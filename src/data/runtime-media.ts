const FPS_30 = 30;
const secondsAtFrame = (frame: number, fps = FPS_30) => frame / fps;
export const RUNTIME_MEDIA = {
    hero: {
        // The 640px `t1` pair traded too much away: at 60fps its bitrate left
        // visible blocking on the glass refraction, which reads as judder. Both
        // desktop sources are re-derived from the 720p master at roughly 1.75x
        // the bitrate. Mobile is deliberately untouched so phones keep the
        // smaller download.
        nativeAlpha: {
            desktop: "/media/hero-earth-alpha-720-60fps-t2-20260804.webm",
            mobile: "/media/hero-earth-alpha-640-60fps-t1-20260731.webm",
            desktopOutput: { width: 720, height: 720 },
            mobileOutput: { width: 640, height: 640 },
        },
        webkitPacked: {
            desktop: "/media/hero-earth-safari-packed-720-60fps-t2-20260804.mp4",
            mobile: "/media/hero-earth-safari-packed-640-60fps-t1-20260731.mp4",
            desktopOutput: { width: 720, height: 720 },
            mobileOutput: { width: 640, height: 640 },
        },
        poster: "/media/hero-earth-poster-1080-20260715.webp",
        fps: { desktop: 60, mobile: 60 },
        frameCount: { desktop: 1200, mobile: 1200 },
        duration: 20,
        keyframeContract: {
            nativeAlpha: {
                desktop: { keyframeCount: 10, maxGopFrames: 120, hasBFrames: 0 },
                mobile: { keyframeCount: 10, maxGopFrames: 120, hasBFrames: 0 },
            },
            webkitPacked: {
                desktop: { keyframeCount: 10, maxGopFrames: 120, hasBFrames: 2 },
                mobile: { keyframeCount: 10, maxGopFrames: 120, hasBFrames: 2 },
            },
        },
    },
    services: {
        nativeAlpha: {
            desktop: "/media/services-keyframes-desktop-final-20260718.webm",
            // `services-keyframes-mobile-lean-20260721.webm` carried the
            // `ALPHA_MODE=1` tag but no alpha plane, so every phone painted the
            // Services frame on an opaque black rectangle instead of the starfield.
            // Re-derived from the desktop alpha master with the libvpx decoder
            // forced so that FFmpeg preserves the real alpha plane.
            mobile: "/media/services-keyframes-mobile-alpha-960-20260803.webm",
            desktopOutput: { width: 1280, height: 720 },
            mobileOutput: { width: 960, height: 540 },
        },
        webkitPacked: {
            desktop: "/media/services-keyframes-packed-1280-gop15-t4-20260801.mp4",
            mobile: "/media/services-keyframes-packed-960-gop15-t4-20260801.mp4",
            desktopOutput: { width: 1280, height: 720 },
            // The transport is 1920x540: 960px colour + 960px alpha mask.
            mobileOutput: { width: 960, height: 540 },
        },
        poster: "/media/services-frame-0-poster-final-20260718.webp",
        stopPosters: [
            "/media/services-stop-1-poster-final-20260718.webp",
            "/media/services-stop-2-poster-final-20260718.webp",
            "/media/services-stop-3-poster-final-20260718.webp",
        ],
        fps: FPS_30,
        frameCount: 558,
        forwardFrameCount: 340,
        stopFrames: [90, 187, 307],
        reverseStopFrames: [557, 460, 340],
        exitFrame: 339,
        seekProfile: "palindrome-positive-playback",
        keyframeContract: {
            nativeAlpha: { keyframeCount: 38, maxGopFrames: 15, hasBFrames: 0 },
            webkitPacked: { keyframeCount: 38, maxGopFrames: 15, hasBFrames: 0 },
        },
    },
    datum: {
        desktop: "/media/datum-news-loop-desktop-20260718.mp4",
        mobile: "/media/datum-news-loop-mobile-lowbit-20260722.mp4",
        chromium: {
            desktop: "/media/datum-news-loop-desktop-vp9-20260718.webm",
            mobile: "/media/datum-news-loop-mobile-vp9-20260718.webm",
        },
        poster: "/media/datum-news-poster-20260714.webp",
        fps: FPS_30,
        frameCount: 201,
        visibilityRatio: 0.25,
        seekProfile: "playback",
        keyframeContract: {
            defaultPlayback: { keyframeCount: 14, maxGopFrames: 15, hasBFrames: 0 },
            chromium: { keyframeCount: 14, maxGopFrames: 15, hasBFrames: 0 },
        },
    },
    domino: {
        poster: "/media/domino-forward-poster-1120-20260807.webp",
        posterOutput: { width: 1120, height: 630 },
        forward: {
            desktop: "/media/domino-cta-forward-desktop-20260718.mp4",
            mobile: "/media/domino-cta-forward-mobile-20260718.mp4",
            chromium: {
                desktop: "/media/domino-cta-forward-desktop-vp9-20260718.webm",
                mobile: "/media/domino-cta-forward-mobile-vp9-20260718.webm",
            },
        },
        reverse: {
            desktop: "/media/domino-cta-reverse-desktop-20260718.mp4",
            mobile: "/media/domino-cta-reverse-mobile-20260718.mp4",
            chromium: {
                desktop: "/media/domino-cta-reverse-desktop-vp9-20260718.webm",
                mobile: "/media/domino-cta-reverse-mobile-vp9-20260718.webm",
            },
        },
        fps: FPS_30,
        frameCount: 115,
        visibilityRatio: 0.25,
        seekProfile: "directional-playback",
        keyframeContract: {
            defaultPlayback: { keyframeCount: 8, maxGopFrames: 15, hasBFrames: 0 },
            chromium: { keyframeCount: 8, maxGopFrames: 15, hasBFrames: 0 },
        },
    },
} as const;
export const SERVICES_KEYFRAME_STOPS = RUNTIME_MEDIA.services.stopFrames.map((frame) => secondsAtFrame(frame, RUNTIME_MEDIA.services.fps)) as readonly number[];
export const SERVICES_REVERSE_KEYFRAME_STOPS = RUNTIME_MEDIA.services.reverseStopFrames.map((frame) => secondsAtFrame(frame, RUNTIME_MEDIA.services.fps)) as readonly number[];
export const SERVICES_EXIT_STOP = secondsAtFrame(RUNTIME_MEDIA.services.exitFrame, RUNTIME_MEDIA.services.fps);
export const DATUM_DURATION = RUNTIME_MEDIA.datum.frameCount / RUNTIME_MEDIA.datum.fps;
export const DOMINO_DURATION = RUNTIME_MEDIA.domino.frameCount / RUNTIME_MEDIA.domino.fps;
