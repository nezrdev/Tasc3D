"use client";
import { forwardRef, memo, useEffect, useImperativeHandle, useRef, type ReactEventHandler, } from "react";
import { installRestorableWebglLifecycle, releaseWebglContext } from "./webglLifecycle";
type PackedAlphaVideoProps = {
    armed?: boolean;
    autoPlay?: boolean;
    className?: string;
    compositeActive?: boolean;
    loop?: boolean;
    maxFps?: number;
    muted?: boolean;
    onError?: () => void;
    onFirstFrame?: () => void;
    onLoadedMetadata?: ReactEventHandler<HTMLVideoElement>;
    onReady?: () => void;
    outputHeight: number;
    outputWidth: number;
    pauseWhenOffscreen?: boolean;
    playsInline?: boolean;
    preload?: "auto" | "metadata" | "none";
    renderMode?: "screen" | "webgl";
    src: string;
    tabIndex?: number;
    videoClassName?: string;
};
type VideoWithFrameCallback = HTMLVideoElement & {
    cancelVideoFrameCallback?: (handle: number) => void;
    requestVideoFrameCallback?: (callback: (now: number) => void) => number;
};
type PlaybackRetrySignal = "initial" | "canplay" | "visibility" | "interaction" | "pause";
const MAX_PLAYBACK_RETRIES_PER_EPISODE = 4;
const PLAY_PROMISE_WATCHDOG_MS = 3000;
function createBoundedPlaybackController({ video, canPlay, onStarted, }: {
    video: HTMLVideoElement;
    canPlay: () => boolean;
    onStarted: () => void;
}) {
    let stopped = false;
    let playPending = false;
    let retryEpisode = false;
    let retryCount = 0;
    let interactionRetryAttached = false;
    let interactionRetryConsumed = false;
    let playAttemptSequence = 0;
    let activePlayAttempt: number | undefined;
    let playWatchdogId: number | undefined;
    const usedRetrySignals = new Set<Exclude<PlaybackRetrySignal, "initial">>();
    function clearPlayWatchdog() {
        if (playWatchdogId === undefined)
            return;
        window.clearTimeout(playWatchdogId);
        playWatchdogId = undefined;
    }
    function removeInteractionRetry() {
        if (!interactionRetryAttached)
            return;
        interactionRetryAttached = false;
        window.removeEventListener("pointerdown", handleFirstInteraction);
        window.removeEventListener("touchend", handleFirstInteraction);
        window.removeEventListener("keydown", handleFirstInteraction);
    }
    function handleFirstInteraction() {
        if (interactionRetryConsumed || stopped || playPending || !canPlay())
            return;
        interactionRetryConsumed = true;
        removeInteractionRetry();
        tryPlay("interaction");
    }
    function armInteractionRetry() {
        if (stopped ||
            interactionRetryAttached ||
            interactionRetryConsumed ||
            retryCount >= MAX_PLAYBACK_RETRIES_PER_EPISODE) {
            return;
        }
        interactionRetryAttached = true;
        window.addEventListener("pointerdown", handleFirstInteraction, { passive: true });
        window.addEventListener("touchend", handleFirstInteraction, { passive: true });
        window.addEventListener("keydown", handleFirstInteraction);
    }
    function resetRetryEpisode() {
        retryEpisode = false;
        retryCount = 0;
        interactionRetryConsumed = false;
        usedRetrySignals.clear();
        removeInteractionRetry();
    }
    function beginRetryEpisode() {
        retryEpisode = true;
        retryCount = 0;
        interactionRetryConsumed = false;
        usedRetrySignals.clear();
        removeInteractionRetry();
        armInteractionRetry();
    }
    function finishPlayAttempt(attempt: number, signal: PlaybackRetrySignal, started: boolean) {
        if (stopped || activePlayAttempt !== attempt)
            return;
        activePlayAttempt = undefined;
        clearPlayWatchdog();
        playPending = false;
        if (started || !video.paused) {
            resetRetryEpisode();
            onStarted();
            return;
        }
        if (!retryEpisode || retryCount >= MAX_PLAYBACK_RETRIES_PER_EPISODE) {
            beginRetryEpisode();
            return;
        }
        if (signal === "interaction") {
            interactionRetryConsumed = false;
            usedRetrySignals.delete("interaction");
        }
        armInteractionRetry();
    }
    function attemptPlay(signal: PlaybackRetrySignal) {
        if (stopped || playPending || !canPlay())
            return;
        if (!video.paused) {
            resetRetryEpisode();
            onStarted();
            return;
        }
        if (retryEpisode) {
            if (signal === "initial" || retryCount >= MAX_PLAYBACK_RETRIES_PER_EPISODE)
                return;
            if (usedRetrySignals.has(signal))
                return;
            usedRetrySignals.add(signal);
            retryCount += 1;
        }
        playPending = true;
        const attempt = ++playAttemptSequence;
        activePlayAttempt = attempt;
        playWatchdogId = window.setTimeout(() => {
            finishPlayAttempt(attempt, signal, false);
        }, PLAY_PROMISE_WATCHDOG_MS);
        let playPromise: Promise<void>;
        try {
            playPromise = video.play();
        }
        catch {
            finishPlayAttempt(attempt, signal, false);
            return;
        }
        void playPromise.then(() => finishPlayAttempt(attempt, signal, true), () => finishPlayAttempt(attempt, signal, false));
    }
    function tryPlay(signal: PlaybackRetrySignal) {
        void attemptPlay(signal);
    }
    function stop() {
        stopped = true;
        activePlayAttempt = undefined;
        playPending = false;
        playAttemptSequence += 1;
        clearPlayWatchdog();
        removeInteractionRetry();
    }
    return { stop, tryPlay };
}
const VERTEX_SHADER = `
  attribute vec2 aPosition;
  attribute vec2 aTexCoord;
  varying vec2 vTexCoord;

  void main() {
    vTexCoord = aTexCoord;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;
const FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D uPacked;
  varying vec2 vTexCoord;

  void main() {
    vec2 colorUv = vec2(vTexCoord.x * 0.5, vTexCoord.y);
    vec2 alphaUv = vec2(0.5 + vTexCoord.x * 0.5, vTexCoord.y);
    vec3 color = texture2D(uPacked, colorUv).rgb;
    float encodedAlpha = texture2D(uPacked, alphaUv).r;
    float alpha = clamp((encodedAlpha - (16.0 / 255.0)) / (219.0 / 255.0), 0.0, 1.0);
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;
function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader)
        return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}
type PackedAlphaWebglResources = {
    fragmentShader: WebGLShader;
    positionBuffer: WebGLBuffer;
    program: WebGLProgram;
    texCoordBuffer: WebGLBuffer;
    texture: WebGLTexture;
    vertexShader: WebGLShader;
};
const PackedAlphaVideo = memo(forwardRef<HTMLVideoElement, PackedAlphaVideoProps>(function PackedAlphaVideo({ armed = true, autoPlay = false, className, compositeActive = true, loop = false, maxFps = 30, muted = true, onError, onFirstFrame, onLoadedMetadata, onReady, outputHeight, outputWidth, pauseWhenOffscreen = false, playsInline = true, preload = "metadata", renderMode = "webgl", src, tabIndex = -1, videoClassName, }, forwardedRef) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const onErrorRef = useRef(onError);
    const onFirstFrameRef = useRef(onFirstFrame);
    const onReadyRef = useRef(onReady);
    onFirstFrameRef.current = onFirstFrame;
    useImperativeHandle(forwardedRef, () => videoRef.current as HTMLVideoElement, []);
    useEffect(() => {
        onErrorRef.current = onError;
        onReadyRef.current = onReady;
    }, [onError, onReady]);
    useEffect(() => {
        if (renderMode !== "screen" || !armed)
            return;
        const video = videoRef.current as VideoWithFrameCallback | null;
        if (!video)
            return;
        let disposed = false;
        let failed = false;
        let firstFrameReported = false;
        let readyReported = false;
        let readyFrameCount = 0;
        let lastMediaTime = Number.NEGATIVE_INFINITY;
        let frameCallbackId: number | undefined;
        let animationFrameId: number | undefined;
        const cancelFrame = () => {
            if (frameCallbackId !== undefined && video.cancelVideoFrameCallback) {
                video.cancelVideoFrameCallback(frameCallbackId);
                frameCallbackId = undefined;
            }
            if (animationFrameId !== undefined) {
                window.cancelAnimationFrame(animationFrameId);
                animationFrameId = undefined;
            }
        };
        const getBufferedAhead = () => {
            try {
                for (let index = 0; index < video.buffered.length; index += 1) {
                    if (video.buffered.start(index) <= video.currentTime + 0.05) {
                        return Math.max(0, video.buffered.end(index) - video.currentTime);
                    }
                }
            }
            catch {
            }
            return 0;
        };
        const scheduleFrame = () => {
            if (disposed ||
                failed ||
                readyReported ||
                (video.paused && firstFrameReported) ||
                video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
                frameCallbackId !== undefined ||
                animationFrameId !== undefined) {
                return;
            }
            const inspectFrame = () => {
                if (disposed || failed || readyReported)
                    return;
                if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                    scheduleFrame();
                    return;
                }
                if (!firstFrameReported) {
                    firstFrameReported = true;
                    onFirstFrameRef.current?.();
                }
                if (Math.abs(video.currentTime - lastMediaTime) >= 1 / 240) {
                    lastMediaTime = video.currentTime;
                    readyFrameCount += 1;
                }
                if (readyFrameCount >= 4 &&
                    (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA || getBufferedAhead() >= 0.75)) {
                    readyReported = true;
                    cancelFrame();
                    onReadyRef.current?.();
                    return;
                }
                scheduleFrame();
            };
            if (typeof video.requestVideoFrameCallback === "function") {
                frameCallbackId = video.requestVideoFrameCallback(() => {
                    frameCallbackId = undefined;
                    inspectFrame();
                });
            }
            else {
                animationFrameId = window.requestAnimationFrame(() => {
                    animationFrameId = undefined;
                    inspectFrame();
                });
            }
        };
        const playbackController = createBoundedPlaybackController({
            video,
            canPlay: () => !disposed && !failed && autoPlay && !document.hidden,
            onStarted: scheduleFrame,
        });
        const reportFailure = () => {
            if (disposed || failed)
                return;
            failed = true;
            playbackController.stop();
            cancelFrame();
            video.pause();
            onErrorRef.current?.();
        };
        const handleCanPlay = () => playbackController.tryPlay("canplay");
        const handleVisibilityChange = () => {
            if (document.hidden) {
                cancelFrame();
                if (pauseWhenOffscreen || autoPlay)
                    video.pause();
            }
            else if (autoPlay) {
                playbackController.tryPlay("visibility");
            }
            else {
                scheduleFrame();
            }
        };
        const handleError = () => reportFailure();
        video.addEventListener("canplay", handleCanPlay);
        video.addEventListener("error", handleError);
        video.addEventListener("loadeddata", scheduleFrame);
        video.addEventListener("playing", scheduleFrame);
        video.addEventListener("progress", scheduleFrame);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        if (autoPlay)
            playbackController.tryPlay("initial");
        return () => {
            disposed = true;
            playbackController.stop();
            cancelFrame();
            video.pause();
            video.removeEventListener("canplay", handleCanPlay);
            video.removeEventListener("error", handleError);
            video.removeEventListener("loadeddata", scheduleFrame);
            video.removeEventListener("playing", scheduleFrame);
            video.removeEventListener("progress", scheduleFrame);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [armed, autoPlay, pauseWhenOffscreen, renderMode, src]);
    useEffect(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current as VideoWithFrameCallback | null;
        if (renderMode !== "webgl" || !armed || !compositeActive || !canvas || !video)
            return;
        const gl = canvas.getContext("webgl", {
            alpha: true,
            antialias: false,
            depth: false,
            premultipliedAlpha: true,
            preserveDrawingBuffer: false,
            powerPreference: "low-power",
            stencil: false,
        });
        if (!gl) {
            onErrorRef.current?.();
            return;
        }
        let resources: PackedAlphaWebglResources | null = null;
        const disposeResources = () => {
            if (!resources)
                return;
            try {
                gl.deleteTexture(resources.texture);
                gl.deleteBuffer(resources.positionBuffer);
                gl.deleteBuffer(resources.texCoordBuffer);
                gl.deleteProgram(resources.program);
                gl.deleteShader(resources.vertexShader);
                gl.deleteShader(resources.fragmentShader);
            }
            catch {
            }
            resources = null;
        };
        const initializeResources = () => {
            disposeResources();
            const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
            const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
            const program = gl.createProgram();
            const positionBuffer = gl.createBuffer();
            const texCoordBuffer = gl.createBuffer();
            const texture = gl.createTexture();
            if (!vertexShader ||
                !fragmentShader ||
                !program ||
                !positionBuffer ||
                !texCoordBuffer ||
                !texture) {
                vertexShader && gl.deleteShader(vertexShader);
                fragmentShader && gl.deleteShader(fragmentShader);
                program && gl.deleteProgram(program);
                positionBuffer && gl.deleteBuffer(positionBuffer);
                texCoordBuffer && gl.deleteBuffer(texCoordBuffer);
                texture && gl.deleteTexture(texture);
                return false;
            }
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                gl.deleteTexture(texture);
                gl.deleteBuffer(positionBuffer);
                gl.deleteBuffer(texCoordBuffer);
                gl.deleteProgram(program);
                gl.deleteShader(vertexShader);
                gl.deleteShader(fragmentShader);
                return false;
            }
            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            const positionLocation = gl.getAttribLocation(program, "aPosition");
            if (positionLocation < 0) {
                gl.deleteTexture(texture);
                gl.deleteBuffer(positionBuffer);
                gl.deleteBuffer(texCoordBuffer);
                gl.deleteProgram(program);
                gl.deleteShader(vertexShader);
                gl.deleteShader(fragmentShader);
                return false;
            }
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
            const texCoordLocation = gl.getAttribLocation(program, "aTexCoord");
            if (texCoordLocation < 0) {
                gl.deleteTexture(texture);
                gl.deleteBuffer(positionBuffer);
                gl.deleteBuffer(texCoordBuffer);
                gl.deleteProgram(program);
                gl.deleteShader(vertexShader);
                gl.deleteShader(fragmentShader);
                return false;
            }
            gl.enableVertexAttribArray(texCoordLocation);
            gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
            gl.uniform1i(gl.getUniformLocation(program, "uPacked"), 0);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.clearColor(0, 0, 0, 0);
            resources = {
                fragmentShader,
                positionBuffer,
                program,
                texCoordBuffer,
                texture,
                vertexShader,
            };
            canvas.dataset.packedAlphaWebgl = "ready";
            return true;
        };
        if (!initializeResources()) {
            canvas.dataset.packedAlphaWebgl = "unavailable";
            releaseWebglContext(canvas, gl);
            onErrorRef.current?.();
            return;
        }
        let animationFrameId: number | undefined;
        let disposed = false;
        let failed = false;
        let contextLost = false;
        let firstFrameReported = false;
        let readyReported = false;
        let readyFrameCount = 0;
        let advancingReadyFrameCount = 0;
        let renderedFrameCount = 0;
        let lastReadyMediaTime = Number.NEGATIVE_INFINITY;
        let frameCallbackId: number | undefined;
        let pauseRecoveryFrame: number | undefined;
        let visible = true;
        let lastFrameDrawAt = Number.NEGATIVE_INFINITY;
        let playbackController: ReturnType<typeof createBoundedPlaybackController> | null = null;
        let restorableLifecycle: ReturnType<typeof installRestorableWebglLifecycle> | null = null;
        const normalizedMaxFps = Number.isFinite(maxFps)
            ? Math.min(60, Math.max(1, maxFps))
            : 30;
        const minimumFrameInterval = 1000 / normalizedMaxFps;
        const frameIntervalTolerance = Math.min(2, minimumFrameInterval * 0.08);
        const getBufferedAhead = () => {
            try {
                for (let index = 0; index < video.buffered.length; index += 1) {
                    if (video.buffered.start(index) <= video.currentTime + 0.05) {
                        return Math.max(0, video.buffered.end(index) - video.currentTime);
                    }
                }
            }
            catch {
            }
            return 0;
        };
        const cancelFrame = () => {
            if (frameCallbackId !== undefined && video.cancelVideoFrameCallback) {
                video.cancelVideoFrameCallback(frameCallbackId);
                frameCallbackId = undefined;
            }
            if (animationFrameId !== undefined) {
                window.cancelAnimationFrame(animationFrameId);
                animationFrameId = undefined;
            }
        };
        const reportFailure = () => {
            if (disposed || failed)
                return;
            failed = true;
            if (!canvas.dataset.packedAlphaWebgl?.startsWith("fallback:")) {
                canvas.dataset.packedAlphaWebgl = "fallback";
            }
            playbackController?.stop();
            cancelFrame();
            video.pause();
            disposeResources();
            restorableLifecycle?.dispose();
            onErrorRef.current?.();
        };
        const renderFrame = (now: number, force = false) => {
            if (disposed ||
                failed ||
                contextLost ||
                !resources ||
                (!visible && !force) ||
                video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
                (!force && now - lastFrameDrawAt + frameIntervalTolerance < minimumFrameInterval)) {
                return;
            }
            lastFrameDrawAt = now;
            try {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, resources.texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
                gl.viewport(0, 0, canvas.width, canvas.height);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                renderedFrameCount += 1;
                canvas.dataset.packedAlphaFrameCount = String(renderedFrameCount);
                if (!firstFrameReported) {
                    firstFrameReported = true;
                    onFirstFrameRef.current?.();
                }
                const mediaTime = video.currentTime;
                if (Math.abs(mediaTime - lastReadyMediaTime) >= 1 / 240) {
                    if (lastReadyMediaTime === Number.NEGATIVE_INFINITY ||
                        mediaTime - lastReadyMediaTime >= 1 / 240) {
                        advancingReadyFrameCount += 1;
                    }
                    else {
                        advancingReadyFrameCount = 1;
                    }
                    lastReadyMediaTime = mediaTime;
                    readyFrameCount += 1;
                }
                if (!readyReported &&
                    ((readyFrameCount >= 4 &&
                        (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA ||
                            getBufferedAhead() >= 0.75)) ||
                        advancingReadyFrameCount >= 8)) {
                    readyReported = true;
                    onReadyRef.current?.();
                }
            }
            catch {
                if (gl.isContextLost()) {
                    return;
                }
                reportFailure();
            }
        };
        const scheduleFrame = () => {
            if (disposed ||
                failed ||
                contextLost ||
                !visible ||
                video.paused ||
                frameCallbackId !== undefined ||
                animationFrameId !== undefined) {
                return;
            }
            if (typeof video.requestVideoFrameCallback === "function") {
                frameCallbackId = video.requestVideoFrameCallback((now) => {
                    frameCallbackId = undefined;
                    renderFrame(now, true);
                    scheduleFrame();
                });
            }
            else {
                animationFrameId = window.requestAnimationFrame((now) => {
                    animationFrameId = undefined;
                    renderFrame(now);
                    scheduleFrame();
                });
            }
        };
        const handleFrameAvailable = () => {
            renderFrame(performance.now(), true);
            scheduleFrame();
        };
        playbackController = createBoundedPlaybackController({
            video,
            canPlay: () => autoPlay &&
                !failed &&
                !disposed &&
                !contextLost &&
                visible &&
                !document.hidden &&
                video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
            onStarted: handleFrameAvailable,
        });
        const handlePause = () => {
            cancelFrame();
            renderFrame(performance.now(), true);
            if (autoPlay && visible && !document.hidden && !disposed && !failed && !contextLost && pauseRecoveryFrame === undefined) {
                pauseRecoveryFrame = window.requestAnimationFrame(() => {
                    pauseRecoveryFrame = undefined;
                    if (video.paused && visible && !document.hidden && !disposed && !failed && !contextLost) {
                        playbackController?.tryPlay("pause");
                    }
                });
            }
        };
        const handleError = () => reportFailure();
        const handleCanPlay = () => playbackController?.tryPlay("canplay");
        const handleVisibilityChange = () => {
            if (document.hidden) {
                cancelFrame();
                if (pauseWhenOffscreen || autoPlay)
                    video.pause();
                return;
            }
            if (autoPlay)
                playbackController?.tryPlay("visibility");
            else
                handleFrameAvailable();
        };
        restorableLifecycle = installRestorableWebglLifecycle({
            canvas,
            label: "packed-alpha",
            onLost: () => {
                contextLost = true;
                canvas.dataset.packedAlphaWebgl = "lost";
                cancelFrame();
                if (pauseRecoveryFrame !== undefined) {
                    window.cancelAnimationFrame(pauseRecoveryFrame);
                    pauseRecoveryFrame = undefined;
                }
                video.pause();
                resources = null;
            },
            onPermanentFailure: (reason) => {
                contextLost = false;
                canvas.dataset.packedAlphaWebgl = `fallback:${reason}`;
                disposeResources();
                reportFailure();
            },
            onRestored: (attemptsUsed) => {
                contextLost = false;
                canvas.dataset.packedAlphaWebgl = "restored";
                canvas.dataset.packedAlphaRestoreAttempts = String(attemptsUsed);
                if (autoPlay && visible && !document.hidden) {
                    playbackController?.tryPlay("visibility");
                }
                else {
                    handleFrameAvailable();
                }
            },
            release: () => gl.getExtension("WEBGL_lose_context")?.loseContext(),
            restore: () => {
                contextLost = false;
                if (!initializeResources()) {
                    return false;
                }
                try {
                    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                        renderFrame(performance.now(), true);
                    }
                }
                catch {
                    return false;
                }
                return true;
            },
        });
        const observer = new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? true;
            if (visible) {
                if (autoPlay)
                    playbackController?.tryPlay("visibility");
                else
                    handleFrameAvailable();
            }
            else {
                cancelFrame();
                if (pauseWhenOffscreen)
                    video.pause();
            }
        }, { rootMargin: "160px" });
        video.addEventListener("canplay", handleCanPlay);
        video.addEventListener("error", handleError);
        video.addEventListener("loadeddata", handleFrameAvailable);
        video.addEventListener("pause", handlePause);
        video.addEventListener("play", handleFrameAvailable);
        video.addEventListener("playing", handleFrameAvailable);
        video.addEventListener("seeked", handleFrameAvailable);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        observer.observe(canvas);
        if (autoPlay)
            playbackController.tryPlay("initial");
        return () => {
            disposed = true;
            playbackController?.stop();
            observer.disconnect();
            cancelFrame();
            if (pauseRecoveryFrame !== undefined)
                window.cancelAnimationFrame(pauseRecoveryFrame);
            video.pause();
            video.removeEventListener("canplay", handleCanPlay);
            video.removeEventListener("error", handleError);
            video.removeEventListener("loadeddata", handleFrameAvailable);
            video.removeEventListener("pause", handlePause);
            video.removeEventListener("play", handleFrameAvailable);
            video.removeEventListener("playing", handleFrameAvailable);
            video.removeEventListener("seeked", handleFrameAvailable);
            restorableLifecycle?.dispose();
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            disposeResources();
        };
    }, [armed, autoPlay, compositeActive, maxFps, pauseWhenOffscreen, renderMode, src]);
    return (<div className={className} data-packed-alpha-video={armed ? (renderMode === "screen" ? "screen-crop" : "h264-side-by-side") : "dormant"} data-packed-alpha-composite={renderMode === "webgl" ? (compositeActive ? "active" : "suspended") : "screen"}>
      {renderMode === "webgl" && compositeActive ? (<canvas ref={canvasRef} width={outputWidth} height={outputHeight} aria-hidden="true"/>) : null}
        <video ref={videoRef} className={videoClassName} src={armed ? src : undefined} width={outputWidth * 2} height={outputHeight} autoPlay={autoPlay && (renderMode === "screen" || compositeActive)} loop={loop} muted={muted} playsInline={playsInline} preload={preload} disablePictureInPicture tabIndex={tabIndex} onLoadedMetadata={onLoadedMetadata} aria-hidden="true"/>
      </div>);
}));
PackedAlphaVideo.displayName = "PackedAlphaVideo";
export default PackedAlphaVideo;
