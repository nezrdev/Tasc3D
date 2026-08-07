"use client";

import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    type VideoHTMLAttributes,
} from "react";

type VideoSource = {
    src: string;
    type: string;
    media?: string;
};

type VisibilityTriggeredVideoProps = Omit<
    VideoHTMLAttributes<HTMLVideoElement>,
    "autoPlay" | "children" | "loop" | "muted" | "playsInline"
> & {
    hostStateAttribute: `data-${string}`;
    sources: VideoSource[];
    threshold?: number;
    enabled?: boolean;
    armDelayMs?: number;
    playbackRate?: number;
};

type FrameAwareVideo = HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
};

type PlaybackHealthCheck = () => void;

const playbackHealthChecks = new Set<PlaybackHealthCheck>();
let playbackHealthFrame = 0;
let playbackHealthCheckedAt = 0;

const runPlaybackHealthChecks = (now: number) => {
    if (now - playbackHealthCheckedAt >= 300) {
        playbackHealthCheckedAt = now;
        playbackHealthChecks.forEach((check) => check());
    }
    if (playbackHealthChecks.size > 0) {
        playbackHealthFrame = window.requestAnimationFrame(runPlaybackHealthChecks);
    }
    else {
        playbackHealthFrame = 0;
    }
};

const registerPlaybackHealthCheck = (check: PlaybackHealthCheck) => {
    playbackHealthChecks.add(check);
    if (!playbackHealthFrame) {
        playbackHealthCheckedAt = 0;
        playbackHealthFrame = window.requestAnimationFrame(runPlaybackHealthChecks);
    }
};

const unregisterPlaybackHealthCheck = (check: PlaybackHealthCheck) => {
    playbackHealthChecks.delete(check);
    if (playbackHealthChecks.size === 0 && playbackHealthFrame) {
        window.cancelAnimationFrame(playbackHealthFrame);
        playbackHealthFrame = 0;
    }
};

