"use client";

import { useCallback } from "react";
import {
    registerMotionInputStory,
    type MotionInputRegistration,
    type MotionInputReleaseReason,
} from "@/lib/motion-input-bus";

export type ServicesStoryPhase =
    | "idle"
    | "preparing"
    | "playing"
    | "waiting"
    | "releasing"
    | "reverse";

type ServicesStoryInputOptions = {
    root: HTMLElement;
    isDisposed: () => boolean;
    isMacRuntime: () => boolean;
    isServicesActive: () => boolean;
    isServicesReleasing: () => boolean;
    servicesOwnsLenisLock: () => boolean;
    getServicesPhase: () => ServicesStoryPhase;
    getServicesStage: () => number;
    getServicesGateUntil: () => number;
    getServicesEntryInputIgnoreUntil: () => number;
    getServicesTransitionDirection: () => 1 | -1 | 0;
    getServicesLockY: () => number;
    getServicesTriggerActive: () => boolean | null;
    correctNativeScroll: (target: number) => void;
    releaseServicesForNavigation: () => void;
    requestServicesDirection: (direction: 1 | -1) => void;
};

export type ServicesStoryInputRuntime = {
    claim: (progress: string) => void;
    clearPendingIntent: () => void;
    dispose: () => void;
    flushPendingIntent: () => void;
    ignoreCurrentTouchGesture: () => void;
    isOwner: () => boolean;
    markProgress: (progress: string) => void;
    release: (reason?: MotionInputReleaseReason) => void;
    resetBlockedInput: () => void;
    resetGestureTotal: () => void;
};

const SERVICES_INPUT_QUIET_MS = 140;

