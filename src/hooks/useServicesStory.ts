"use client";

import { useCallback } from "react";
import type Lenis from "lenis";
import {
    getMotionStoryController,
    type MotionStoryRegistration,
} from "@/lib/motion-story-controller";
import type { MotionInputReleaseReason } from "@/lib/motion-input-bus";

export type ServicesStoryPhase =
    | "idle"
    | "preparing"
    | "playing"
    | "waiting"
    | "releasing"
    | "reverse";

type ServicesRange = { end: number; start: number };

type ServicesStoryInputOptions = {
    enterServices: (direction: 1 | -1, lockY: number, source: string) => void;
    getLenis: () => Lenis | null;
    getServicesEntryDirection: () => 1 | -1;
    getServicesLockY: () => number;
    getServicesPhase: () => ServicesStoryPhase;
    getServicesRange: () => ServicesRange | null;
    getServicesStage: () => number;
    isDisposed: () => boolean;
    isServicesActive: () => boolean;
    isServicesReleasing: () => boolean;
    releaseServicesForNavigation: () => void;
    requestServicesDirection: (direction: 1 | -1) => boolean;
    root: HTMLElement;
};

export type ServicesStoryInputRuntime = {
    beginRelease: () => void;
    beginTransition: () => void;
    claim: (progress: string) => void;
    clearPendingIntent: () => void;
    dispose: () => void;
    flushPendingIntent: () => void;
    ignoreCurrentTouchGesture: () => void;
    isOwner: () => boolean;
    markProgress: (progress: string) => void;
    release: (
        reason?: MotionInputReleaseReason,
        releaseTo?: number | (() => number),
    ) => void;
    resetBlockedInput: () => void;
    resetGestureTotal: () => void;
    settle: () => void;
};

const inEntryCorridor = (
    direction: 1 | -1,
    scrollY: number,
    deltaY: number,
    range: ServicesRange,
    viewportHeight: number,
) => {
    const corridor = Math.min(220, Math.max(72, viewportHeight * 0.2));
    const predicted = scrollY + deltaY;
    if (direction > 0)
        return scrollY >= range.start - corridor && scrollY <= range.start + corridor && predicted >= range.start - corridor;
    return scrollY >= range.end - corridor && scrollY <= range.end + corridor && predicted <= range.end + corridor;
};

/**
 * Services keeps its authored media FSM. Gesture parsing, one-gesture gating and
 * fixed-position ownership are delegated to MotionStoryController.
 */
export function useServicesStory() {
    return useCallback((options: ServicesStoryInputOptions): ServicesStoryInputRuntime => {
        const controller = getMotionStoryController(options.root, options.getLenis);
        let registration: MotionStoryRegistration | null = null;

        registration = controller.register({
            id: "services",
            priority: 100,
            stageCount: 3,
            getLockY: options.getServicesLockY,
            canEnter: (gesture) => {
                if (options.isDisposed() || options.isServicesReleasing() || options.isServicesActive())
                    return false;
                if (gesture.direction === 0 || gesture.kind === "touchstart")
                    return false;
                const range = options.getServicesRange();
                if (!range || !inEntryCorridor(
                    gesture.direction,
                    gesture.scrollY,
                    gesture.deltaY,
                    range,
                    gesture.viewportHeight,
                )) {
                    return false;
                }
                return {
                    direction: gesture.direction,
                    lockY: gesture.direction > 0 ? range.start + 1 : range.end - 1,
                    stage: gesture.direction > 0 ? 0 : 2,
                };
            },
            onEnter: ({ direction, lockY }) => {
                options.enterServices(direction, lockY ?? options.getServicesLockY(), "story-controller");
                return { pending: true };
            },
            onIntent: ({ direction }) => {
                if (!options.isServicesActive() || options.getServicesPhase() !== "waiting")
                    return { pending: true };
                const accepted = options.requestServicesDirection(direction);
                return accepted
                    ? { pending: true }
                    : { stage: Math.max(0, options.getServicesStage()) };
            },
            onRelease: (_context, reason) => {
                if ((reason === "watchdog" || reason === "superseded") &&
                    (options.isServicesActive() || options.isServicesReleasing())) {
                    options.releaseServicesForNavigation();
                }
            },
        });

        const stage = () => Math.max(0, options.getServicesStage());
        const enterCurrent = () => registration?.enter({
            direction: options.getServicesEntryDirection(),
            lockY: options.getServicesLockY(),
            stage: stage(),
        });

        return {
            // Services still has authored exit media to finish. Keep the shared
            // owner transitioning (and heartbeating) until finishServicesRelease.
            beginRelease: () => registration?.beginTransition(stage()),
            beginTransition: () => {
                if (!registration?.isActive())
                    void enterCurrent();
                registration?.beginTransition(stage());
                registration?.updateLock(options.getServicesLockY());
            },
            claim: () => {
                if (!registration?.isActive())
                    void enterCurrent();
                else
                    registration.updateLock(options.getServicesLockY());
            },
            clearPendingIntent: () => undefined,
            dispose: () => {
                registration?.unregister();
                registration = null;
            },
            flushPendingIntent: () => undefined,
            ignoreCurrentTouchGesture: () => undefined,
            isOwner: () => registration?.isActive() ?? false,
            markProgress: (progress) => registration?.markProgress(progress),
            release: (reason = "completed", releaseTo) => {
                if (registration?.isActive())
                    void registration.release(reason, releaseTo);
            },
            resetBlockedInput: () => undefined,
            resetGestureTotal: () => undefined,
            settle: () => registration?.settle(stage()),
        };
    }, []);
}
