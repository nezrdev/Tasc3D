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
type StoryCorridor = {
    end: number;
    start: number;
};
const TOUCH_COMMIT_PX = 18;
const HORIZONTAL_BIAS = 1.15;
const PORTION_DURATION = 0.82;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function useMobilePortionedScroll({ enabled, lenisRef, rootRef, }: MobilePortionedScrollOptions) {
    useEffect(() => {
        const root = rootRef.current;
        if (!root || !enabled)
            return;
        const compactQuery = window.matchMedia("(max-width: 900px) and (pointer: coarse)");
        if (!compactQuery.matches)
            return;
        let startX = 0;
        let startY = 0;
        let startScroll = 0;
        let tracking = false;
        let committed = false;
        let blockCurrentGesture = false;
        let portionTween: gsap.core.Tween | null = null;
        const getViewportHeight = () => Math.max(1, window.visualViewport?.height ?? window.innerHeight);
        const getDocumentMaxScroll = () => Math.max(0, document.documentElement.scrollHeight -
            Math.max(document.documentElement.clientHeight, getViewportHeight()));
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
        const getOwnedStoryCorridors = () => [
            readTriggerCorridor(["services-prelock", "services-reversible"], ["services-reverse-prelock", "services-reversible"]),
            readTriggerCorridor(["how-work-visual-range", "how-work-reversible"], ["how-work-visual-range", "how-work-reversible"]),
            readTriggerCorridor(["domino-forward-approach", "domino-reversible"], ["domino-reversible"]),
        ].filter((corridor): corridor is StoryCorridor => corridor !== null);
        const hasLocalStoryOwner = () => root.dataset.motionInputLocked === "true" ||
            root.dataset.servicesPinned === "true" ||
            root.dataset.howWorkInputOwner === "true" ||
            root.dataset.dominoPinned === "true";
        const isInsideOwnedStory = (scrollY = window.scrollY) => getOwnedStoryCorridors().some(({ start, end }) => scrollY >= start - 3 && scrollY <= end + 3);
        const clampBeforeOwnedStory = (rawTarget: number, direction: -1 | 1, origin: number) => {
            let target = rawTarget;
            getOwnedStoryCorridors().forEach(({ start, end }) => {
                if (direction > 0 && origin < start && target >= start) {
                    target = Math.min(target, Math.max(origin, start + 2));
                }
                if (direction < 0 && origin > end && target <= end) {
                    target = Math.max(target, Math.min(origin, end - 2));
                }
            });
            return target;
        };
        const writeScroll = (nextY: number) => {
            const y = clamp(nextY, 0, getDocumentMaxScroll());
            const lenis = lenisRef.current;
            if (lenis) {
                lenis.scrollTo(y, { immediate: true, force: true });
            }
            else {
                window.scrollTo({ top: y, left: 0, behavior: "auto" });
            }
            ScrollTrigger.update();
        };
        const finishPortion = () => {
            portionTween = null;
            delete root.dataset.portionedScroll;
        };
        const beginPortion = (direction: -1 | 1) => {
            const viewportHeight = getViewportHeight();
            const distance = Math.min(720, Math.max(440, viewportHeight * 0.82));
            const unclampedTarget = startScroll + direction * distance;
            const target = clamp(clampBeforeOwnedStory(unclampedTarget, direction, startScroll), 0, getDocumentMaxScroll());
            portionTween?.kill();
            const proxy = { y: window.scrollY };
            root.dataset.portionedScroll = direction > 0 ? "forward" : "reverse";
            portionTween = gsap.to(proxy, {
                y: target,
                duration: PORTION_DURATION,
                ease: "power3.inOut",
                overwrite: true,
                onUpdate: () => writeScroll(proxy.y),
                onComplete: finishPortion,
                onInterrupt: finishPortion,
            });
        };
        const resetGesture = () => {
            tracking = false;
            committed = false;
            blockCurrentGesture = false;
        };
        const handleTouchStart = (event: TouchEvent) => {
            const touch = event.touches.length === 1 ? event.touches[0] : null;
            if (!touch) {
                resetGesture();
                return;
            }
            if (event.target instanceof Element &&
                event.target.closest("input, textarea, select, [contenteditable='true'], .mobile-menu-panel")) {
                resetGesture();
                return;
            }
            startX = touch.clientX;
            startY = touch.clientY;
            startScroll = window.scrollY;
            tracking = true;
            committed = false;
            blockCurrentGesture =
                Boolean(portionTween) ||
                    hasLocalStoryOwner() ||
                    isInsideOwnedStory(startScroll);
        };
        const ownTouchMove = (event: TouchEvent) => {
            if (event.cancelable)
                event.preventDefault();
        };
        const handleTouchMove = (event: TouchEvent) => {
            if (!tracking)
                return;
            if (event.defaultPrevented && !portionTween)
                return;
            const touch = event.touches.length === 1 ? event.touches[0] : null;
            if (!touch)
                return;
            if (blockCurrentGesture) {
                if (portionTween)
                    ownTouchMove(event);
                return;
            }
            const deltaX = touch.clientX - startX;
            const deltaY = startY - touch.clientY;
            if (!committed) {
                if (Math.abs(deltaX) > Math.abs(deltaY) * HORIZONTAL_BIAS ||
                    Math.abs(deltaY) < TOUCH_COMMIT_PX) {
                    return;
                }
                committed = true;
                ownTouchMove(event);
                beginPortion(deltaY > 0 ? 1 : -1);
                return;
            }
            ownTouchMove(event);
        };
        const handleTouchEnd = () => {
            resetGesture();
        };
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
            portionTween?.kill();
            portionTween = null;
            delete root.dataset.portionedScroll;
            window.removeEventListener("touchstart", handleTouchStart, true);
            window.removeEventListener("touchmove", handleTouchMove, true);
            window.removeEventListener("touchend", handleTouchEnd, true);
            window.removeEventListener("touchcancel", handleTouchEnd, true);
        };
    }, [enabled, lenisRef, rootRef]);
}
