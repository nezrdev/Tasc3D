"use client";
import { useEffect, useRef, type RefObject } from "react";
import type Lenis from "lenis";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DOMINO_DURATION } from "@/data/runtime-media";
import { revealTime } from "@/lib/tasc-motion-timings";
import { getVisualViewportHeight } from "@/lib/visibility";
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
const clamp01 = gsap.utils.clamp(0, 1);
const DOMINO_PLAYBACK_RATE = 1.25;
const DOMINO_FORWARD_MEANINGFUL_TIME = 0.55;
const DOMINO_POST_UNLOCK_QUIET_MS = 300;
const DOMINO_TOUCH_DIRECTION_THRESHOLD = 50;
const DOMINO_WHEEL_DIRECTION_THRESHOLD = 60;
const DOMINO_WHEEL_GESTURE_GAP_MS = 180;
export function useReversibleScrollStories({ rootRef, dominoVideoRef, dominoReverseVideoRef, lenisRef, transportKey = "default", onForwardCompletedOnce, enabled, story, }: ReversibleScrollStoriesOptions) {
    const onForwardCompletedOnceRef = useRef(onForwardCompletedOnce);
    const forwardCompletionReportedRef = useRef(false);
    useEffect(() => {
        onForwardCompletedOnceRef.current = onForwardCompletedOnce;
    }, [onForwardCompletedOnce]);
    useGSAP(() => {
        const root = rootRef.current;
        if (!root || !enabled)
            return;
        const compact = window.matchMedia("(max-width: 760px)").matches;
        const lowPower = root.dataset.mobilePerformance === "true";
        const getViewportHeight = () => Math.max(1, window.visualViewport?.height ?? window.innerHeight);
        const cleanup: Array<() => void> = [];
        const howSection = root.querySelector<HTMLElement>(".how-work-motion-section");
        const howInner = howSection?.querySelector<HTMLElement>(".how-work-motion-inner");
        const howNumbers = howSection
            ? Array.from(howSection.querySelectorAll<HTMLElement>(".how-work-step-number"))
            : [];
        const howCopies = howSection
            ? Array.from(howSection.querySelectorAll<HTMLElement>(".how-work-step-copy"))
            : [];
        const howCopyItems = howCopies.map((copy) => Array.from(copy.querySelectorAll<HTMLElement>("h3, p")));
        if (story === "how" && howSection && howInner && howNumbers.length === 3 && howCopies.length === 3) {
            const inactiveNumber = { scale: 0.67, autoAlpha: 0.62, color: "rgba(119, 177, 244, 0.7)" };
            const activeNumber = { scale: 1, autoAlpha: 1, color: "#badaff" };
            const howStops = [0.02, 0.4, 0.78] as const;
            const howCopyTransition = revealTime(0.13);
            const howItemTransition = revealTime(0.11);
            const howItemStagger = revealTime(0.02);
            const howStepDuration = compact && !lowPower ? 1.3 : 1.34;
            const howWheelThreshold = 18;
            const howTouchThreshold = 36;
            const howWheelGestureGapMs = 220;
            const hiddenCopyPose = { x: -54, y: 0, autoAlpha: 0 };
            const activeCopyPose = { x: 0, y: 0, autoAlpha: 1 };
            const exitingCopyPose = { x: -56, y: 0, autoAlpha: 0 };
            const enteringCopyPose = { x: -56, y: 0, autoAlpha: 0 };
            gsap.set(howInner, { y: 54, autoAlpha: 0 });
            gsap.set(howCopies, hiddenCopyPose);
            gsap.set(howCopyItems.flat(), { x: -16, y: 0, autoAlpha: 1 });
            gsap.set(howCopies[0], activeCopyPose);
            gsap.set(howCopyItems[0], { x: 0, y: 0, autoAlpha: 1 });
            gsap.set(howNumbers, inactiveNumber);
            gsap.set(howNumbers[0], activeNumber);
            let disposed = false;
            let howTimeline: gsap.core.Timeline | null = null;
            let howTrigger: ScrollTrigger | null = null;
            let howRange: ScrollTrigger | null = null;
            let howStepTween: gsap.core.Tween | null = null;
            let howStepWatchdog = 0;
            let transitioning = false;
            let inputRangeActive = false;
            let inputOwner = false;
            let inputSuppressed = false;
            let inputListenersAttached = false;
            let currentStep = 0;
            let wheelDelta = 0;
            let wheelConsumed = false;
            let wheelLastAt = 0;
            let wheelQuietTimer = 0;
            let touchY: number | null = null;
            let touchDelta = 0;
            let touchConsumed = false;
            let pendingDirection: -1 | 1 | null = null;
            const hasForeignInputOwner = () => Boolean(root.dataset.portionedScroll || root.dataset.portionGesture) ||
                root.dataset.servicesPinned === "true" ||
                root.dataset.dominoPinned === "true" ||
                root.dataset.motionInputLocked === "true";
            const accumulateDirectionalDelta = (accumulated: number, delta: number) => accumulated === 0 || Math.sign(accumulated) === Math.sign(delta) ? accumulated + delta : delta;
            const normalizeHowWheel = (event: WheelEvent) => {
                if (event.deltaMode === WheelEvent.DOM_DELTA_LINE)
                    return event.deltaY * 16;
                if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE)
                    return event.deltaY * getViewportHeight();
                return event.deltaY;
            };
            const getStepScroll = (step: number, trigger = howTrigger) => {
                if (!trigger)
                    return window.scrollY;
                const range = Math.max(1, trigger.end - trigger.start);
                const target = trigger.start + range * howStops[step];
                return step === 0 ? Math.min(trigger.end - 1, Math.ceil(trigger.start) + 8) : target;
            };
            const writeHowScroll = (target: number) => {
                const trigger = howTrigger;
                if (!trigger || disposed)
                    return;
                const safeTarget = Math.max(0, target);
                const lenis = lenisRef.current;
                if (lenis)
                    lenis.scrollTo(safeTarget, { immediate: true, force: true });
                else
                    trigger.scroll(safeTarget);
                ScrollTrigger.update();
            };
            const finishHowStepTween = () => {
                window.clearTimeout(howStepWatchdog);
                howStepWatchdog = 0;
                howStepTween = null;
                transitioning = false;
                delete root.dataset.howWorkTransitioning;
            };
            const killHowStepTween = () => {
                if (!howStepTween) {
                    finishHowStepTween();
                    return;
                }
                const tween = howStepTween;
                howStepTween = null;
                tween.kill();
                finishHowStepTween();
            };
            const animateHowScroll = (target: number, onComplete?: () => void) => {
                const trigger = howTrigger;
                if (!trigger || disposed)
                    return;
                killHowStepTween();
                const proxy = { value: trigger.scroll() };
                transitioning = true;
                root.dataset.howWorkTransitioning = "true";
                let tween: gsap.core.Tween;
                const finishAndFlush = () => {
                    if (disposed || howStepTween !== tween)
                        return;
                    finishHowStepTween();
                    onComplete?.();
                    const queuedDirection = pendingDirection;
                    pendingDirection = null;
                    if (queuedDirection !== null && inputOwner && !hasForeignInputOwner()) {
                        requestStep(queuedDirection);
                    }
                };
                tween = gsap.to(proxy, {
                    value: Math.max(0, target),
                    duration: howStepDuration,
                    ease: "power2.inOut",
                    overwrite: true,
                    onUpdate: () => writeHowScroll(proxy.value),
                    onComplete: finishAndFlush,
                    onInterrupt: () => {
                        if (howStepTween === tween)
                            finishHowStepTween();
                    },
                });
                howStepTween = tween;
                howStepWatchdog = window.setTimeout(() => {
                    if (disposed || howStepTween !== tween || !transitioning)
                        return;
                    howStepTween = null;
                    tween.kill();
                    writeHowScroll(Math.max(0, target));
                    transitioning = false;
                    delete root.dataset.howWorkTransitioning;
                    onComplete?.();
                    const queuedDirection = pendingDirection;
                    pendingDirection = null;
                    if (queuedDirection !== null && inputOwner && !hasForeignInputOwner()) {
                        requestStep(queuedDirection);
                    }
                }, Math.max(1400, Math.round((howStepDuration + 0.8) * 1000)));
            };
            const setCurrentStep = (step: number, alignScroll = true) => {
                currentStep = Math.max(0, Math.min(howStops.length - 1, step));
                root.dataset.howWorkStep = String(currentStep + 1);
                if (alignScroll)
                    animateHowScroll(getStepScroll(currentStep));
            };
            const resetWheelGesture = () => {
                window.clearTimeout(wheelQuietTimer);
                wheelQuietTimer = 0;
                wheelDelta = 0;
                wheelConsumed = false;
                wheelLastAt = 0;
            };
            const scheduleWheelGestureReset = () => {
                window.clearTimeout(wheelQuietTimer);
                wheelQuietTimer = window.setTimeout(() => {
                    wheelQuietTimer = 0;
                    wheelDelta = 0;
                    wheelConsumed = false;
                }, howWheelGestureGapMs);
            };
            const resetTouchGesture = () => {
                touchY = null;
                touchDelta = 0;
                touchConsumed = false;
            };
            function detachInputListeners() {
                if (!inputListenersAttached)
                    return;
                inputListenersAttached = false;
                window.removeEventListener("wheel", handleWheel, true);
                window.removeEventListener("touchstart", handleTouchStart, true);
                window.removeEventListener("touchmove", handleTouchMove, true);
                window.removeEventListener("touchend", handleTouchEnd, true);
                window.removeEventListener("touchcancel", handleTouchEnd, true);
                window.removeEventListener("keydown", handleKey, true);
                resetWheelGesture();
                resetTouchGesture();
            }
            const releaseInputOwner = (detach = false) => {
                inputOwner = false;
                pendingDirection = null;
                delete root.dataset.howWorkInputOwner;
                if (detach)
                    detachInputListeners();
            };
            const claimInputOwner = (step: number) => {
                if (disposed || inputSuppressed || hasForeignInputOwner())
                    return false;
                inputOwner = true;
                currentStep = Math.max(0, Math.min(howStops.length - 1, step));
                root.dataset.howWorkInputOwner = "true";
                root.dataset.howWorkPinned = "true";
                root.dataset.howWorkStep = String(currentStep + 1);
                attachInputListeners();
                return true;
            };
            const consumeCurrentEntryGesture = () => {
                if (wheelLastAt > 0 && performance.now() - wheelLastAt <= howWheelGestureGapMs) {
                    wheelConsumed = true;
                    scheduleWheelGestureReset();
                }
                if (touchY !== null)
                    touchConsumed = true;
            };
            const releaseBackward = () => {
                const trigger = howTrigger;
                if (!trigger)
                    return;
                inputSuppressed = true;
                releaseInputOwner(true);
                killHowStepTween();
                currentStep = 0;
                root.dataset.howWorkStep = "1";
                delete root.dataset.howWorkPinned;
                const scrubTween = trigger.getTween();
                if (scrubTween && typeof scrubTween !== "boolean" && typeof scrubTween.kill === "function") {
                    scrubTween.kill();
                }
                howTimeline?.progress(0);
                root.dataset.howWorkProgress = "0.000";
                const handoff = new CustomEvent("tasc:how-work-release-backward", {
                    cancelable: true,
                    detail: { fallbackY: trigger.start - 2 },
                });
                if (window.dispatchEvent(handoff))
                    writeHowScroll(trigger.start - 2);
            };
            const releaseForward = () => {
                const trigger = howTrigger;
                if (!trigger)
                    return;
                const datumPin = ScrollTrigger.getById("datum-reversible");
                const datumEntrance = ScrollTrigger.getById("datum-entrance");
                const datumTarget = datumPin?.start ??
                    datumEntrance?.start ??
                    trigger.end + Math.round(getViewportHeight() * 0.2);
                animateHowScroll(Math.max(trigger.end + 2, Math.ceil(datumTarget) + 6), () => {
                    releaseInputOwner();
                });
            };
            const requestStep = (direction: -1 | 1) => {
                if (!inputOwner || hasForeignInputOwner()) {
                    releaseInputOwner(hasForeignInputOwner());
                    return;
                }
                if (transitioning) {
                    pendingDirection = direction;
                    return;
                }
                if (direction > 0) {
                    if (currentStep < howStops.length - 1)
                        setCurrentStep(currentStep + 1);
                    else
                        releaseForward();
                    return;
                }
                if (currentStep > 0)
                    setCurrentStep(currentStep - 1);
                else
                    releaseBackward();
            };
            type HowCaptureState = "active" | "boundary" | null;
            const resolveCaptureState = (direction: -1 | 1, gestureDistance = 0): HowCaptureState => {
                const trigger = howTrigger;
                if (!trigger || disposed || inputSuppressed || hasForeignInputOwner())
                    return null;
                if (inputOwner && trigger.isActive)
                    return "active";
                const scroll = trigger.scroll();
                const corridor = Math.min(180, Math.max(48, getViewportHeight() * 0.16));
                const crossesStart = direction > 0 && scroll < trigger.start && scroll + gestureDistance >= trigger.start;
                const crossesEnd = direction < 0 && scroll > trigger.end && scroll - gestureDistance <= trigger.end;
                if (!trigger.isActive &&
                    direction > 0 &&
                    (scroll >= trigger.start - corridor || crossesStart) &&
                    scroll < trigger.start) {
                    if (!claimInputOwner(0))
                        return null;
                    setCurrentStep(0);
                    return "boundary";
                }
                if (!trigger.isActive &&
                    direction < 0 &&
                    (scroll <= trigger.end + corridor || crossesEnd) &&
                    scroll > trigger.end) {
                    if (!claimInputOwner(howStops.length - 1))
                        return null;
                    setCurrentStep(howStops.length - 1);
                    return "boundary";
                }
                if (!trigger.isActive)
                    return null;
                const nearestStep = howStops.reduce<number>((nearest, progress, index) => Math.abs(trigger.progress - progress) <
                    Math.abs(trigger.progress - (howStops[nearest] ?? howStops[0]))
                    ? index
                    : nearest, 0);
                return claimInputOwner(nearestStep) ? "active" : null;
            };
            const ownEvent = (event: Event) => {
                if (event.cancelable)
                    event.preventDefault();
                event.stopImmediatePropagation();
            };
            function handleWheel(event: WheelEvent) {
                if (event.ctrlKey)
                    return;
                const delta = normalizeHowWheel(event);
                if (Math.abs(delta) < 0.5)
                    return;
                const now = performance.now();
                wheelLastAt = now;
                const direction: -1 | 1 = delta > 0 ? 1 : -1;
                const captureState = resolveCaptureState(direction, Math.abs(delta));
                if (!captureState)
                    return;
                ownEvent(event);
                scheduleWheelGestureReset();
                if (captureState === "boundary") {
                    wheelConsumed = true;
                    wheelDelta = 0;
                    return;
                }
                if (wheelConsumed)
                    return;
                wheelDelta = accumulateDirectionalDelta(wheelDelta, delta);
                if (Math.abs(wheelDelta) < howWheelThreshold)
                    return;
                wheelConsumed = true;
                wheelDelta = 0;
                requestStep(direction);
            }
            function handleTouchStart(event: TouchEvent) {
                if (event.touches.length !== 1 || inputSuppressed || hasForeignInputOwner()) {
                    resetTouchGesture();
                    return;
                }
                touchY = event.touches[0]?.clientY ?? null;
                touchDelta = 0;
                touchConsumed = false;
            }
            function handleTouchMove(event: TouchEvent) {
                const touch = event.touches.length === 1 ? event.touches[0] : null;
                if (!touch || touchY === null)
                    return;
                const delta = touchY - touch.clientY;
                touchY = touch.clientY;
                if (Math.abs(delta) < 0.5)
                    return;
                const direction: -1 | 1 = delta > 0 ? 1 : -1;
                const captureState = resolveCaptureState(direction, Math.abs(delta));
                if (!captureState)
                    return;
                ownEvent(event);
                if (captureState === "boundary") {
                    touchConsumed = true;
                    touchDelta = 0;
                    return;
                }
                if (touchConsumed)
                    return;
                touchDelta = accumulateDirectionalDelta(touchDelta, delta);
                if (Math.abs(touchDelta) < howTouchThreshold)
                    return;
                touchConsumed = true;
                touchDelta = 0;
                requestStep(direction);
            }
            function handleTouchEnd() {
                resetTouchGesture();
            }
            function handleKey(event: KeyboardEvent) {
                if (event.target instanceof Element &&
                    event.target.closest("input, textarea, select, button, [contenteditable='true']")) {
                    return;
                }
                const forward = event.key === "ArrowDown" ||
                    event.key === "PageDown" ||
                    (event.key === " " && !event.shiftKey);
                const backward = event.key === "ArrowUp" ||
                    event.key === "PageUp" ||
                    (event.key === " " && event.shiftKey);
                if (!forward && !backward)
                    return;
                const direction: -1 | 1 = forward ? 1 : -1;
                const keyDistance = event.key === "PageDown" || event.key === "PageUp" || event.key === " "
                    ? getViewportHeight()
                    : 64;
                const captureState = resolveCaptureState(direction, keyDistance);
                if (!captureState)
                    return;
                ownEvent(event);
                if (captureState === "boundary" || event.repeat)
                    return;
                requestStep(direction);
            }
            function attachInputListeners() {
                if (inputListenersAttached || disposed || inputSuppressed)
                    return;
                inputListenersAttached = true;
                window.addEventListener("wheel", handleWheel, { capture: true, passive: false });
                window.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
                window.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
                window.addEventListener("touchend", handleTouchEnd, { capture: true, passive: true });
                window.addEventListener("touchcancel", handleTouchEnd, { capture: true, passive: true });
                window.addEventListener("keydown", handleKey, true);
            }
            const syncInputListeners = () => {
                const shouldListen = !inputSuppressed && (inputRangeActive || Boolean(howTrigger?.isActive) || inputOwner);
                if (shouldListen)
                    attachInputListeners();
                else
                    detachInputListeners();
            };
            const howEntrance = gsap.fromTo(howInner, { y: 54, autoAlpha: 0 }, {
                y: 0,
                autoAlpha: 1,
                ease: "none",
                immediateRender: false,
                scrollTrigger: {
                    id: "how-work-entrance",
                    trigger: howSection,
                    start: "top 78%",
                    end: "top 18%",
                    scrub: lowPower ? 0.28 : 0.36,
                    refreshPriority: -21,
                    invalidateOnRefresh: true,
                },
            });
            howTimeline = gsap.timeline({
                defaults: { ease: "none" },
                scrollTrigger: {
                    id: "how-work-reversible",
                    trigger: howSection,
                    start: "top top",
                    end: () => `+=${Math.round(getViewportHeight() * (lowPower ? 1.08 : compact ? 1.34 : 1.22))}`,
                    pin: true,
                    scrub: true,
                    anticipatePin: 1,
                    refreshPriority: 20,
                    invalidateOnRefresh: true,
                    onEnter: () => {
                        inputSuppressed = false;
                        syncInputListeners();
                        if (hasForeignInputOwner())
                            return;
                        root.dataset.howWorkPinned = "true";
                        if (!inputOwner && claimInputOwner(0)) {
                            consumeCurrentEntryGesture();
                            setCurrentStep(0, false);
                        }
                    },
                    onEnterBack: () => {
                        inputSuppressed = false;
                        syncInputListeners();
                        if (hasForeignInputOwner())
                            return;
                        root.dataset.howWorkPinned = "true";
                        if (!inputOwner && claimInputOwner(howStops.length - 1)) {
                            consumeCurrentEntryGesture();
                            setCurrentStep(howStops.length - 1, false);
                        }
                    },
                    onToggle: (self) => {
                        if (self.isActive &&
                            !root.dataset.portionedScroll &&
                            !root.dataset.portionGesture &&
                            root.dataset.servicesPinned !== "true" &&
                            root.dataset.dominoPinned !== "true") {
                            root.dataset.howWorkPinned = "true";
                        }
                        else {
                            delete root.dataset.howWorkPinned;
                        }
                        syncInputListeners();
                    },
                    onLeave: () => {
                        releaseInputOwner();
                        delete root.dataset.howWorkPinned;
                        syncInputListeners();
                    },
                    onLeaveBack: () => {
                        releaseInputOwner();
                        delete root.dataset.howWorkPinned;
                        syncInputListeners();
                    },
                    onUpdate: (self) => {
                        root.dataset.howWorkProgress = self.progress.toFixed(3);
                        if (inputOwner && hasForeignInputOwner()) {
                            releaseInputOwner(true);
                            return;
                        }
                        if (self.isActive)
                            syncInputListeners();
                    },
                },
            });
            howTrigger = howTimeline.scrollTrigger ?? null;
            howTimeline
                .to({}, { duration: 1 }, 0)
                .to(howCopies[0], { ...exitingCopyPose, duration: howCopyTransition, ease: "power2.inOut" }, 0.075)
                .to(howNumbers[0], { ...inactiveNumber, duration: howCopyTransition, ease: "power2.inOut" }, 0.19)
                .to(howNumbers[1], { ...activeNumber, duration: howCopyTransition, ease: "power2.inOut" }, 0.19)
                .fromTo(howCopies[1], enteringCopyPose, {
                ...activeCopyPose,
                duration: howCopyTransition,
                ease: "power2.inOut",
                immediateRender: false,
            }, 0.17)
                .fromTo(howCopyItems[1], { x: -16, y: 0 }, {
                x: 0,
                y: 0,
                duration: howItemTransition,
                stagger: howItemStagger,
                ease: "power2.out",
                immediateRender: false,
            }, 0.17)
                .to(howCopies[1], { ...exitingCopyPose, duration: howCopyTransition, ease: "power2.inOut" }, 0.445)
                .to(howNumbers[1], { ...inactiveNumber, duration: howCopyTransition, ease: "power2.inOut" }, 0.56)
                .to(howNumbers[2], { ...activeNumber, duration: howCopyTransition, ease: "power2.inOut" }, 0.56)
                .fromTo(howCopies[2], enteringCopyPose, {
                ...activeCopyPose,
                duration: howCopyTransition,
                ease: "power2.inOut",
                immediateRender: false,
            }, 0.54)
                .fromTo(howCopyItems[2], { x: -16, y: 0 }, {
                x: 0,
                y: 0,
                duration: howItemTransition,
                stagger: howItemStagger,
                ease: "power2.out",
                immediateRender: false,
            }, 0.54)
                .addLabel("step-01", howStops[0])
                .addLabel("step-02", howStops[1])
                .addLabel("step-03", howStops[2])
                .addLabel("story-end", 1);
            howRange = ScrollTrigger.create({
                id: "how-work-visual-range",
                trigger: howSection,
                start: () => Math.max(0, (howTrigger?.start ?? window.scrollY) - Math.round(getViewportHeight() * 0.75)),
                end: () => (howTrigger?.end ?? window.scrollY) + Math.round(getViewportHeight() * 0.75),
                refreshPriority: 19,
                invalidateOnRefresh: true,
                onToggle: (self) => {
                    inputRangeActive = self.isActive;
                    if (self.isActive)
                        root.dataset.howWorkInrange = "true";
                    else
                        delete root.dataset.howWorkInrange;
                    syncInputListeners();
                },
            });
            cleanup.push(() => {
                disposed = true;
                inputSuppressed = true;
                releaseInputOwner(true);
                killHowStepTween();
                window.clearTimeout(wheelQuietTimer);
                howRange?.kill();
                howEntrance.scrollTrigger?.kill();
                howEntrance.kill();
                howTimeline?.scrollTrigger?.kill();
                howTimeline?.kill();
                delete root.dataset.howWorkProgress;
                delete root.dataset.howWorkStep;
                delete root.dataset.howWorkInputOwner;
                delete root.dataset.howWorkTransitioning;
                delete root.dataset.howWorkPinned;
                delete root.dataset.howWorkInrange;
            });
        }
        const dominoSection = root.querySelector<HTMLElement>(".domino-cta-section");
        const dominoScene = dominoSection?.querySelector<HTMLElement>(".domino-scene");
        const dominoMedia = dominoSection?.querySelector<HTMLElement>(".domino-media");
        const dominoTitle = dominoSection?.querySelector<HTMLElement>(".domino-video-title");
        const dominoFormCopy = dominoSection?.querySelector<HTMLElement>(".domino-form-stage .domino-copy");
        const dominoForwardVideo = dominoVideoRef.current;
        const dominoReverseVideo = dominoReverseVideoRef.current;
        if (story === "domino" &&
            dominoSection &&
            dominoScene &&
            dominoMedia &&
            dominoForwardVideo &&
            dominoReverseVideo) {
            const durationHint = DOMINO_DURATION;
            const isCompactDomino = () => window.innerWidth <= 760;
            const videos = [dominoForwardVideo, dominoReverseVideo] as const;
            const setScaleX = gsap.quickSetter(dominoMedia, "scaleX");
            const setScaleY = gsap.quickSetter(dominoMedia, "scaleY");
            const setTitleOpacity = dominoTitle ? gsap.quickSetter(dominoTitle, "opacity") : null;
            const setTitleY = dominoTitle ? gsap.quickSetter(dominoTitle, "y", "px") : null;
            let disposed = false;
            let locked = false;
            let direction: -1 | 0 | 1 = 0;
            let requestedDirection: -1 | 0 | 1 = 0;
            let logicalTime = 0;
            let transportToken = 0;
            let monitorFrame = 0;
            let transportRetryTimer = 0;
            let touchY: number | null = null;
            let lockedTouchDelta = 0;
            let lockedWheelDelta = 0;
            let lockedWheelLastAt = 0;
            let entryIntent: -1 | 0 | 1 = 0;
            let entryTouchY: number | null = null;
            let entryTouchDelta = 0;
            let entryTouchEpoch = -1;
            let entryWheelDelta = 0;
            let entryWheelLastAt = 0;
            let gestureEpoch = 0;
            let postUnlockQuietUntil = 0;
            let postUnlockDirection: -1 | 0 | 1 = 0;
            let sessionDirection: -1 | 0 | 1 = 0;
            let sessionBoundaryY: number | null = null;
            let boundaryHoldFrame = 0;
            let dominoTrigger: ScrollTrigger | null = null;
            let dominoApproachTrigger: ScrollTrigger | null = null;
            let dominoReadinessTrigger: ScrollTrigger | null = null;
            let syncInputListeners = () => { };
            let formHandoffTimer = 0;
            let formHandoffActive = false;
            let reverseHandoffActive = false;
            let forwardApproachAlignPending = false;
            let forwardApproachHandoffActive = false;
            let removeReadinessListeners = () => { };
            let transportAttemptDirection: -1 | 0 | 1 = 0;
            let transportAttemptStartedAt = 0;
            let transportAttemptFailures = 0;
            const transportUnavailable = new Set<-1 | 1>();
            const accumulateDirectionalDelta = (accumulated: number, delta: number) => accumulated === 0 || Math.sign(accumulated) === Math.sign(delta) ? accumulated + delta : delta;
            const resetGestureTracking = () => {
                touchY = null;
                lockedTouchDelta = 0;
                lockedWheelDelta = 0;
                lockedWheelLastAt = 0;
                entryTouchY = null;
                entryTouchDelta = 0;
                entryTouchEpoch = -1;
                entryWheelDelta = 0;
                entryWheelLastAt = 0;
            };
            const beginPostUnlockGestureEpoch = (completedDirection: -1 | 0 | 1) => {
                gestureEpoch += 1;
                postUnlockDirection = completedDirection;
                postUnlockQuietUntil = performance.now() + DOMINO_POST_UNLOCK_QUIET_MS;
                entryIntent = 0;
                resetGestureTracking();
            };
            const jumpToScrollPosition = (target: number) => {
                const lenis = lenisRef.current;
                if (lenis) {
                    lenis.scrollTo(target, { immediate: true, force: true });
                    return;
                }
                window.scrollTo({ top: target, left: 0, behavior: "auto" });
            };
            const isDominoVisuallyNear = (viewportMargin = 0.8) => {
                const viewportHeight = getViewportHeight();
                const margin = viewportHeight * viewportMargin;
                const dominoSpacer = dominoScene.closest<HTMLElement>(".pin-spacer-domino-reversible");
                const rect = (dominoSpacer ?? dominoScene).getBoundingClientRect();
                return rect.bottom >= -margin && rect.top <= viewportHeight + margin;
            };
            const resetTransportAttempt = () => {
                transportAttemptDirection = 0;
                transportAttemptStartedAt = 0;
                transportAttemptFailures = 0;
            };
            const beginTransportAttempt = (nextDirection: -1 | 1) => {
                if (transportAttemptDirection === nextDirection && transportAttemptStartedAt > 0)
                    return;
                transportAttemptDirection = nextDirection;
                transportAttemptStartedAt = performance.now();
                transportAttemptFailures = 0;
            };
            const finishFormHandoff = () => {
                formHandoffActive = false;
                delete root.dataset.dominoHandoff;
            };
            const cancelFormHandoff = () => {
                window.clearTimeout(formHandoffTimer);
                formHandoffTimer = 0;
                if (formHandoffActive) {
                    lenisRef.current?.scrollTo(window.scrollY, { immediate: true, force: true });
                }
                finishFormHandoff();
            };
            const handoffToForm = () => {
                cancelFormHandoff();
                if (!dominoFormCopy)
                    return;
                formHandoffTimer = window.setTimeout(() => {
                    formHandoffTimer = 0;
                    if (disposed || root.dataset.dominoPlayback !== "complete")
                        return;
                    const rect = dominoFormCopy.getBoundingClientRect();
                    const viewportHeight = getViewportHeight();
                    const headerOffset = Math.max(76, Math.round(viewportHeight * 0.08));
                    const centeredOffset = Math.max(headerOffset, (viewportHeight - Math.min(rect.height, viewportHeight)) / 2);
                    const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
                    const target = Math.min(maxScroll, Math.max(0, window.scrollY + rect.top - centeredOffset));
                    formHandoffActive = true;
                    root.dataset.dominoHandoff = "form";
                    const lenis = lenisRef.current;
                    if (lenis) {
                        lenis.scrollTo(target, {
                            duration: 0.42,
                            easing: (value) => 1 - Math.pow(1 - value, 4),
                            force: true,
                            onComplete: finishFormHandoff,
                        });
                    }
                    else {
                        window.scrollTo({ top: target, left: 0, behavior: "smooth" });
                        window.setTimeout(finishFormHandoff, 460);
                    }
                }, 90);
            };
            const getDuration = () => {
                const mediaDurations = videos
                    .map((video) => video.duration)
                    .filter((value) => Number.isFinite(value) && value > 0);
                return Math.max(0.1, Math.min(durationHint, ...(mediaDurations.length ? mediaDurations : [durationHint])) - 0.035);
            };
            const activeVideo = () => direction < 0
                ? dominoReverseVideo
                : direction > 0
                    ? dominoForwardVideo
                    : videos.find((video) => video.dataset.dominoActive === "true") ?? null;
            const readLogicalTime = () => {
                const duration = getDuration();
                if (direction > 0)
                    return Math.min(duration, Math.max(0, dominoForwardVideo.currentTime));
                if (direction < 0)
                    return Math.min(duration, Math.max(0, duration - dominoReverseVideo.currentTime));
                return Math.min(duration, Math.max(0, logicalTime));
            };
            const syncVisualState = () => {
                const duration = getDuration();
                const progress = clamp01(logicalTime / duration);
                const compactDomino = isCompactDomino();
                const scale = compactDomino
                    ? 1
                    : progress < 0.35
                        ? 1.08 - (0.08 * progress) / 0.35
                        : 1 + 0.032 * ((progress - 0.35) / 0.65);
                setScaleX(scale);
                setScaleY(scale);
                const titleOpacity = clamp01((progress - 0.22) / 0.08);
                const titleTravel = compactDomino
                    ? Math.min(getViewportHeight() * 0.42, dominoScene.getBoundingClientRect().height * 0.36)
                    : Math.max(getViewportHeight() * 0.24, getViewportHeight() * 0.5 - Math.max(84, getViewportHeight() * 0.095));
                const ascent = -titleTravel * clamp01((progress - 0.28) / 0.62);
                setTitleOpacity?.(titleOpacity);
                setTitleY?.(ascent);
                root.dataset.dominoProgress = progress.toFixed(3);
            };
            const markActive = (video: HTMLVideoElement, state: "playing" | "ready") => {
                videos.forEach((candidate) => {
                    const active = candidate === video;
                    candidate.dataset.dominoActive = String(active);
                    if (active)
                        candidate.dataset.segmentState = state;
                    else if (candidate.dataset.segmentState !== "fallback")
                        candidate.dataset.segmentState = "idle";
                });
            };
            const pauseVideos = () => videos.forEach((video) => video.pause());
            const waitForMetadata = (video: HTMLVideoElement, token: number) => new Promise<boolean>((resolve) => {
                if (video.dataset.armed !== "true") {
                    resolve(false);
                    return;
                }
                if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
                    resolve(true);
                    return;
                }
                let settled = false;
                const finish = (ready: boolean) => {
                    if (settled)
                        return;
                    settled = true;
                    window.clearTimeout(timeout);
                    video.removeEventListener("loadedmetadata", handleMetadata);
                    video.removeEventListener("error", handleError);
                    resolve(ready && token === transportToken && !disposed);
                };
                const handleMetadata = () => finish(true);
                const handleError = () => finish(false);
                const timeout = window.setTimeout(() => finish(false), lowPower ? 3600 : 2400);
                video.addEventListener("loadedmetadata", handleMetadata, { once: true });
                video.addEventListener("error", handleError, { once: true });
                if (video.networkState === HTMLMediaElement.NETWORK_EMPTY)
                    video.load();
            });
            const waitForSeek = (video: HTMLVideoElement, targetTime: number, token: number) => new Promise<boolean>((resolve) => {
                const startedAt = performance.now();
                let frame = 0;
                let settled = false;
                const finish = (ready: boolean) => {
                    if (settled)
                        return;
                    settled = true;
                    window.cancelAnimationFrame(frame);
                    resolve(ready && token === transportToken && locked && !disposed);
                };
                const inspect = () => {
                    if (token !== transportToken || !locked || disposed) {
                        finish(false);
                        return;
                    }
                    const seekSettled = !video.seeking &&
                        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                        Math.abs(video.currentTime - targetTime) <= 0.12;
                    if (seekSettled) {
                        finish(true);
                        return;
                    }
                    if (performance.now() - startedAt >= (lowPower ? 3600 : 2400)) {
                        finish(false);
                        return;
                    }
                    frame = window.requestAnimationFrame(inspect);
                };
                frame = window.requestAnimationFrame(inspect);
            });
            const waitForPlaybackAdvance = (video: HTMLVideoElement, sourceTime: number, token: number) => new Promise<boolean>((resolve) => {
                const startedAt = performance.now();
                let frame = 0;
                let settled = false;
                const finish = (playing: boolean) => {
                    if (settled)
                        return;
                    settled = true;
                    window.cancelAnimationFrame(frame);
                    resolve(playing && token === transportToken && locked && !disposed);
                };
                const inspect = () => {
                    if (token !== transportToken || !locked || disposed) {
                        finish(false);
                        return;
                    }
                    const advanced = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                        !video.paused &&
                        video.currentTime >= sourceTime + 1 / 120;
                    if (advanced) {
                        finish(true);
                        return;
                    }
                    if (performance.now() - startedAt >= (lowPower ? 3600 : 2400)) {
                        finish(false);
                        return;
                    }
                    frame = window.requestAnimationFrame(inspect);
                };
                frame = window.requestAnimationFrame(inspect);
            });
            const holdSessionAtBoundary = () => {
                if (!locked || sessionBoundaryY === null || disposed)
                    return;
                const target = sessionBoundaryY;
                if (Math.abs(window.scrollY - target) <= 0.75)
                    return;
                jumpToScrollPosition(target);
            };
            const scheduleBoundaryHold = () => {
                window.cancelAnimationFrame(boundaryHoldFrame);
                boundaryHoldFrame = window.requestAnimationFrame(() => {
                    boundaryHoldFrame = 0;
                    holdSessionAtBoundary();
                });
            };
            const finishForwardApproachHandoff = () => {
                forwardApproachAlignPending = false;
                forwardApproachHandoffActive = false;
                if (disposed || !locked || sessionDirection !== 1) {
                    sessionBoundaryY = null;
                    return;
                }
                sessionBoundaryY = (dominoTrigger?.start ?? window.scrollY) + 1;
                jumpToScrollPosition(sessionBoundaryY);
                ScrollTrigger.update();
                scheduleBoundaryHold();
            };
            const cancelForwardApproachHandoff = () => {
                const wasActive = forwardApproachHandoffActive;
                forwardApproachAlignPending = false;
                forwardApproachHandoffActive = false;
                if (wasActive) {
                    lenisRef.current?.scrollTo(window.scrollY, { immediate: true, force: true });
                }
                sessionBoundaryY = locked ? window.scrollY : null;
            };
            const alignForwardApproach = () => {
                if (disposed ||
                    !locked ||
                    sessionDirection !== 1 ||
                    !forwardApproachAlignPending ||
                    forwardApproachHandoffActive) {
                    return;
                }
                forwardApproachHandoffActive = true;
                const target = (dominoTrigger?.start ?? window.scrollY) + 1;
                sessionBoundaryY = null;
                const lenis = lenisRef.current;
                if (lenis) {
                    lenis.scrollTo(target, {
                        duration: 0.42,
                        easing: (value) => 1 - Math.pow(1 - value, 4),
                        force: true,
                        onComplete: finishForwardApproachHandoff,
                    });
                    return;
                }
                window.scrollTo({ top: target, left: 0, behavior: "smooth" });
                window.setTimeout(finishForwardApproachHandoff, 460);
            };
            const releaseAtBoundary = (completedDirection: -1 | 1) => {
                window.cancelAnimationFrame(monitorFrame);
                monitorFrame = 0;
                logicalTime = completedDirection > 0 ? getDuration() : 0;
                syncVisualState();
                direction = 0;
                requestedDirection = 0;
                entryIntent = 0;
                sessionDirection = 0;
                locked = false;
                sessionBoundaryY = null;
                window.cancelAnimationFrame(boundaryHoldFrame);
                boundaryHoldFrame = 0;
                beginPostUnlockGestureEpoch(completedDirection);
                syncInputListeners();
                resetTransportAttempt();
                root.dataset.dominoPlayback = completedDirection > 0 ? "complete" : "start";
                if (completedDirection > 0) {
                    if (!forwardCompletionReportedRef.current) {
                        forwardCompletionReportedRef.current = true;
                        root.dataset.dominoReverseMediaArmed = "true";
                        onForwardCompletedOnceRef.current?.();
                    }
                    lenisRef.current?.start();
                    handoffToForm();
                }
                else {
                    cancelFormHandoff();
                    const previousSectionTop = Math.max(0, (dominoTrigger?.start ?? window.scrollY) - getVisualViewportHeight() - 1);
                    reverseHandoffActive = true;
                    window.requestAnimationFrame(() => {
                        if (disposed || root.dataset.dominoPlayback !== "start") {
                            reverseHandoffActive = false;
                            return;
                        }
                        const lenis = lenisRef.current;
                        jumpToScrollPosition(previousSectionTop);
                        ScrollTrigger.update();
                        window.requestAnimationFrame(() => {
                            if (disposed || root.dataset.dominoPlayback !== "start") {
                                reverseHandoffActive = false;
                                return;
                            }
                            jumpToScrollPosition(previousSectionTop);
                            ScrollTrigger.update();
                            lenis?.start();
                            reverseHandoffActive = false;
                        });
                    });
                }
            };
            const monitorPlayback = () => {
                window.cancelAnimationFrame(monitorFrame);
                const update = () => {
                    if (disposed || !locked || direction === 0)
                        return;
                    logicalTime = readLogicalTime();
                    syncVisualState();
                    if (direction > 0 &&
                        forwardApproachAlignPending &&
                        logicalTime >= DOMINO_FORWARD_MEANINGFUL_TIME) {
                        alignForwardApproach();
                    }
                    const duration = getDuration();
                    if (direction > 0 && logicalTime >= duration - 1 / 45) {
                        dominoForwardVideo.pause();
                        dominoForwardVideo.currentTime = duration;
                        markActive(dominoForwardVideo, "ready");
                        releaseAtBoundary(1);
                        return;
                    }
                    if (direction < 0 && logicalTime <= 1 / 45) {
                        dominoReverseVideo.pause();
                        dominoReverseVideo.currentTime = duration;
                        markActive(dominoReverseVideo, "ready");
                        releaseAtBoundary(-1);
                        return;
                    }
                    monitorFrame = window.requestAnimationFrame(update);
                };
                monitorFrame = window.requestAnimationFrame(update);
            };
            const failOpenDominoTransport = (failedDirection: -1 | 1, video: HTMLVideoElement, reason: string) => {
                transportToken += 1;
                window.clearTimeout(transportRetryTimer);
                transportRetryTimer = 0;
                window.cancelAnimationFrame(monitorFrame);
                monitorFrame = 0;
                window.cancelAnimationFrame(boundaryHoldFrame);
                boundaryHoldFrame = 0;
                cancelForwardApproachHandoff();
                pauseVideos();
                direction = 0;
                requestedDirection = 0;
                entryIntent = 0;
                sessionDirection = 0;
                locked = false;
                sessionBoundaryY = null;
                reverseHandoffActive = false;
                beginPostUnlockGestureEpoch(0);
                resetTransportAttempt();
                transportUnavailable.add(failedDirection);
                video.dataset.segmentState = "fallback";
                root.dataset.dominoPlayback = "media-unavailable";
                root.dataset.dominoMediaFailure = reason;
                syncInputListeners();
                lenisRef.current?.start();
            };
            const scheduleTransportRetryOrFailOpen = (nextDirection: -1 | 1, video: HTMLVideoElement, waitingState: string) => {
                beginTransportAttempt(nextDirection);
                transportAttemptFailures += 1;
                const elapsed = performance.now() - transportAttemptStartedAt;
                const retryBudgetMs = lowPower ? 18000 : 12000;
                if (video.error || transportAttemptFailures >= 4 || elapsed >= retryBudgetMs) {
                    failOpenDominoTransport(nextDirection, video, waitingState);
                    return;
                }
                direction = 0;
                requestedDirection = 0;
                video.dataset.segmentState = "buffering";
                root.dataset.dominoPlayback = waitingState;
                transportRetryTimer = window.setTimeout(() => {
                    transportRetryTimer = 0;
                    if (locked && !disposed)
                        void switchDirection(nextDirection);
                }, 180);
            };
            const switchDirection = async (nextDirection: -1 | 1) => {
                if (!locked || disposed)
                    return;
                beginTransportAttempt(nextDirection);
                if (direction === nextDirection && !activeVideo()?.paused)
                    return;
                window.clearTimeout(transportRetryTimer);
                transportRetryTimer = 0;
                logicalTime = readLogicalTime();
                syncVisualState();
                requestedDirection = nextDirection;
                const token = ++transportToken;
                window.cancelAnimationFrame(monitorFrame);
                monitorFrame = 0;
                const outgoing = activeVideo();
                pauseVideos();
                direction = 0;
                const incoming = nextDirection > 0 ? dominoForwardVideo : dominoReverseVideo;
                incoming.dataset.segmentState = "buffering";
                const metadataReady = await waitForMetadata(incoming, token);
                if (!metadataReady || token !== transportToken || !locked || disposed) {
                    if (token === transportToken && locked && !disposed) {
                        scheduleTransportRetryOrFailOpen(nextDirection, incoming, "waiting-media");
                    }
                    return;
                }
                const sourceTime = nextDirection > 0 ? logicalTime : getDuration() - logicalTime;
                const targetTime = Math.min(getDuration(), Math.max(0.001, sourceTime));
                try {
                    incoming.currentTime = targetTime;
                }
                catch {
                }
                const seekReady = await waitForSeek(incoming, targetTime, token);
                if (!seekReady || token !== transportToken || !locked || disposed) {
                    if (token === transportToken && locked && !disposed) {
                        scheduleTransportRetryOrFailOpen(nextDirection, incoming, "waiting-seek");
                    }
                    return;
                }
                incoming.playbackRate = DOMINO_PLAYBACK_RATE;
                incoming.defaultPlaybackRate = DOMINO_PLAYBACK_RATE;
                direction = nextDirection;
                requestedDirection = nextDirection;
                try {
                    await incoming.play();
                }
                catch {
                    if (token !== transportToken || !locked || disposed)
                        return;
                    scheduleTransportRetryOrFailOpen(nextDirection, incoming, "waiting-play");
                    return;
                }
                if (token !== transportToken || !locked || disposed) {
                    incoming.pause();
                    return;
                }
                const playbackAdvanced = await waitForPlaybackAdvance(incoming, targetTime, token);
                if (!playbackAdvanced || token !== transportToken || !locked || disposed) {
                    if (token === transportToken && locked && !disposed) {
                        incoming.pause();
                        scheduleTransportRetryOrFailOpen(nextDirection, incoming, "waiting-frame");
                    }
                    return;
                }
                markActive(incoming, "playing");
                if (outgoing && outgoing !== incoming)
                    outgoing.pause();
                root.dataset.dominoPlayback = nextDirection > 0 ? "forward" : "reverse";
                resetTransportAttempt();
                monitorPlayback();
            };
            const requestDirection = (nextDirection: -1 | 1) => {
                if (!locked || requestedDirection === nextDirection)
                    return;
                const duration = getDuration();
                if (nextDirection > 0 && logicalTime >= duration - 1 / 45)
                    return;
                if (nextDirection < 0 && logicalTime <= 1 / 45)
                    return;
                if (nextDirection < 0)
                    cancelForwardApproachHandoff();
                void switchDirection(nextDirection);
            };
            const startSession = (nextDirection: -1 | 1, boundaryY?: number, triggerConfirmed = false) => {
                const navigationTarget = root.dataset.programmaticAnchor;
                if ((root.dataset.portionedScroll || root.dataset.portionGesture) && navigationTarget !== "#brief")
                    return;
                if (navigationTarget && navigationTarget !== "#brief")
                    return;
                if (transportUnavailable.has(nextDirection))
                    return;
                if (locked) {
                    scheduleBoundaryHold();
                    return;
                }
                const requiresDeliberateOppositeGesture = postUnlockDirection !== 0 && nextDirection === -postUnlockDirection;
                if (navigationTarget !== "#brief" &&
                    ((requiresDeliberateOppositeGesture && entryIntent !== nextDirection) ||
                        (!triggerConfirmed && entryIntent !== nextDirection))) {
                    return;
                }
                entryIntent = 0;
                postUnlockDirection = 0;
                postUnlockQuietUntil = 0;
                gestureEpoch += 1;
                resetGestureTracking();
                cancelFormHandoff();
                window.clearTimeout(transportRetryTimer);
                transportRetryTimer = 0;
                transportToken += 1;
                resetTransportAttempt();
                locked = true;
                sessionDirection = nextDirection;
                syncInputListeners();
                lenisRef.current?.stop();
                const fallbackBoundary = nextDirection > 0 ? (dominoTrigger?.start ?? window.scrollY) + 1 : (dominoTrigger?.end ?? window.scrollY) - 1;
                sessionBoundaryY = Number.isFinite(boundaryY) ? boundaryY! : fallbackBoundary;
                jumpToScrollPosition(sessionBoundaryY);
                logicalTime = nextDirection > 0 ? 0 : getDuration();
                direction = 0;
                requestedDirection = 0;
                root.dataset.dominoPlayback = nextDirection > 0 ? "forward" : "reverse";
                syncVisualState();
                const incomingVideo = nextDirection > 0 ? dominoForwardVideo : dominoReverseVideo;
                if (incomingVideo.dataset.armed === "true" &&
                    incomingVideo.networkState === HTMLMediaElement.NETWORK_EMPTY) {
                    incomingVideo.load();
                }
                requestDirection(nextDirection);
            };
            const startForwardFromApproach = () => {
                if (locked || root.dataset.portionedScroll || root.dataset.portionGesture)
                    return forwardApproachAlignPending;
                forwardApproachAlignPending = true;
                const approachBoundary = Math.max(0, (dominoTrigger?.start ?? window.scrollY) - getVisualViewportHeight() * 0.5);
                const started = startForwardFromCrossedBoundary(approachBoundary);
                if (!started)
                    forwardApproachAlignPending = false;
                return started;
            };
            const startReverseFromCompletedBoundary = () => {
                if (locked ||
                    disposed ||
                    reverseHandoffActive ||
                    transportUnavailable.has(-1) ||
                    root.dataset.dominoPlayback !== "complete" ||
                    logicalTime < getDuration() - 1 / 45 ||
                    !isDominoVisuallyNear()) {
                    return false;
                }
                const reverseBoundary = dominoTrigger?.end;
                startSession(-1, Number.isFinite(reverseBoundary) ? reverseBoundary! - 1 : undefined, true);
                return true;
            };
            const startForwardFromCrossedBoundary = (boundaryY?: number) => {
                const navigationTarget = root.dataset.programmaticAnchor;
                if (locked ||
                    disposed ||
                    reverseHandoffActive ||
                    transportUnavailable.has(1) ||
                    logicalTime > 1 / 45 ||
                    root.dataset.dominoPlayback === "complete" ||
                    (entryIntent !== 1 && navigationTarget !== "#brief") ||
                    !isDominoVisuallyNear(0.35)) {
                    return false;
                }
                const forwardBoundary = Number.isFinite(boundaryY)
                    ? boundaryY!
                    : (dominoTrigger?.start ?? window.scrollY) + 1;
                startSession(1, forwardBoundary, false);
                if (locked) {
                    ScrollTrigger.update();
                    scheduleBoundaryHold();
                }
                return locked;
            };
            const cancelSession = () => {
                cancelFormHandoff();
                cancelForwardApproachHandoff();
                transportToken += 1;
                window.clearTimeout(transportRetryTimer);
                transportRetryTimer = 0;
                window.cancelAnimationFrame(monitorFrame);
                monitorFrame = 0;
                window.cancelAnimationFrame(boundaryHoldFrame);
                boundaryHoldFrame = 0;
                pauseVideos();
                locked = false;
                sessionBoundaryY = null;
                reverseHandoffActive = false;
                forwardApproachAlignPending = false;
                forwardApproachHandoffActive = false;
                beginPostUnlockGestureEpoch(0);
                sessionDirection = 0;
                resetTransportAttempt();
                syncInputListeners();
                lenisRef.current?.start();
                direction = 0;
                requestedDirection = 0;
                videos.forEach((video) => {
                    video.dataset.dominoActive = "false";
                    if (video.dataset.segmentState !== "fallback")
                        video.dataset.segmentState = "idle";
                });
                logicalTime = 0;
                syncVisualState();
                root.dataset.dominoPlayback = "ready";
            };
            const normalizeWheel = (event: WheelEvent) => {
                if (event.deltaMode === WheelEvent.DOM_DELTA_LINE)
                    return event.deltaY * 16;
                if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE)
                    return event.deltaY * getViewportHeight();
                return event.deltaY;
            };
            const handleWheel = (event: WheelEvent) => {
                if (!locked || event.ctrlKey)
                    return;
                event.preventDefault();
                scheduleBoundaryHold();
                const delta = normalizeWheel(event);
                if (Math.abs(delta) < 2)
                    return;
                const now = performance.now();
                if (now - lockedWheelLastAt > DOMINO_WHEEL_GESTURE_GAP_MS)
                    lockedWheelDelta = 0;
                lockedWheelLastAt = now;
                const nextDirection = delta > 0 ? 1 : -1;
                const currentDirection = requestedDirection || direction || sessionDirection;
                if (nextDirection === currentDirection) {
                    lockedWheelDelta = 0;
                    return;
                }
                lockedWheelDelta = accumulateDirectionalDelta(lockedWheelDelta, delta);
                if (Math.abs(lockedWheelDelta) < DOMINO_WHEEL_DIRECTION_THRESHOLD)
                    return;
                lockedWheelDelta = 0;
                requestDirection(nextDirection);
            };
            const handleTouchStart = (event: TouchEvent) => {
                touchY = locked && event.touches[0] ? event.touches[0].clientY : null;
                lockedTouchDelta = 0;
            };
            const handleTouchMove = (event: TouchEvent) => {
                if (!locked || !event.touches[0])
                    return;
                if (event.cancelable)
                    event.preventDefault();
                const nextY = event.touches[0].clientY;
                if (touchY === null) {
                    touchY = nextY;
                    scheduleBoundaryHold();
                    return;
                }
                const delta = touchY - nextY;
                touchY = nextY;
                if (Math.abs(delta) < 1)
                    return;
                const nextDirection = delta > 0 ? 1 : -1;
                const currentDirection = requestedDirection || direction || sessionDirection;
                if (nextDirection === currentDirection) {
                    lockedTouchDelta = 0;
                    return;
                }
                lockedTouchDelta = accumulateDirectionalDelta(lockedTouchDelta, delta);
                if (Math.abs(lockedTouchDelta) < DOMINO_TOUCH_DIRECTION_THRESHOLD)
                    return;
                lockedTouchDelta = 0;
                requestDirection(nextDirection);
            };
            const handleTouchEnd = () => {
                touchY = null;
                lockedTouchDelta = 0;
                if (locked)
                    scheduleBoundaryHold();
            };
            const handleLockedScroll = () => {
                if (locked)
                    scheduleBoundaryHold();
            };
            const handleKey = (event: KeyboardEvent) => {
                if (!locked || event.target instanceof Element && event.target.closest("input, textarea, select, button"))
                    return;
                const forward = event.key === "ArrowDown" || event.key === "PageDown" || (event.key === " " && !event.shiftKey);
                const backward = event.key === "ArrowUp" || event.key === "PageUp" || (event.key === " " && event.shiftKey);
                if (!forward && !backward)
                    return;
                event.preventDefault();
                if (!event.repeat)
                    requestDirection(forward ? 1 : -1);
            };
            const handleEntryWheel = (event: WheelEvent) => {
                if (locked || root.dataset.portionedScroll || root.dataset.portionGesture || event.ctrlKey)
                    return;
                const delta = normalizeWheel(event);
                if (Math.abs(delta) < 2)
                    return;
                const now = performance.now();
                if (now < postUnlockQuietUntil) {
                    entryWheelDelta = 0;
                    entryWheelLastAt = 0;
                    return;
                }
                if (now - entryWheelLastAt > DOMINO_WHEEL_GESTURE_GAP_MS)
                    entryWheelDelta = 0;
                entryWheelLastAt = now;
                entryWheelDelta = accumulateDirectionalDelta(entryWheelDelta, delta);
                if (Math.abs(entryWheelDelta) < DOMINO_WHEEL_DIRECTION_THRESHOLD)
                    return;
                entryIntent = entryWheelDelta > 0 ? 1 : -1;
                entryWheelDelta = 0;
                if (entryIntent < 0) {
                    startReverseFromCompletedBoundary();
                    return;
                }
                const triggerStart = dominoTrigger?.start;
                const distanceToBoundary = Number.isFinite(triggerStart)
                    ? triggerStart! - window.scrollY
                    : Number.POSITIVE_INFINITY;
                const seamGuard = Math.min(180, Math.max(96, getVisualViewportHeight() * 0.2));
                if (distanceToBoundary >= -seamGuard && distanceToBoundary <= seamGuard) {
                    if (event.cancelable)
                        event.preventDefault();
                    startForwardFromCrossedBoundary((triggerStart ?? window.scrollY) + 1);
                }
            };
            const handleEntryTouchStart = (event: TouchEvent) => {
                if (locked || root.dataset.portionedScroll || root.dataset.portionGesture || performance.now() < postUnlockQuietUntil || !event.touches[0]) {
                    entryTouchY = null;
                    entryTouchDelta = 0;
                    entryTouchEpoch = -1;
                    return;
                }
                entryTouchY = event.touches[0].clientY;
                entryTouchDelta = 0;
                entryTouchEpoch = gestureEpoch;
            };
            const handleEntryTouchMove = (event: TouchEvent) => {
                if (locked ||
                    root.dataset.portionedScroll ||
                    root.dataset.portionGesture ||
                    entryTouchY === null ||
                    entryTouchEpoch !== gestureEpoch ||
                    performance.now() < postUnlockQuietUntil ||
                    !event.touches[0]) {
                    return;
                }
                const nextY = event.touches[0].clientY;
                const delta = entryTouchY - nextY;
                entryTouchY = nextY;
                if (Math.abs(delta) < 1)
                    return;
                entryTouchDelta = accumulateDirectionalDelta(entryTouchDelta, delta);
                if (Math.abs(entryTouchDelta) < DOMINO_TOUCH_DIRECTION_THRESHOLD)
                    return;
                entryIntent = entryTouchDelta > 0 ? 1 : -1;
                entryTouchDelta = 0;
                if (entryIntent < 0) {
                    startReverseFromCompletedBoundary();
                    return;
                }
                const triggerStart = dominoTrigger?.start;
                const distanceToBoundary = Number.isFinite(triggerStart)
                    ? triggerStart! - window.scrollY
                    : Number.POSITIVE_INFINITY;
                const seamGuard = Math.min(180, Math.max(96, getVisualViewportHeight() * 0.2));
                if (distanceToBoundary >= -seamGuard && distanceToBoundary <= seamGuard) {
                    if (event.cancelable)
                        event.preventDefault();
                    startForwardFromCrossedBoundary((triggerStart ?? window.scrollY) + 1);
                }
            };
            const handleEntryTouchEnd = () => {
                entryTouchY = null;
                entryTouchDelta = 0;
                entryTouchEpoch = -1;
            };
            const handleEntryKey = (event: KeyboardEvent) => {
                if (locked || root.dataset.portionedScroll || root.dataset.portionGesture || event.target instanceof Element && event.target.closest("input, textarea, select, button")) {
                    return;
                }
                const forward = event.key === "ArrowDown" || event.key === "PageDown" || (event.key === " " && !event.shiftKey);
                const backward = event.key === "ArrowUp" || event.key === "PageUp" || (event.key === " " && event.shiftKey);
                if (forward || backward) {
                    entryIntent = forward ? 1 : -1;
                    if (entryIntent < 0)
                        startReverseFromCompletedBoundary();
                }
            };
            const handleVisibility = () => {
                if (!locked)
                    return;
                if (document.hidden) {
                    pauseVideos();
                    return;
                }
                const resumeDirection = requestedDirection || direction;
                requestedDirection = 0;
                if (resumeDirection)
                    void switchDirection(resumeDirection);
            };
            const markTransportAvailable = (video: HTMLVideoElement, availableDirection: -1 | 1) => {
                if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
                    return;
                transportUnavailable.delete(availableDirection);
                if (transportUnavailable.size === 0)
                    delete root.dataset.dominoMediaFailure;
                if (!locked && root.dataset.dominoPlayback === "media-unavailable") {
                    root.dataset.dominoPlayback = logicalTime >= getDuration() - 1 / 45 ? "complete" : "ready";
                }
            };
            const handleForwardTransportAvailable = () => markTransportAvailable(dominoForwardVideo, 1);
            const handleReverseTransportAvailable = () => markTransportAvailable(dominoReverseVideo, -1);
            let pageShowResumeDirection: -1 | 0 | 1 = 0;
            const handlePageHide = () => {
                if (locked) {
                    pageShowResumeDirection = sessionDirection;
                    cancelSession();
                    logicalTime = pageShowResumeDirection < 0 ? getDuration() : 0;
                    syncVisualState();
                }
            };
            const handlePageShow = (event: PageTransitionEvent) => {
                if (!event.persisted)
                    return;
                markTransportAvailable(dominoForwardVideo, 1);
                markTransportAvailable(dominoReverseVideo, -1);
                lenisRef.current?.start();
                window.requestAnimationFrame(() => {
                    if (disposed)
                        return;
                    ScrollTrigger.refresh();
                    const resumeDirection = pageShowResumeDirection;
                    pageShowResumeDirection = 0;
                    if (!resumeDirection || !dominoTrigger)
                        return;
                    const boundary = resumeDirection > 0 ? dominoTrigger.start + 1 : dominoTrigger.end - 1;
                    const nearSeam = Math.abs(window.scrollY - boundary) <= Math.max(6, getVisualViewportHeight() * 0.04);
                    if (nearSeam)
                        startSession(resumeDirection, boundary, true);
                });
            };
            gsap.set(dominoMedia, {
                scaleX: isCompactDomino() ? 1 : 1.08,
                scaleY: isCompactDomino() ? 1 : 1.08,
                autoAlpha: 1,
            });
            if (dominoTitle)
                gsap.set(dominoTitle, { y: 0, opacity: 0, visibility: "visible" });
            videos.forEach((video) => {
                video.pause();
                video.loop = false;
                video.playbackRate = DOMINO_PLAYBACK_RATE;
                video.defaultPlaybackRate = DOMINO_PLAYBACK_RATE;
                video.dataset.dominoActive = "false";
                video.dataset.segmentState = "idle";
            });
            logicalTime = 0;
            syncVisualState();
            root.dataset.dominoPlayback = "ready";
            const warmDominoMedia = () => {
                removeReadinessListeners();
                root.dataset.dominoQuarterReady = "warming";
                let settled = false;
                let fallbackTimer: number | undefined;
                const hasForwardFrame = () => dominoForwardVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
                const remove = () => {
                    dominoForwardVideo.removeEventListener("loadeddata", markReady);
                    dominoForwardVideo.removeEventListener("canplay", markReady);
                    dominoForwardVideo.removeEventListener("error", markFallback);
                    if (fallbackTimer !== undefined) {
                        window.clearTimeout(fallbackTimer);
                        fallbackTimer = undefined;
                    }
                };
                const markReady = () => {
                    if (settled || disposed)
                        return;
                    if (!hasForwardFrame())
                        return;
                    settled = true;
                    removeReadinessListeners();
                    root.dataset.dominoQuarterReady = "true";
                };
                const markFallback = () => {
                    if (settled || disposed)
                        return;
                    if (hasForwardFrame()) {
                        markReady();
                        return;
                    }
                    settled = true;
                    removeReadinessListeners();
                    root.dataset.dominoQuarterReady = "fallback";
                };
                removeReadinessListeners = remove;
                if (dominoForwardVideo.dataset.armed === "true" &&
                    dominoForwardVideo.networkState === HTMLMediaElement.NETWORK_EMPTY) {
                    dominoForwardVideo.load();
                }
                if (hasForwardFrame()) {
                    markReady();
                }
                else {
                    dominoForwardVideo.addEventListener("loadeddata", markReady, { once: true });
                    dominoForwardVideo.addEventListener("canplay", markReady, { once: true });
                    dominoForwardVideo.addEventListener("error", markFallback, { once: true });
                    fallbackTimer = window.setTimeout(markFallback, isCompactDomino() ? 3600 : 2600);
                }
            };
            dominoReadinessTrigger = ScrollTrigger.create({
                id: "domino-quarter-readiness",
                trigger: dominoScene,
                start: () => `top ${Math.round(getVisualViewportHeight() * 2)}px`,
                end: "bottom top",
                invalidateOnRefresh: true,
                onEnter: warmDominoMedia,
                onEnterBack: warmDominoMedia,
            });
            dominoTrigger = ScrollTrigger.create({
                id: "domino-reversible",
                trigger: dominoScene,
                start: "top top",
                end: () => `+=${Math.min(110, Math.max(72, Math.round(getViewportHeight() * 0.08)))}`,
                pin: true,
                pinSpacing: true,
                anticipatePin: 1,
                refreshPriority: 5,
                invalidateOnRefresh: true,
                onToggle: (self) => {
                    root.dataset.dominoPinned = String(self.isActive);
                },
                onEnter: (self) => startSession(1, self.start + 1, self.direction > 0),
                onEnterBack: (self) => startSession(-1, self.end - 1, self.direction < 0),
                onUpdate: (self) => {
                    if (locked) {
                        if (self.progress <= 0 || self.progress >= 1)
                            scheduleBoundaryHold();
                        return;
                    }
                    if (self.direction > 0 &&
                        self.progress > 0 &&
                        logicalTime <= 1 / 45) {
                        startForwardFromCrossedBoundary(self.start + 1);
                        return;
                    }
                    if (self.direction < 0 &&
                        self.progress <= 1 &&
                        logicalTime >= getDuration() - 1 / 45) {
                        startSession(-1, self.end - 1, true);
                    }
                },
                onLeave: (self) => {
                    if (!locked &&
                        self.direction > 0 &&
                        logicalTime <= 1 / 45) {
                        startForwardFromCrossedBoundary(self.start + 1);
                    }
                    if (locked)
                        scheduleBoundaryHold();
                },
                onLeaveBack: () => {
                    if (locked)
                        scheduleBoundaryHold();
                },
                onRefresh: (self) => {
                    if (!locked || sessionDirection === 0)
                        return;
                    sessionBoundaryY = sessionDirection > 0 ? self.start + 1 : self.end - 1;
                    holdSessionAtBoundary();
                },
            });
            dominoApproachTrigger = ScrollTrigger.create({
                id: "domino-forward-approach",
                trigger: dominoScene,
                start: () => `top ${Math.round(getVisualViewportHeight() * 0.5)}px`,
                end: "top top",
                refreshPriority: 6,
                invalidateOnRefresh: true,
                onEnter: (self) => {
                    warmDominoMedia();
                    if (self.direction > 0) {
                        startForwardFromApproach();
                    }
                },
                onEnterBack: warmDominoMedia,
                onUpdate: (self) => {
                    if (!locked && self.direction > 0 && self.progress > 0) {
                        warmDominoMedia();
                        startForwardFromApproach();
                    }
                },
                onLeave: () => {
                    if (!locked && logicalTime <= 1 / 45) {
                        startForwardFromApproach();
                    }
                },
            });
            let inputListenersAttached = false;
            const attachInputListeners = () => {
                if (inputListenersAttached)
                    return;
                inputListenersAttached = true;
                window.addEventListener("wheel", handleWheel, { capture: true, passive: false });
                window.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
                window.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
                window.addEventListener("touchend", handleTouchEnd, { capture: true, passive: true });
                window.addEventListener("touchcancel", handleTouchEnd, { capture: true, passive: true });
                window.addEventListener("scroll", handleLockedScroll, { passive: true });
                window.addEventListener("keydown", handleKey, true);
            };
            const detachInputListeners = () => {
                if (!inputListenersAttached)
                    return;
                inputListenersAttached = false;
                window.removeEventListener("wheel", handleWheel, true);
                window.removeEventListener("touchstart", handleTouchStart, true);
                window.removeEventListener("touchmove", handleTouchMove, true);
                window.removeEventListener("touchend", handleTouchEnd, true);
                window.removeEventListener("touchcancel", handleTouchEnd, true);
                window.removeEventListener("scroll", handleLockedScroll);
                window.removeEventListener("keydown", handleKey, true);
            };
            syncInputListeners = () => {
                if (locked)
                    attachInputListeners();
                else
                    detachInputListeners();
            };
            syncInputListeners();
            window.addEventListener("wheel", handleEntryWheel, { capture: true, passive: false });
            window.addEventListener("touchstart", handleEntryTouchStart, { capture: true, passive: true });
            window.addEventListener("touchmove", handleEntryTouchMove, { capture: true, passive: false });
            window.addEventListener("touchend", handleEntryTouchEnd, { capture: true, passive: true });
            window.addEventListener("touchcancel", handleEntryTouchEnd, { capture: true, passive: true });
            window.addEventListener("keydown", handleEntryKey, true);
            window.addEventListener("tasc:release-directional-domino", cancelSession);
            dominoForwardVideo.addEventListener("loadeddata", handleForwardTransportAvailable);
            dominoForwardVideo.addEventListener("canplay", handleForwardTransportAvailable);
            dominoReverseVideo.addEventListener("loadeddata", handleReverseTransportAvailable);
            dominoReverseVideo.addEventListener("canplay", handleReverseTransportAvailable);
            window.addEventListener("pagehide", handlePageHide);
            window.addEventListener("pageshow", handlePageShow);
            document.addEventListener("visibilitychange", handleVisibility);
            cleanup.push(() => {
                disposed = true;
                cancelSession();
                dominoTrigger?.kill();
                dominoApproachTrigger?.kill();
                dominoReadinessTrigger?.kill();
                window.clearTimeout(transportRetryTimer);
                transportRetryTimer = 0;
                window.cancelAnimationFrame(boundaryHoldFrame);
                boundaryHoldFrame = 0;
                removeReadinessListeners();
                detachInputListeners();
                window.removeEventListener("wheel", handleEntryWheel, true);
                window.removeEventListener("touchstart", handleEntryTouchStart, true);
                window.removeEventListener("touchmove", handleEntryTouchMove, true);
                window.removeEventListener("touchend", handleEntryTouchEnd, true);
                window.removeEventListener("touchcancel", handleEntryTouchEnd, true);
                window.removeEventListener("keydown", handleEntryKey, true);
                window.removeEventListener("tasc:release-directional-domino", cancelSession);
                dominoForwardVideo.removeEventListener("loadeddata", handleForwardTransportAvailable);
                dominoForwardVideo.removeEventListener("canplay", handleForwardTransportAvailable);
                dominoReverseVideo.removeEventListener("loadeddata", handleReverseTransportAvailable);
                dominoReverseVideo.removeEventListener("canplay", handleReverseTransportAvailable);
                window.removeEventListener("pagehide", handlePageHide);
                window.removeEventListener("pageshow", handlePageShow);
                document.removeEventListener("visibilitychange", handleVisibility);
                videos.forEach((video) => {
                    delete video.dataset.dominoActive;
                    delete video.dataset.segmentState;
                });
                delete root.dataset.dominoPlayback;
                delete root.dataset.dominoProgress;
                delete root.dataset.dominoQuarterReady;
                delete root.dataset.dominoPinned;
                delete root.dataset.dominoHandoff;
                delete root.dataset.dominoMediaFailure;
            });
        }
        let viewportWidth = window.innerWidth;
        let viewportPortrait = window.innerHeight >= window.innerWidth;
        let resizeTimer = 0;
        const refreshForRealViewportChange = () => {
            const nextWidth = window.innerWidth;
            const nextPortrait = window.innerHeight >= window.innerWidth;
            const meaningfulChange = Math.abs(nextWidth - viewportWidth) > 24 || nextPortrait !== viewportPortrait;
            if (!meaningfulChange)
                return;
            viewportWidth = nextWidth;
            viewportPortrait = nextPortrait;
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => {
                ScrollTrigger.sort();
                ScrollTrigger.refresh();
            }, 180);
        };
        window.addEventListener("orientationchange", refreshForRealViewportChange, { passive: true });
        window.visualViewport?.addEventListener("resize", refreshForRealViewportChange, { passive: true });
        const refreshFrame = window.requestAnimationFrame(() => {
            ScrollTrigger.sort();
            ScrollTrigger.refresh();
        });
        return () => {
            window.cancelAnimationFrame(refreshFrame);
            window.clearTimeout(resizeTimer);
            window.removeEventListener("orientationchange", refreshForRealViewportChange);
            window.visualViewport?.removeEventListener("resize", refreshForRealViewportChange);
            cleanup.reverse().forEach((dispose) => dispose());
        };
    }, {
        scope: rootRef,
        dependencies: [enabled, story, transportKey],
        revertOnUpdate: true,
    });
}
