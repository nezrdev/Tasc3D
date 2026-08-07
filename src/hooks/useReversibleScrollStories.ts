"use client";
import { type RefObject } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DOMINO_DURATION } from "@/data/runtime-media";
import { scheduleScrollTriggerRefresh } from "@/lib/scroll-trigger-refresh";
import { acquireScrollLock, type ScrollLockHandle } from "@/lib/scroll-lock";
import { revealTime } from "@/lib/tasc-motion-timings";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export type ReversibleScrollStoriesOptions = {
    rootRef: RefObject<HTMLElement | null>;
    dominoVideoRef: RefObject<HTMLVideoElement | null>;
    transportKey?: string;
    enabled: boolean;
    story: "how" | "domino";
};

const clamp01 = gsap.utils.clamp(0, 1);
const DOMINO_PLAYBACK_RATE = 1.25;
/*
  The Domino frame is held for a little over a viewport of scrolling. That is
  long enough for the sequence to finish under the lock and still leave the
  reader inside the pinned band when it lets go, so the release never reads as
  a jump.
*/
const DOMINO_PIN_TRAVEL_PX = () => {
    const viewportHeight = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
    return Math.round(Math.min(1400, Math.max(620, viewportHeight * 1.15)));
};
/*
  How we work stays pinned - the owner asked to keep the fixation - but the
  three steps are now plain scrub. The band is a little over two viewports so
  each step gets real reading distance instead of being stepped through by a
  gesture threshold.
*/
const HOW_PIN_TRAVEL = (compact: boolean, lowPower: boolean) => {
    const viewportHeight = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
    return Math.round(viewportHeight * (lowPower ? 1.8 : compact ? 2.2 : 2.05));
};

