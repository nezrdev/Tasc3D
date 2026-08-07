"use client";

import { useEffect, useRef, type RefObject } from "react";
import type Lenis from "lenis";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DOMINO_DURATION } from "@/data/runtime-media";
import {
    getMotionStoryController,
    type MotionStoryDirection,
    type MotionStoryEntry,
    type MotionStoryRegistration,
} from "@/lib/motion-story-controller";
import { scheduleScrollTriggerRefresh } from "@/lib/scroll-trigger-refresh";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export type ReversibleScrollStoriesOptions = {
    rootRef: RefObject<HTMLElement | null>;
    dominoVideoRef: RefObject<HTMLVideoElement | null>;
    dominoReverseVideoRef: RefObject<HTMLVideoElement | null>;
    lenisRef: RefObject<Lenis | null>;
    transportKey?: string;
    onForwardCompletedOnce?: () => void;
    enabled: boolean;
    story: "how" | "domino";
};

const DOMINO_PLAYBACK_RATE = 1.25;
const DOMINO_DECODE_FAILURE_MS = 8000;

const viewportHeight = () => Math.max(1, window.visualViewport?.height ?? window.innerHeight);

const isEditableTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));

const entersRange = (
    direction: MotionStoryDirection,
    scrollY: number,
    deltaY: number,
    start: number,
    end: number,
    corridor: number,
) => {
    const predicted = scrollY + deltaY;
    return direction > 0
        ? scrollY >= start - corridor && scrollY <= start + corridor && predicted >= start - corridor
        : scrollY >= end - corridor && scrollY <= end + corridor && predicted <= end + corridor;
};

const tweenPromise = (build: (resolve: () => void) => gsap.core.Timeline) =>
    new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled)
                return;
            settled = true;
            resolve();
        };
        const timeline = build(finish);
        timeline.eventCallback("onInterrupt", finish);
    });