const VisibilityTriggeredVideo = forwardRef<HTMLVideoElement, VisibilityTriggeredVideoProps>(
    function VisibilityTriggeredVideo(
        {
            armDelayMs = 720,
            className,
            enabled = true,
            hostStateAttribute,
            playbackRate = 1,
            poster,
            preload = "metadata",
            sources,
            threshold = 0.25,
            ...videoProps
        },
        forwardedRef,
    ) {
        const videoRef = useRef<HTMLVideoElement | null>(null);
        const [activePoster, setActivePoster] = useState<string | undefined>(poster);
        const [firstFrameState, setFirstFrameState] = useState<"waiting" | "decoded" | "fallback">("waiting");

        useImperativeHandle(forwardedRef, () => videoRef.current as HTMLVideoElement, []);

        useEffect(() => {
            const video = videoRef.current as FrameAwareVideo | null;
            if (!video) {
                return;
            }

            const host = video.closest<HTMLElement>("section");
            const target = host ?? video;
            const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            const qualifiedThreshold = Math.min(1, Math.max(0, threshold));
            const retryTimers = new Set<number>();
            let disposed = false;
            let started = false;
            let announced = false;
            let decoded = false;
            let visibilityQualified = false;
            let nearViewport = false;
            let retryLadderScheduled = false;
            let terminalObservedAt = 0;
            let playRequest: Promise<boolean> | null = null;
            let loopRestartRequest: Promise<boolean> | null = null;
            let sourceSelectionFrame = 0;
            let decodedFrameCallback = 0;
            let decodedFallbackFrame = 0;
            let visibilityObserver: IntersectionObserver | null = null;
            let proximityObserver: IntersectionObserver | null = null;

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

            const markFirstFrameDecoded = () => {
                decodedFrameCallback = 0;
                decodedFallbackFrame = 0;
                if (disposed || decoded) {
                    return;
                }
                decoded = true;
                setActivePoster(undefined);
                setFirstFrameState("decoded");
                host?.setAttribute("data-visibility-video-frame", "decoded");
            };

            const requestFirstDecodedFrame = () => {
                if (disposed || decoded || decodedFrameCallback || decodedFallbackFrame) {
                    return;
                }
                if (typeof video.requestVideoFrameCallback === "function") {
                    decodedFrameCallback = video.requestVideoFrameCallback(markFirstFrameDecoded);
                    return;
                }
                if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.paused) {
                    decodedFallbackFrame = window.requestAnimationFrame(markFirstFrameDecoded);
                }
            };

            const showFallback = () => {
                if (disposed) {
                    return;
                }
                unregisterPlaybackHealthCheck(checkPlaybackHealth);
                video.pause();
                setActivePoster(poster);
                setFirstFrameState("fallback");
                host?.setAttribute("data-visibility-video-frame", "fallback");
                setState("fallback");
                announcePlayback();
            };

            const clearRetryTimers = () => {
                retryTimers.forEach((timer) => window.clearTimeout(timer));
                retryTimers.clear();
                retryLadderScheduled = false;
            };

            const isPlaybackEligible = () => nearViewport && visibilityQualified && !document.hidden;

            const startPlayback = async () => {
                if (disposed || reducedMotion || !isPlaybackEligible()) {
                    return false;
                }
                video.playbackRate = playbackRate;
                video.defaultPlaybackRate = playbackRate;
                if (!video.paused) {
                    started = true;
                    setState("playing");
                    requestFirstDecodedFrame();
                    registerPlaybackHealthCheck(checkPlaybackHealth);
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
                        if (disposed || video.paused) {
                            return false;
                        }
                        started = true;
                        setState("playing");
                        requestFirstDecodedFrame();
                        registerPlaybackHealthCheck(checkPlaybackHealth);
                        announcePlayback();
                        return true;
                    }
                    catch {
                        if (!disposed) {
                            if (video.error) {
                                showFallback();
                            }
                            else {
                                setState("waiting");
                            }
                        }
                        return false;
                    }
                    finally {
                        playRequest = null;
                    }
                })();
                return playRequest;
            };

            const schedulePlaybackRetry = () => {
                if (disposed || reducedMotion || !isPlaybackEligible() || retryLadderScheduled) {
                    return;
                }
                retryLadderScheduled = true;
                [0, 80, 240, 640].forEach((delay) => {
                    const timer = window.setTimeout(() => {
                        retryTimers.delete(timer);
                        if (retryTimers.size === 0) {
                            retryLadderScheduled = false;
                        }
                        if (disposed || !isPlaybackEligible() || !video.paused) {
                            return;
                        }
                        void startPlayback();
                    }, delay);
                    retryTimers.add(timer);
                });
            };

            const restartCompletedLoop = (force = false) => {
                if (
                    disposed ||
                    reducedMotion ||
                    !isPlaybackEligible() ||
                    !Number.isFinite(video.duration) ||
                    video.duration <= 0 ||
                    video.currentTime < video.duration - 0.12
                ) {
                    terminalObservedAt = 0;
                    return;
                }
                const now = performance.now();
                if (!force && terminalObservedAt === 0) {
                    terminalObservedAt = now;
                    return;
                }
                if (!force && now - terminalObservedAt < 450) {
                    return;
                }
                if (loopRestartRequest) {
                    return;
                }
                terminalObservedAt = now;
                loopRestartRequest = (async () => {
                    try {
                        video.currentTime = 0.001;
                        await video.play();
                        if (disposed || video.paused) {
                            return false;
                        }
                        started = true;
                        setState("playing");
                        registerPlaybackHealthCheck(checkPlaybackHealth);
                        announcePlayback();
                        return true;
                    }
                    catch {
                        if (!disposed) {
                            if (video.error) {
                                showFallback();
                            }
                            else {
                                setState("waiting");
                            }
                        }
                        return false;
                    }
                    finally {
                        loopRestartRequest = null;
                    }
                })();
            };

            const checkPlaybackHealth = () => {
                if (disposed || !isPlaybackEligible() || video.paused) {
                    unregisterPlaybackHealthCheck(checkPlaybackHealth);
                    return;
                }
                restartCompletedLoop();
            };

            const primeFirstFrameForNextEntry = () => {
                if (
                    !started ||
                    video.seeking ||
                    !Number.isFinite(video.duration) ||
                    video.duration <= 0 ||
                    video.currentTime <= 0.05
                ) {
                    return;
                }
                terminalObservedAt = 0;
                try {
                    video.currentTime = 0;
                }
                catch {
                }
            };

            const pauseOutsideQualifiedVisibility = () => {
                clearRetryTimers();
                unregisterPlaybackHealthCheck(checkPlaybackHealth);
                video.pause();
                primeFirstFrameForNextEntry();
                setState("waiting");
            };

            const handlePageVisibility = () => {
                if (!isPlaybackEligible()) {
                    pauseOutsideQualifiedVisibility();
                    return;
                }
                schedulePlaybackRetry();
            };

            const handlePlaying = () => {
                if (disposed) {
                    return;
                }
                started = true;
                clearRetryTimers();
                setState("playing");
                requestFirstDecodedFrame();
                registerPlaybackHealthCheck(checkPlaybackHealth);
                announcePlayback();
            };

            const handleUnexpectedPause = () => {
                unregisterPlaybackHealthCheck(checkPlaybackHealth);
                if (disposed || !isPlaybackEligible() || video.error) {
                    return;
                }
                setState("waiting");
                schedulePlaybackRetry();
            };

            const handleInterruptedPlayback = () => {
                unregisterPlaybackHealthCheck(checkPlaybackHealth);
                if (disposed || !isPlaybackEligible() || video.error) {
                    return;
                }
                setState("waiting");
                if (!video.paused) {
                    video.pause();
                }
                schedulePlaybackRetry();
            };

            const retryWhenReady = () => {
                if (visibilityQualified) {
                    schedulePlaybackRetry();
                }
            };

            setActivePoster(poster);
            setFirstFrameState("waiting");
            host?.setAttribute("data-visibility-video-frame", "waiting");
            setState("waiting");

            if (!enabled) {
                video.pause();
                return () => {
                    host?.removeAttribute(hostStateAttribute);
                    host?.removeAttribute("data-visibility-video-frame");
                };
            }

            if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
                if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) {
                    video.load();
                }
                sourceSelectionFrame = window.requestAnimationFrame(() => {
                    if (
                        video.readyState === HTMLMediaElement.HAVE_NOTHING &&
                        (video.networkState === HTMLMediaElement.NETWORK_EMPTY ||
                            video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE)
                    ) {
                        video.load();
                    }
                });
            }

            if (reducedMotion) {
                showFallback();
                return () => {
                    disposed = true;
                    if (sourceSelectionFrame) {
                        window.cancelAnimationFrame(sourceSelectionFrame);
                    }
                    host?.removeAttribute(hostStateAttribute);
                    host?.removeAttribute("data-visibility-video-frame");
                };
            }

            if ("IntersectionObserver" in window) {
                proximityObserver = new IntersectionObserver(
                    (entries) => {
                        nearViewport = Boolean(entries[0]?.isIntersecting);
                        handlePageVisibility();
                    },
                    { rootMargin: "900px 0px", threshold: 0 },
                );
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
            video.addEventListener("waiting", handleInterruptedPlayback);
            video.addEventListener("stalled", handleInterruptedPlayback);
            video.addEventListener("loadeddata", retryWhenReady);
            video.addEventListener("canplay", retryWhenReady);
            video.addEventListener("error", showFallback);

            const handleEnded = () => restartCompletedLoop(true);
            video.addEventListener("ended", handleEnded);

            const armTimer = window.setTimeout(() => {
                if (!("IntersectionObserver" in window)) {
                    visibilityQualified = true;
                    schedulePlaybackRetry();
                    return;
                }
                visibilityObserver = new IntersectionObserver(
                    (entries) => {
                        const entry = entries[0];
                        visibilityQualified = Boolean(
                            entry && entry.isIntersecting && entry.intersectionRatio + 0.001 >= qualifiedThreshold,
                        );
                        if (visibilityQualified) {
                            schedulePlaybackRetry();
                        }
                        else if (started) {
                            pauseOutsideQualifiedVisibility();
                        }
                    },
                    { threshold: [0, 0.25, 0.5, 0.75, 1] },
                );
                visibilityObserver.observe(target);
            }, armDelayMs);

            return () => {
                disposed = true;
                window.clearTimeout(armTimer);
                clearRetryTimers();
                unregisterPlaybackHealthCheck(checkPlaybackHealth);
                if (sourceSelectionFrame) {
                    window.cancelAnimationFrame(sourceSelectionFrame);
                }
                if (decodedFallbackFrame) {
                    window.cancelAnimationFrame(decodedFallbackFrame);
                }
                if (decodedFrameCallback && typeof video.cancelVideoFrameCallback === "function") {
                    video.cancelVideoFrameCallback(decodedFrameCallback);
                }
                visibilityObserver?.disconnect();
                proximityObserver?.disconnect();
                document.removeEventListener("visibilitychange", handlePageVisibility);
                window.removeEventListener("pageshow", handlePageVisibility);
                window.removeEventListener("tasc:scroll-position-applied", schedulePlaybackRetry);
                video.removeEventListener("playing", handlePlaying);
                video.removeEventListener("pause", handleUnexpectedPause);
                video.removeEventListener("waiting", handleInterruptedPlayback);
                video.removeEventListener("stalled", handleInterruptedPlayback);
                video.removeEventListener("ended", handleEnded);
                video.removeEventListener("loadeddata", retryWhenReady);
                video.removeEventListener("canplay", retryWhenReady);
                video.removeEventListener("error", showFallback);
                video.pause();
                host?.removeAttribute(hostStateAttribute);
                host?.removeAttribute("data-visibility-video-frame");
            };
        }, [armDelayMs, enabled, hostStateAttribute, playbackRate, poster, threshold]);

        return (
            <video
                {...videoProps}
                ref={videoRef}
                className={className}
                data-first-frame={firstFrameState}
                loop
                muted
                playsInline
                poster={activePoster}
                preload={preload}
                disablePictureInPicture
                aria-hidden="true"
            >
                {sources.map((source) => (
                    <source key={source.src} src={source.src} type={source.type} media={source.media} />
                ))}
            </video>
        );
    },
);

export default VisibilityTriggeredVideo;