export function useReversibleScrollStories({ rootRef, dominoVideoRef, transportKey = "default", enabled, story, }: ReversibleScrollStoriesOptions) {
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
            const howCopyTransition = revealTime(0.16);
            const howItemTransition = revealTime(0.17);
            const howItemStagger = revealTime(0.03);
            const hiddenCopyPose = { x: -34, y: 0, autoAlpha: 0 };
            const activeCopyPose = { x: 0, y: 0, autoAlpha: 1 };
            const exitingCopyPose = { x: 30, y: -10, autoAlpha: 0 };
            const enteringCopyPose = { x: -30, y: 10, autoAlpha: 0 };
            gsap.set(howInner, { y: 54, autoAlpha: 0 });
            gsap.set(howCopies, hiddenCopyPose);
            gsap.set(howCopyItems.flat(), { x: -12, y: 0, autoAlpha: 1 });
            gsap.set(howCopies[0], activeCopyPose);
            gsap.set(howCopyItems[0], { x: 0, y: 0, autoAlpha: 1 });
            gsap.set(howNumbers, inactiveNumber);
            gsap.set(howNumbers[0], activeNumber);

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
                    refreshPriority: 25,
                    invalidateOnRefresh: true,
                },
            });
            /*
              No input owner, no step tween, no scroll writes. The reader moves
              the page and the steps follow; the only thing the pin does is hold
              the frame still while they read.
            */
            const howTimeline = gsap.timeline({
                defaults: { ease: "none" },
                scrollTrigger: {
                    id: "how-work-reversible",
                    trigger: howSection,
                    start: "top top",
                    end: () => `+=${HOW_PIN_TRAVEL(compact, lowPower)}`,
                    pin: true,
                    scrub: true,
                    anticipatePin: 1,
                    refreshPriority: 20,
                    invalidateOnRefresh: true,
                    onToggle: (self) => {
                        if (self.isActive)
                            root.dataset.howWorkPinned = "true";
                        else
                            delete root.dataset.howWorkPinned;
                    },
                    onUpdate: (self) => {
                        root.dataset.howWorkProgress = self.progress.toFixed(3);
                        const step = howStops.reduce((current, stop, index) => (self.progress >= stop ? index : current), 0);
                        root.dataset.howWorkStep = String(step + 1);
                    },
                },
            });
            howTimeline
                .to({}, { duration: 1 }, 0)
                // Keep the copy handoffs almost sequential. The former 0.11-wide
                // overlap put two headings and two paragraphs on the same pixels,
                // which read as blurred ghost text at ordinary wheel stops.
                .to(howCopies[0], { ...exitingCopyPose, duration: howCopyTransition, ease: "sine.inOut" }, 0.075)
                .to(howNumbers[0], { ...inactiveNumber, duration: howCopyTransition, ease: "sine.inOut" }, 0.15)
                .to(howNumbers[1], { ...activeNumber, duration: howCopyTransition, ease: "sine.inOut" }, 0.15)
                .fromTo(howCopies[1], enteringCopyPose, {
                ...activeCopyPose,
                duration: howCopyTransition,
                ease: "sine.inOut",
                immediateRender: false,
            }, 0.225)
                .fromTo(howCopyItems[1], { x: -12, y: 0 }, {
                x: 0,
                y: 0,
                duration: howItemTransition,
                stagger: howItemStagger,
                ease: "sine.out",
                immediateRender: false,
            }, 0.23)
                .to(howCopies[1], { ...exitingCopyPose, duration: howCopyTransition, ease: "sine.inOut" }, 0.455)
                .to(howNumbers[1], { ...inactiveNumber, duration: howCopyTransition, ease: "sine.inOut" }, 0.525)
                .to(howNumbers[2], { ...activeNumber, duration: howCopyTransition, ease: "sine.inOut" }, 0.525)
                .fromTo(howCopies[2], enteringCopyPose, {
                ...activeCopyPose,
                duration: howCopyTransition,
                ease: "sine.inOut",
                immediateRender: false,
            }, 0.605)
                .fromTo(howCopyItems[2], { x: -12, y: 0 }, {
                x: 0,
                y: 0,
                duration: howItemTransition,
                stagger: howItemStagger,
                ease: "sine.out",
                immediateRender: false,
            }, 0.61)
                .addLabel("step-01", howStops[0])
                .addLabel("step-02", howStops[1])
                .addLabel("step-03", howStops[2])
                .addLabel("story-end", 1);
            cleanup.push(() => {
                howEntrance.scrollTrigger?.kill();
                howEntrance.kill();
                howTimeline.scrollTrigger?.kill();
                howTimeline.kill();
                delete root.dataset.howWorkProgress;
                delete root.dataset.howWorkStep;
                delete root.dataset.howWorkPinned;
            });
        }

        const dominoSection = root.querySelector<HTMLElement>(".domino-cta-section");
        const dominoScene = dominoSection?.querySelector<HTMLElement>(".domino-scene");
        const dominoMedia = dominoSection?.querySelector<HTMLElement>(".domino-media");
        const dominoTitle = dominoSection?.querySelector<HTMLElement>(".domino-video-title");
        const dominoVideo = dominoVideoRef.current;
        if (story === "domino" && dominoSection && dominoScene && dominoMedia && dominoVideo) {
            const isCompactDomino = () => window.innerWidth <= 760;
            const setScaleX = gsap.quickSetter(dominoMedia, "scaleX");
            const setScaleY = gsap.quickSetter(dominoMedia, "scaleY");
            const setTitleOpacity = dominoTitle ? gsap.quickSetter(dominoTitle, "opacity") : null;
            const setTitleY = dominoTitle ? gsap.quickSetter(dominoTitle, "y", "px") : null;
            let disposed = false;
            let played = false;
            let playing = false;
            let monitorFrame = 0;
            let lock: ScrollLockHandle | null = null;
            let readinessTrigger: ScrollTrigger | null = null;
            let pinTrigger: ScrollTrigger | null = null;
            let forwardEntryRequested = false;
            let removeReadinessListeners = () => { };

            const getDuration = () => {
                const mediaDuration = dominoVideo.duration;
                const duration = Number.isFinite(mediaDuration) && mediaDuration > 0
                    ? Math.min(DOMINO_DURATION, mediaDuration)
                    : DOMINO_DURATION;
                return Math.max(0.1, duration - 0.035);
            };
            const syncVisualState = (time: number) => {
                const progress = clamp01(time / getDuration());
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
                setTitleOpacity?.(titleOpacity);
                setTitleY?.(-titleTravel * clamp01((progress - 0.28) / 0.62));
                root.dataset.dominoProgress = progress.toFixed(3);
            };
            const releaseLock = () => {
                lock?.release();
                lock = null;
            };
            /*
              One exit from playback, whatever caused it: the frame monitor
              reaching the end, the media erroring, the tab going away, or the
              lock's own deadline expiring. The scroll always comes back.
            */
            const finishPlayback = (reason: string) => {
                if (!playing)
                    return;
                playing = false;
                played = true;
                window.cancelAnimationFrame(monitorFrame);
                monitorFrame = 0;
                dominoVideo.pause();
                dominoVideo.dataset.dominoActive = "true";
                dominoVideo.dataset.segmentState = "ready";
                releaseLock();
                root.dataset.dominoPlayback = "complete";
                root.dataset.dominoRelease = reason;
                syncVisualState(getDuration());
            };
            const monitorPlayback = () => {
                window.cancelAnimationFrame(monitorFrame);
                const inspect = () => {
                    if (disposed || !playing)
                        return;
                    if (!lock?.isHeld()) {
                        // The safety deadline fired. Let the reader go and stop
                        // pretending the sequence is still driving the page.
                        finishPlayback("lock-expired");
                        return;
                    }
                    if (dominoVideo.error) {
                        root.dataset.dominoMediaFailure = "playback-error";
                        finishPlayback("media-error");
                        return;
                    }
                    const duration = getDuration();
                    const time = Math.max(0, dominoVideo.currentTime);
                    syncVisualState(time);
                    if (dominoVideo.ended || time >= duration - 1 / 45) {
                        finishPlayback("ended");
                        return;
                    }
                    monitorFrame = window.requestAnimationFrame(inspect);
                };
                monitorFrame = window.requestAnimationFrame(inspect);
            };
            const startPlayback = () => {
                if (disposed || played || playing)
                    return;
                if (dominoVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                    // No decoded frame yet: leave the reader alone rather than
                    // freezing them in front of a poster.
                    root.dataset.dominoPlayback = "waiting-media";
                    dominoVideo.dataset.dominoActive = "true";
                    dominoVideo.dataset.segmentState = "ready";
                    return;
                }
                playing = true;
                lock = acquireScrollLock("domino");
                root.dataset.dominoPlayback = "forward";
                delete root.dataset.dominoRelease;
                dominoVideo.dataset.dominoActive = "true";
                dominoVideo.dataset.segmentState = "playing";
                dominoVideo.playbackRate = DOMINO_PLAYBACK_RATE;
                dominoVideo.defaultPlaybackRate = DOMINO_PLAYBACK_RATE;
                try {
                    if (Math.abs(dominoVideo.currentTime) > 1 / 60)
                        dominoVideo.currentTime = 0;
                }
                catch {
                    // Seeking before metadata settles throws on some builds; the
                    // element is already at zero in that case.
                }
                syncVisualState(0);
                void dominoVideo.play().catch(() => {
                    root.dataset.dominoMediaFailure = "play-rejected";
                    finishPlayback("play-rejected");
                });
                monitorPlayback();
            };
            const isAtDominoPinBoundary = () => {
                if (!pinTrigger?.isActive)
                    return false;
                // ScrollTrigger's anticipatePin can report the band active a
                // few pixels early. Do not spend the one-shot playback before
                // the reader has actually crossed the authored top boundary.
                if (window.scrollY + 1 < pinTrigger.start)
                    return false;
                const sceneTop = dominoScene.getBoundingClientRect().top;
                const boundaryTolerance = Math.max(10, getViewportHeight() * 0.018);
                return Math.abs(sceneTop) <= boundaryTolerance;
            };
            const requestForwardPlayback = () => {
                if (disposed || played || playing || !pinTrigger?.isActive ||
                    pinTrigger.direction < 0 || !isAtDominoPinBoundary()) {
                    return;
                }
                forwardEntryRequested = true;
                startPlayback();
            };

            const warmDominoMedia = () => {
                removeReadinessListeners();
                root.dataset.dominoQuarterReady = "warming";
                let settled = false;
                let fallbackTimer: number | undefined;
                const hasFrame = () => dominoVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
                const markReady = () => {
                    if (settled || disposed || !hasFrame())
                        return;
                    settled = true;
                    removeReadinessListeners();
                    root.dataset.dominoQuarterReady = "true";
                    // Readiness only warms media. Playback is allowed to begin
                    // after a real forward pin entry requested it; otherwise a
                    // tiny upward scroll from the footer can steal the reader.
                    if (forwardEntryRequested)
                        requestForwardPlayback();
                };
                const markFallback = () => {
                    if (settled || disposed)
                        return;
                    if (hasFrame()) {
                        markReady();
                        return;
                    }
                    settled = true;
                    removeReadinessListeners();
                    root.dataset.dominoQuarterReady = "fallback";
                };
                const remove = () => {
                    dominoVideo.removeEventListener("loadeddata", markReady);
                    dominoVideo.removeEventListener("canplay", markReady);
                    dominoVideo.removeEventListener("error", markFallback);
                    if (fallbackTimer !== undefined) {
                        window.clearTimeout(fallbackTimer);
                        fallbackTimer = undefined;
                    }
                };
                removeReadinessListeners = remove;
                if (dominoVideo.dataset.armed === "true" &&
                    dominoVideo.networkState === HTMLMediaElement.NETWORK_EMPTY) {
                    dominoVideo.load();
                }
                if (hasFrame()) {
                    markReady();
                }
                else {
                    dominoVideo.addEventListener("loadeddata", markReady, { once: true });
                    dominoVideo.addEventListener("canplay", markReady, { once: true });
                    dominoVideo.addEventListener("error", markFallback, { once: true });
                    fallbackTimer = window.setTimeout(markFallback, isCompactDomino() ? 3600 : 2600);
                }
            };

            dominoVideo.pause();
            dominoVideo.loop = false;
            dominoVideo.playbackRate = DOMINO_PLAYBACK_RATE;
            dominoVideo.defaultPlaybackRate = DOMINO_PLAYBACK_RATE;
            // Keep a decoded first frame or the authored poster painted while
            // media is only warming. Playback ownership is still gated by the
            // real forward pin entry below.
            dominoVideo.dataset.dominoActive = "true";
            dominoVideo.dataset.segmentState = "ready";
            gsap.set(dominoMedia, {
                scaleX: isCompactDomino() ? 1 : 1.08,
                scaleY: isCompactDomino() ? 1 : 1.08,
                autoAlpha: 1,
            });
            if (dominoTitle)
                gsap.set(dominoTitle, { y: 0, opacity: 0, visibility: "visible" });
            syncVisualState(0);
            root.dataset.dominoPlayback = "ready";

            readinessTrigger = ScrollTrigger.create({
                id: "domino-quarter-readiness",
                trigger: dominoScene,
                /*
                  Phones reach this section far faster than the sequence
                  downloads, which is what left a black frame under the copy.
                  Warm the media a further viewport out on compact screens.
                */
                start: () => `top ${Math.round(getViewportHeight() * (isCompactDomino() ? 3.6 : 2.45))}px`,
                end: "bottom top",
                invalidateOnRefresh: true,
                onEnter: warmDominoMedia,
                onEnterBack: warmDominoMedia,
            });
            pinTrigger = ScrollTrigger.create({
                id: "domino-reversible",
                trigger: dominoScene,
                start: "top top",
                end: () => `+=${DOMINO_PIN_TRAVEL_PX()}`,
                pin: true,
                pinSpacing: true,
                anticipatePin: 1,
                refreshPriority: 5,
                invalidateOnRefresh: true,
                onToggle: (self) => {
                    root.dataset.dominoPinned = String(self.isActive);
                },
                /*
                  Forward entry is the only thing that starts the sequence, and
                  only once. Coming back up leaves the settled last frame alone -
                  a reader climbing out of the brief is not asking to watch the
                  dominoes fall backwards.
                */
                onEnter: (self) => {
                    if (self.direction > 0 && isAtDominoPinBoundary())
                        requestForwardPlayback();
                },
                onEnterBack: () => {
                    forwardEntryRequested = false;
                    warmDominoMedia();
                },
                onLeave: () => {
                    forwardEntryRequested = false;
                },
                onLeaveBack: () => {
                    forwardEntryRequested = false;
                    if (playing)
                        finishPlayback("left-band");
                },
            });

            const handleVisibility = () => {
                if (!playing)
                    return;
                if (document.hidden) {
                    finishPlayback("document-hidden");
                    return;
                }
            };
            document.addEventListener("visibilitychange", handleVisibility);
            const handlePageHide = () => finishPlayback("page-hide");
            window.addEventListener("pagehide", handlePageHide);
            const cancelDomino = () => finishPlayback("external-release");
            window.addEventListener("tasc:release-directional-domino", cancelDomino);

            cleanup.push(() => {
                disposed = true;
                window.cancelAnimationFrame(monitorFrame);
                monitorFrame = 0;
                releaseLock();
                removeReadinessListeners();
                readinessTrigger?.kill();
                pinTrigger?.kill();
                document.removeEventListener("visibilitychange", handleVisibility);
                window.removeEventListener("pagehide", handlePageHide);
                window.removeEventListener("tasc:release-directional-domino", cancelDomino);
                dominoVideo.pause();
                delete dominoVideo.dataset.dominoActive;
                delete dominoVideo.dataset.segmentState;
                delete root.dataset.dominoPlayback;
                delete root.dataset.dominoProgress;
                delete root.dataset.dominoQuarterReady;
                delete root.dataset.dominoPinned;
                delete root.dataset.dominoRelease;
                delete root.dataset.dominoMediaFailure;
            });
        }

        let viewportWidth = window.innerWidth;
        let viewportPortrait = window.innerHeight >= window.innerWidth;
        const refreshForRealViewportChange = () => {
            const nextWidth = window.innerWidth;
            const nextPortrait = window.innerHeight >= window.innerWidth;
            const meaningfulChange = Math.abs(nextWidth - viewportWidth) > 24 || nextPortrait !== viewportPortrait;
            if (!meaningfulChange)
                return;
            viewportWidth = nextWidth;
            viewportPortrait = nextPortrait;
            scheduleScrollTriggerRefresh();
        };
        window.addEventListener("orientationchange", refreshForRealViewportChange, { passive: true });
        window.visualViewport?.addEventListener("resize", refreshForRealViewportChange, { passive: true });
        scheduleScrollTriggerRefresh(0);
        return () => {
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