export function useReversibleScrollStories({
    rootRef,
    dominoVideoRef,
    dominoReverseVideoRef,
    lenisRef,
    transportKey = "default",
    onForwardCompletedOnce,
    enabled,
    story,
}: ReversibleScrollStoriesOptions) {
    const onForwardCompletedRef = useRef(onForwardCompletedOnce);

    useEffect(() => {
        onForwardCompletedRef.current = onForwardCompletedOnce;
    }, [onForwardCompletedOnce]);

    useGSAP(() => {
        const root = rootRef.current;
        if (!root || !enabled)
            return;
        const controller = getMotionStoryController(root, () => lenisRef.current);

        if (story === "how") {
            const section = root.querySelector<HTMLElement>(".how-work-motion-section");
            const inner = section?.querySelector<HTMLElement>(".how-work-motion-inner");
            const numbers = section
                ? Array.from(section.querySelectorAll<HTMLElement>(".how-work-step-number"))
                : [];
            const copies = section
                ? Array.from(section.querySelectorAll<HTMLElement>(".how-work-step-copy"))
                : [];
            if (!section || !inner || numbers.length !== 3 || copies.length !== 3)
                return;

            const inactiveNumber = {
                autoAlpha: 0.62,
                color: "rgba(119, 177, 244, 0.7)",
                scale: 0.67,
            };
            const activeNumber = { autoAlpha: 1, color: "#badaff", scale: 1 };
            let disposed = false;
            let currentStep = 0;
            let stepTimeline: gsap.core.Timeline | null = null;
            let trigger: ScrollTrigger | null = null;
            let registration: MotionStoryRegistration | null = null;

            const renderStep = (step: number) => {
                currentStep = Math.max(0, Math.min(2, step));
                copies.forEach((copy, index) => {
                    gsap.set(copy, index === currentStep
                        ? { autoAlpha: 1, x: 0, pointerEvents: "auto" }
                        : { autoAlpha: 0, x: -28, pointerEvents: "none" });
                });
                numbers.forEach((number, index) => {
                    gsap.set(number, index === currentStep ? activeNumber : inactiveNumber);
                });
                root.dataset.howWorkStep = String(currentStep + 1);
            };

            const animateStep = (nextStep: number, direction: MotionStoryDirection) => {
                const target = Math.max(0, Math.min(2, nextStep));
                if (target === currentStep)
                    return Promise.resolve();
                stepTimeline?.kill();
                const outgoing = copies[currentStep];
                const incoming = copies[target];
                const outgoingNumber = numbers[currentStep];
                const incomingNumber = numbers[target];
                const travel = direction > 0 ? -26 : 26;
                root.dataset.howWorkTransitioning = "true";
                return tweenPromise((resolve) => {
                    stepTimeline = gsap.timeline({
                        defaults: { overwrite: "auto" },
                        onComplete: () => {
                            currentStep = target;
                            root.dataset.howWorkStep = String(target + 1);
                            delete root.dataset.howWorkTransitioning;
                            stepTimeline = null;
                            resolve();
                        },
                    });
                    stepTimeline
                        .to(outgoing, {
                            autoAlpha: 0,
                            duration: 0.32,
                            ease: "sine.inOut",
                            pointerEvents: "none",
                            x: travel,
                        }, 0)
                        .to(outgoingNumber, { ...inactiveNumber, duration: 0.38, ease: "sine.inOut" }, 0.03)
                        .set(incoming, { autoAlpha: 0, pointerEvents: "auto", x: -travel }, 0.12)
                        .to(incoming, { autoAlpha: 1, duration: 0.5, ease: "power3.out", x: 0 }, 0.14)
                        .to(incomingNumber, { ...activeNumber, duration: 0.44, ease: "sine.inOut" }, 0.14);
                    return stepTimeline;
                });
            };

            gsap.set(inner, { autoAlpha: 0, y: 40 });
            renderStep(0);

            registration = controller.register({
                id: "how",
                priority: 80,
                stageCount: 3,
                getLockY: () => {
                    if (!trigger)
                        return window.scrollY;
                    return currentStep === 2 && window.scrollY > trigger.start
                        ? Math.min(trigger.end - 1, window.scrollY)
                        : trigger.start + 1;
                },
                canEnter: (gesture) => {
                    if (!trigger || disposed || gesture.direction === 0 || isEditableTarget(gesture.event.target))
                        return false;
                    const corridor = Math.min(220, Math.max(72, gesture.viewportHeight * 0.2));
                    if (!entersRange(
                        gesture.direction,
                        gesture.scrollY,
                        gesture.deltaY,
                        trigger.start,
                        trigger.end,
                        corridor,
                    )) {
                        return false;
                    }
                    return {
                        direction: gesture.direction,
                        lockY: gesture.direction > 0 ? trigger.start + 1 : trigger.end - 1,
                        stage: gesture.direction > 0 ? 0 : 2,
                    };
                },
                onEnter: async ({ stage }) => {
                    currentStep = stage;
                    renderStep(stage);
                    root.dataset.servicesBypassed = "true";
                    delete root.dataset.howWorkBypassed;
                    root.dataset.howWorkPinned = "true";
                    await tweenPromise((resolve) => gsap.timeline({ onComplete: resolve })
                        .to(inner, { autoAlpha: 1, duration: 0.46, ease: "power3.out", y: 0 }));
                },
                onIntent: async ({ direction, stage }) => {
                    const next = stage + direction;
                    if (next < 0) {
                        return {
                            release: true,
                            releaseTo: () => Math.max(0, (trigger?.start ?? window.scrollY) - 2),
                            stage: 0,
                        };
                    }
                    if (next > 2) {
                        return {
                            release: true,
                            releaseTo: () => (trigger?.end ?? window.scrollY) + 2,
                            stage: 2,
                        };
                    }
                    await animateStep(next, direction);
                    return { stage: next };
                },
                onRelease: () => {
                    root.dataset.howWorkPinned = "false";
                    delete root.dataset.howWorkTransitioning;
                },
            });

            const enter = (direction: MotionStoryDirection, lockY: number) => {
                if (controller.currentState !== "idle" || registration?.isActive())
                    return;
                const entry: MotionStoryEntry = {
                    direction,
                    lockY,
                    stage: direction > 0 ? 0 : 2,
                };
                void registration?.enter(entry);
            };

            trigger = ScrollTrigger.create({
                id: "how-work-reversible",
                trigger: section,
                start: "top top",
                end: () => `+=${Math.round(viewportHeight())}`,
                pin: true,
                pinSpacing: false,
                anticipatePin: 1,
                refreshPriority: 20,
                invalidateOnRefresh: true,
                onRefresh: (self) => {
                    if (registration?.isActive())
                        registration.updateLock(currentStep === 2 ? self.end - 1 : self.start + 1);
                },
            });

            root.dataset.howWorkProgress = "discrete";
            const handlePositionApplied = () => {
                if (root.dataset.programmaticAnchor === "#work" && trigger)
                    enter(1, trigger.start + 1);
            };
            const handleStoryHandoff = (event: Event) => {
                if (!trigger)
                    return;
                const detail = (event as CustomEvent<{
                    direction?: MotionStoryDirection;
                    from?: string;
                }>).detail;
                if (detail?.from === "services" && detail.direction === 1) {
                    enter(1, trigger.start + 1);
                }
                else if (detail?.from === "datum" && detail.direction === -1) {
                    enter(-1, trigger.end - 1);
                }
            };
            window.addEventListener("tasc:scroll-position-applied", handlePositionApplied);
            window.addEventListener("tasc:motion-story-handoff", handleStoryHandoff);
            scheduleScrollTriggerRefresh(0);
            return () => {
                disposed = true;
                stepTimeline?.kill();
                trigger?.kill();
                registration?.unregister();
                window.removeEventListener("tasc:scroll-position-applied", handlePositionApplied);
                window.removeEventListener("tasc:motion-story-handoff", handleStoryHandoff);
                delete root.dataset.howWorkPinned;
                delete root.dataset.howWorkProgress;
                delete root.dataset.howWorkStep;
                delete root.dataset.howWorkTransitioning;
            };
        }

        const section = root.querySelector<HTMLElement>(".domino-cta-section");
        const scene = section?.querySelector<HTMLElement>(".domino-scene");
        const media = section?.querySelector<HTMLElement>(".domino-media");
        const title = section?.querySelector<HTMLElement>(".domino-video-title");
        const formStage = section?.querySelector<HTMLElement>(".domino-form-stage");
        const formItems = formStage
            ? Array.from(formStage.querySelectorAll<HTMLElement>(
                ".domino-body, .domino-impulse-row, .domino-privacy-row, .lead-form-status",
            ))
            : [];
        const forwardVideo = dominoVideoRef.current;
        const reverseVideo = dominoReverseVideoRef.current;
        if (!section || !scene || !media || !formStage || !forwardVideo || !reverseVideo)
            return;

        const videos = [forwardVideo, reverseVideo] as const;
        let disposed = false;
        let cancelDecodeWait: (() => void) | null = null;
        let cancelPlaybackWait: (() => void) | null = null;
        let operationToken = 0;
        let playbackFrame = 0;
        let playbackToken = 0;
        let sceneTimeline: gsap.core.Timeline | null = null;
        let sceneTimelineResolve: (() => void) | null = null;
        let trigger: ScrollTrigger | null = null;
        let readinessTrigger: ScrollTrigger | null = null;
        let registration: MotionStoryRegistration | null = null;
        let sceneState: "start" | "form" = "start";
        let passThroughDirection: MotionStoryDirection | 0 = 0;

        const setSceneState = (state: "loading" | "video" | "title" | "form" | "error") => {
            root.dataset.dominoSceneState = state;
            section.dataset.dominoSceneState = state;
            if (state === "loading")
                root.dataset.dominoLoading = "true";
            else
                delete root.dataset.dominoLoading;
        };

        const stopPlayback = () => {
            playbackToken += 1;
            window.cancelAnimationFrame(playbackFrame);
            playbackFrame = 0;
            videos.forEach((video) => video.pause());
            setVideoActive(null);
            const cancel = cancelPlaybackWait;
            cancelPlaybackWait = null;
            cancel?.();
            const cancelDecode = cancelDecodeWait;
            cancelDecodeWait = null;
            cancelDecode?.();
        };

        const setVideoActive = (active: HTMLVideoElement | null) => {
            videos.forEach((video) => {
                const selected = video === active;
                video.dataset.dominoActive = String(selected);
                video.dataset.segmentState = selected ? "playing" : "idle";
            });
            root.dataset.activeVideoDecoder = active ? `domino-${active.dataset.dominoDirection}` : "none";
        };

        const waitForDecodedFrame = (video: HTMLVideoElement) => new Promise<boolean>((resolve) => {
            if (video.error) {
                resolve(false);
                return;
            }
            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                resolve(true);
                return;
            }
            setSceneState("loading");
            let settled = false;
            const finish = (ready: boolean) => {
                if (settled)
                    return;
                settled = true;
                window.clearTimeout(failureTimer);
                video.removeEventListener("loadeddata", readyHandler);
                video.removeEventListener("canplay", readyHandler);
                video.removeEventListener("error", errorHandler);
                if (cancelDecodeWait === cancel)
                    cancelDecodeWait = null;
                resolve(ready && !disposed);
            };
            const cancel = () => finish(false);
            const readyHandler = () => {
                if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
                    finish(true);
            };
            const errorHandler = () => finish(false);
            const failureTimer = window.setTimeout(() => {
                root.dataset.dominoMediaFailure = "decode-timeout";
                finish(false);
            }, DOMINO_DECODE_FAILURE_MS);
            video.addEventListener("loadeddata", readyHandler);
            video.addEventListener("canplay", readyHandler);
            video.addEventListener("error", errorHandler);
            cancelDecodeWait = cancel;
            if (video.dataset.armed === "true" && video.networkState === HTMLMediaElement.NETWORK_EMPTY)
                video.load();
        });

        const renderPlaybackFrame = (video: HTMLVideoElement, direction: MotionStoryDirection) => {
            const duration = Number.isFinite(video.duration) && video.duration > 0
                ? video.duration
                : DOMINO_DURATION;
            const progress = Math.max(0, Math.min(1, video.currentTime / Math.max(0.1, duration)));
            const logicalProgress = direction > 0 ? progress : 1 - progress;
            root.dataset.dominoProgress = logicalProgress.toFixed(3);
            if (title) {
                const titleProgress = Math.max(0, Math.min(1, (logicalProgress - 0.2) / 0.22));
                gsap.set(title, {
                    autoAlpha: titleProgress,
                    y: -Math.round(viewportHeight() * 0.18 * Math.max(0, logicalProgress - 0.36)),
                });
            }
            gsap.set(media, { scale: window.innerWidth <= 760 ? 1 : 1.06 - logicalProgress * 0.04 });
        };

        const playDirection = async (direction: MotionStoryDirection, operation: number) => {
            const video = direction > 0 ? forwardVideo : reverseVideo;
            stopPlayback();
            const token = ++playbackToken;
            const ready = await waitForDecodedFrame(video);
            if (operation !== operationToken || token !== playbackToken || disposed)
                return false;
            if (!ready || video.error) {
                root.dataset.dominoMediaFailure = video.error ? `media-${video.error.code}` : "decode-timeout";
                setVideoActive(null);
                return false;
            }
            setSceneState("video");
            setVideoActive(video);
            gsap.set(media, { autoAlpha: 1 });
            if (title)
                gsap.set(title, { autoAlpha: direction > 0 ? 0 : 1, y: direction > 0 ? 0 : -viewportHeight() * 0.18 });
            if (video.currentTime > 0.045 || video.ended) {
                try {
                    video.currentTime = 0.001;
                }
                catch {
                }
            }
            video.loop = false;
            video.muted = true;
            video.playsInline = true;
            video.playbackRate = DOMINO_PLAYBACK_RATE;
            try {
                await video.play();
            }
            catch {
                root.dataset.dominoMediaFailure = "play-error";
                setVideoActive(null);
                return false;
            }
            if (operation !== operationToken || token !== playbackToken || disposed) {
                video.pause();
                setVideoActive(null);
                return false;
            }
            return new Promise<boolean>((resolve) => {
                let settled = false;
                let playbackTimeout = 0;
                const duration = Number.isFinite(video.duration) && video.duration > 0
                    ? video.duration
                    : DOMINO_DURATION;
                const finish = (success: boolean) => {
                    if (settled)
                        return;
                    settled = true;
                    window.cancelAnimationFrame(playbackFrame);
                    window.clearTimeout(playbackTimeout);
                    playbackFrame = 0;
                    video.removeEventListener("ended", handleEnded);
                    video.removeEventListener("error", handleError);
                    video.pause();
                    if (success) {
                        // Keep the decoded terminal frame painted until the scene
                        // transition has fully covered it. Decoder work is already
                        // stopped, so telemetry/background motion can resume now.
                        video.dataset.dominoActive = "true";
                        video.dataset.segmentState = "ready";
                        root.dataset.activeVideoDecoder = "none";
                    }
                    else {
                        video.dataset.segmentState = "fallback";
                        setVideoActive(null);
                    }
                    if (cancelPlaybackWait === cancel)
                        cancelPlaybackWait = null;
                    resolve(success && token === playbackToken && !disposed);
                };
                const cancel = () => finish(false);
                const handleEnded = () => finish(true);
                const handleError = () => {
                    root.dataset.dominoMediaFailure = video.error
                        ? `media-${video.error.code}`
                        : "media-error";
                    finish(false);
                };
                const inspect = () => {
                    if (disposed || token !== playbackToken) {
                        finish(false);
                        return;
                    }
                    renderPlaybackFrame(video, direction);
                    if (video.error) {
                        root.dataset.dominoMediaFailure = `media-${video.error.code}`;
                        finish(false);
                        return;
                    }
                    if (video.ended || video.currentTime >= duration - 1 / 30) {
                        finish(true);
                        return;
                    }
                    playbackFrame = window.requestAnimationFrame(inspect);
                };
                cancelPlaybackWait = cancel;
                video.addEventListener("ended", handleEnded, { once: true });
                video.addEventListener("error", handleError, { once: true });
                playbackTimeout = window.setTimeout(() => {
                    root.dataset.dominoMediaFailure = "playback-timeout";
                    finish(false);
                }, Math.max(8000, duration / DOMINO_PLAYBACK_RATE * 1000 + 2500));
                playbackFrame = window.requestAnimationFrame(inspect);
            });
        };

        const stopSceneTransition = () => {
            sceneTimeline?.kill();
            sceneTimeline = null;
            const resolve = sceneTimelineResolve;
            sceneTimelineResolve = null;
            resolve?.();
        };

        const runSceneTransition = (build: (complete: () => void) => gsap.core.Timeline) =>
            new Promise<void>((resolve) => {
                stopSceneTransition();
                let settled = false;
                const complete = () => {
                    if (settled)
                        return;
                    settled = true;
                    sceneTimeline = null;
                    sceneTimelineResolve = null;
                    resolve();
                };
                sceneTimelineResolve = complete;
                sceneTimeline = build(complete);
            });

        const showForm = async (operation: number, failed = false) => {
            const titleLift = viewportHeight() * 0.29;
            sceneState = "form";
            setSceneState(failed ? "error" : "title");
            root.dataset.dominoPlayback = "complete";
            gsap.set(formStage, { pointerEvents: "none" });
            await runSceneTransition((resolve) => gsap.timeline({ onComplete: resolve })
                .to(title ?? [], { autoAlpha: 1, duration: 0.3, ease: "power2.out", y: -titleLift }, 0.04)
                .to(formStage, { autoAlpha: 1, duration: 0.42, ease: "power3.out" }, 0.18)
                .to(formItems, { autoAlpha: 1, duration: 0.42, ease: "power3.out", stagger: 0.055, y: 0 }, 0.22));
            if (operation !== operationToken || disposed)
                return false;
            gsap.set(formStage, { pointerEvents: "auto" });
            setSceneState(failed ? "error" : "form");
            return true;
        };

        const hideForm = async (operation: number) => {
            sceneState = "start";
            gsap.set(formStage, { pointerEvents: "none" });
            await runSceneTransition((resolve) => gsap.timeline({ onComplete: resolve })
                .to(formItems, { autoAlpha: 0, duration: 0.2, ease: "power2.in", stagger: 0.02, y: 20 }, 0)
                .to(formStage, { autoAlpha: 0, duration: 0.25, ease: "power2.inOut" }, 0.08));
            return operation === operationToken && !disposed;
        };

        const playForward = async () => {
            const operation = ++operationToken;
            if (!await hideForm(operation))
                return false;
            root.dataset.dominoPlayback = "forward";
            delete root.dataset.dominoMediaFailure;
            const success = await playDirection(1, operation);
            if (operation !== operationToken || disposed)
                return false;
            if (!success && !root.dataset.dominoMediaFailure)
                return false;
            if (!await showForm(operation, !success))
                return false;
            onForwardCompletedRef.current?.();
            return true;
        };

        const playReverse = async () => {
            const operation = ++operationToken;
            if (!await hideForm(operation))
                return false;
            root.dataset.dominoPlayback = "reverse";
            delete root.dataset.dominoMediaFailure;
            const success = await playDirection(-1, operation);
            if (operation !== operationToken || disposed)
                return false;
            if (!success) {
                if (!root.dataset.dominoMediaFailure)
                    return false;
                await showForm(operation, true);
                return false;
            }
            sceneState = "start";
            root.dataset.dominoPlayback = "start";
            setSceneState("video");
            gsap.set(media, { autoAlpha: 1 });
            if (title)
                gsap.set(title, { autoAlpha: 0, y: 0 });
            return true;
        };

        gsap.set(media, { autoAlpha: 1, scale: 1 });
        gsap.set(title ?? [], { autoAlpha: 0, y: 0 });
        gsap.set(formStage, { autoAlpha: 0, pointerEvents: "none" });
        gsap.set(formItems, { autoAlpha: 0, y: 24 });
        root.dataset.dominoPlayback = "ready";
        setSceneState("video");
        videos.forEach((video) => {
            video.pause();
            video.loop = false;
            video.playbackRate = DOMINO_PLAYBACK_RATE;
            video.dataset.dominoActive = "false";
            video.dataset.segmentState = "idle";
        });

        registration = controller.register({
            id: "domino",
            priority: 70,
            stageCount: 2,
            getLockY: () => sceneState === "form"
                ? (trigger?.start ?? window.scrollY) + 1
                : window.scrollY,
            canEnter: (gesture) => {
                if (!trigger || disposed || gesture.direction === 0 || isEditableTarget(gesture.event.target))
                    return false;
                if (passThroughDirection === gesture.direction)
                    return false;
                if (passThroughDirection !== 0 && passThroughDirection !== gesture.direction)
                    passThroughDirection = 0;
                const corridor = Math.min(240, Math.max(90, gesture.viewportHeight * 0.24));
                const returningFromForm = gesture.direction < 0 &&
                    sceneState === "form" &&
                    gesture.scrollY >= trigger.start - corridor &&
                    gesture.scrollY <= trigger.end + corridor;
                if (!returningFromForm && !entersRange(
                    gesture.direction,
                    gesture.scrollY,
                    gesture.deltaY,
                    trigger.start,
                    trigger.end,
                    corridor,
                )) {
                    return false;
                }
                return {
                    direction: gesture.direction,
                    lockY: gesture.direction > 0
                        ? trigger.start + 1
                        : trigger.start + 1,
                    stage: gesture.direction > 0 ? 0 : 1,
                };
            },
            onEnter: async ({ direction }) => {
                passThroughDirection = 0;
                if (direction > 0) {
                    await playForward();
                    return { stage: 1 };
                }
                const success = await playReverse();
                if (success)
                    passThroughDirection = -1;
                return success
                    ? {
                        release: true,
                        stage: 0,
                    }
                    : { stage: 1 };
            },
            onIntent: async ({ direction, stage }) => {
                if (stage === 1 && direction < 0) {
                    const success = await playReverse();
                    if (success)
                        passThroughDirection = -1;
                    return success
                        ? {
                            release: true,
                            stage: 0,
                        }
                        : { stage: 1 };
                }
                if (stage === 1 && direction > 0) {
                    passThroughDirection = 1;
                    return {
                        release: true,
                        stage: 1,
                    };
                }
                await playForward();
                return { stage: 1 };
            },
            onRelease: (_context, reason) => {
                if (reason !== "completed") {
                    operationToken += 1;
                    stopSceneTransition();
                    stopPlayback();
                    sceneState = "start";
                    passThroughDirection = 0;
                    root.dataset.dominoPlayback = "ready";
                    setSceneState("video");
                }
                else if (sceneState === "start") {
                    window.requestAnimationFrame(() => {
                        if (!disposed && !registration?.isActive())
                            setVideoActive(null);
                    });
                }
                delete root.dataset.dominoPinned;
            },
        });

        const enter = (direction: MotionStoryDirection, lockY: number) => {
            if (controller.currentState !== "idle" || registration?.isActive())
                return;
            void registration?.enter({
                direction,
                lockY,
                stage: direction > 0 ? 0 : 1,
            });
        };

        trigger = ScrollTrigger.create({
            id: "domino-reversible",
            trigger: scene,
            start: "top top",
            end: () => `+=${Math.round(viewportHeight())}`,
            pin: true,
            pinSpacing: false,
            anticipatePin: 1,
            refreshPriority: 5,
            invalidateOnRefresh: true,
            onToggle: (self) => {
                root.dataset.dominoPinned = String(self.isActive || registration?.isActive());
            },
            onLeave: () => {
                if (passThroughDirection > 0)
                    passThroughDirection = 0;
            },
            onLeaveBack: () => {
                if (passThroughDirection < 0)
                    passThroughDirection = 0;
            },
            onRefresh: (self) => {
                if (registration?.isActive())
                    registration.updateLock(sceneState === "form" ? self.start + 1 : window.scrollY);
            },
        });

        const warmMedia = () => {
            videos.forEach((video) => {
                if (video.dataset.armed === "true" &&
                    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA &&
                    video.networkState === HTMLMediaElement.NETWORK_EMPTY) {
                    video.load();
                }
            });
        };
        readinessTrigger = ScrollTrigger.create({
            id: "domino-quarter-readiness",
            trigger: scene,
            start: () => `top ${Math.round(viewportHeight() * 2)}px`,
            end: "bottom top",
            invalidateOnRefresh: true,
            onEnter: warmMedia,
            onEnterBack: warmMedia,
        });

        const cancelForNavigation = () => {
            if (registration?.isActive())
                void registration.release("superseded");
        };
        const handlePositionApplied = () => {
            if (root.dataset.programmaticAnchor === "#brief" && trigger)
                enter(1, trigger.start + 1);
        };
        const handleVisibility = (event: Event) => {
            if (event.type !== "pagehide" && !document.hidden)
                return;
            operationToken += 1;
            stopSceneTransition();
            stopPlayback();
            if (registration?.isActive())
                void registration.release("superseded");
        };
        window.addEventListener("tasc:release-directional-domino", cancelForNavigation);
        window.addEventListener("tasc:scroll-position-applied", handlePositionApplied);
        document.addEventListener("visibilitychange", handleVisibility);
        window.addEventListener("pagehide", handleVisibility);
        scheduleScrollTriggerRefresh(0);

        return () => {
            disposed = true;
            operationToken += 1;
            stopSceneTransition();
            stopPlayback();
            trigger?.kill();
            readinessTrigger?.kill();
            registration?.unregister();
            window.removeEventListener("tasc:release-directional-domino", cancelForNavigation);
            window.removeEventListener("tasc:scroll-position-applied", handlePositionApplied);
            document.removeEventListener("visibilitychange", handleVisibility);
            window.removeEventListener("pagehide", handleVisibility);
            videos.forEach((video) => {
                delete video.dataset.dominoActive;
                delete video.dataset.segmentState;
            });
            delete root.dataset.activeVideoDecoder;
            delete root.dataset.dominoLoading;
            delete root.dataset.dominoMediaFailure;
            delete root.dataset.dominoPinned;
            delete root.dataset.dominoPlayback;
            delete root.dataset.dominoProgress;
            delete root.dataset.dominoSceneState;
        };
    }, {
        scope: rootRef,
        dependencies: [enabled, story, transportKey],
        revertOnUpdate: true,
    });
}
