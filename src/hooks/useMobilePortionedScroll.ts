"use client";

import { useEffect, type RefObject } from "react";
import type Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type MobilePortionedScrollOptions = {
    enabled: boolean;
    lenisRef: RefObject<Lenis | null>;
    rootRef: RefObject<HTMLElement | null>;
};

type PortionDirection = -1 | 1;

type PortionAnchor = {
    ids: string[];
    y: number;
};

type StoryCorridor = {
    end: number;
    start: number;
};

const TOUCH_COMMIT_PX = 8;
const HORIZONTAL_BIAS = 1.15;
const PORTION_DURATION = 0.42;
const ANCHOR_DEDUPLICATION_PX = 3;
const ANCHOR_SETTLE_PX = 8;
const FRAME_STEP_VIEWPORT_RATIO = 0.9;
const MAX_SETTLE_DURATION_MS = 4000;
const MAX_SETTLE_STALLED_FRAMES = 8;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function useMobilePortionedScroll({
    enabled,
    lenisRef,
    rootRef,
}: MobilePortionedScrollOptions) {
    useEffect(() => {
        const root = rootRef.current;
        if (!root || !enabled)
            return;

        const compactQuery = window.matchMedia("(max-width: 900px) and (pointer: coarse)");
        if (!compactQuery.matches)
            return;

        let startX = 0;
        let startY = 0;
        let tracking = false;
        let committed = false;
        let blockCurrentGesture = false;
        let portionTween: gsap.core.Tween | null = null;
        let settleFrame: number | null = null;
        let viewportResizeFrame: number | null = null;
        let viewportRebuildTimer: number | null = null;
        let portionSequence = 0;
        let activeTargetIndex: number | null = null;
        let activeTargetY: number | null = null;
        let activeTargetId: string | null = null;
        let activeDirection: PortionDirection | null = null;
        let cachedDocumentMaxScroll = 0;
        let cachedFrameStep = 1;
        let cachedAnchors: PortionAnchor[] = [];
        let cachedStoryCorridors: StoryCorridor[] = [];

        const readViewportHeight = () => Math.max(1, window.visualViewport?.height ?? window.innerHeight);

        const readDocumentMaxScroll = () => Math.max(
            0,
            document.documentElement.scrollHeight -
                Math.max(document.documentElement.clientHeight, readViewportHeight()),
        );

        const updateViewportGeometry = () => {
            cachedDocumentMaxScroll = readDocumentMaxScroll();
            cachedFrameStep = Math.max(1, Math.floor(readViewportHeight() * FRAME_STEP_VIEWPORT_RATIO));
        };

        const readElementTop = (selector: string) => {
            const element = root.querySelector<HTMLElement>(selector) ?? document.querySelector<HTMLElement>(selector);
            if (!element)
                return null;
            return window.scrollY + element.getBoundingClientRect().top;
        };

        const readTriggerStart = (id: string, fallbackSelector: string) => {
            const trigger = ScrollTrigger.getById(id);
            if (trigger && Number.isFinite(trigger.start))
                return trigger.start;
            return readElementTop(fallbackSelector);
        };

        const readTriggerCorridor = (startIds: string[], endIds: string[]): StoryCorridor | null => {
            const startTrigger = startIds
                .map((id) => ScrollTrigger.getById(id))
                .find((trigger) => trigger && Number.isFinite(trigger.start));
            const endTrigger = endIds
                .map((id) => ScrollTrigger.getById(id))
                .find((trigger) => trigger && Number.isFinite(trigger.end));
            if (!startTrigger || !endTrigger)
                return null;
            return {
                start: Math.min(startTrigger.start, endTrigger.start),
                end: Math.max(startTrigger.end, endTrigger.end),
            };
        };

        const findNearestAnchorIndex = (scrollPosition: number) => {
            if (cachedAnchors.length === 0)
                return null;
            let nearestIndex = 0;
            let nearestDistance = Math.abs(cachedAnchors[0].y - scrollPosition);
            for (let index = 1; index < cachedAnchors.length; index += 1) {
                const distance = Math.abs(cachedAnchors[index].y - scrollPosition);
                if (distance < nearestDistance) {
                    nearestIndex = index;
                    nearestDistance = distance;
                }
            }
            return nearestIndex;
        };

        const rebuildGeometry = () => {
            updateViewportGeometry();
            const candidates = [
                { id: "hero", y: readTriggerStart("hero-motion", ".hero-motion") },
                { id: "clients", y: readElementTop(".figma-clients-section") },
                { id: "services", y: readTriggerStart("services-reversible", ".services-story-section") },
                { id: "how", y: readTriggerStart("how-work-reversible", ".how-work-motion-section") },
                { id: "datum", y: readTriggerStart("datum-reversible", ".datum-motion-section") },
                { id: "domino", y: readTriggerStart("domino-reversible", ".domino-cta-section") },
                { id: "process", y: readElementTop(".process-contact-section") },
                { id: "footer", y: readElementTop(".site-footer") },
            ]
                .filter((candidate): candidate is { id: string; y: number } => Number.isFinite(candidate.y))
                .map((candidate) => ({
                    ids: [candidate.id],
                    y: Math.round(clamp(candidate.y, 0, cachedDocumentMaxScroll)),
                }))
                .sort((left, right) => left.y - right.y);

            cachedAnchors = candidates.reduce<PortionAnchor[]>((anchors, candidate) => {
                const previous = anchors.at(-1);
                if (previous && Math.abs(previous.y - candidate.y) <= ANCHOR_DEDUPLICATION_PX) {
                    previous.ids.push(...candidate.ids);
                    return anchors;
                }
                anchors.push(candidate);
                return anchors;
            }, []);

            cachedStoryCorridors = [
                readTriggerCorridor(
                    ["services-prelock", "services-reversible"],
                    ["services-reverse-prelock", "services-reversible"],
                ),
                readTriggerCorridor(
                    ["how-work-visual-range", "how-work-reversible"],
                    ["how-work-visual-range", "how-work-reversible"],
                ),
                readTriggerCorridor(
                    ["domino-forward-approach", "domino-reversible"],
                    ["domino-reversible"],
                ),
            ].filter((corridor): corridor is StoryCorridor => corridor !== null);

            if (activeTargetY !== null) {
                const targetId = activeTargetId;
                const matchedIndex = targetId === null
                    ? -1
                    : cachedAnchors.findIndex((anchor) => anchor.ids.includes(targetId));
                activeTargetIndex = matchedIndex >= 0
                    ? matchedIndex
                    : findNearestAnchorIndex(activeTargetY);
                activeTargetY = activeTargetIndex === null ? null : cachedAnchors[activeTargetIndex].y;
                if (portionTween?.isActive() && activeTargetY !== null)
                    portionTween.resetTo("y", activeTargetY);
            }
            root.dataset.portionAnchorCount = String(cachedAnchors.length);
            root.dataset.portionAnchors = cachedAnchors.map((anchor) => anchor.ids.join("+")).join("|");
            root.dataset.portionDuration = String(PORTION_DURATION);
            root.dataset.portionEase = "power2.out";
        };

        const scheduleViewportGeometryUpdate = () => {
            if (viewportResizeFrame === null) {
                viewportResizeFrame = window.requestAnimationFrame(() => {
                    viewportResizeFrame = null;
                    updateViewportGeometry();
                });
            }
            if (viewportRebuildTimer !== null)
                window.clearTimeout(viewportRebuildTimer);
            viewportRebuildTimer = window.setTimeout(() => {
                viewportRebuildTimer = null;
                rebuildGeometry();
            }, 160);
        };

        const hasLocalStoryOwner = () => root.dataset.motionInputLocked === "true" ||
            root.dataset.servicesPinned === "true" ||
            root.dataset.howWorkInputOwner === "true" ||
            (root.dataset.dominoPinned === "true" &&
                ["forward", "reverse"].includes(root.dataset.dominoPlayback ?? ""));

        const hasForeignScrollOwner = () => Boolean(root.dataset.programmaticAnchor) || hasLocalStoryOwner();

        const isInsideOwnedStory = (scrollPosition = window.scrollY) => cachedStoryCorridors.some(
            ({ start, end }) => scrollPosition >= start - 3 && scrollPosition <= end + 3,
        );

        const writeScroll = (nextY: number) => {
            const requestedY = clamp(nextY, 0, cachedDocumentMaxScroll);
            const currentY = window.scrollY;
            const y = currentY + clamp(requestedY - currentY, -cachedFrameStep, cachedFrameStep);
            const lenis = lenisRef.current;
            window.scrollTo({ top: y, left: 0, behavior: "auto" });
            if (!lenis)
                ScrollTrigger.update();
            return window.scrollY;
        };

        const emitPortionEvent = (
            name: "tasc:portion-start" | "tasc:portion-settled" | "tasc:portion-interrupted",
            detail: Record<string, number | string>,
        ) => {
            window.dispatchEvent(new CustomEvent(name, { detail }));
        };

        const finishPortion = (
            sequence: number,
            targetIndex: number,
            targetY: number,
            direction: PortionDirection,
            eventName: "tasc:portion-settled" | "tasc:portion-interrupted",
        ) => {
            if (sequence !== portionSequence)
                return;
            if (settleFrame !== null) {
                window.cancelAnimationFrame(settleFrame);
                settleFrame = null;
            }
            portionTween = null;
            activeDirection = null;
            const anchor = cachedAnchors[targetIndex]?.ids.join("+") ?? activeTargetId ?? "";
            root.dataset.portionSettling = direction < 0 ? "reverse" : "forward";
            emitPortionEvent(eventName, {
                anchor,
                direction,
                index: targetIndex,
                settledY: window.scrollY,
                targetY,
            });
            delete root.dataset.portionedScroll;
            delete root.dataset.portionSettling;
            ScrollTrigger.update();
        };

        const interruptActivePortion = (emit = true) => {
            if (!portionTween && settleFrame === null)
                return;
            const interruptedIndex = activeTargetIndex;
            const interruptedY = activeTargetY;
            const interruptedDirection = activeDirection;
            if (settleFrame !== null) {
                window.cancelAnimationFrame(settleFrame);
                settleFrame = null;
            }
            if (portionTween) {
                portionTween.eventCallback("onInterrupt", null);
                portionTween.kill();
                portionTween = null;
            }
            delete root.dataset.portionedScroll;
            delete root.dataset.portionSettling;
            activeDirection = null;
            if (emit && interruptedIndex !== null && interruptedY !== null) {
                emitPortionEvent("tasc:portion-interrupted", {
                    direction: interruptedDirection ?? 0,
                    index: interruptedIndex,
                    settledY: window.scrollY,
                    targetY: interruptedY,
                });
            }
        };

        const resolveTargetIndex = (direction: PortionDirection) => {
            if (cachedAnchors.length === 0)
                return null;
            if (portionTween && activeTargetIndex !== null) {
                const interruptedTarget = activeTargetIndex + direction;
                return interruptedTarget >= 0 && interruptedTarget < cachedAnchors.length
                    ? interruptedTarget
                    : null;
            }

            const currentY = window.scrollY;
            const nearestIndex = findNearestAnchorIndex(currentY);
            if (
                nearestIndex !== null &&
                Math.abs(cachedAnchors[nearestIndex].y - currentY) <= ANCHOR_SETTLE_PX
            ) {
                activeTargetIndex = nearestIndex;
                const adjacentIndex = nearestIndex + direction;
                return adjacentIndex >= 0 && adjacentIndex < cachedAnchors.length
                    ? adjacentIndex
                    : null;
            }

            activeTargetIndex = null;
            if (direction > 0) {
                const nextIndex = cachedAnchors.findIndex((anchor) => anchor.y > currentY + ANCHOR_SETTLE_PX);
                return nextIndex >= 0 ? nextIndex : null;
            }
            for (let index = cachedAnchors.length - 1; index >= 0; index -= 1) {
                if (cachedAnchors[index].y < currentY - ANCHOR_SETTLE_PX)
                    return index;
            }
            return null;
        };

        const beginPortion = (direction: PortionDirection) => {
            const targetIndex = resolveTargetIndex(direction);
            if (targetIndex === null)
                return Boolean(portionTween);

            const target = cachedAnchors[targetIndex];
            const fromIndex = activeTargetIndex ?? findNearestAnchorIndex(window.scrollY) ?? -1;
            interruptActivePortion();
            const sequence = ++portionSequence;
            const proxy = { y: window.scrollY };
            activeTargetIndex = targetIndex;
            activeTargetY = target.y;
            activeTargetId = target.ids[0] ?? null;
            activeDirection = direction;
            root.dataset.portionedScroll = direction > 0 ? "forward" : "reverse";
            root.dataset.portionTargetIndex = String(targetIndex);
            root.dataset.portionTargetY = String(target.y);
            emitPortionEvent("tasc:portion-start", {
                anchor: target.ids.join("+"),
                anchorCount: cachedAnchors.length,
                direction,
                fromIndex,
                index: targetIndex,
                targetY: target.y,
            });
            portionTween = gsap.to(proxy, {
                y: target.y,
                duration: PORTION_DURATION,
                ease: "power2.out",
                overwrite: true,
                onUpdate: () => writeScroll(proxy.y),
                onComplete: () => {
                    const settleStartedAt = performance.now();
                    let stalledFrames = 0;
                    let previousY = window.scrollY;
                    const settleAtTarget = (timestamp: number) => {
                        if (sequence !== portionSequence)
                            return;
                        const settledTargetIndex = activeTargetIndex ?? targetIndex;
                        const settledTargetY = activeTargetY ?? target.y;
                        const actualY = writeScroll(settledTargetY);
                        if (Math.abs(actualY - settledTargetY) <= 0.5) {
                            settleFrame = window.requestAnimationFrame(() => {
                                settleFrame = null;
                                finishPortion(
                                    sequence,
                                    settledTargetIndex,
                                    settledTargetY,
                                    direction,
                                    "tasc:portion-settled",
                                );
                            });
                            return;
                        }
                        stalledFrames = Math.abs(actualY - previousY) <= 0.5
                            ? stalledFrames + 1
                            : 0;
                        previousY = actualY;
                        if (
                            stalledFrames >= MAX_SETTLE_STALLED_FRAMES ||
                            timestamp - settleStartedAt >= MAX_SETTLE_DURATION_MS
                        ) {
                            settleFrame = null;
                            finishPortion(
                                sequence,
                                settledTargetIndex,
                                settledTargetY,
                                direction,
                                "tasc:portion-interrupted",
                            );
                            return;
                        }
                        settleFrame = window.requestAnimationFrame(settleAtTarget);
                    };
                    settleFrame = window.requestAnimationFrame(settleAtTarget);
                },
                onInterrupt: () => {
                    const interruptedTargetIndex = activeTargetIndex ?? targetIndex;
                    const interruptedTargetY = activeTargetY ?? target.y;
                    finishPortion(
                        sequence,
                        interruptedTargetIndex,
                        interruptedTargetY,
                        direction,
                        "tasc:portion-interrupted",
                    );
                },
            });
            return true;
        };

        const resetGesture = () => {
            tracking = false;
            committed = false;
            blockCurrentGesture = false;
            delete root.dataset.portionGesture;
        };

        const releasePortionToStoryOwner = () => {
            if (!portionTween && settleFrame === null)
                return;
            interruptActivePortion(false);
            activeTargetIndex = null;
            activeTargetY = null;
            activeTargetId = null;
        };

        const handleTouchStart = (event: TouchEvent) => {
            const touch = event.touches.length === 1 ? event.touches[0] : null;
            if (!touch) {
                resetGesture();
                return;
            }
            if (
                event.target instanceof Element &&
                event.target.closest("input, textarea, select, [contenteditable='true'], .mobile-menu-panel")
            ) {
                resetGesture();
                return;
            }

            startX = touch.clientX;
            startY = touch.clientY;
            tracking = true;
            committed = false;
            blockCurrentGesture = hasForeignScrollOwner() || isInsideOwnedStory(window.scrollY);
            if (blockCurrentGesture)
                releasePortionToStoryOwner();
            else
                root.dataset.portionGesture = "tracking";
        };

        const ownTouchMove = (event: TouchEvent) => {
            if (event.cancelable)
                event.preventDefault();
        };

        const handleTouchMove = (event: TouchEvent) => {
            if (!tracking || blockCurrentGesture || event.defaultPrevented)
                return;
            const touch = event.touches.length === 1 ? event.touches[0] : null;
            if (!touch)
                return;

            if (hasForeignScrollOwner() || (!committed && isInsideOwnedStory(window.scrollY))) {
                blockCurrentGesture = true;
                releasePortionToStoryOwner();
                return;
            }

            const deltaX = touch.clientX - startX;
            const deltaY = startY - touch.clientY;
            if (!committed) {
                if (
                    Math.abs(deltaX) > Math.abs(deltaY) * HORIZONTAL_BIAS ||
                    Math.abs(deltaY) < TOUCH_COMMIT_PX
                ) {
                    return;
                }
                if (!beginPortion(deltaY > 0 ? 1 : -1))
                    return;
                committed = true;
            }
            ownTouchMove(event);
        };

        const handleTouchEnd = () => {
            resetGesture();
        };

        rebuildGeometry();
        ScrollTrigger.addEventListener("refresh", rebuildGeometry);
        window.visualViewport?.addEventListener("resize", scheduleViewportGeometryUpdate);
        window.addEventListener("tasc:scroll-position-applied", releasePortionToStoryOwner);
        window.addEventListener("touchstart", handleTouchStart, {
            capture: true,
            passive: true,
        });
        window.addEventListener("touchmove", handleTouchMove, {
            capture: true,
            passive: false,
        });
        window.addEventListener("touchend", handleTouchEnd, {
            capture: true,
            passive: true,
        });
        window.addEventListener("touchcancel", handleTouchEnd, {
            capture: true,
            passive: true,
        });

        return () => {
            portionSequence += 1;
            interruptActivePortion(false);
            if (viewportResizeFrame !== null) {
                window.cancelAnimationFrame(viewportResizeFrame);
                viewportResizeFrame = null;
            }
            if (viewportRebuildTimer !== null) {
                window.clearTimeout(viewportRebuildTimer);
                viewportRebuildTimer = null;
            }
            delete root.dataset.portionedScroll;
            delete root.dataset.portionGesture;
            delete root.dataset.portionAnchorCount;
            delete root.dataset.portionAnchors;
            delete root.dataset.portionTargetIndex;
            delete root.dataset.portionTargetY;
            delete root.dataset.portionDuration;
            delete root.dataset.portionEase;
            ScrollTrigger.removeEventListener("refresh", rebuildGeometry);
            window.visualViewport?.removeEventListener("resize", scheduleViewportGeometryUpdate);
            window.removeEventListener("tasc:scroll-position-applied", releasePortionToStoryOwner);
            window.removeEventListener("touchstart", handleTouchStart, true);
            window.removeEventListener("touchmove", handleTouchMove, true);
            window.removeEventListener("touchend", handleTouchEnd, true);
            window.removeEventListener("touchcancel", handleTouchEnd, true);
        };
    }, [enabled, lenisRef, rootRef]);
}