export function useServicesStory() {
    return useCallback((options: ServicesStoryInputOptions): ServicesStoryInputRuntime => {
        const {
            root,
            isDisposed,
            isMacRuntime,
            isServicesActive,
            isServicesReleasing,
            servicesOwnsLenisLock,
            getServicesPhase,
            getServicesStage,
            getServicesGateUntil,
            getServicesEntryInputIgnoreUntil,
            getServicesTransitionDirection,
            getServicesLockY,
            getServicesTriggerActive,
            correctNativeScroll,
            releaseServicesForNavigation,
            requestServicesDirection,
        } = options;

        let registration: MotionInputRegistration | null = null;
        let gestureTotal = 0;
        let pendingDirection: 1 | -1 | 0 = 0;
        let pendingMagnitude = 0;
        let pendingTimer = 0;
        let lastBlockedInputAt = 0;
        let blockedDirection: 1 | -1 | 0 = 0;
        let touchY: number | null = null;
        let touchGestureActive = false;
        let ignoreCurrentTouch = false;
        let touchStartedAtSettledStop = false;

        const resetGestureTotal = () => {
            gestureTotal = 0;
        };

        const resetBlockedInput = () => {
            lastBlockedInputAt = 0;
            blockedDirection = 0;
        };

        const clearPendingIntent = () => {
            window.clearTimeout(pendingTimer);
            pendingTimer = 0;
            pendingDirection = 0;
            pendingMagnitude = 0;
        };

        const queueIntent = (
            direction: 1 | -1,
            gestureMagnitude = 160,
            threshold = 18,
            allowTransitionDirection = false,
        ) => {
            const transitionDirection = getServicesTransitionDirection();
            if (transitionDirection === 0)
                return;
            if (direction === transitionDirection && !allowTransitionDirection)
                return;
            if (pendingDirection !== 0 && pendingDirection !== direction)
                pendingMagnitude = 0;
            pendingMagnitude += Math.abs(gestureMagnitude);
            if (pendingMagnitude >= threshold)
                pendingDirection = direction;
        };

        const flushPendingIntent = () => {
            window.clearTimeout(pendingTimer);
            pendingTimer = 0;
            if (!isServicesActive() || getServicesPhase() !== "waiting" || pendingDirection === 0)
                return;
            const delay = Math.max(0, getServicesGateUntil() - performance.now());
            pendingTimer = window.setTimeout(() => {
                pendingTimer = 0;
                if (!isServicesActive() || getServicesPhase() !== "waiting" || pendingDirection === 0)
                    return;
                const direction = pendingDirection;
                pendingDirection = 0;
                pendingMagnitude = 0;
                blockedDirection = 0;
                lastBlockedInputAt = 0;
                requestServicesDirection(direction);
            }, delay);
        };

        const isEditableTarget = (target: EventTarget | null) =>
            target instanceof Element &&
            Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));

        const normalizeWheelDelta = (event: WheelEvent) => {
            if (event.deltaMode === WheelEvent.DOM_DELTA_LINE)
                return event.deltaY * 16;
            if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE)
                return event.deltaY * window.innerHeight;
            return event.deltaY;
        };

        const handleWheel = (event: WheelEvent) => {
            if (event.ctrlKey)
                return;
            const servicesTriggerActive = getServicesTriggerActive();
            if (isMacRuntime() &&
                isServicesActive() &&
                !isServicesReleasing() &&
                servicesTriggerActive === false) {
                releaseServicesForNavigation();
                return;
            }
            if (isServicesReleasing()) {
                event.preventDefault();
                return;
            }
            if (!isServicesActive())
                return;
            event.preventDefault();
            const now = performance.now();
            const delta = normalizeWheelDelta(event);
            if (Math.abs(delta) < 0.01)
                return;
            const direction = delta >= 0 ? 1 : -1;
            const gestureThreshold = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 12 : 18;
            if (now < getServicesEntryInputIgnoreUntil()) {
                gestureTotal = 0;
                clearPendingIntent();
                return;
            }
            if (getServicesPhase() !== "waiting") {
                gestureTotal = 0;
                queueIntent(direction, Math.abs(delta), gestureThreshold);
                lastBlockedInputAt = now;
                blockedDirection = direction;
                return;
            }
            if (now < getServicesGateUntil()) {
                gestureTotal = 0;
                const deliberatePostStageGesture = Math.abs(delta) >= 72;
                queueIntent(direction, Math.abs(delta), gestureThreshold, deliberatePostStageGesture);
                lastBlockedInputAt = now;
                blockedDirection = direction;
                flushPendingIntent();
                return;
            }
            if (direction === blockedDirection && now - lastBlockedInputAt < SERVICES_INPUT_QUIET_MS) {
                gestureTotal = 0;
                return;
            }
            blockedDirection = 0;
            lastBlockedInputAt = 0;
            gestureTotal += delta;
            if (Math.abs(gestureTotal) >= gestureThreshold)
                requestServicesDirection(gestureTotal > 0 ? 1 : -1);
        };

        const handleTouchStart = (event: TouchEvent) => {
            touchGestureActive = true;
            if (performance.now() < getServicesEntryInputIgnoreUntil())
                ignoreCurrentTouch = true;
            touchStartedAtSettledStop =
                isServicesActive() && !isServicesReleasing() && getServicesPhase() === "waiting";
            if (isServicesActive() && !isServicesReleasing()) {
                gestureTotal = 0;
                lastBlockedInputAt = 0;
                blockedDirection = 0;
            }
            touchY = (isServicesActive() || isServicesReleasing()) && event.touches[0]
                ? event.touches[0].clientY
                : null;
        };

        const handleTouchMove = (event: TouchEvent) => {
            if (isServicesReleasing()) {
                if (event.cancelable)
                    event.preventDefault();
                return;
            }
            if (!isServicesActive() || !event.touches[0])
                return;
            const nextY = event.touches[0].clientY;
            if (ignoreCurrentTouch) {
                if (event.cancelable)
                    event.preventDefault();
                touchY = nextY;
                gestureTotal = 0;
                clearPendingIntent();
                return;
            }
            if (touchY === null) {
                if (event.cancelable)
                    event.preventDefault();
                touchY = nextY;
                correctNativeScroll(getServicesLockY());
                return;
            }
            const delta = touchY - nextY;
            touchY = nextY;
            if (event.cancelable)
                event.preventDefault();
            const now = performance.now();
            const direction = delta >= 0 ? 1 : -1;
            if (now < getServicesEntryInputIgnoreUntil()) {
                gestureTotal = 0;
                clearPendingIntent();
                return;
            }
            if (getServicesPhase() !== "waiting") {
                gestureTotal = 0;
                queueIntent(direction, Math.abs(delta), 10);
                lastBlockedInputAt = now;
                blockedDirection = direction;
                return;
            }
            if (now < getServicesGateUntil()) {
                gestureTotal = 0;
                queueIntent(direction, Math.abs(delta), 10, touchStartedAtSettledStop);
                lastBlockedInputAt = now;
                blockedDirection = direction;
                flushPendingIntent();
                return;
            }
            if (direction === blockedDirection && now - lastBlockedInputAt < SERVICES_INPUT_QUIET_MS) {
                gestureTotal = 0;
                return;
            }
            blockedDirection = 0;
            lastBlockedInputAt = 0;
            gestureTotal += delta;
            if (Math.abs(gestureTotal) >= 10)
                requestServicesDirection(gestureTotal > 0 ? 1 : -1);
        };

        const handleTouchEnd = () => {
            const ignoredEntryGesture = ignoreCurrentTouch;
            touchGestureActive = false;
            ignoreCurrentTouch = false;
            touchY = null;
            gestureTotal = 0;
            if (!ignoredEntryGesture &&
                touchStartedAtSettledStop &&
                isServicesActive() &&
                getServicesPhase() === "waiting" &&
                pendingDirection !== 0) {
                flushPendingIntent();
            }
            else {
                clearPendingIntent();
            }
            touchStartedAtSettledStop = false;
            lastBlockedInputAt = 0;
            blockedDirection = 0;
        };

        const handleKeydown = (event: KeyboardEvent) => {
            const forward =
                event.key === "ArrowDown" ||
                event.key === "PageDown" ||
                event.key === "End" ||
                (event.key === " " && !event.shiftKey);
            const backward =
                event.key === "ArrowUp" ||
                event.key === "PageUp" ||
                event.key === "Home" ||
                (event.key === " " && event.shiftKey);
            if (!forward && !backward)
                return;
            if (isEditableTarget(event.target))
                return;
            if (isServicesReleasing()) {
                event.preventDefault();
                return;
            }
            if (isServicesActive()) {
                event.preventDefault();
                if (!event.repeat) {
                    const direction = forward ? 1 : -1;
                    if (getServicesPhase() !== "waiting" || performance.now() < getServicesGateUntil()) {
                        queueIntent(direction, 160, 18, getServicesPhase() === "waiting");
                        if (getServicesPhase() === "waiting")
                            flushPendingIntent();
                    }
                    else {
                        requestServicesDirection(direction);
                    }
                }
                return;
            }
        };

        const maintainPinnedScroll = () => {
            const targetY = isServicesActive() && !isServicesReleasing()
                ? getServicesLockY()
                : null;
            if (targetY !== null)
                correctNativeScroll(targetY);
        };

        registration = registerMotionInputStory({
            id: "services",
            priority: 100,
            root,
            canClaim: () => !isDisposed() && (isServicesActive() || isServicesReleasing()),
            observe: ({ kind }) => {
                if (kind === "touchstart")
                    touchGestureActive = true;
                else if (kind === "touchend" || kind === "touchcancel")
                    touchGestureActive = false;
            },
            onGesture: ({ event, kind }) => {
                if (kind === "wheel")
                    handleWheel(event as WheelEvent);
                else if (kind === "touchstart")
                    handleTouchStart(event as TouchEvent);
                else if (kind === "touchmove")
                    handleTouchMove(event as TouchEvent);
                else if (kind === "touchend" || kind === "touchcancel")
                    handleTouchEnd();
                else if (kind === "keydown")
                    handleKeydown(event as KeyboardEvent);
                else if (kind === "scroll")
                    maintainPinnedScroll();
                const phase = getServicesPhase();
                const releaseWaitingGesture =
                    phase === "waiting" &&
                    (kind === "wheel" ||
                        kind === "keydown" ||
                        kind === "touchend" ||
                        kind === "touchcancel");
                return {
                    handled: event.defaultPrevented,
                    progress: phase === "waiting"
                        ? undefined
                        : `${phase}:${Math.max(0, getServicesStage() + 1)}`,
                    release: releaseWaitingGesture,
                };
            },
            release: (reason) => {
                touchGestureActive = false;
                if ((reason === "watchdog" || reason === "superseded") &&
                    (isServicesActive() || isServicesReleasing() || servicesOwnsLenisLock())) {
                    releaseServicesForNavigation();
                }
            },
        });

        return {
            claim: (progress) => registration?.claim(progress),
            clearPendingIntent,
            dispose: () => {
                clearPendingIntent();
                registration?.unregister();
                registration = null;
            },
            flushPendingIntent,
            ignoreCurrentTouchGesture: () => {
                ignoreCurrentTouch = touchGestureActive;
            },
            isOwner: () => registration?.isOwner() ?? false,
            markProgress: (progress) => registration?.markProgress(progress),
            release: (reason) => registration?.release(reason),
            resetBlockedInput,
            resetGestureTotal,
        };
    }, []);
}
