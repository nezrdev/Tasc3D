const FPS_30 = 30;
const secondsAtFrame = (frame: number, fps = FPS_30) => frame / fps;
export const RUNTIME_MEDIA = {
    hero: {
        nativeAlpha: {
            desktop: "/media/hero-earth-alpha-640-60fps-20260716.webm",
            mobile: "/media/hero-earth-alpha-480-30fps-mobile-20260722.webm",
            desktopOutput: { width: 640, height: 640 },
            mobileOutput: { width: 480, height: 480 },
        },
        webkitPacked: {
            desktop: "/media/hero-earth-safari-packed-640-60fps-20260716.mp4",
            mobile: "/media/hero-earth-safari-packed-480-30fps-mobile-20260722.mp4",
            desktopOutput: { width: 640, height: 640 },
            mobileOutput: { width: 480, height: 480 },
        },
        poster: "/media/hero-earth-poster-1080-20260715.webp",
        fps: { desktop: 60, mobile: 30 },
        frameCount: { desktop: 1200, mobile: 600 },
        duration: 20,
    },
    services: {
        nativeAlpha: {
            desktop: "/media/services-keyframes-desktop-final-20260718.webm",
            mobile: "/media/services-keyframes-mobile-lean-20260721.webm",
        },
        webkitPacked: {
            desktop: "/media/services-keyframes-packed-1280-final-20260718.mp4",
            mobile: "/media/services-keyframes-packed-960-lean-20260721.mp4",
            desktopOutput: { width: 1280, height: 720 },
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
        seekProfile: "palindrome-positive-playback-gop15",
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
        seekProfile: "playback-gop15",
    },
    domino: {
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
        seekProfile: "directional-playback-gop15",
    },
} as const;
export const SERVICES_KEYFRAME_STOPS = RUNTIME_MEDIA.services.stopFrames.map((frame) => secondsAtFrame(frame, RUNTIME_MEDIA.services.fps)) as readonly number[];
export const SERVICES_REVERSE_KEYFRAME_STOPS = RUNTIME_MEDIA.services.reverseStopFrames.map((frame) => secondsAtFrame(frame, RUNTIME_MEDIA.services.fps)) as readonly number[];
export const SERVICES_EXIT_STOP = secondsAtFrame(RUNTIME_MEDIA.services.exitFrame, RUNTIME_MEDIA.services.fps);
export const DATUM_DURATION = RUNTIME_MEDIA.datum.frameCount / RUNTIME_MEDIA.datum.fps;
export const DOMINO_DURATION = RUNTIME_MEDIA.domino.frameCount / RUNTIME_MEDIA.domino.fps;
