"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, type VideoHTMLAttributes, } from "react";
import { getElementVisibleRatio, getVisualViewportHeight } from "@/lib/visibility";
type VideoSource = {
    src: string;
    type: string;
    media?: string;
};
type VisibilityTriggeredVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "autoPlay" | "children" | "loop" | "muted" | "playsInline"> & {
    hostStateAttribute: `data-${string}`;
    sources: VideoSource[];
    threshold?: number;
    reverseThreshold?: number;
    enabled?: boolean;
    armDelayMs?: number;
    playbackRate?: number;
};
const VisibilityTriggeredVideo = forwardRef<HTMLVideoElement, VisibilityTriggeredVideoProps>(function VisibilityTriggeredVideo({ armDelayMs = 720, className, enabled = true, hostStateAttribute, playbackRate = 1, poster, preload = "metadata", reverseThreshold, sources, threshold = 0.25, ...videoProps }, forwardedRef) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    useImperativeHandle(forwardedRef, () => videoRef.current as HTMLVideoElement, []);
    useEffect(() => {
        const video = videoRef.current;
        if (!video) {
            return;
        }
        const host = video.closest<HTMLElement>("section");
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let started = false;
        let announced = false;
        let disposed = false;
        let playRequest: Promise<boolean> | null = null;
        let loopRestartRequest: Promise<boolean> | null = null;
        let terminalObservedAt = 0;
        let nearViewport = false;
        let lastScrollY = window.scrollY;
        let scrollDirection: -1 | 1 = 1;
        const retryTimers = new Set<number>();
        let retryLadderScheduled = false;
        const setState = (state: "waiting" | "playing" | "fallback") => {
            video.dataset.playbackState = state;
            host?.setAttribute(hostStateAttribute, state);
        };
        const announcePlayback = () => {
            if (announced) {
                return;
            }
            announced = true;
            host?.dispatchEvent(new CustomEvent("tasc:visibility-video-play"));
        };
        if (!enabled) {
            video.pause();
            setState("waiting");
            return () => {
                host?.removeAttribute(hostStateAttribute);
            };
        }
        let sourceSelectionFrame = 0;
        if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
            if (video.networkState === HTMLMediaElement.NETWORK_EMPTY)
                video.load();
            sourceSelectionFrame = window.requestAnimationFrame(() => {
                if (video.readyState === HTMLMediaElement.HAVE_NOTHING &&
                    (video.networkState === HTMLMediaElement.NETWORK_EMPTY ||
                        video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE)) {
                    video.load();
                }
            });
        }
        if (reducedMotion) {
            setState("fallback");
            announcePlayback();
            return () => {
                if (sourceSelectionFrame)
                    window.cancelAnimationFrame(sourceSelectionFrame);
                host?.removeAttribute(hostStateAttribute);
            };
        }
        setState("waiting");
        let observer: IntersectionObserver | null = null;
        let proximityObserver: IntersectionObserver | null = null;
        let visibilityQualified = false;
        let visibilityFrame = 0;
        const target = host ?? video;
        const effectiveThreshold = Math.max(0, threshold - 0.015);
        const effectiveReverseThreshold = Math.max(effectiveThreshold, Math.min(1, (reverseThreshold ?? threshold) - 0.015));
        const getRequiredThreshold = () => video.paused && scrollDirection < 0
            ? effectiveReverseThreshold
            : effectiveThreshold;
        const hasStableVisibility = () => getElementVisibleRatio(target) >= getRequiredThreshold();
        const isNearViewport = () => {
            const rect = target.getBoundingClientRect();
            return rect.bottom >= -900 && rect.top <= getVisualViewportHeight() + 900;
        };
        nearViewport = isNearViewport();
        const startPlayback = async () => {
            if (disposed || reducedMotion || document.hidden || !hasStableVisibility()) {
                return false;
            }
            video.playbackRate = playbackRate;
            video.defaultPlaybackRate = playbackRate;
            if (!video.paused) {
                started = true;
                setState("playing");
                announcePlayback();
                return true;
            }
            if (playRequest) {
                return playRequest;
            }
            playRequest = (async () => {
                try {
                    if (!started && video.currentTime > 0.05) {
                        video.currentTime = 0;
                    }
                    await video.play();
                    if (disposed || video.paused)
                        return false;
                    started = true;
                    setState("playing");
                    announcePlayback();
                    return true;
                }
                catch {
                    if (!disposed)
                        setState(video.error ? "fallback" : "waiting");
                    return false;
                }
                finally {
                    playRequest = null;
                }
            })();
            return playRequest;
        };
        const clearRetryTimers = () => {
            retryTimers.forEach((timer) => window.clearTimeout(timer));
            retryTimers.clear();
            retryLadderScheduled = false;
        };
        const schedulePlaybackRetry = () => {
            if (disposed || reducedMotion || document.hidden || !isNearViewport() || !hasStableVisibility())
                return;
            if (retryLadderScheduled)
                return;
            retryLadderScheduled = true;
            [0, 80, 240, 640].forEach((delay) => {
                const timer = window.setTimeout(() => {
                    retryTimers.delete(timer);
                    if (retryTimers.size === 0)
                        retryLadderScheduled = false;
                    if (disposed || document.hidden || !video.paused || !hasStableVisibility())
                        return;
                    void startPlayback();
                }, delay);
                retryTimers.add(timer);
            });
        };
        const restartCompletedLoop = (force = false) => {
            if (disposed ||
                reducedMotion ||
                document.hidden ||
                !hasStableVisibility() ||
                !Number.isFinite(video.duration) ||
                video.duration <= 0 ||
                video.currentTime < video.duration - 0.12) {
                terminalObservedAt = 0;
                return;
            }
            const now = performance.now();
            if (!force && terminalObservedAt === 0) {
                terminalObservedAt = now;
                return;
            }
            if (!force && now - terminalObservedAt < 450)
                return;
            if (loopRestartRequest)
                return;
            terminalObservedAt = now;
            loopRestartRequest = (async () => {
                try {
                    video.currentTime = 0.001;
                    await video.play();
                    if (disposed || video.paused)
                        return false;
                    started = true;
                    setState("playing");
                    announcePlayback();
                    return true;
                }
                catch {
                    if (!disposed)
                        setState(video.error ? "fallback" : "waiting");
                    return false;
                }
                finally {
                    loopRestartRequest = null;
                }
            })();
        };
        const primeFirstFrameForNextEntry = () => {
            if (!started ||
                video.seeking ||
                !Number.isFinite(video.duration) ||
                video.duration <= 0 ||
                video.currentTime <= 0.05) {
                return;
            }
            terminalObservedAt = 0;
            try {
                video.currentTime = 0;
            }
            catch {
            }
        };
        const handlePageVisibility = () => {
            nearViewport = isNearViewport();
            if (document.hidden || !nearViewport) {
                clearRetryTimers();
                video.pause();
                primeFirstFrameForNextEntry();
                setState("waiting");
            }
            else if (started || hasStableVisibility()) {
                schedulePlaybackRetry();
            }
        };
        const handlePlaying = () => {
            if (disposed)
                return;
            started = true;
            clearRetryTimers();
            setState("playing");
            announcePlayback();
        };
        const handleUnexpectedPause = () => {
            if (disposed || document.hidden || !hasStableVisibility())
                return;
            setState("waiting");
            schedulePlaybackRetry();
        };
        if ("IntersectionObserver" in window) {
            proximityObserver = new IntersectionObserver((entries) => {
                nearViewport = Boolean(entries[0]?.isIntersecting) || isNearViewport();
                handlePageVisibility();
            }, { rootMargin: "900px 0px", threshold: 0 });
            proximityObserver.observe(target);
        }
        else {
            nearViewport = true;
        }
        document.addEventListener("visibilitychange", handlePageVisibility);
        window.addEventListener("pageshow", handlePageVisibility);
        window.addEventListener("tasc:scroll-position-applied", schedulePlaybackRetry);
        video.addEventListener("playing", handlePlaying);
        video.addEventListener("pause", handleUnexpectedPause);
        video.addEventListener("waiting", handleUnexpectedPause);
        video.addEventListener("stalled", handleUnexpectedPause);
        const handleEnded = () => restartCompletedLoop(true);
        video.addEventListener("ended", handleEnded);
        const retryWhenReady = () => {
            if (!visibilityQualified || !hasStableVisibility())
                return;
            schedulePlaybackRetry();
        };
        video.addEventListener("loadeddata", retryWhenReady);
        video.addEventListener("canplay", retryWhenReady);
        const pauseOutsideQualifiedVisibility = () => {
            clearRetryTimers();
            video.pause();
            primeFirstFrameForNextEntry();
            setState("waiting");
        };
        const checkVisibility = () => {
            visibilityFrame = 0;
            nearViewport = isNearViewport();
            if (!hasStableVisibility()) {
                visibilityQualified = false;
                if (started)
                    pauseOutsideQualifiedVisibility();
                return;
            }
            visibilityQualified = true;
            schedulePlaybackRetry();
        };
        const scheduleVisibilityCheck = () => {
            const nextScrollY = window.scrollY;
            if (Math.abs(nextScrollY - lastScrollY) > 1) {
                scrollDirection = nextScrollY > lastScrollY ? 1 : -1;
                lastScrollY = nextScrollY;
            }
            if (visibilityFrame)
                return;
            visibilityFrame = window.requestAnimationFrame(checkVisibility);
        };
        window.addEventListener("scroll", scheduleVisibilityCheck, { passive: true });
        window.addEventListener("resize", scheduleVisibilityCheck, { passive: true });
        window.visualViewport?.addEventListener("scroll", scheduleVisibilityCheck, { passive: true });
        window.visualViewport?.addEventListener("resize", scheduleVisibilityCheck, { passive: true });
        const armTimer = window.setTimeout(() => {
            if (!("IntersectionObserver" in window)) {
                schedulePlaybackRetry();
                return;
            }
            observer = new IntersectionObserver((entries) => {
                const entry = entries[0];
                visibilityQualified = Boolean(entry && entry.intersectionRatio >= getRequiredThreshold());
                if (visibilityQualified && hasStableVisibility()) {
                    schedulePlaybackRetry();
                }
                else if (started) {
                    pauseOutsideQualifiedVisibility();
                }
            }, {
                threshold: Array.from(new Set([0, effectiveThreshold, threshold, effectiveReverseThreshold])).sort((a, b) => a - b),
            });
            observer.observe(target);
            scheduleVisibilityCheck();
        }, armDelayMs);
        const playbackHealthTimer = window.setInterval(() => {
            restartCompletedLoop();
            if ((started || visibilityQualified) && video.paused && hasStableVisibility()) {
                schedulePlaybackRetry();
            }
        }, 300);
        return () => {
            disposed = true;
            window.clearTimeout(armTimer);
            window.clearInterval(playbackHealthTimer);
            clearRetryTimers();
            if (sourceSelectionFrame)
                window.cancelAnimationFrame(sourceSelectionFrame);
            observer?.disconnect();
            proximityObserver?.disconnect();
            if (visibilityFrame)
                window.cancelAnimationFrame(visibilityFrame);
            window.removeEventListener("scroll", scheduleVisibilityCheck);
            window.removeEventListener("resize", scheduleVisibilityCheck);
            window.visualViewport?.removeEventListener("scroll", scheduleVisibilityCheck);
            window.visualViewport?.removeEventListener("resize", scheduleVisibilityCheck);
            document.removeEventListener("visibilitychange", handlePageVisibility);
            window.removeEventListener("pageshow", handlePageVisibility);
            window.removeEventListener("tasc:scroll-position-applied", schedulePlaybackRetry);
            video.removeEventListener("playing", handlePlaying);
            video.removeEventListener("pause", handleUnexpectedPause);
            video.removeEventListener("waiting", handleUnexpectedPause);
            video.removeEventListener("stalled", handleUnexpectedPause);
            video.removeEventListener("ended", handleEnded);
            video.removeEventListener("loadeddata", retryWhenReady);
            video.removeEventListener("canplay", retryWhenReady);
            video.pause();
            host?.removeAttribute(hostStateAttribute);
        };
    }, [
        armDelayMs,
        enabled,
        hostStateAttribute,
        playbackRate,
        reverseThreshold,
        threshold,
    ]);
    return (<video {...videoProps} ref={videoRef} className={className} loop muted playsInline poster={poster} preload={preload} disablePictureInPicture aria-hidden="true">
      {sources.map((source) => (<source key={source.src} src={source.src} type={source.type} media={source.media}/>))}
    </video>);
});
export default VisibilityTriggeredVideo;
