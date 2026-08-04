"use client";

import { useEffect, type RefObject } from "react";
import type Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
    getMotionInputOwnerId,
    registerMotionInputStory,
    type MotionInputGesture,
    type MotionInputRegistration,
    type MotionInputReleaseReason,
} from "@/lib/motion-input-bus";

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
/*
  One swipe jumps to the next section anchor, and anchors can sit several
  viewports apart. A flat duration therefore flung the long hops across the
  page in the same time as a short one, which is what read as "insanely fast".
  The tween now scales with the distance actually travelled: short hops stay
  as snappy as before, long ones get the time they need.
*/
const PORTION_DURATION_BASE = 0.46;
const PORTION_DURATION_MAX = 1.35;

const resolvePortionDuration = (distance: number, viewportHeight: number) => {
    const viewports = Math.max(0, distance) / Math.max(1, viewportHeight);
    const scaled = PORTION_DURATION_BASE * Math.sqrt(Math.max(1, viewports));
    return Math.min(PORTION_DURATION_MAX, scaled);
};
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
        let motionInputRegistration: MotionInputRegistration | null = null;
        let portionStoppedLenis = false;

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
            root.dataset.portionDuration = String(PORTION_DURATION_BASE);
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

        const hasForeignScrollOwner = () => {
            const ownerId = getMotionInputOwnerId();
            return Boolean(root.dataset.programmaticAnchor) || Boolean(ownerId && ownerId !== "portion");
        };

        const isInsideOwnedStory = (scrollPosition = window.scrollY) => cachedStoryCorridors.some(
            ({ start, end }) => scrollPosition >= start - 3 && scrollPosition <= end + 3,
        );

        const writeScroll = (nextY: number) => {
            const requestedY = clamp(nextY, 0, cachedDocumentMaxScroll);
            const currentY = window.scrollY;
            const y = currentY + clamp(requestedY - currentY, -cachedFrameStep, cachedFrameStep);
            const lenis = lenisRef.current;
            if (lenis)
                lenis.scrollTo(y, { immediate: true, force: true });
            else {
                window.scrollTo({ top: y, left: 0, behavior: "auto" });
                ScrollTrigger.update();
            }
            return window.scrollY;
        };

        const claimLenis = () => {
            const lenis = lenisRef.current;
            if (!lenis || portionStoppedLenis || lenis.isStopped)
                return;
            lenis.stop();
            portionStoppedLenis = true;
        };

        const releaseLenis = () => {
            if (!portionStoppedLenis)
                return;
            const lenis = lenisRef.current;
            portionStoppedLenis = false;
            if (!lenis)
                return;
            lenis.scrollTo(window.scrollY, { immediate: true, force: true });
            lenis.start();
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
            motionInputRegistration?.markProgress(
                `${eventName === "tasc:portion-settled" ? "settled" : "interrupted"}:${sequence}:${targetIndex}`,
            );
            delete root.dataset.portionedScroll;
            delete root.dataset.portionSettling;
            delete root.dataset.portionTargetIndex;
            delete root.dataset.portionTargetY;
            ScrollTrigger.update();
            motionInputRegistration?.release(
                eventName === "tasc:portion-settled" ? "completed" : "out-of-range",
            );
            releaseLenis();
        };

        const interruptActivePortion = (emit = true, keepLenisStopped = false) => {
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
            delete root.dataset.portionTargetIndex;
            delete root.dataset.portionTargetY;
            if (!keepLenisStopped)
                releaseLenis();
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
            const retargeting = hasActivePortion();
            if (retargeting)
                motionInputRegistration?.markProgress(`retarget:${portionSequence}:${targetIndex}`);
            interruptActivePortion(true, retargeting);
            claimLenis();
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
            motionInputRegistration?.markProgress(`start:${sequence}:${targetIndex}`);
            const portionDuration = resolvePortionDuration(
                Math.abs(target.y - proxy.y),
                readViewportHeight(),
            );
            root.dataset.portionDuration = String(Math.round(portionDuration * 100) / 100);
            portionTween = gsap.to(proxy, {
                y: target.y,
                duration: portionDuration,
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
                            settleFrame = null;
                            finishPortion(
                                sequence,
                                settledTargetIndex,
                                settledTargetY,
                                direction,
                                "tasc:portion-settled",
                            );
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
            if (portionTween || settleFrame !== null) {
                motionInputRegistration?.markProgress(`interrupted:${portionSequence}`);
                interruptActivePortion(false);
            }
            activeTargetIndex = null;
            activeTargetY = null;
            activeTargetId = null;
            resetGesture();
            motionInputRegistration?.release("out-of-range");
        };

        const hasActivePortion = () => portionTween !== null || settleFrame !== null;

        const handleTouchStart = (event: TouchEvent) => {
            const touch = event.touches.length === 1 ? event.touches[0] : null;
            if (!touch) {
                resetGesture();
                return false;
            }
            if (
                event.target instanceof Element &&
                event.target.closest("input, textarea, select, [contenteditable='true'], .mobile-menu-panel")
            ) {
                resetGesture();
                return false;
            }

            startX = touch.clientX;
            startY = touch.clientY;
            tracking = true;
            committed = false;
            blockCurrentGesture = hasForeignScrollOwner() ||
                (!hasActivePortion() && isInsideOwnedStory(window.scrollY));
            if (blockCurrentGesture)
                releasePortionToStoryOwner();
            else
                root.dataset.portionGesture = "tracking";
            return false;
        };

        const handleTouchMove = (event: TouchEvent) => {
            if (!tracking || blockCurrentGesture || event.defaultPrevented)
                return false;
            const touch = event.touches.length === 1 ? event.touches[0] : null;
            if (!touch)
                return false;

            if (
                hasForeignScrollOwner() ||
                (!committed && !hasActivePortion() && isInsideOwnedStory(window.scrollY))
            ) {
                blockCurrentGesture = true;
                releasePortionToStoryOwner();
                return false;
            }

            const deltaX = touch.clientX - startX;
            const deltaY = startY - touch.clientY;
            if (!committed) {
                if (
                    Math.abs(deltaX) > Math.abs(deltaY) * HORIZONTAL_BIAS ||
                    Math.abs(deltaY) < TOUCH_COMMIT_PX
                ) {
                    return false;
                }
                if (!beginPortion(deltaY > 0 ? 1 : -1))
                    return false;
                committed = true;
            }
            return true;
        };

        const handleTouchEnd = () => {
            resetGesture();
            return !hasActivePortion();
        };

        const canClaimPortionedGesture = (gesture: MotionInputGesture) => {
            if (!compactQuery.matches || hasForeignScrollOwner())
                return false;
            if (motionInputRegistration?.isOwner())
                return true;
            if (
                tracking && committed &&
                (gesture.kind === "touchmove" ||
                    gesture.kind === "touchend" ||
                    gesture.kind === "touchcancel")
            ) {
                return true;
            }
            if (gesture.kind !== "touchstart")
                return false;
            const event = gesture.event as TouchEvent;
            if (isInsideOwnedStory(gesture.scrollY))
                return false;
            const touch = event.touches.length === 1 ? event.touches[0] : null;
            if (!touch)
                return false;
            return !(event.target instanceof Element && event.target.closest(
                "input, textarea, select, [contenteditable='true'], .mobile-menu-panel",
            ));
        };

        const handleMotionGesture = (gesture: MotionInputGesture) => {
            if (
                gesture.kind !== "touchstart" &&
                gesture.kind !== "touchmove" &&
                gesture.kind !== "touchend" &&
                gesture.kind !== "touchcancel"
            )
                return false;
            const event = gesture.event as TouchEvent;
            if (gesture.kind === "touchstart")
                return handleTouchStart(event);
            if (gesture.kind === "touchmove")
                return handleTouchMove(event);
            if (gesture.kind === "touchend" || gesture.kind === "touchcancel") {
                const release = handleTouchEnd();
                return { release };
            }
            return false;
        };

        const releaseMotionOwnership = (reason: MotionInputReleaseReason) => {
            interruptActivePortion(reason !== "completed");
            portionSequence += 1;
            activeTargetIndex = null;
            activeTargetY = null;
            activeTargetId = null;
            resetGesture();
        };

        rebuildGeometry();
        motionInputRegistration = registerMotionInputStory({
            canClaim: canClaimPortionedGesture,
            id: "portion",
            onGesture: handleMotionGesture,
            priority: 10,
            release: releaseMotionOwnership,
            root,
        });
        ScrollTrigger.addEventListener("refresh", rebuildGeometry);
        window.visualViewport?.addEventListener("resize", scheduleViewportGeometryUpdate);
        window.addEventListener("tasc:scroll-position-applied", releasePortionToStoryOwner);

        return () => {
            portionSequence += 1;
            interruptActivePortion(false);
            releaseLenis();
            resetGesture();
            motionInputRegistration?.unregister();
            motionInputRegistration = null;
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
        };
    }, [enabled, lenisRef, rootRef]);
}
