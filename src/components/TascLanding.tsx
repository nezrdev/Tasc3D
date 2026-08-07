"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import CookieConsent from "@/components/CookieConsent";
import { ClientsSection } from "@/components/sections/ClientsSection";
import { DatumSection } from "@/components/sections/DatumSection";
import { DominoSection } from "@/components/sections/DominoSection";
import { HeroSection } from "@/components/sections/HeroSection";
import { HowWeWorkSection } from "@/components/sections/HowWeWorkSection";
import { ProcessSection } from "@/components/sections/ProcessSection";
import { ServicesSection } from "@/components/sections/ServicesSection";
import { SiteFooter } from "@/components/sections/SiteFooter";
import SitePreloader from "@/components/SitePreloader";
import TascHeader from "@/components/TascHeader";
import { useMediaOrchestrator } from "@/hooks/useMediaOrchestrator";
import { useReversibleScrollStories } from "@/hooks/useReversibleScrollStories";
import type { GalaxyHandle } from "@/components/Galaxy";
import { useLeadSubmission } from "@/hooks/useLeadSubmission";
import { RUNTIME_MEDIA, SERVICES_EXIT_STOP, SERVICES_KEYFRAME_STOPS, SERVICES_REVERSE_KEYFRAME_STOPS, } from "@/data/runtime-media";
import { CONTENT_REVEAL_LAG, cardRevealTime, revealTime } from "@/lib/tasc-motion-timings";
import {
    hasExplicitConstrainedConnectionSignal,
    MEASURED_CONSTRAINED_MEGABITS_PER_SECOND,
    observeFirstMediaThroughput,
} from "@/lib/connection-profile";
import { isMediaBufferedThrough } from "@/lib/media-buffer";
import { registerMotionInputObserver } from "@/lib/motion-input-bus";
import { scheduleScrollTriggerRefresh } from "@/lib/scroll-trigger-refresh";
import { acquireScrollLock, type ScrollLockHandle } from "@/lib/scroll-lock";
import { getVisualViewportHeight } from "@/lib/visibility";
import type { LensPose, MotionNavigationController, } from "@/types/landing";
gsap.registerPlugin(ScrollTrigger, useGSAP);
const Galaxy = dynamic(() => import("@/components/Galaxy"), { ssr: false });
const GALAXY_SHARED_PROPS = {
    glowIntensity: 0.2,
    saturation: 0,
    hueShift: 360,
    twinkleIntensity: 0,
    rotationSpeed: 0.1,
    repulsionStrength: 6.5,
    mouseRepulsion: true,
    transparent: true,
    pauseDuringScroll: false,
    disableOnReducedMotion: false,
} as const;
const PRIMARY_GALAXY_VISIBILITY_TARGETS = ".hero-motion, .figma-clients-section, .services-story-section, .how-work-motion-section";
const INTERACTIVE_GALAXY_VISIBILITY_TARGETS = ".hero-motion, .figma-clients-inner";
const DOMINO_VIDEO_MP4 = RUNTIME_MEDIA.domino.forward.desktop;
const DOMINO_VIDEO_MOBILE_MP4 = RUNTIME_MEDIA.domino.forward.mobile;
const DOMINO_VIDEO_WEBM = RUNTIME_MEDIA.domino.forward.chromium.desktop;
const DOMINO_VIDEO_MOBILE_WEBM = RUNTIME_MEDIA.domino.forward.chromium.mobile;
const DOMINO_REVERSE_VIDEO_MP4 = RUNTIME_MEDIA.domino.reverse.desktop;
const DOMINO_REVERSE_VIDEO_MOBILE_MP4 = RUNTIME_MEDIA.domino.reverse.mobile;
const DOMINO_REVERSE_VIDEO_WEBM = RUNTIME_MEDIA.domino.reverse.chromium.desktop;
const DOMINO_REVERSE_VIDEO_MOBILE_WEBM = RUNTIME_MEDIA.domino.reverse.chromium.mobile;
const HERO_LENS_VIDEO_WEBM = RUNTIME_MEDIA.hero.nativeAlpha.desktop;
const HERO_LENS_VIDEO_MOBILE_WEBM = RUNTIME_MEDIA.hero.nativeAlpha.mobile;
const HERO_LENS_SAFARI_PACKED_MP4 = RUNTIME_MEDIA.hero.webkitPacked.desktop;
const HERO_LENS_SAFARI_MOBILE_PACKED_MP4 = RUNTIME_MEDIA.hero.webkitPacked.mobile;
const HERO_LENS_POSTER = RUNTIME_MEDIA.hero.poster;
const SERVICES_SEQUENCE_POSTER = RUNTIME_MEDIA.services.poster;
const SERVICES_VIDEO_WEBM = RUNTIME_MEDIA.services.nativeAlpha.desktop;
const SERVICES_VIDEO_MOBILE_WEBM = RUNTIME_MEDIA.services.nativeAlpha.mobile;
const SERVICES_VIDEO_PACKED_MP4 = RUNTIME_MEDIA.services.webkitPacked.desktop;
const SERVICES_VIDEO_MOBILE_PACKED_MP4 = RUNTIME_MEDIA.services.webkitPacked.mobile;
const SERVICES_STOP_POSTERS = RUNTIME_MEDIA.services.stopPosters;
const DATUM_VIDEO_MP4 = RUNTIME_MEDIA.datum.desktop;
const DATUM_VIDEO_MOBILE_MP4 = RUNTIME_MEDIA.datum.mobile;
const DATUM_VIDEO_WEBM = RUNTIME_MEDIA.datum.chromium.desktop;
const DATUM_VIDEO_MOBILE_WEBM = RUNTIME_MEDIA.datum.chromium.mobile;
const DATUM_VIDEO_POSTER = RUNTIME_MEDIA.datum.poster;
const VISION_LOGO_PLACEHOLDER =
    "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
const CLIENTS_FLARE_PLACEHOLDER =
    "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
const VISION_LOGO_DEEP_LINKS = new Set([
    "#clients",
    "#services",
    "#work",
    "#datum",
    "#brief",
    "#process",
    "#contact",
]);
const SERVICES_PLAYBACK_RATE = 1;
const SERVICES_ENTRY_GATE_MS = 120;
const SERVICES_POST_STAGE_GATE_MS = 150;
const MEDIA_SEGMENT_GRACE_MS = 700;
const SERVICES_FIRST_SEGMENT_BUFFER_END = SERVICES_KEYFRAME_STOPS[0] + 2 / 30;
const SERVICES_COMPLETE_STORY_BUFFER_END = Math.max(SERVICES_EXIT_STOP, SERVICES_REVERSE_KEYFRAME_STOPS[0]) + 1 / 60;
const SERVICES_REVERSE_STOP_FRAMES = RUNTIME_MEDIA.services.reverseStopFrames;
const SERVICES_REVERSE_STOP_FRAME_SIGNATURE = SERVICES_REVERSE_STOP_FRAMES.join(",");
const SERVICES_REVERSE_STOP_TIME_LABELS = SERVICES_REVERSE_STOP_FRAMES.map((frame) => `${frame}/${RUNTIME_MEDIA.services.fps}`);
const SERVICES_REVERSE_STOP_TIME_SIGNATURE = SERVICES_REVERSE_STOP_TIME_LABELS.join(",");
const SERVICES_HAS_CONTINUOUS_REVERSE = SERVICES_REVERSE_KEYFRAME_STOPS.length === SERVICES_KEYFRAME_STOPS.length;
const SERVICES_FORWARD_HOLD_STOP = SERVICES_REVERSE_KEYFRAME_STOPS[SERVICES_REVERSE_KEYFRAME_STOPS.length - 1];
// Half a frame. Enough to land on the intended side of a cut, short enough that the
// rendered frame is still the authored stop.
const SERVICES_SEAM_FRAME_NUDGE = 1 / (RUNTIME_MEDIA.services.fps * 2);
// Sub-frame acceptance window for seeks that have to resolve to one exact frame.
const SERVICES_SEAM_SEEK_TOLERANCE = 1 / (RUNTIME_MEDIA.services.fps * 2);
/*
  Services is pinned across this many viewports of real document. The three
  stops sit at the progress marks below, so the reader gets close to a viewport
  of ordinary scrolling between one segment and the next. Past the last stop we
  settle on the visually identical first reverse frame; the transparent frame at
  the old exit seam must never become the pinned resting surface.
*/
const SERVICES_PIN_VIEWPORTS = 2.4;
const SERVICES_STOP_PROGRESS = [0, 0.34, 0.63] as const;
const SERVICES_EXIT_PROGRESS = 0.88;
const MOBILE_PROFILE_WIDTH = 900;
const MOBILE_PROFILE_HYSTERESIS_PX = 80;
type RuntimePerformanceProfile = {
    constrainedConnection: boolean;
    edgeAlphaCompatibility: boolean;
    forcePackedTransport: boolean;
    macPerformance: boolean;
    mobilePerformance: boolean;
    nativeAlphaWebMSupported: boolean;
    packedH264Supported: boolean;
    webkitCompatibility: boolean;
};
type InitialRuntimeProfile = RuntimePerformanceProfile & {
    coarsePointer: boolean;
    motionAllowed: boolean;
    ready: boolean;
    viewportHeight: number;
    viewportWidth: number;
};
const readBootstrapBoolean = (key: string, fallback: boolean) => {
    if (typeof document === "undefined")
        return fallback;
    const value = document.documentElement.dataset[key];
    return value === undefined ? fallback : value === "true";
};
const readBootstrapNumber = (key: string, fallback: number) => {
    if (typeof document === "undefined")
        return fallback;
    const value = Number(document.documentElement.dataset[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};
const readInitialRuntimeProfile = (): InitialRuntimeProfile => ({
    ready: readBootstrapBoolean("tascProfileReady", false),
    motionAllowed: readBootstrapBoolean("tascMotionAllowed", false),
    mobilePerformance: readBootstrapBoolean("tascMobilePerformance", false),
    macPerformance: readBootstrapBoolean("tascMacos", false),
    webkitCompatibility: readBootstrapBoolean("tascWebkit", false),
    edgeAlphaCompatibility: readBootstrapBoolean("tascEdgeAlpha", false),
    packedH264Supported: readBootstrapBoolean("tascPackedH264Supported", true),
    nativeAlphaWebMSupported: readBootstrapBoolean("tascNativeAlphaWebmSupported", true),
    forcePackedTransport: readBootstrapBoolean("tascForcePacked", false),
    constrainedConnection: readBootstrapBoolean("tascConstrainedConnection", false),
    coarsePointer: readBootstrapBoolean("tascCoarsePointer", false),
    viewportWidth: readBootstrapNumber("tascViewportWidth", 1280),
    viewportHeight: readBootstrapNumber("tascViewportHeight", 800),
});
const ensurePreloadAuto = (video: HTMLVideoElement | null) => {
    if (!video || video.preload === "auto" || video.dataset.armed !== "true")
        return;
    video.preload = "auto";
};
export function TascLanding() {
    const [initialRuntimeProfile] = useState(readInitialRuntimeProfile);
    const rootRef = useRef<HTMLElement | null>(null);
    const primaryGalaxyRef = useRef<GalaxyHandle | null>(null);
    const interactiveGalaxyRef = useRef<GalaxyHandle | null>(null);
    const dominoVideoRef = useRef<HTMLVideoElement | null>(null);
    const dominoReverseVideoRef = useRef<HTMLVideoElement | null>(null);
    const dominoSourceErrorReporterRef = useRef<((direction: "forward" | "reverse") => void) | null>(null);
    const dominoPendingSourceErrorsRef = useRef({ forward: false, reverse: false });
    const servicesVideoRef = useRef<HTMLVideoElement | null>(null);
    const servicesWarmupClaimRef = useRef<(() => void) | null>(null);
    const datumVideoRef = useRef<HTMLVideoElement | null>(null);
    const heroTimelineRef = useRef<gsap.core.Timeline | null>(null);
    const servicesControllerRef = useRef<MotionNavigationController | null>(null);
    const programmaticNavigationRef = useRef(false);
    const programmaticAnchorRef = useRef<string | null>(null);
    const anchorSettleCleanupRef = useRef<(() => void) | null>(null);
    const initialHashHandledRef = useRef(false);
    const [motionAllowed, setMotionAllowed] = useState(false);
    const [motionPreferenceResolved, setMotionPreferenceResolved] = useState(false);
    const [performanceModeResolved, setPerformanceModeResolved] = useState(false);
    const [mobilePerformanceMode, setMobilePerformanceMode] = useState(() => initialRuntimeProfile.mobilePerformance);
    const [macPerformanceMode, setMacPerformanceMode] = useState(() => initialRuntimeProfile.macPerformance);
    const [webkitCompatibilityMode, setWebkitCompatibilityMode] = useState(() => initialRuntimeProfile.webkitCompatibility);
    const [edgeAlphaCompatibilityMode, setEdgeAlphaCompatibilityMode] = useState(() => initialRuntimeProfile.edgeAlphaCompatibility);
    const [packedH264Supported, setPackedH264Supported] = useState(() => initialRuntimeProfile.packedH264Supported);
    const [nativeAlphaWebMSupported, setNativeAlphaWebMSupported] = useState(() => initialRuntimeProfile.nativeAlphaWebMSupported);
    const [forcePackedTransport, setForcePackedTransport] = useState(() => initialRuntimeProfile.forcePackedTransport);
    const [constrainedConnection, setConstrainedConnection] = useState(() => initialRuntimeProfile.constrainedConnection);
    const [explicitConstrainedConnection, setExplicitConstrainedConnection] = useState(() => initialRuntimeProfile.constrainedConnection);
    const [preloaderComplete, setPreloaderComplete] = useState(false);
    const [preloaderRevealStarted, setPreloaderRevealStarted] = useState(false);
    const [criticalStaticAssetsReady, setCriticalStaticAssetsReady] = useState(false);
    const [heroIntroReady, setHeroIntroReady] = useState(false);
    const {
        actions: mediaActions,
        setters: {
            setDatumMediaFallback,
            setDatumMediaPrepared,
            setDominoForwardFallback,
            setDominoForwardPrepared,
            setDominoReverseFallback,
            setDominoReversePrepared,
            setGalaxyStatus,
            setHeroFallbackAnimationEligible,
            setHeroFallbackAnimationReady,
            setServicesStopPostersArmed,
            setVisionLogoArmed,
        },
        state: {
            clientsFlareArmed,
            datumMediaArmed,
            datumMediaFallback,
            datumMediaPrepared,
            dominoForwardFallback,
            dominoForwardPrepared,
            dominoMediaArmed,
            dominoReverseFallback,
            dominoReverseMediaArmed,
            dominoReversePrepared,
            galaxyStatus,
            heroFallbackAnimationEligible,
            heroFallbackAnimationReady,
            heroVideoEligible,
            heroVideoState,
            interactiveGalaxyArmed,
            packedAlphaOwner,
            servicesMediaArmed,
            servicesMediaFallback,
            servicesMediaPrepared,
            servicesStopPostersArmed,
            visionLogoArmed,
        },
    } = useMediaOrchestrator();
    const servicesGalaxyStatus = galaxyStatus;
    const constrainedConnectionLatchRef = useRef(initialRuntimeProfile.constrainedConnection);
    const explicitConstrainedConnectionLatchRef = useRef(initialRuntimeProfile.constrainedConnection);
    const viewportMetricsRef = useRef({
        height: initialRuntimeProfile.viewportHeight,
        width: initialRuntimeProfile.viewportWidth,
    });
    const stableMobileViewportWidthRef = useRef(initialRuntimeProfile.viewportWidth);
    const stableMobilePerformanceModeRef = useRef(initialRuntimeProfile.mobilePerformance);
    const runtimeProfileRef = useRef<RuntimePerformanceProfile>({
        constrainedConnection: initialRuntimeProfile.constrainedConnection,
        edgeAlphaCompatibility: initialRuntimeProfile.edgeAlphaCompatibility,
        forcePackedTransport: initialRuntimeProfile.forcePackedTransport,
        macPerformance: initialRuntimeProfile.macPerformance,
        mobilePerformance: initialRuntimeProfile.mobilePerformance,
        nativeAlphaWebMSupported: initialRuntimeProfile.nativeAlphaWebMSupported,
        packedH264Supported: initialRuntimeProfile.packedH264Supported,
        webkitCompatibility: initialRuntimeProfile.webkitCompatibility,
    });
    const motionRuntimeGateRef = useRef({
        allowed: false,
        revealStarted: false,
    });
    const servicesSourceStateRef = useRef<{
        node: HTMLVideoElement | null;
        source: string;
        transport: string;
    }>({ node: null, source: "", transport: "" });
    const datumLead = useLeadSubmission("datum_waitlist");
    const dominoLead = useLeadSubmission("project_brief");
    const lightweightMediaMode = mobilePerformanceMode || constrainedConnection;
    const servicesLightweightMediaMode = mobilePerformanceMode || explicitConstrainedConnection;
    const servicesPackedTransportMode =
        packedH264Supported &&
            (forcePackedTransport ||
                webkitCompatibilityMode ||
                edgeAlphaCompatibilityMode ||
                !nativeAlphaWebMSupported);
    const servicesTransportProfile = servicesLightweightMediaMode ? "mobile" : "desktop";
    const servicesTransportFormat = servicesPackedTransportMode ? "packed-alpha-h264" : "native-alpha-webm";
    const servicesTransportReason = servicesPackedTransportMode
        ? forcePackedTransport
            ? "force-packed"
            : webkitCompatibilityMode
                ? "webkit-compat"
                : edgeAlphaCompatibilityMode
                    ? "edge-alpha-compat"
                    : "native-alpha-webm-unsupported"
        : forcePackedTransport && !packedH264Supported
            ? "force-packed-unavailable"
            : "native-alpha-webm-supported";
    const servicesVideoSource = servicesPackedTransportMode
        ? servicesTransportProfile === "mobile"
            ? SERVICES_VIDEO_MOBILE_PACKED_MP4
            : SERVICES_VIDEO_PACKED_MP4
        : servicesTransportProfile === "mobile"
            ? SERVICES_VIDEO_MOBILE_WEBM
            : SERVICES_VIDEO_WEBM;
    const servicesTransportKey = servicesPackedTransportMode ? "packed-alpha-h264" : "native-alpha-webm";
    useLayoutEffect(() => {
        runtimeProfileRef.current = {
            constrainedConnection,
            edgeAlphaCompatibility: edgeAlphaCompatibilityMode,
            forcePackedTransport,
            macPerformance: macPerformanceMode,
            mobilePerformance: mobilePerformanceMode,
            nativeAlphaWebMSupported,
            packedH264Supported,
            webkitCompatibility: webkitCompatibilityMode,
        };
        motionRuntimeGateRef.current.allowed = motionAllowed;
        motionRuntimeGateRef.current.revealStarted = preloaderRevealStarted;
    }, [
        constrainedConnection,
        edgeAlphaCompatibilityMode,
        forcePackedTransport,
        macPerformanceMode,
        mobilePerformanceMode,
        motionAllowed,
        nativeAlphaWebMSupported,
        packedH264Supported,
        preloaderRevealStarted,
        webkitCompatibilityMode,
    ]);
    const activateServicesMediaFallback = useCallback(() => {
        const root = rootRef.current;
        const video = servicesVideoRef.current;
        const activeStage = Math.min(SERVICES_KEYFRAME_STOPS.length, Math.max(1, Number(root?.dataset.servicesActive ?? 1) || 1));
        video?.pause();
        mediaActions.activateServicesFallback();
        if (video)
            video.dataset.segmentState = "fallback";
        if (root) {
            delete root.dataset.servicesMediaDecoded;
            root.dataset.servicesMediaFallback = "true";
            root.dataset.servicesStaticStop = String(activeStage);
        }
    }, [mediaActions]);
    const recoverServicesMedia = useCallback(() => {
        const root = rootRef.current;
        const video = servicesVideoRef.current;
        if (!root ||
            !video ||
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            !isMediaBufferedThrough(video, SERVICES_FIRST_SEGMENT_BUFFER_END) ||
            root.dataset.servicesStartFrameDecoded !== "true") {
            return;
        }
        delete root.dataset.servicesMediaFallback;
        delete root.dataset.servicesTransportFailure;
        if (video.dataset.segmentState === "fallback")
            video.dataset.segmentState = "idle";
        root.dataset.servicesFirstSegmentWarm = "true";
        const completeStoryPrepared = isMediaBufferedThrough(video, SERVICES_COMPLETE_STORY_BUFFER_END);
        if (completeStoryPrepared) {
            root.dataset.servicesCompleteStoryWarm = "true";
        }
        mediaActions.recoverServices();
    }, [mediaActions]);
    const reportDominoSourceError = useCallback((direction: "forward" | "reverse") => {
        dominoPendingSourceErrorsRef.current[direction] = true;
        const reporter = dominoSourceErrorReporterRef.current;
        if (!reporter)
            return;
        dominoPendingSourceErrorsRef.current[direction] = false;
        reporter(direction);
    }, []);
    const datumVideoSource = lightweightMediaMode
        ? DATUM_VIDEO_MOBILE_MP4
        : webkitCompatibilityMode
            ? DATUM_VIDEO_MP4
            : DATUM_VIDEO_WEBM;
    const dominoTransportKey = `${webkitCompatibilityMode ? "mp4-first" : "webm-first"}-${lightweightMediaMode ? "compact" : "desktop"}`;
    const heroVisualReady = !motionAllowed ||
        heroVideoState === "ready" ||
        (heroVideoState === "fallback" && (!heroFallbackAnimationEligible || heroFallbackAnimationReady));
    const lowerMediaPrepared = servicesMediaPrepared &&
        datumMediaPrepared &&
        dominoForwardPrepared;
    const lowerMediaHasFallback = servicesMediaFallback ||
        datumMediaFallback ||
        dominoForwardFallback;
    const lowerMediaSettled = (servicesMediaPrepared || servicesMediaFallback) &&
        (datumMediaPrepared || datumMediaFallback) &&
        (dominoForwardPrepared || dominoForwardFallback);
    const preloaderReady = motionPreferenceResolved &&
        performanceModeResolved &&
        criticalStaticAssetsReady &&
        heroVisualReady;
    /*
      The starfield mode has to agree with whether the canvas is actually on the
      page. A stale "ready" from a galaxy that has since unmounted put the shell
      in galaxy mode with nothing rendering, and galaxy mode hides the static
      fallback - which is a sky with no stars in it.
    */
    const galaxyMounted = heroIntroReady && motionPreferenceResolved && performanceModeResolved && motionAllowed;
    const interactiveGalaxyEnabled = interactiveGalaxyArmed &&
        motionAllowed &&
        performanceModeResolved &&
        preloaderComplete &&
        !mobilePerformanceMode;
    useEffect(() => {
        if (!motionPreferenceResolved || motionAllowed)
            return;
        const armFrame = window.requestAnimationFrame(mediaActions.armVisionLogo);
        return () => window.cancelAnimationFrame(armFrame);
    }, [mediaActions, motionAllowed, motionPreferenceResolved]);
    const resetToTop = useCallback(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }, []);
    useLayoutEffect(() => {
        const previousRestoration = window.history.scrollRestoration;
        const initialHash = window.location.hash;
        window.history.scrollRestoration = "manual";
        if (!initialHash) {
            resetToTop();
        }
        return () => {
            window.history.scrollRestoration = previousRestoration;
        };
    }, [resetToTop]);
    useEffect(() => {
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const syncMotionPreference = () => {
            ScrollTrigger.config({ ignoreMobileResize: true });
            setMotionAllowed(!media.matches);
            setMotionPreferenceResolved(true);
        };
        syncMotionPreference();
        media.addEventListener("change", syncMotionPreference);
        return () => media.removeEventListener("change", syncMotionPreference);
    }, []);
    useEffect(() => {
        if (!motionPreferenceResolved)
            return;
        const eventName = motionAllowed && preloaderRevealStarted
            ? "tasc:motion-runtime-request"
            : "tasc:motion-runtime-disable";
        window.dispatchEvent(new Event(eventName));
    }, [motionAllowed, motionPreferenceResolved, preloaderRevealStarted]);
    useEffect(() => {
        let cancelled = false;
        const criticalImages = [
            HERO_LENS_POSTER,
            "/media/hero-mission-transition-20260712.svg",
            "/media/tasc-logo-20260710.svg",
            "/media/safari-static-starfield-20260713.svg",
        ];
        const decodeImage = (src: string) => new Promise<void>((resolve) => {
            const image = new window.Image();
            let settled = false;
            const finish = () => {
                if (settled)
                    return;
                settled = true;
                resolve();
            };
            image.decoding = "async";
            image.onload = () => {
                if (typeof image.decode === "function")
                    void image.decode().catch(() => undefined).finally(finish);
                else
                    finish();
            };
            image.onerror = finish;
            image.src = src;
            if (image.complete)
                finish();
        });
        const safetyTimer = window.setTimeout(() => {
            if (!cancelled)
                setCriticalStaticAssetsReady(true);
        }, 1200);
        void Promise.all(criticalImages.map(decodeImage)).then(() => {
            if (cancelled)
                return;
            window.clearTimeout(safetyTimer);
            setCriticalStaticAssetsReady(true);
        });
        return () => {
            cancelled = true;
            window.clearTimeout(safetyTimer);
        };
    }, []);
    useEffect(() => {
        const device = navigator as Navigator & {
            connection?: {
                addEventListener?: (type: "change", listener: () => void) => void;
                effectiveType?: string;
                removeEventListener?: (type: "change", listener: () => void) => void;
                saveData?: boolean;
            };
            deviceMemory?: number;
        };
        const coarsePointer = window.matchMedia("(pointer: coarse)");
        const userAgent = navigator.userAgent;
        const codecProbe = document.createElement("video");
        const supportsPackedH264 = codecProbe.canPlayType('video/mp4; codecs="avc1.4D401F"') !== "";
        const isEdge = /\bEdg(?:A|iOS)?\//i.test(userAgent);
        const isSafari = /^((?!chrome|android|crios|fxios|edg|opr).)*safari/i.test(userAgent);
        const isIOS = /iPad|iPhone|iPod/i.test(userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        const isAppleWebView = /AppleWebKit/i.test(userAgent) &&
            !/(Safari|Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android)/i.test(userAgent);
        const isKnownChromiumAlphaRuntime =
            /(?:Chrome|Chromium)\//i.test(userAgent) &&
            !isEdge &&
            !/\b(?:OPR|SamsungBrowser)\//i.test(userAgent) &&
            !isIOS &&
            !isAppleWebView;
        const supportsNativeAlphaWebM = isKnownChromiumAlphaRuntime &&
            codecProbe.canPlayType('video/webm; codecs="vp9"') !== "";
        const searchParams = new URLSearchParams(window.location.search);
        const forceWebKitCompatibility = searchParams.get("webkitCompat") === "1";
        const forcePacked = searchParams.get("forcePacked") === "1";
        const isAppleWebKit = document.documentElement.dataset.tascWebkit === "true" ||
            forceWebKitCompatibility ||
            isSafari ||
            isIOS ||
            isAppleWebView;
        const isMacOS = document.documentElement.dataset.tascMacos === "true" ||
            /Macintosh|Mac OS X/i.test(userAgent) ||
            /^Mac/i.test(navigator.platform || "") ||
            isIOS;
        const lowMemory = typeof device.deviceMemory === "number" && device.deviceMemory <= 4;
        const lowCpu = typeof device.hardwareConcurrency === "number" && device.hardwareConcurrency <= 4;
        let resizeFrame = 0;
        let forceNextSync = false;
        const readViewport = () => ({
            height: Math.max(1, document.documentElement.clientHeight || window.visualViewport?.height || window.innerHeight),
            width: Math.max(1, document.documentElement.clientWidth || window.visualViewport?.width || window.innerWidth),
        });
        const syncPerformanceMode = (forceViewportProfile = false) => {
            const viewport = readViewport();
            viewportMetricsRef.current = viewport;
            document.documentElement.dataset.tascViewportWidth = String(Math.round(viewport.width));
            document.documentElement.dataset.tascViewportHeight = String(Math.round(viewport.height));
            const nextMobileMode = coarsePointer.matches ||
                viewport.width <= MOBILE_PROFILE_WIDTH ||
                (!isMacOS && (lowMemory || lowCpu)) ||
                device.connection?.saveData === true;
            const widthMoved = Math.abs(viewport.width - stableMobileViewportWidthRef.current);
            const mobileModeChanged = nextMobileMode !== stableMobilePerformanceModeRef.current;
            const shouldSwitchMobileMode = mobileModeChanged &&
                (forceViewportProfile || widthMoved > MOBILE_PROFILE_HYSTERESIS_PX);
            if (shouldSwitchMobileMode) {
                stableMobileViewportWidthRef.current = viewport.width;
                stableMobilePerformanceModeRef.current = nextMobileMode;
            }
            if (forceViewportProfile || shouldSwitchMobileMode) {
                document.documentElement.dataset.tascMobilePerformance = String(nextMobileMode);
                setMobilePerformanceMode(nextMobileMode);
            }
            setWebkitCompatibilityMode(isAppleWebKit);
            setEdgeAlphaCompatibilityMode(isEdge);
            setPackedH264Supported(supportsPackedH264);
            setNativeAlphaWebMSupported(supportsNativeAlphaWebM);
            setForcePackedTransport(forcePacked);
            setMacPerformanceMode(isMacOS);
            if (!explicitConstrainedConnectionLatchRef.current && hasExplicitConstrainedConnectionSignal(device)) {
                explicitConstrainedConnectionLatchRef.current = true;
                setExplicitConstrainedConnection(true);
                if (!constrainedConnectionLatchRef.current) {
                    constrainedConnectionLatchRef.current = true;
                    setConstrainedConnection(true);
                }
            }
            setPerformanceModeResolved(true);
        };
        const scheduleSync = (forceViewportProfile = false) => {
            forceNextSync = forceNextSync || forceViewportProfile;
            if (resizeFrame)
                return;
            resizeFrame = window.requestAnimationFrame(() => {
                resizeFrame = 0;
                const forceProfile = forceNextSync;
                forceNextSync = false;
                syncPerformanceMode(forceProfile);
            });
        };
        const scheduleViewportSync = () => scheduleSync(false);
        const scheduleSignalSync = () => scheduleSync(true);
        syncPerformanceMode(!initialRuntimeProfile.ready);
        window.addEventListener("resize", scheduleViewportSync, { passive: true });
        window.visualViewport?.addEventListener("resize", scheduleViewportSync, { passive: true });
        coarsePointer.addEventListener("change", scheduleSignalSync);
        device.connection?.addEventListener?.("change", scheduleSignalSync);
        return () => {
            if (resizeFrame)
                window.cancelAnimationFrame(resizeFrame);
            window.removeEventListener("resize", scheduleViewportSync);
            window.visualViewport?.removeEventListener("resize", scheduleViewportSync);
            coarsePointer.removeEventListener("change", scheduleSignalSync);
            device.connection?.removeEventListener?.("change", scheduleSignalSync);
        };
    }, [initialRuntimeProfile.ready]);
    useEffect(() => observeFirstMediaThroughput((megabitsPerSecond) => {
        const root = rootRef.current;
        if (root) {
            root.dataset.measuredMediaThroughputMbps = megabitsPerSecond.toFixed(2);
            root.dataset.measuredConnectionProfile = megabitsPerSecond <= MEASURED_CONSTRAINED_MEGABITS_PER_SECOND
                ? "constrained"
                : "standard";
        }
        if (megabitsPerSecond <= MEASURED_CONSTRAINED_MEGABITS_PER_SECOND) {
            if (!constrainedConnectionLatchRef.current) {
                constrainedConnectionLatchRef.current = true;
                document.documentElement.dataset.tascConstrainedConnection = "true";
                setConstrainedConnection(true);
            }
        }
    }), []);
    useEffect(() => {
        if (!motionAllowed ||
            !performanceModeResolved ||
            !preloaderComplete ||
            mobilePerformanceMode) {
            return;
        }
        const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
        if (!finePointer.matches) {
            return;
        }
        let armed = false;
        const armInteractiveGalaxy = () => {
            if (armed)
                return;
            armed = true;
            mediaActions.armInteractiveGalaxy();
        };
        const idleTimer = window.setTimeout(armInteractiveGalaxy, webkitCompatibilityMode ? 1800 : 850);
        window.addEventListener("pointermove", armInteractiveGalaxy, {
            once: true,
            passive: true,
        });
        return () => {
            window.clearTimeout(idleTimer);
            window.removeEventListener("pointermove", armInteractiveGalaxy);
        };
    }, [
        mobilePerformanceMode,
        mediaActions,
        motionAllowed,
        performanceModeResolved,
        preloaderComplete,
        webkitCompatibilityMode,
    ]);
    useEffect(() => {
        if (!interactiveGalaxyEnabled ||
            mobilePerformanceMode ||
            (!webkitCompatibilityMode && !macPerformanceMode)) {
            return;
        }
        const root = rootRef.current;
        const layer = root?.querySelector<HTMLElement>(".first-four-star-parallax");
        if (!root || !layer)
            return;
        const xTo = gsap.quickTo(layer, "x", { duration: 0.65, ease: "power3.out" });
        const yTo = gsap.quickTo(layer, "y", { duration: 0.65, ease: "power3.out" });
        const visibleTargets = new Set<Element>();
        let interactionActive = false;
        let servicesBlocked = false;
        const resetPosition = () => {
            xTo(0);
            yTo(0);
        };
        const syncInteraction = () => {
            interactionActive = visibleTargets.size > 0 && !servicesBlocked;
            layer.dataset.parallaxActive = String(interactionActive);
            if (!interactionActive)
                resetPosition();
        };
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting)
                    visibleTargets.add(entry.target);
                else
                    visibleTargets.delete(entry.target);
            });
            syncInteraction();
        }, { threshold: 0.01 });
        root
            .querySelectorAll<HTMLElement>(INTERACTIVE_GALAXY_VISIBILITY_TARGETS)
            .forEach((target) => observer.observe(target));
        const servicesSection = root.querySelector<HTMLElement>(".services-story-section");
        const servicesObserver = servicesSection
            ? new IntersectionObserver((entries) => {
                servicesBlocked = entries.some((entry) => entry.isIntersecting);
                syncInteraction();
            }, { threshold: 0.01 })
            : null;
        if (servicesSection)
            servicesObserver?.observe(servicesSection);
        const handlePointerMove = (event: PointerEvent) => {
            if (!interactionActive)
                return;
            const normalizedX = event.clientX / Math.max(1, window.innerWidth) - 0.5;
            const normalizedY = event.clientY / Math.max(1, window.innerHeight) - 0.5;
            xTo(normalizedX * 44);
            yTo(normalizedY * 26);
        };
        window.addEventListener("pointermove", handlePointerMove, { passive: true });
        window.addEventListener("blur", resetPosition);
        document.addEventListener("mouseleave", resetPosition);
        return () => {
            observer.disconnect();
            servicesObserver?.disconnect();
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("blur", resetPosition);
            document.removeEventListener("mouseleave", resetPosition);
            delete layer.dataset.parallaxActive;
            gsap.set(layer, { clearProps: "transform" });
        };
    }, [
        interactiveGalaxyEnabled,
        macPerformanceMode,
        mobilePerformanceMode,
        webkitCompatibilityMode,
    ]);
    useEffect(() => {
        const root = rootRef.current;
        const userAgent = navigator.userAgent;
        const isSafari = /^((?!chrome|android|crios|fxios|edg|opr).)*safari/i.test(userAgent);
        const isIOS = /iPad|iPhone|iPod/i.test(userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        const isAppleWebView = /AppleWebKit/i.test(userAgent) &&
            !/(Safari|Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android)/i.test(userAgent);
        const isEdge = /\bEdg(?:A|iOS)?\//i.test(userAgent);
        const needsAnimatedFallback = isSafari || isIOS || isAppleWebView || isEdge || !nativeAlphaWebMSupported;
        const useStaticHero = new URLSearchParams(window.location.search).get("staticHero") === "1";
        root?.setAttribute("data-hero-video-composite", "alpha");
        root?.setAttribute("data-hero-video-format", useStaticHero ? "static-poster" : needsAnimatedFallback ? "h264-mask-webgl" : "alpha-webm");
        if (!motionPreferenceResolved) {
            return;
        }
        if (!motionAllowed) {
            root?.removeAttribute("data-hero-video-poster-fallback");
            const stateFrame = window.requestAnimationFrame(() => {
                mediaActions.configureHero("reduced");
            });
            return () => {
                window.cancelAnimationFrame(stateFrame);
            };
        }
        const stateFrame = window.requestAnimationFrame(() => {
            if (useStaticHero) {
                root?.setAttribute("data-hero-video-poster-fallback", "true");
                mediaActions.configureHero("poster");
            }
            else if (needsAnimatedFallback) {
                root?.setAttribute("data-hero-video-poster-fallback", "true");
                mediaActions.configureHero("animated-fallback");
            }
            else {
                root?.removeAttribute("data-hero-video-poster-fallback");
                mediaActions.configureHero("video");
            }
        });
        return () => window.cancelAnimationFrame(stateFrame);
    }, [constrainedConnection, mediaActions, motionAllowed, motionPreferenceResolved, nativeAlphaWebMSupported]);
    useEffect(() => {
        if (!preloaderComplete ||
            !motionAllowed ||
            (!heroFallbackAnimationEligible && !servicesPackedTransportMode)) {
            return;
        }
        const root = rootRef.current;
        const hero = root?.querySelector<HTMLElement>(".hero-motion");
        const services = root?.querySelector<HTMLElement>(".services-story-section");
        if (!root || !hero || !services)
            return;
        let frame = 0;
        const syncOwner = () => {
            frame = 0;
            const viewportHeight = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
            const heroRect = hero.getBoundingClientRect();
            const servicesRect = services.getBoundingClientRect();
            const heroVisible = heroRect.bottom > 0 && heroRect.top < viewportHeight;
            const servicesNear = servicesRect.bottom >= -viewportHeight * 0.75 &&
                servicesRect.top <= viewportHeight * 1.75;
            const nextOwner = heroVisible
                ? "hero"
                : servicesNear || window.location.hash === "#services"
                    ? "services"
                    : null;
            if (!nextOwner)
                return;
            mediaActions.selectPackedAlphaOwner(nextOwner);
        };
        const scheduleSync = () => {
            if (frame)
                return;
            frame = window.requestAnimationFrame(syncOwner);
        };
        const observer = new IntersectionObserver(scheduleSync, {
            rootMargin: "75% 0px",
            threshold: 0,
        });
        observer.observe(hero);
        observer.observe(services);
        window.addEventListener("resize", scheduleSync, { passive: true });
        window.addEventListener("hashchange", scheduleSync);
        syncOwner();
        return () => {
            observer.disconnect();
            if (frame)
                window.cancelAnimationFrame(frame);
            window.removeEventListener("resize", scheduleSync);
            window.removeEventListener("hashchange", scheduleSync);
        };
    }, [
        heroFallbackAnimationEligible,
        mediaActions,
        motionAllowed,
        preloaderComplete,
        servicesPackedTransportMode,
    ]);
    useEffect(() => {
        const root = rootRef.current;
        const video = servicesVideoRef.current;
        root?.setAttribute("data-services-video-composite", servicesPackedTransportMode ? "packed-alpha" : "alpha");
        root?.setAttribute("data-services-video-format", servicesTransportFormat);
        root?.setAttribute("data-services-transport", servicesPackedTransportMode ? "packed-h264-webgl" : "native-alpha-webm");
        root?.setAttribute("data-services-transport-reason", servicesTransportReason);
        root?.setAttribute("data-services-source-profile", servicesTransportProfile);
        root?.setAttribute("data-services-source", servicesVideoSource);
        root?.setAttribute("data-services-native-alpha-webm-supported", String(nativeAlphaWebMSupported));
        root?.setAttribute("data-services-packed-h264-supported", String(packedH264Supported));
        root?.setAttribute("data-services-force-packed", String(forcePackedTransport));
        root?.setAttribute("data-services-reverse-transport", "continuous");
        root?.setAttribute("data-services-continuous-reverse", String(SERVICES_HAS_CONTINUOUS_REVERSE));
        root?.setAttribute("data-services-reverse-stop-frames", SERVICES_REVERSE_STOP_FRAME_SIGNATURE);
        root?.setAttribute("data-services-reverse-stop-times", SERVICES_REVERSE_STOP_TIME_SIGNATURE);
        root?.setAttribute("data-services-reverse-fps", String(RUNTIME_MEDIA.services.fps));
        if (video) {
            video.dataset.armed = servicesMediaArmed ? "true" : "false";
            if (!video.dataset.servicesNodeId) {
                const nextNodeId = Number(root?.dataset.servicesVideoNodeSequence ?? 0) + 1;
                video.dataset.servicesNodeId = String(nextNodeId);
                root?.setAttribute("data-services-video-node-sequence", String(nextNodeId));
            }
            root?.setAttribute("data-services-video-node-id", video.dataset.servicesNodeId);
        }
        if (!motionAllowed || !servicesMediaArmed || !video)
            return;
        const previousSourceState = servicesSourceStateRef.current;
        const sameTransportSourceChange = previousSourceState.node === video &&
            previousSourceState.transport === servicesTransportKey &&
            previousSourceState.source !== "" &&
            previousSourceState.source !== servicesVideoSource;
        servicesSourceStateRef.current = {
            node: video,
            source: servicesVideoSource,
            transport: servicesTransportKey,
        };
        video.dataset.segmentState = "idle";
        if (sameTransportSourceChange) {
            video.pause();
            video.src = servicesVideoSource;
            const loadCount = Number(root?.dataset.servicesVideoLoadCount ?? 0) + 1;
            root?.setAttribute("data-services-video-load-count", String(loadCount));
            root?.setAttribute("data-services-video-source-swapped", "true");
            delete root?.dataset.servicesFirstSegmentWarm;
            delete root?.dataset.servicesCompleteStoryWarm;
            delete root?.dataset.servicesStartFrameDecoded;
            mediaActions.invalidateServicesPrepared();
            video.load();
        }
        else if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) {
            video.load();
        }
    }, [
        forcePackedTransport,
        motionAllowed,
        nativeAlphaWebMSupported,
        packedH264Supported,
        servicesMediaArmed,
        servicesPackedTransportMode,
        servicesTransportFormat,
        servicesTransportProfile,
        servicesTransportReason,
        servicesTransportKey,
        servicesVideoSource,
        mediaActions,
    ]);
    useEffect(() => {
        const root = rootRef.current;
        const video = servicesVideoRef.current;
        if (!root || !video || !motionAllowed || !servicesMediaArmed)
            return;
        const shell = root;
        const media = video;
        let disposed = false;
        let firstSegmentSettled = shell.dataset.servicesFirstSegmentWarm === "true";
        let completeStorySettled = shell.dataset.servicesCompleteStoryWarm === "true";
        let interactiveClaimed = false;
        const cleanup = () => {
            media.removeEventListener("loadeddata", markDecodedStart);
            media.removeEventListener("canplay", inspectWarmState);
            media.removeEventListener("progress", inspectWarmState);
        };
        const completeStoryWarmup = () => {
            if (completeStorySettled || disposed)
                return;
            completeStorySettled = true;
            cleanup();
            if (!interactiveClaimed) {
                media.pause();
                media.playbackRate = 1;
                if (media.readyState >= HTMLMediaElement.HAVE_METADATA) {
                    try {
                        if (Math.abs(media.currentTime) > 1 / 60)
                            media.currentTime = 0;
                    }
                    catch {
                    }
                }
                media.dataset.segmentState = "ready";
            }
            shell.dataset.servicesCompleteStoryWarm = "true";
        };
        const completeFirstSegmentWarmup = () => {
            if (firstSegmentSettled || disposed)
                return;
            firstSegmentSettled = true;
            if (!interactiveClaimed) {
                media.pause();
                media.playbackRate = 1;
                try {
                    if (Math.abs(media.currentTime - 0.001) > 1 / 60)
                        media.currentTime = 0.001;
                }
                catch {
                }
                media.dataset.segmentState = "ready";
            }
            shell.dataset.servicesFirstSegmentWarm = "true";
            delete shell.dataset.servicesWarmupBlocked;
            mediaActions.markServicesFirstSegmentPrepared();
        };
        function inspectWarmState() {
            if (disposed || completeStorySettled)
                return;
            if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                shell.dataset.servicesStartFrameDecoded = "true";
            }
            const playedThroughFirstSegment = media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                media.currentTime >= SERVICES_FIRST_SEGMENT_BUFFER_END - 0.12;
            if (shell.dataset.servicesStartFrameDecoded === "true" &&
                (isMediaBufferedThrough(media, SERVICES_FIRST_SEGMENT_BUFFER_END) ||
                    playedThroughFirstSegment)) {
                completeFirstSegmentWarmup();
            }
            const playedThroughCompleteStory = media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                media.currentTime >= SERVICES_COMPLETE_STORY_BUFFER_END - 0.18;
            if (shell.dataset.servicesStartFrameDecoded === "true" &&
                (isMediaBufferedThrough(media, SERVICES_COMPLETE_STORY_BUFFER_END) ||
                    playedThroughCompleteStory)) {
                completeFirstSegmentWarmup();
                completeStoryWarmup();
            }
        }
        function markDecodedStart() {
            if (disposed || completeStorySettled)
                return;
            shell.dataset.servicesStartFrameDecoded = "true";
            inspectWarmState();
        }
        media.addEventListener("loadeddata", markDecodedStart);
        media.addEventListener("canplay", inspectWarmState);
        media.addEventListener("progress", inspectWarmState);
        const claimInteractiveOwnership = () => {
            if (disposed || interactiveClaimed)
                return;
            interactiveClaimed = true;
            media.pause();
            delete shell.dataset.servicesWarmupBlocked;
            shell.dataset.servicesWarmupOwner = "interactive";
        };
        servicesWarmupClaimRef.current = claimInteractiveOwnership;
        if (media.networkState === HTMLMediaElement.NETWORK_EMPTY)
            media.load();
        inspectWarmState();
        return () => {
            disposed = true;
            cleanup();
            if (servicesWarmupClaimRef.current === claimInteractiveOwnership) {
                servicesWarmupClaimRef.current = null;
            }
            if (!completeStorySettled && !preloaderRevealStarted)
                media.pause();
        };
    }, [
        motionAllowed,
        preloaderRevealStarted,
        servicesMediaArmed,
        servicesVideoSource,
        mediaActions,
        webkitCompatibilityMode,
    ]);
    useEffect(() => {
        const resetFrame = window.requestAnimationFrame(() => {
            delete rootRef.current?.dataset.servicesStartFrameDecoded;
            delete rootRef.current?.dataset.servicesFirstSegmentWarm;
            delete rootRef.current?.dataset.servicesCompleteStoryWarm;
            delete rootRef.current?.dataset.servicesWarmupBlocked;
            mediaActions.resetServicesWarmState();
        });
        return () => window.cancelAnimationFrame(resetFrame);
    }, [mediaActions, servicesVideoSource]);
    useEffect(() => {
        const resetFrame = window.requestAnimationFrame(() => {
            mediaActions.resetDatumWarmState();
        });
        return () => window.cancelAnimationFrame(resetFrame);
    }, [datumVideoSource, mediaActions]);
    useEffect(() => {
        const resetFrame = window.requestAnimationFrame(() => {
            mediaActions.resetDominoWarmState();
        });
        return () => window.cancelAnimationFrame(resetFrame);
    }, [dominoTransportKey, mediaActions]);
    useEffect(() => {
        if (!motionPreferenceResolved || !performanceModeResolved)
            return;
        const armDeepLinkedMedia = () => {
            const hash = window.location.hash;
            if (VISION_LOGO_DEEP_LINKS.has(hash))
                mediaActions.armVisionLogo();
            if (hash === "#clients" || hash === "#services")
                mediaActions.armClientsFlare();
            if (hash === "#services") {
                mediaActions.armServices();
            }
            if (hash === "#datum" || hash === "#brief") {
                mediaActions.armDatum();
                mediaActions.armDomino();
            }
            if (hash === "#process" || hash === "#contact") {
                mediaActions.armDatum();
                mediaActions.armDomino();
            }
        };
        armDeepLinkedMedia();
        window.addEventListener("hashchange", armDeepLinkedMedia);
        return () => window.removeEventListener("hashchange", armDeepLinkedMedia);
    }, [mediaActions, motionPreferenceResolved, performanceModeResolved]);
    useEffect(() => {
        if (!motionPreferenceResolved || !preloaderComplete)
            return;
        const root = rootRef.current;
        if (!root)
            return;
        const armFromHash = () => {
            const hash = window.location.hash;
            if (VISION_LOGO_DEEP_LINKS.has(hash))
                mediaActions.armVisionLogo();
            if (hash === "#clients" || hash === "#services")
                mediaActions.armClientsFlare();
            if (hash === "#services") {
                mediaActions.armServices();
            }
            if (hash === "#datum")
                mediaActions.armDatum();
            if (hash === "#brief")
                mediaActions.armDomino();
        };
        armFromHash();
        const targets = new Map<Element, { arm: () => void; marginViewports: number }>();
        const register = (selector: string, arm: () => void, marginViewports: number) => {
            const target = root.querySelector(selector);
            if (target)
                targets.set(target, { arm, marginViewports });
        };
        register(".services-story-section", () => {
            mediaActions.armServices();
        }, mobilePerformanceMode || constrainedConnection ? 1.75 : 2);
        register(".figma-clients-section", mediaActions.armClientsFlare, 1);
        register(".datum-motion-section", mediaActions.armDatum, 1.4);
        register(".domino-cta-section", mediaActions.armDomino, mobilePerformanceMode || constrainedConnection ? 3.6 : 2.45);
        const getArmMargin = (target: Element) => {
            const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
            const marginViewports = targets.get(target)?.marginViewports ?? 1;
            return Math.max(600, Math.round(viewportHeight * marginViewports));
        };
        const armedTargets = new Set<Element>();
        const observers = new Map<Element, IntersectionObserver>();
        let proximityFrame = 0;
        let proximityListenersAttached = false;
        let unregisterProximityInputObserver = () => { };
        let nearbyReevaluationTimer = 0;
        function stopProximityTracking() {
            observers.forEach((observer) => observer.disconnect());
            observers.clear();
            if (proximityListenersAttached) {
                unregisterProximityInputObserver();
                unregisterProximityInputObserver = () => { };
                window.removeEventListener("resize", scheduleProximityCheck);
                proximityListenersAttached = false;
            }
            if (proximityFrame)
                window.cancelAnimationFrame(proximityFrame);
            proximityFrame = 0;
            if (nearbyReevaluationTimer)
                window.clearTimeout(nearbyReevaluationTimer);
            nearbyReevaluationTimer = 0;
        }
        function armTarget(target: Element) {
            if (armedTargets.has(target))
                return;
            armedTargets.add(target);
            targets.get(target)?.arm();
            observers.get(target)?.disconnect();
            observers.delete(target);
            if (armedTargets.size === targets.size)
                stopProximityTracking();
        }
        function armNearbyTargets() {
            proximityFrame = 0;
            targets.forEach((_, target) => {
                if (armedTargets.has(target))
                    return;
                const rect = target.getBoundingClientRect();
                const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
                const currentMargin = getArmMargin(target);
                if (rect.top <= viewportHeight + currentMargin && rect.bottom >= -currentMargin) {
                    armTarget(target);
                }
            });
        }
        function scheduleProximityCheck() {
            if (proximityFrame)
                return;
            proximityFrame = window.requestAnimationFrame(armNearbyTargets);
        }
        const startProximityFallback = () => {
            if (proximityListenersAttached)
                return;
            unregisterProximityInputObserver = registerMotionInputObserver("media-proximity", ({ kind }) => {
                if (kind === "scroll")
                    scheduleProximityCheck();
            });
            window.addEventListener("resize", scheduleProximityCheck, { passive: true });
            proximityListenersAttached = true;
            scheduleProximityCheck();
        };
        if ("IntersectionObserver" in window) {
            try {
                targets.forEach((_, target) => {
                    const observer = new IntersectionObserver((entries) => {
                        if (entries.some((entry) => entry.isIntersecting))
                            armTarget(target);
                    }, { rootMargin: `${getArmMargin(target)}px 0px`, threshold: 0 });
                    observers.set(target, observer);
                    observer.observe(target);
                });
            }
            catch {
                startProximityFallback();
            }
        }
        else {
            startProximityFallback();
        }
        nearbyReevaluationTimer = window.setTimeout(startProximityFallback, 10000);
        return stopProximityTracking;
    }, [constrainedConnection, mediaActions, mobilePerformanceMode, motionPreferenceResolved, preloaderComplete]);
    useEffect(() => {
        if (!dominoMediaArmed)
            return;
        const forwardVideo = dominoVideoRef.current;
        const reverseVideo = dominoReverseVideoRef.current;
        if (!forwardVideo || !reverseVideo)
            return;
        let disposed = false;
        const retryTimers = new Map<number, HTMLVideoElement>();
        const failedVideos = new Set<HTMLVideoElement>();
        const retryLadderStarted = new Set<HTMLVideoElement>();
        const videos = [forwardVideo, ...(dominoReverseMediaArmed ? [reverseVideo] : [])];
        const clearRetryLadder = (video: HTMLVideoElement) => {
            retryTimers.forEach((owner, timer) => {
                if (owner !== video)
                    return;
                window.clearTimeout(timer);
                retryTimers.delete(timer);
            });
            failedVideos.delete(video);
            retryLadderStarted.delete(video);
            if (video === forwardVideo)
                dominoPendingSourceErrorsRef.current.forward = false;
            else
                dominoPendingSourceErrorsRef.current.reverse = false;
        };
        const markPrepared = (video: HTMLVideoElement) => {
            if (disposed || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
                return;
            clearRetryLadder(video);
            if (video === forwardVideo) {
                mediaActions.markDominoPrepared("forward");
            }
            else {
                mediaActions.markDominoPrepared("reverse");
            }
        };
        const warmVideo = (video: HTMLVideoElement) => {
            if (video.dataset.armed !== "true" || failedVideos.has(video))
                return;
            if (video.networkState === HTMLMediaElement.NETWORK_EMPTY)
                video.load();
            markPrepared(video);
        };
        const retryColdMedia = (video: HTMLVideoElement) => {
            if (disposed ||
                !failedVideos.has(video) ||
                video.dataset.armed !== "true" ||
                video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                markPrepared(video);
                return;
            }
            if (video.networkState !== HTMLMediaElement.NETWORK_EMPTY &&
                video.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE)
                return;
            failedVideos.delete(video);
            video.load();
        };
        const scheduleColdMediaRetry = (video: HTMLVideoElement) => {
            failedVideos.add(video);
            if (retryLadderStarted.has(video))
                return;
            retryLadderStarted.add(video);
            [2000, 6000, 12000].forEach((delay) => {
                const timer = window.setTimeout(() => {
                    retryTimers.delete(timer);
                    retryColdMedia(video);
                }, delay);
                retryTimers.set(timer, video);
            });
        };
        const handleForwardPrepared = () => markPrepared(forwardVideo);
        const handleReversePrepared = () => markPrepared(reverseVideo);
        const handleForwardError = () => {
            mediaActions.markDominoFallback("forward");
            scheduleColdMediaRetry(forwardVideo);
        };
        const handleReverseError = () => {
            mediaActions.markDominoFallback("reverse");
            scheduleColdMediaRetry(reverseVideo);
        };
        const reportSourceError = (direction: "forward" | "reverse") => {
            if (direction === "forward")
                handleForwardError();
            else if (dominoReverseMediaArmed)
                handleReverseError();
        };
        dominoSourceErrorReporterRef.current = reportSourceError;
        if (dominoPendingSourceErrorsRef.current.forward) {
            dominoPendingSourceErrorsRef.current.forward = false;
            handleForwardError();
        }
        if (dominoReverseMediaArmed && dominoPendingSourceErrorsRef.current.reverse) {
            dominoPendingSourceErrorsRef.current.reverse = false;
            handleReverseError();
        }
        const handlePageShow = () => videos.forEach(warmVideo);
        forwardVideo.addEventListener("loadeddata", handleForwardPrepared);
        forwardVideo.addEventListener("canplay", handleForwardPrepared);
        forwardVideo.addEventListener("error", handleForwardError, true);
        if (dominoReverseMediaArmed) {
            reverseVideo.addEventListener("loadeddata", handleReversePrepared);
            reverseVideo.addEventListener("canplay", handleReversePrepared);
            reverseVideo.addEventListener("error", handleReverseError, true);
        }
        videos.forEach(warmVideo);
        if (forwardVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA &&
            forwardVideo.networkState === HTMLMediaElement.NETWORK_NO_SOURCE)
            handleForwardError();
        if (dominoReverseMediaArmed &&
            reverseVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA &&
            reverseVideo.networkState === HTMLMediaElement.NETWORK_NO_SOURCE)
            handleReverseError();
        window.addEventListener("pageshow", handlePageShow);
        return () => {
            disposed = true;
            if (dominoSourceErrorReporterRef.current === reportSourceError)
                dominoSourceErrorReporterRef.current = null;
            retryTimers.forEach((_, timer) => window.clearTimeout(timer));
            retryTimers.clear();
            forwardVideo.removeEventListener("loadeddata", handleForwardPrepared);
            forwardVideo.removeEventListener("canplay", handleForwardPrepared);
            forwardVideo.removeEventListener("error", handleForwardError, true);
            reverseVideo.removeEventListener("loadeddata", handleReversePrepared);
            reverseVideo.removeEventListener("canplay", handleReversePrepared);
            reverseVideo.removeEventListener("error", handleReverseError, true);
            window.removeEventListener("pageshow", handlePageShow);
        };
    }, [dominoMediaArmed, dominoReverseMediaArmed, dominoTransportKey, mediaActions]);
    useEffect(() => {
        if (!motionAllowed || !heroVideoEligible) {
            return;
        }
        const video = rootRef.current?.querySelector<HTMLVideoElement>(".lens-video");
        if (!video) {
            return;
        }
        let cancelled = false;
        let failed = false;
        let readyReleased = false;
        let warmFrameCount = 0;
        let lastWarmMediaTime = Number.NEGATIVE_INFINITY;
        let videoFrameCallbackId: number | undefined;
        let animationFrameId: number | undefined;
        let readyCheck: number | undefined;
        let fallbackCheck: number | undefined;
        const stopChecks = () => {
            if (readyCheck !== undefined) {
                window.clearTimeout(readyCheck);
            }
            if (fallbackCheck !== undefined) {
                window.clearTimeout(fallbackCheck);
            }
            if (videoFrameCallbackId !== undefined && typeof video.cancelVideoFrameCallback === "function") {
                video.cancelVideoFrameCallback(videoFrameCallbackId);
                videoFrameCallbackId = undefined;
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
        const releasePoster = () => {
            if (cancelled || failed || readyReleased) {
                return;
            }
            readyReleased = true;
            stopChecks();
            rootRef.current?.removeAttribute("data-hero-video-poster-fallback");
            mediaActions.markHeroPlaybackReady();
        };
        const fallBackToPoster = () => {
            if (cancelled) {
                return;
            }
            failed = true;
            readyReleased = false;
            stopChecks();
            video.pause();
            mediaActions.markHeroPlaybackFallback();
        };
        const requestWarmFrame = () => {
            if (cancelled ||
                failed ||
                readyReleased ||
                video.paused ||
                video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
                videoFrameCallbackId !== undefined ||
                animationFrameId !== undefined) {
                return;
            }
            const inspectFrame = () => {
                if (cancelled || failed || readyReleased)
                    return;
                if (Math.abs(video.currentTime - lastWarmMediaTime) >= 1 / 240) {
                    lastWarmMediaTime = video.currentTime;
                    warmFrameCount += 1;
                }
                if (warmFrameCount >= 4 &&
                    (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA || getBufferedAhead() >= 0.35)) {
                    releasePoster();
                    return;
                }
                requestWarmFrame();
            };
            if (typeof video.requestVideoFrameCallback === "function") {
                videoFrameCallbackId = video.requestVideoFrameCallback(() => {
                    videoFrameCallbackId = undefined;
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
        const releaseWhenReady = () => requestWarmFrame();
        video.addEventListener("loadeddata", releaseWhenReady);
        video.addEventListener("canplay", releaseWhenReady);
        video.addEventListener("playing", releaseWhenReady);
        video.addEventListener("progress", releaseWhenReady);
        video.addEventListener("error", fallBackToPoster);
        void video.play().then(releaseWhenReady).catch(() => {
            fallBackToPoster();
        });
        readyCheck = window.setTimeout(releaseWhenReady, 520);
        fallbackCheck = window.setTimeout(() => {
            if (!readyReleased && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
                fallBackToPoster();
            }
        }, window.matchMedia("(max-width: 900px), (pointer: coarse)").matches ? 5200 : 3600);
        return () => {
            cancelled = true;
            video.removeEventListener("loadeddata", releaseWhenReady);
            video.removeEventListener("canplay", releaseWhenReady);
            video.removeEventListener("playing", releaseWhenReady);
            video.removeEventListener("progress", releaseWhenReady);
            video.removeEventListener("error", fallBackToPoster);
            stopChecks();
        };
    }, [heroVideoEligible, mediaActions, motionAllowed]);
    const handleAnchorNavigate = useCallback((href: string, options?: { replaceHistory?: boolean }) => {
        const replaceHistory = options?.replaceHistory !== false;
        if (href === "#services") {
            mediaActions.armServices();
        }
        if (VISION_LOGO_DEEP_LINKS.has(href))
            mediaActions.armVisionLogo();
        if (href === "#datum")
            mediaActions.armDatum();
        if (href === "#brief")
            mediaActions.armDomino();
        if (!motionAllowed) {
            const target = href === "#top"
                ? document.documentElement
                : document.querySelector<HTMLElement>(href);
            const top = href === "#top"
                ? 0
                : target
                    ? target.getBoundingClientRect().top + window.scrollY - 72
                    : 0;
            if (replaceHistory)
                window.history.replaceState(null, "", href);
            window.scrollTo({
                top: Math.max(0, top),
                left: 0,
                behavior: "auto",
            });
            return;
        }
        anchorSettleCleanupRef.current?.();
        if (rootRef.current)
            rootRef.current.dataset.programmaticAnchor = href;
        window.dispatchEvent(new Event("tasc:release-directional-domino"));
        programmaticAnchorRef.current = href;
        programmaticNavigationRef.current = true;
        servicesControllerRef.current?.releaseForNavigation();
        const headerOffset = href === "#clients" ? 0 : -84;
        const getSectionTop = (selector: string) => {
            const section = document.querySelector<HTMLElement>(selector);
            return section ? section.getBoundingClientRect().top + window.scrollY + 1 : null;
        };
        const getPinnedStoryStart = (triggerId: string, selector: string) => {
            const trigger = ScrollTrigger.getById(triggerId);
            if (trigger && Number.isFinite(trigger.start))
                return trigger.start + 1;
            return getSectionTop(selector);
        };
        const scrollToPosition = (top: number, resolveTop?: () => number | null) => {
            programmaticNavigationRef.current = true;
            let settleCancelled = false;
            let settleFrame = 0;
            let unregisterInputObserver = () => { };
            const removeIntentListeners = () => {
                unregisterInputObserver();
                unregisterInputObserver = () => { };
                window.removeEventListener("pointerdown", cancelSettle);
            };
            const completeSettle = () => {
                removeIntentListeners();
                if (anchorSettleCleanupRef.current === cancelSettle) {
                    anchorSettleCleanupRef.current = null;
                }
                if (programmaticAnchorRef.current === href) {
                    programmaticNavigationRef.current = false;
                    programmaticAnchorRef.current = null;
                }
                if (rootRef.current?.dataset.programmaticAnchor === href) {
                    delete rootRef.current.dataset.programmaticAnchor;
                }
            };
            function cancelSettle() {
                if (settleCancelled)
                    return;
                settleCancelled = true;
                window.cancelAnimationFrame(settleFrame);
                completeSettle();
            }
            unregisterInputObserver = registerMotionInputObserver("anchor-settle", ({ event, kind }) => {
                if (kind === "wheel" || kind === "touchstart") {
                    cancelSettle();
                    return;
                }
                if (kind === "keydown" && event instanceof KeyboardEvent &&
                    ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
                    cancelSettle();
                }
            });
            window.addEventListener("pointerdown", cancelSettle, { passive: true });
            anchorSettleCleanupRef.current = cancelSettle;
            const applyPosition = (nextTop: number) => {
                const targetTop = Math.max(0, Math.round(nextTop));
                window.scrollTo({ top: targetTop, behavior: "auto" });
                ScrollTrigger.update();
                window.dispatchEvent(new CustomEvent("tasc:scroll-position-applied"));
            };
            if (replaceHistory && window.history?.replaceState) {
                window.history.replaceState(null, "", href);
            }
            settleFrame = window.requestAnimationFrame(() => {
                if (settleCancelled || !programmaticNavigationRef.current || programmaticAnchorRef.current !== href)
                    return;
                const finalTop = resolveTop?.() ?? top;
                if (finalTop !== null)
                    applyPosition(finalTop);
                completeSettle();
            });
        };
        if (href === "#top") {
            scrollToPosition(0);
            return;
        }
        if (href === "#clients") {
            const clientsSection = document.querySelector<HTMLElement>(".figma-clients-section");
            const resolveClientsTop = () => {
                const heroTrigger = ScrollTrigger.getById("hero-motion");
                if (clientsSection)
                    return clientsSection.getBoundingClientRect().top + window.scrollY + 1;
                if (heroTrigger && Number.isFinite(heroTrigger.end))
                    return heroTrigger.end + 1;
                return null;
            };
            const top = resolveClientsTop();
            if (top !== null) {
                scrollToPosition(top, resolveClientsTop);
                return;
            }
        }
        if (href === "#brief") {
            const resolveBriefTop = () => getPinnedStoryStart("domino-reversible", ".domino-cta-section");
            const top = resolveBriefTop();
            if (top !== null) {
                scrollToPosition(top, resolveBriefTop);
                return;
            }
        }
        if (href === "#services") {
            const resolveServicesTop = () => getPinnedStoryStart("services-reversible", ".services-story-section");
            const top = resolveServicesTop();
            if (top !== null) {
                scrollToPosition(top, resolveServicesTop);
                return;
            }
        }
        if (href === "#work") {
            const resolveWorkTop = () => {
                const sectionTop = getSectionTop(".how-work-motion-section");
                const triggerTop = getPinnedStoryStart("how-work-reversible", ".how-work-motion-section");
                if (sectionTop !== null && (triggerTop === null || triggerTop < sectionTop - 4))
                    return sectionTop;
                return triggerTop;
            };
            const top = resolveWorkTop();
            if (top !== null) {
                scrollToPosition(top, resolveWorkTop);
                return;
            }
        }
        if (href === "#datum") {
            const resolveDatumTop = () => getPinnedStoryStart("datum-reversible", ".datum-motion-section");
            const top = resolveDatumTop();
            if (top !== null) {
                scrollToPosition(top, resolveDatumTop);
                return;
            }
        }
        if (href === "#process") {
            const processSection = document.querySelector<HTMLElement>(".process-contact-section");
            if (processSection) {
                const resolveProcessTop = () => processSection.getBoundingClientRect().top + window.scrollY + 1;
                const top = resolveProcessTop();
                scrollToPosition(top, resolveProcessTop);
                return;
            }
        }
        const target = document.querySelector<HTMLElement>(href);
        if (!target) {
            programmaticNavigationRef.current = false;
            programmaticAnchorRef.current = null;
            if (rootRef.current?.dataset.programmaticAnchor === href) {
                delete rootRef.current.dataset.programmaticAnchor;
            }
            return;
        }
        const resolveTargetTop = () => target.getBoundingClientRect().top + window.scrollY + headerOffset;
        scrollToPosition(resolveTargetTop(), resolveTargetTop);
    }, [mediaActions, motionAllowed]);
    useLayoutEffect(() => {
        const root = rootRef.current;
        const clientsSection = root?.querySelector<HTMLElement>(".figma-clients-section");
        const clientsFlareStage = root?.querySelector<HTMLElement>(".vision-clients-flare-stage");
        const clientsScrollElement = root?.querySelector<HTMLElement>(".clients-scroll-element-wrap");
        if (!root || !clientsSection || !clientsFlareStage || !clientsScrollElement)
            return;
        let frame = 0;
        let debounceTimer = 0;
        const readViewportWidth = () => Math.max(1, document.documentElement.clientWidth || window.visualViewport?.width || window.innerWidth);
        let stableViewportWidth = readViewportWidth();
        let stableViewportHeight = Math.max(document.documentElement.clientHeight, window.visualViewport?.height ?? window.innerHeight);
        const syncClientsFlareDocumentPosition = () => {
            frame = 0;
            const rootRect = root.getBoundingClientRect();
            const clientsRect = clientsSection.getBoundingClientRect();
            const planeWidth = clientsScrollElement.offsetWidth;
            const planeHeight = clientsScrollElement.offsetHeight;
            const planeOffsetTop = clientsScrollElement.offsetTop;
            const viewportHeight = stableViewportHeight;
            const compactFlare = stableViewportWidth <= 900;
            const angle = (15 * Math.PI) / 180;
            const planeScale = compactFlare ? 1 : 1.42;
            const rotatedHeight = Math.abs(planeWidth * Math.sin(angle)) +
                Math.abs(planeHeight * Math.cos(angle));
            const rotatedTopWithinStage = planeOffsetTop + planeHeight / 2 - (rotatedHeight * planeScale) / 2;
            const entryFactor = compactFlare ? 0.82 : 1.24;
            const entryOverlap = Math.min(Math.max(viewportHeight * entryFactor, 520), compactFlare ? 760 : 1680);
            const clientsTopWithinRoot = clientsRect.top - rootRect.top;
            const stageTop = clientsTopWithinRoot - entryOverlap - rotatedTopWithinStage;
            clientsFlareStage.style.transform = `translate3d(0, ${Math.round(stageTop)}px, 0)`;
        };
        const scheduleSync = () => {
            if (debounceTimer)
                window.clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(() => {
                debounceTimer = 0;
                if (frame)
                    window.cancelAnimationFrame(frame);
                frame = window.requestAnimationFrame(syncClientsFlareDocumentPosition);
            }, 200);
        };
        const handleViewportResize = () => {
            const nextWidth = readViewportWidth();
            const compact = nextWidth <= 900;
            if (compact && Math.abs(nextWidth - stableViewportWidth) < 24)
                return;
            stableViewportWidth = nextWidth;
            stableViewportHeight = Math.max(document.documentElement.clientHeight, window.visualViewport?.height ?? window.innerHeight);
            scheduleSync();
        };
        const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        syncClientsFlareDocumentPosition();
        const resizeObserver = new ResizeObserver(scheduleSync);
        resizeObserver.observe(root);
        resizeObserver.observe(clientsSection);
        resizeObserver.observe(clientsScrollElement);
        window.addEventListener("resize", handleViewportResize, { passive: true });
        reducedMotionQuery.addEventListener("change", scheduleSync);
        return () => {
            if (debounceTimer)
                window.clearTimeout(debounceTimer);
            if (frame)
                window.cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            window.removeEventListener("resize", handleViewportResize);
            reducedMotionQuery.removeEventListener("change", scheduleSync);
            clientsFlareStage.style.removeProperty("transform");
        };
    }, []);
    useGSAP(() => {
        const root = rootRef.current;
        if (!root) {
            return;
        }
        let runtimeInitialized = false;
        let runtimeCleanup: (() => void) | null = null;
        const createMotionRuntime = () => {
        if (runtimeInitialized ||
            !motionRuntimeGateRef.current.revealStarted ||
            !motionRuntimeGateRef.current.allowed) {
            return;
        }
        runtimeInitialized = true;
        root.dataset.motionRuntimeInitCount = String(Number(root.dataset.motionRuntimeInitCount ?? 0) + 1);
        root.dataset.motionRuntimeInitialized = "true";
        const isMobileRuntime = () => runtimeProfileRef.current.mobilePerformance;
        const isMacRuntime = () => runtimeProfileRef.current.macPerformance;
        const isWebKitRuntime = () => runtimeProfileRef.current.webkitCompatibility;
        const isConstrainedRuntime = () => runtimeProfileRef.current.constrainedConnection;
        const getRuntimeViewport = () => viewportMetricsRef.current;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const compactMotion = window.matchMedia("(max-width: 640px)").matches;
        const useLegacyServicesFlow = true;
        let stableHeroViewportWidth = getRuntimeViewport().width;
        let stableHeroViewportHeight = getRuntimeViewport().height;
        const getStableHeroPinDistance = () => {
            const { height: nextHeight, width: nextWidth } = getRuntimeViewport();
            const isRealViewportChange = Math.abs(nextWidth - stableHeroViewportWidth) > 80 ||
                Math.abs(nextHeight - stableHeroViewportHeight) > Math.max(180, stableHeroViewportHeight * 0.28);
            if (isRealViewportChange) {
                stableHeroViewportWidth = nextWidth;
                stableHeroViewportHeight = nextHeight;
            }
            // Hero plus Vision used to reserve almost two and a half viewports of
            // scroll on desktop, which read as a long empty stretch before Clients.
            // Review pass two asked for another 20% off desktop and 15% off mobile,
            // so the Vision beat lands while the reader is still moving.
            const pinMultiplier = isMacRuntime() ? 1.12 : isMobileRuntime() ? 1.36 : 1.26;
            return Math.round(stableHeroViewportHeight * pinMultiplier);
        };
        const lensVideo = root.querySelector<HTMLVideoElement>(".lens-video");
        const servicesVideo = servicesVideoRef.current;
        const servicesVisual = root.querySelector<HTMLElement>(".services-story-video");
        const servicesStaticVisual = root.querySelector<HTMLElement>(".services-story-stop-posters");
        const servicesMediaVisuals = [servicesVisual, servicesStaticVisual].filter((visual): visual is HTMLElement => Boolean(visual));
        const isServicesVisuallyNear = (viewportMargin = 1.25) => {
            const servicesNode = root.querySelector<HTMLElement>(".services-story-section");
            if (!servicesNode)
                return false;
            const viewportHeight = getRuntimeViewport().height;
            const margin = viewportHeight * viewportMargin;
            const servicesSpacer = servicesNode.closest<HTMLElement>(".pin-spacer-services-reversible");
            const rect = (servicesSpacer ?? servicesNode).getBoundingClientRect();
            return rect.bottom >= -margin && rect.top <= viewportHeight + margin;
        };
        const dominoVideo = dominoVideoRef.current;
        const servicePanels = gsap.utils.toArray<HTMLElement>(".services-story-panel", root);
        const heroCopyRegion = root.querySelector<HTMLElement>(".hero-copy");
        const missionFrameRegion = root.querySelector<HTMLElement>(".mission-frame");
        const setRegionInteractive = (element: HTMLElement | null, interactive: boolean) => {
            if (!element)
                return;
            if (interactive) {
                element.removeAttribute("inert");
                element.removeAttribute("aria-hidden");
            }
            else {
                element.setAttribute("inert", "");
                element.setAttribute("aria-hidden", "true");
            }
        };
        let disposed = false;
        let heroTimeline: gsap.core.Timeline | null = null;
        let servicesTrigger: ScrollTrigger | null = null;
        let clientsServicesHandoff: gsap.core.Timeline | null = null;
        let datumTimeline: gsap.core.Timeline | null = null;
        let servicesTextTimeline: gsap.core.Timeline | null = null;
        let servicesTextWatchdog = 0;
        let servicesStage = -1;
        let servicesRunToken = 0;
        let servicesActive = false;
        let servicesReleasing = false;
        let servicesForwardComplete = false;
        let servicesSessionDirection: 1 | -1 | 0 = 0;
        const lockClientsServicesHandoffAtServices = () => {
            const handoff = clientsServicesHandoff;
            const trigger = handoff?.scrollTrigger;
            const pendingScrub = trigger?.getTween();
            trigger?.disable(false, true);
            if (pendingScrub &&
                typeof pendingScrub !== "boolean" &&
                typeof pendingScrub.kill === "function") {
                pendingScrub.kill();
            }
            handoff?.progress(1).pause();
            if (servicesMediaVisuals.length)
                gsap.set(servicesMediaVisuals, { autoAlpha: 1 });
        };
        let servicesPhase: "idle" | "preparing" | "playing" | "waiting" | "releasing" | "reverse" = "idle";
        let servicesGateUntil = 0;
        let servicesTransitionDirection: 1 | -1 | 0 = 0;
        let servicesReleaseToken = 0;
        let servicesReleaseTimer = 0;
        let servicesEntryToken = 0;
        let servicesEntryPreparing: 1 | -1 | 0 = 0;
        let servicesEntryRetryTimer = 0;
        let servicesMediaRetryTimer = 0;
        let servicesMediaRetryKey = "";
        let servicesMediaRetryFailures = 0;
        let servicesMediaRetryStartedAt = 0;
        let servicesScrollLock: ScrollLockHandle | null = null;
        let heroVideoSuspended = false;
        const cleanupCallbacks: Array<() => void> = [];
        const managedRevealElements = new Set<HTMLElement>();
        const managedRevealTriggers = new Set<HTMLElement>();
        const registerManagedRevealElements = (elements: Iterable<HTMLElement>) => {
            Array.from(elements).forEach((element) => {
                managedRevealElements.add(element);
                element.dataset.revealManaged = "true";
                delete element.dataset.revealComplete;
            });
        };
        const registerManagedRevealTrigger = (element: HTMLElement) => {
            managedRevealTriggers.add(element);
            element.dataset.revealTrigger = "true";
        };
        const completeManagedReveal = (elements: Iterable<HTMLElement>) => {
            Array.from(elements).forEach((element) => {
                element.dataset.revealComplete = "true";
            });
        };
        cleanupCallbacks.push(() => {
            delete root.dataset.motionReady;
            gsap.killTweensOf(Array.from(managedRevealElements));
            managedRevealElements.forEach((element) => {
                delete element.dataset.revealManaged;
                delete element.dataset.revealComplete;
            });
            managedRevealTriggers.forEach((element) => {
                delete element.dataset.revealTrigger;
            });
        });
        const mediaRunCancels = new Map<HTMLVideoElement, () => void>();
        heroTimelineRef.current = null;
        const resetServicesMediaRetry = () => {
            window.clearTimeout(servicesMediaRetryTimer);
            servicesMediaRetryTimer = 0;
            servicesMediaRetryKey = "";
            servicesMediaRetryFailures = 0;
            servicesMediaRetryStartedAt = 0;
        };
        const beginServicesMediaAttempt = (key: string) => {
            if (servicesMediaRetryKey === key && servicesMediaRetryStartedAt > 0)
                return;
            resetServicesMediaRetry();
            servicesMediaRetryKey = key;
            servicesMediaRetryStartedAt = performance.now();
        };
        const shouldFailOpenServicesMedia = (video: HTMLVideoElement | null) => {
            servicesMediaRetryFailures += 1;
            const connection = (navigator as Navigator & {
                connection?: {
                    effectiveType?: string;
                    saveData?: boolean;
                };
            }).connection;
            const slowTransport = isMobileRuntime() ||
                isConstrainedRuntime() ||
                connection?.saveData === true ||
                connection?.effectiveType === "3g";
            const elapsed = performance.now() - servicesMediaRetryStartedAt;
            if (video?.error)
                return true;
            return servicesMediaRetryFailures >= 4 &&
                elapsed >= (slowTransport ? 16000 : 9000);
        };
        const refreshScroll = () => {
            if (!disposed)
                scheduleScrollTriggerRefresh();
        };
        const getMediaTargetTime = (video: HTMLVideoElement, time: number) => Math.min(Math.max(0, time), Math.max(0, (video.duration || time + 0.02) - 0.02));
        const pauseAndSeek = (video: HTMLVideoElement | null, time: number, tolerance = 1 / 1000) => {
            if (!video)
                return;
            video.pause();
            if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
                const target = getMediaTargetTime(video, time);
                if (Math.abs(video.currentTime - target) > tolerance)
                    video.currentTime = target;
            }
        };
        const setServicesStaticStop = (stage: number | null) => {
            if (stage === null) {
                delete root.dataset.servicesStaticStop;
                return;
            }
            delete root.dataset.servicesMediaDecoded;
            root.dataset.servicesStaticStop = String(stage + 1);
        };
        const setServicesEntryPoster = (visible: boolean) => {
            if (visible)
                root.dataset.servicesEntryPoster = "true";
            else
                delete root.dataset.servicesEntryPoster;
        };
        /*
          `tolerance` is how far off the requested time the decoder is allowed to be
          before this counts as "already there". The 0.12s default is 3.6 frames wide,
          which is fine in the middle of a shot and wrong at a cut: the Services exit
          frame and the first reverse frame are one frame apart, so the default let a
          reverse entry accept the transparent exit frame and paint nothing at all.
          Callers landing on a seam pass a sub-frame tolerance.
        */
        const seekServicesFrame = (video: HTMLVideoElement | null, time: number, isCurrent: () => boolean, tolerance = 0.12) => new Promise<boolean>((resolve) => {
            if (!video || !isCurrent() || disposed) {
                resolve(false);
                return;
            }
            const media = video;
            const target = getMediaTargetTime(media, time);
            let settled = false;
            let timeout = 0;
            const cleanup = () => {
                media.removeEventListener("loadedmetadata", assignTarget);
                media.removeEventListener("loadeddata", reportTarget);
                media.removeEventListener("canplay", reportTarget);
                media.removeEventListener("seeked", reportTarget);
                media.removeEventListener("error", fail);
                window.clearTimeout(timeout);
            };
            const finish = (ready: boolean) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                resolve(ready);
            };
            const reportTarget = () => {
                if (!isCurrent() || disposed) {
                    finish(false);
                    return;
                }
                if (media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || media.seeking)
                    return;
                if (Math.abs(media.currentTime - target) <= tolerance) {
                    finish(true);
                    return;
                }
                assignTarget();
            };
            const assignTarget = () => {
                if (settled || !isCurrent() || disposed) {
                    finish(false);
                    return;
                }
                media.pause();
                if (!media.seeking && Math.abs(media.currentTime - target) <= tolerance) {
                    if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
                        reportTarget();
                    return;
                }
                try {
                    media.currentTime = target;
                }
                catch {
                    finish(false);
                }
            };
            const fail = () => finish(false);
            media.addEventListener("loadedmetadata", assignTarget);
            media.addEventListener("loadeddata", reportTarget);
            media.addEventListener("canplay", reportTarget);
            media.addEventListener("seeked", reportTarget);
            media.addEventListener("error", fail);
            timeout = window.setTimeout(() => {
                finish(isCurrent() &&
                    !disposed &&
                    media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                    !media.seeking &&
                    Math.abs(media.currentTime - target) <= tolerance);
            }, 1800);
            if (media.readyState >= HTMLMediaElement.HAVE_METADATA) {
                assignTarget();
            }
            else {
                ensurePreloadAuto(media);
                if (media.dataset.armed === "true" &&
                    media.networkState === HTMLMediaElement.NETWORK_EMPTY)
                    media.load();
            }
        });
        const ensureServicesPlayable = (video: HTMLVideoElement | null, targetTime: number, isCurrent: () => boolean, bufferStartTime?: number, primeBufferedRange = false) => new Promise<boolean>((resolve) => {
            if (!video || !isCurrent() || disposed) {
                resolve(false);
                return;
            }
            const media = video;
            let settled = false;
            let timeout = 0;
            let primingPlayback = false;
            const hasWarmFrame = () => {
                const targetProbe = Math.min(Number.isFinite(media.duration) ? Math.max(0, media.duration - 1 / 30) : targetTime, targetTime + 2 / 30);
                const startProbe = Math.min(bufferStartTime ?? media.currentTime, targetTime);
                const bufferedTargetReady = isMediaBufferedThrough(media, targetProbe, startProbe);
                const decodedServicesSegmentReady = media === servicesVideo &&
                    root.dataset.servicesStartFrameDecoded === "true" &&
                    media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
                    !media.seeking &&
                    Number.isFinite(media.duration) &&
                    media.duration >= targetProbe &&
                    targetProbe - startProbe <= 5.25 &&
                    media.currentTime >= startProbe - 0.2 &&
                    media.currentTime <= targetProbe + 0.2;
                const warmedServicesSegmentReady = media === servicesVideo &&
                    isWebKitRuntime() &&
                    media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                    ((targetProbe <= SERVICES_FIRST_SEGMENT_BUFFER_END + 0.05 &&
                        root.dataset.servicesFirstSegmentWarm === "true") ||
                        (targetProbe <= SERVICES_COMPLETE_STORY_BUFFER_END + 0.05 &&
                            root.dataset.servicesCompleteStoryWarm === "true"));
                return (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                    !media.error &&
                    (bufferedTargetReady || decodedServicesSegmentReady || warmedServicesSegmentReady));
            };
            const cleanup = () => {
                window.clearTimeout(timeout);
                media.removeEventListener("loadeddata", inspect);
                media.removeEventListener("canplay", inspect);
                media.removeEventListener("progress", inspect);
                media.removeEventListener("timeupdate", inspect);
                media.removeEventListener("seeked", inspect);
                media.removeEventListener("error", fail);
                if (primingPlayback)
                    media.pause();
            };
            const finish = (ready: boolean) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                resolve(ready && isCurrent() && !disposed);
            };
            const inspect = () => {
                if (hasWarmFrame())
                    finish(true);
            };
            const fail = () => finish(false);
            if (hasWarmFrame()) {
                finish(true);
                return;
            }
            ensurePreloadAuto(media);
            media.addEventListener("loadeddata", inspect);
            media.addEventListener("canplay", inspect);
            media.addEventListener("progress", inspect);
            media.addEventListener("timeupdate", inspect);
            media.addEventListener("seeked", inspect);
            media.addEventListener("error", fail, { once: true });
            if (media.dataset.armed === "true" &&
                media.networkState === HTMLMediaElement.NETWORK_EMPTY)
                media.load();
            if (primeBufferedRange &&
                media.paused &&
                media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                media.muted = true;
                media.playsInline = true;
                void media.play().then(() => {
                    if (settled || disposed || !isCurrent()) {
                        media.pause();
                        return;
                    }
                    primingPlayback = true;
                    inspect();
                }).catch(() => {
                });
            }
            const connection = (navigator as Navigator & {
                connection?: {
                    effectiveType?: string;
                    saveData?: boolean;
                };
            }).connection;
            const slowNetwork = isMobileRuntime() ||
                isConstrainedRuntime() ||
                connection?.saveData === true ||
                connection?.effectiveType === "3g";
            timeout = window.setTimeout(() => finish(hasWarmFrame()), slowNetwork ? 2800 : 4000);
        });
        const ensureServicesEntrySegmentReady = (video: HTMLVideoElement, isCurrent: () => boolean, segmentStart = 0, segmentEnd = SERVICES_FIRST_SEGMENT_BUFFER_END) => new Promise<boolean>((resolve) => {
            let settled = false;
            let timeout = 0;
            let frame = 0;
            let playbackRequested = false;
            const target = segmentEnd;
            const hasBufferedFirstSegment = () => {
                try {
                    for (let index = 0; index < video.buffered.length; index += 1) {
                        if (video.buffered.start(index) <= segmentStart + 0.25 && video.buffered.end(index) >= target)
                            return true;
                    }
                }
                catch {
                }
                return false;
            };
            const hasFirstSegment = () => (segmentStart === 0 && root!.dataset.servicesFirstSegmentWarm === "true") ||
                hasBufferedFirstSegment() ||
                (video.currentTime >= target - 0.12 && video.currentTime <= target + 0.25);
            const hasDecodedFirstSegment = () => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                !video.seeking &&
                hasFirstSegment();
            const cleanup = () => {
                window.clearTimeout(timeout);
                window.cancelAnimationFrame(frame);
                video.removeEventListener("loadeddata", inspect);
                video.removeEventListener("canplay", inspect);
                video.removeEventListener("playing", inspect);
                video.removeEventListener("progress", inspect);
                video.removeEventListener("timeupdate", inspect);
                video.removeEventListener("error", fail);
            };
            const finish = (ready: boolean) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                video.pause();
                resolve(ready && isCurrent() && !disposed);
            };
            const requestWarmPlayback = () => {
                if (playbackRequested || settled || !isCurrent() || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
                    return;
                playbackRequested = true;
                video.muted = true;
                video.playsInline = true;
                void video.play().then(() => {
                    inspect();
                }).catch(() => {
                    playbackRequested = false;
                });
            };
            function inspect() {
                if (settled)
                    return;
                if (!isCurrent() || disposed) {
                    finish(false);
                    return;
                }
                if (hasDecodedFirstSegment()) {
                    root!.dataset.servicesStartFrameDecoded = "true";
                    if (segmentStart === 0)
                        root!.dataset.servicesFirstSegmentWarm = "true";
                    finish(true);
                    return;
                }
                requestWarmPlayback();
                frame = window.requestAnimationFrame(inspect);
            }
            const fail = () => finish(false);
            ensurePreloadAuto(video);
            video.addEventListener("loadeddata", inspect);
            video.addEventListener("canplay", inspect);
            video.addEventListener("playing", inspect);
            video.addEventListener("progress", inspect);
            video.addEventListener("timeupdate", inspect);
            video.addEventListener("error", fail, { once: true });
            if (video.dataset.armed === "true" && video.networkState === HTMLMediaElement.NETWORK_EMPTY)
                video.load();
            timeout = window.setTimeout(() => finish(hasDecodedFirstSegment()), isMobileRuntime() || isConstrainedRuntime() ? 16000 : 12000);
            inspect();
        });
        const playMediaSegment = (video: HTMLVideoElement | null, from: number, to: number, playbackRate: number, isCurrent: () => boolean, revealLiveFrame = true, snapToFinalFrame = true, skipInitialSeek = false, watchdogGraceMs = MEDIA_SEGMENT_GRACE_MS) => new Promise<boolean>((resolve) => {
            if (!video) {
                resolve(false);
                return;
            }
            const media = video;
            mediaRunCancels.get(video)?.();
            if (root.dataset.servicesMediaDecoded !== "true") {
                video.dataset.segmentState = "buffering";
            }
            let finished = false;
            let frameId = 0;
            let metadataTimer = 0;
            let seekTimer = 0;
            let watchdogTimer = 0;
            let liveRevealTimer = 0;
            let videoFrameCallbackId: number | null = null;
            let seekHandler: (() => void) | null = null;
            let playbackStarted = false;
            const nominalDurationMs = ((to - from) / Math.max(0.1, playbackRate)) * 1000;
            const resolveEndGuard = () => Number.isFinite(media.duration) && to >= media.duration - 0.15
                ? Math.min(0.08, Math.max(1 / 30, media.duration - to + 1 / 30))
                : 1 / 60;
            const hasReachedSegmentTarget = () => media.currentTime >= to - resolveEndGuard() || media.ended;
            const finish = (completed: boolean, snapToEnd = false) => {
                if (finished)
                    return;
                finished = true;
                cancelAnimationFrame(frameId);
                if (videoFrameCallbackId !== null &&
                    typeof video.cancelVideoFrameCallback === "function") {
                    video.cancelVideoFrameCallback(videoFrameCallbackId);
                    videoFrameCallbackId = null;
                }
                window.clearTimeout(metadataTimer);
                window.clearTimeout(seekTimer);
                window.clearTimeout(watchdogTimer);
                window.clearTimeout(liveRevealTimer);
                video.removeEventListener("loadedmetadata", begin);
                if (seekHandler)
                    video.removeEventListener("seeked", seekHandler);
                video.pause();
                mediaRunCancels.delete(video);
                if (completed && snapToEnd && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
                    // Playback monitoring intentionally has a small end guard so a
                    // decoder cannot run past a stop. Do not let that guard become
                    // the resting frame: wait for the authored frame to be decoded
                    // before text/catch-up logic is allowed to continue.
                    void seekServicesFrame(video, to, isCurrent, SERVICES_SEAM_SEEK_TOLERANCE / 2)
                        .then((settledAtTarget) => resolve(settledAtTarget));
                    return;
                }
                resolve(completed);
            };
            const monitor = () => {
                if (finished)
                    return;
                if (!isCurrent() || disposed) {
                    video.dataset.segmentState = "idle";
                    finish(false);
                    return;
                }
                if (hasReachedSegmentTarget()) {
                    video.dataset.segmentState = "ready";
                    finish(true, snapToFinalFrame);
                    return;
                }
                frameId = requestAnimationFrame(monitor);
            };
            function begin() {
                if (!isCurrent() || disposed) {
                    finish(false);
                    return;
                }
                const startPlayback = () => {
                    if (playbackStarted || finished)
                        return;
                    playbackStarted = true;
                    window.clearTimeout(seekTimer);
                    if (seekHandler)
                        media.removeEventListener("seeked", seekHandler);
                    seekHandler = null;
                    media.playbackRate = playbackRate;
                    if (root!.dataset.servicesMediaDecoded !== "true") {
                        media.dataset.segmentState = "buffering";
                    }
                    void media.play()
                        .then(() => {
                        if (!isCurrent() || disposed) {
                            finish(false);
                            return;
                        }
                        const revealPlayingFrame = () => {
                            if (finished)
                                return;
                            if (!isCurrent() || disposed) {
                                finish(false);
                                return;
                            }
                            window.clearTimeout(liveRevealTimer);
                            if (revealLiveFrame) {
                                setServicesStaticStop(null);
                                setServicesEntryPoster(false);
                                root!.dataset.servicesMediaDecoded = "true";
                            }
                            media.dataset.segmentState = "playing";
                            monitor();
                        };
                        if (typeof media.requestVideoFrameCallback === "function") {
                            videoFrameCallbackId = media.requestVideoFrameCallback(() => {
                                videoFrameCallbackId = null;
                                revealPlayingFrame();
                            });
                            liveRevealTimer = window.setTimeout(() => {
                                if (!finished &&
                                    !disposed &&
                                    isCurrent() &&
                                    media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                                    media.currentTime >= from + 1 / 30) {
                                    if (videoFrameCallbackId !== null &&
                                        typeof media.cancelVideoFrameCallback === "function") {
                                        media.cancelVideoFrameCallback(videoFrameCallbackId);
                                        videoFrameCallbackId = null;
                                    }
                                    revealPlayingFrame();
                                }
                            }, 180);
                        }
                        else {
                            frameId = requestAnimationFrame(revealPlayingFrame);
                        }
                    })
                        .catch(() => {
                        media.dataset.segmentState = "idle";
                        finish(false);
                    });
                };
                media.pause();
                const target = getMediaTargetTime(media, from);
                const forwardSegment = to >= from;
                const startTolerance = forwardSegment ? 0.16 : 1 / 30;
                if (!skipInitialSeek && Math.abs(media.currentTime - target) > startTolerance) {
                    seekHandler = startPlayback;
                    media.addEventListener("seeked", seekHandler, { once: true });
                    media.currentTime = target;
                    seekTimer = window.setTimeout(startPlayback, 420);
                }
                else {
                    startPlayback();
                }
            }
            mediaRunCancels.set(video, () => finish(false));
            watchdogTimer = window.setTimeout(() => {
                if (media.readyState < HTMLMediaElement.HAVE_METADATA) {
                    media.dataset.segmentState = "buffering";
                    finish(false);
                    return;
                }
                if (hasReachedSegmentTarget()) {
                    media.dataset.segmentState = "ready";
                    finish(true, snapToFinalFrame);
                    return;
                }
                media.dataset.segmentState = "idle";
                finish(false);
            }, Math.max(1800, nominalDurationMs + watchdogGraceMs));
            if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
                begin();
            }
            else {
                video.addEventListener("loadedmetadata", begin, { once: true });
                ensurePreloadAuto(video);
                if (video.dataset.armed === "true" &&
                    video.networkState === HTMLMediaElement.NETWORK_EMPTY)
                    video.load();
                metadataTimer = window.setTimeout(() => {
                    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
                        video.dataset.segmentState = "buffering";
                        finish(false);
                    }
                }, 2200);
            }
        });
        const servicePanelItems = servicePanels.map((panel) => Array.from(panel.querySelectorAll<HTMLElement>(".services-story-heading > p, .services-story-heading h2 > span, .services-story-rule, .services-story-lead, .services-story-body, .services-story-cta")));
        const missionStoryItems = gsap.utils.toArray<HTMLElement>(".mission-statement, .mission-main-rule, .mission-main-block > p, .mission-support, .mission-story-cta", root);
        servicePanels.forEach((panel, panelIndex) => {
            gsap.set(panel, { y: 28, autoAlpha: 0, pointerEvents: "none" });
            gsap.set(servicePanelItems[panelIndex], { y: 26, autoAlpha: 0 });
            setRegionInteractive(panel, false);
        });
        const setServicesPanel = (panelIndex: number) => {
            servicesStage = panelIndex;
            root.dataset.servicesActive = String(panelIndex + 1);
            if (servicesMediaVisuals.length)
                gsap.set(servicesMediaVisuals, { autoAlpha: 1 });
            servicePanels.forEach((panel, index) => {
                const active = index === panelIndex;
                gsap.set(panel, { y: 0, autoAlpha: active ? 1 : 0, pointerEvents: active ? "auto" : "none" });
                gsap.set(servicePanelItems[index], { y: 0, autoAlpha: active ? 1 : 0 });
                setRegionInteractive(panel, active);
            });
        };
        const resetServicesPanels = () => {
            servicesStage = -1;
            delete root.dataset.servicesActive;
            delete root.dataset.servicesPreview;
            servicePanels.forEach((panel, index) => {
                gsap.set(panel, { y: 28, autoAlpha: 0, pointerEvents: "none" });
                gsap.set(servicePanelItems[index], { y: 26, autoAlpha: 0 });
                setRegionInteractive(panel, false);
            });
        };
        const showServicesIdlePreview = (revealed = false) => {
            if (servicesActive || servicesReleasing)
                return;
            if (servicesVideo)
                servicesVideo.dataset.segmentState = revealed ? "ready" : "idle";
            if (revealed)
                root.dataset.servicesMediaDecoded = "true";
            else
                delete root.dataset.servicesMediaDecoded;
            setServicesEntryPoster(!revealed);
            setServicesStaticStop(null);
            servicesStage = -1;
            delete root.dataset.servicesActive;
            root.dataset.servicesPreview = "1";
            servicePanels.forEach((panel, index) => {
                const preview = index === 0;
                gsap.set(panel, { y: 0, autoAlpha: preview ? 1 : 0, pointerEvents: preview ? "auto" : "none" });
                gsap.set(servicePanelItems[index], {
                    y: preview && revealed ? 0 : 26,
                    autoAlpha: preview && revealed ? 1 : 0,
                });
                setRegionInteractive(panel, false);
            });
        };
        const getLensPose = (xRatio: number, yRatio: number, scale: number, autoAlpha = 1): LensPose => ({
            x: () => {
                const lens = root.querySelector<HTMLElement>(".lens-stage");
                const grid = root.querySelector<HTMLElement>(".hero-grid");
                if (!lens || !grid) {
                    return 0;
                }
                const gridRect = grid.getBoundingClientRect();
                const baseCenter = gridRect.left + lens.offsetLeft + lens.offsetWidth / 2;
                return window.innerWidth * xRatio - baseCenter;
            },
            y: () => {
                const lens = root.querySelector<HTMLElement>(".lens-stage");
                const grid = root.querySelector<HTMLElement>(".hero-grid");
                if (!lens || !grid) {
                    return 0;
                }
                const gridRect = grid.getBoundingClientRect();
                const baseCenter = gridRect.top + lens.offsetTop + lens.offsetHeight / 2;
                return window.innerHeight * yRatio - baseCenter;
            },
            scale,
            autoAlpha,
        });
        const setMotionPhase = () => {
            if (!heroTimeline) {
                return;
            }
            const time = heroTimeline.time();
            const labels = heroTimeline.labels;
            const phase = time >= labels.secondVideoComplete
                ? "secondVideoComplete"
                : time >= labels.secondRevealEnter
                    ? "secondRevealEnter"
                    : time >= labels.galaxyFadeOut
                        ? "galaxyFadeOut"
                        : time >= labels.loopExitHidden
                            ? "loopExitHidden"
                            : time >= labels.visionRight
                                ? "visionRight"
                                : "heroIntro";
            root.dataset.motionPhase = phase;
            setRegionInteractive(heroCopyRegion, time < labels.visionRight);
            setRegionInteractive(missionFrameRegion, time >= labels.visionRight && time < labels.loopExitHidden);
        };
        const syncHeroVideoActivity = () => {
            if (!lensVideo || !heroTimeline || root.dataset.heroVideoPosterFallback === "true") {
                return;
            }
            const trigger = heroTimeline.scrollTrigger;
            const shouldPlay = document.visibilityState === "visible" &&
                (!trigger || trigger.isActive || window.scrollY <= trigger.start + 1);
            if (shouldPlay) {
                heroVideoSuspended = false;
                if (lensVideo.paused)
                    void lensVideo.play().catch(() => undefined);
            }
            else if (!heroVideoSuspended || !lensVideo.paused) {
                heroVideoSuspended = true;
                lensVideo.pause();
            }
        };
        const handleHeroPlaybackResume = () => {
            if (document.visibilityState === "visible")
                syncHeroVideoActivity();
        };
        document.addEventListener("visibilitychange", handleHeroPlaybackResume);
        window.addEventListener("pageshow", handleHeroPlaybackResume);
        window.addEventListener("focus", handleHeroPlaybackResume);
        cleanupCallbacks.push(() => {
            document.removeEventListener("visibilitychange", handleHeroPlaybackResume);
            window.removeEventListener("pageshow", handleHeroPlaybackResume);
            window.removeEventListener("focus", handleHeroPlaybackResume);
        });
        const handleLensMetadata = () => refreshScroll();
        gsap.set(".mission-frame", { y: 74, autoAlpha: 0 });
        setRegionInteractive(heroCopyRegion, true);
        setRegionInteractive(missionFrameRegion, false);
        gsap.set(".mission-story", { y: 42, autoAlpha: 0 });
        gsap.set(missionStoryItems, { y: 22, autoAlpha: 0 });
        gsap.set(".second-stage", { autoAlpha: 0 });
        gsap.set(".second-copy", { y: 0, autoAlpha: 1 });
        gsap.set(".vision-reveal-copy > *", { y: 22, autoAlpha: 0 });
        gsap.set(".second-media", { yPercent: 46, y: 72, scale: 0.94, autoAlpha: 0 });
        gsap.set(".vision-logo-image", { y: 72, scale: 0.96, autoAlpha: 0 });
        gsap.set(".services-story-video-wrap", { xPercent: 0, y: 0, scale: 1, autoAlpha: 1 });
        gsap.set(".domino-media", { xPercent: 0, yPercent: 0, y: 0, scale: 1.08, autoAlpha: 1 });
        gsap.set(".domino-copy", { y: 0, autoAlpha: 1 });
        gsap.set(".domino-body, .domino-impulse-row, .domino-privacy-row", {
            y: 34,
            autoAlpha: 0,
        });
        gsap.set(".domino-impulse-form", { y: 0, autoAlpha: 1, pointerEvents: "none" });
        gsap.set(".how-work-step-copy", { x: -34, y: 0, autoAlpha: 0 });
        gsap.set(".how-work-step-copy-1", { x: 0, y: 0, autoAlpha: 1 });
        gsap.set(".how-work-step-number", {
            scale: 0.67,
            autoAlpha: 0.6,
            color: "rgba(119, 177, 244, 0.7)",
        });
        gsap.set(".how-work-step-number-1", { scale: 1, autoAlpha: 1, color: "#badaff" });
        gsap.set(".process-contact-bg", { y: 34, autoAlpha: 0 });
        if (reduceMotion) {
            if (lensVideo) {
                lensVideo.pause();
                if (lensVideo.readyState > 0) {
                    lensVideo.currentTime = 0;
                }
            }
            pauseAndSeek(dominoVideo, 0);
            gsap.set(".mission-frame", { y: 0, autoAlpha: 1 });
            gsap.set(".mission-story", { position: "relative", xPercent: 0, y: 0, autoAlpha: 1 });
            gsap.set(missionStoryItems, { y: 0, autoAlpha: 1 });
            gsap.set(".second-stage", { position: "relative", autoAlpha: 1 });
            gsap.set(".second-copy", { y: 0, autoAlpha: 1 });
            gsap.set(".vision-reveal-copy > *", { y: 0, autoAlpha: 1 });
            gsap.set(".second-media, .vision-logo-image", { yPercent: 0, y: 0, scale: 1, autoAlpha: 1 });
            gsap.set(".services-story-video-wrap", { xPercent: 0, y: 0, scale: 1, autoAlpha: 1 });
            servicePanels.forEach((panel, panelIndex) => {
                gsap.set(panel, { y: 0, autoAlpha: 1, pointerEvents: "auto" });
                gsap.set(servicePanelItems[panelIndex], { y: 0, autoAlpha: 1 });
                setRegionInteractive(panel, true);
            });
            setRegionInteractive(heroCopyRegion, true);
            setRegionInteractive(missionFrameRegion, true);
            gsap.set(".domino-copy", { y: 0, autoAlpha: 1 });
            gsap.set(".domino-body, .domino-impulse-form, .domino-impulse-row, .domino-privacy-row", {
                y: 0,
                autoAlpha: 1,
                pointerEvents: "auto",
            });
            gsap.set(".domino-media", { xPercent: 0, yPercent: 0, scale: 1, autoAlpha: 1 });
            gsap.set(".how-work-step-copy, .how-work-step-number", { clearProps: "all" });
            gsap.set(".datum-motion-state-cards, .datum-motion-state-waitlist", {
                position: "relative",
                y: 0,
                autoAlpha: 1,
                pointerEvents: "auto",
            });
            root
                .querySelectorAll<HTMLElement>(".datum-motion-state-cards, .datum-motion-state-waitlist")
                .forEach((state) => setRegionInteractive(state, true));
            gsap.set(".datum-motion-state-cards .stagger-reveal-item, .datum-waitlist-segment", {
                y: 0,
                autoAlpha: 1,
            });
            gsap.set(".process-contact-bg", { y: 0, autoAlpha: 1 });
            return;
        }
        /*
          Every browser scrolls natively. Lenis used to sit in front of the wheel
          on Windows while iOS and macOS were already on the native path, so the
          site ran two different scroll models at once and ScrollTrigger had to
          reconcile them. One model means the pinned stories and the document
          agree about where the reader is.
        */
        root.dataset.wheelScrollRate = "native";
        let servicesTextResolve: (() => void) | null = null;
        let servicesEntryRetryResolve: (() => void) | null = null;
        const clearServicesEntryRetry = () => {
            window.clearTimeout(servicesEntryRetryTimer);
            servicesEntryRetryTimer = 0;
            const resolve = servicesEntryRetryResolve;
            servicesEntryRetryResolve = null;
            resolve?.();
        };
        const waitForServicesEntryRetry = (delayMs: number) => new Promise<void>((resolve) => {
            clearServicesEntryRetry();
            servicesEntryRetryResolve = resolve;
            servicesEntryRetryTimer = window.setTimeout(() => {
                servicesEntryRetryTimer = 0;
                const pendingResolve = servicesEntryRetryResolve;
                servicesEntryRetryResolve = null;
                pendingResolve?.();
            }, delayMs);
        });
        /*
          The stop only holds the reader while a segment is actually decoding and
          playing. Everything else about Services - approaching it, reading a
          settled stop, leaving it - is plain native scrolling.
        */
        const holdServicesScroll = () => {
            if (servicesScrollLock?.isHeld())
                return;
            servicesScrollLock = acquireScrollLock("services");
            root.dataset.servicesLocked = "true";
        };
        const releaseServicesScroll = () => {
            servicesScrollLock?.release();
            servicesScrollLock = null;
            delete root.dataset.servicesLocked;
        };
        const setMotionInputState = () => {
            if (servicesScrollLock?.isHeld()) {
                root.dataset.motionInputLocked = "true";
            }
            else {
                delete root.dataset.motionInputLocked;
            }
        };
        /*
          Loading and seeking happen while native scrolling remains available.
          Only a concrete playing/releasing segment owns the temporary lock.
        */
        const setServicesPhase = (phase: typeof servicesPhase) => {
            servicesPhase = phase;
            root.dataset.servicesPhase = phase;
            if (phase === "playing" || phase === "releasing" || phase === "reverse")
                holdServicesScroll();
            else
                releaseServicesScroll();
            setMotionInputState();
        };
        const cancelServicesEntryPreparation = (reason = "cancelled") => {
            if (servicesEntryPreparing !== 0)
                root.dataset.servicesEntryAbortReason = reason;
            servicesEntryToken += 1;
            servicesEntryPreparing = 0;
            clearServicesEntryRetry();
            delete root.dataset.servicesEntryPreparing;
            delete root.dataset.servicesEntryAttempt;
            if (!servicesActive && !servicesReleasing && servicesPhase === "preparing") {
                setServicesPhase("idle");
            }
            setMotionInputState();
        };
        const stopServicesTextTimeline = () => {
            window.clearTimeout(servicesTextWatchdog);
            servicesTextWatchdog = 0;
            servicesTextTimeline?.kill();
            servicesTextTimeline = null;
            if (servicesVideo)
                gsap.set(servicesVideo, { autoAlpha: 1 });
            servicesTextResolve?.();
            servicesTextResolve = null;
        };
        const armServicesTextWatchdog = (timeline: gsap.core.Timeline, resolve: () => void, timeoutMs: number) => {
            window.clearTimeout(servicesTextWatchdog);
            servicesTextWatchdog = window.setTimeout(() => {
                if (servicesTextTimeline !== timeline || servicesTextResolve !== resolve)
                    return;
                timeline.eventCallback("onComplete", null);
                timeline.progress(1).pause();
                servicesTextTimeline = null;
                servicesTextResolve = null;
                servicesTextWatchdog = 0;
                resolve();
            }, timeoutMs);
        };
        const animateServicesPanel = (nextPanel: number, segmentDuration: number) => new Promise<void>((resolve) => {
            stopServicesTextTimeline();
            servicesTextResolve = resolve;
            const outgoingPanel = servicesStage >= 0 ? servicePanels[servicesStage] : null;
            const outgoingItems = servicesStage >= 0 ? servicePanelItems[servicesStage] : [];
            const incomingPanel = servicePanels[nextPanel];
            const incomingItems = servicePanelItems[nextPanel] ?? [];
            const revealAt = outgoingPanel ? Math.max(0.42, segmentDuration - 1.55) : 0.2;
            const exitDuration = revealTime(0.5);
            const exitStagger = revealTime(0.055);
            const exitEnd = exitDuration + Math.max(0, outgoingItems.length - 1) * exitStagger;
            const exitStart = outgoingPanel ? Math.max(0, revealAt - exitEnd * 0.68) : 0;
            servicesTextTimeline = gsap.timeline({
                onComplete: () => {
                    window.clearTimeout(servicesTextWatchdog);
                    servicesTextWatchdog = 0;
                    servicesTextTimeline = null;
                    servicesTextResolve = null;
                    resolve();
                },
            });
            if (outgoingPanel) {
                servicesTextTimeline
                    .to(outgoingItems, {
                    y: -44,
                    autoAlpha: 0,
                    duration: exitDuration,
                    stagger: exitStagger,
                    ease: "power3.inOut",
                }, exitStart)
                    .set(outgoingPanel, { autoAlpha: 0, pointerEvents: "none" }, exitStart + exitEnd);
            }
            servicesTextTimeline
                .set(incomingPanel, { y: 0, autoAlpha: 1, pointerEvents: "auto" }, revealAt)
                .fromTo(incomingItems, { y: 28, autoAlpha: 0 }, {
                y: 0,
                autoAlpha: 1,
                duration: revealTime(0.88),
                stagger: revealTime(0.09),
                ease: "power4.out",
            }, revealAt)
                .to({}, { duration: 0.01 }, segmentDuration);
            armServicesTextWatchdog(servicesTextTimeline, resolve, Math.max(1300, (segmentDuration + 0.55) * 1000));
        });
        const animateServicesReversePanel = (nextPanel: number, segmentDuration: number) => new Promise<void>((resolve) => {
            stopServicesTextTimeline();
            servicesTextResolve = resolve;
            const outgoingPanel = servicesStage >= 0 ? servicePanels[servicesStage] : null;
            const outgoingItems = servicesStage >= 0 ? servicePanelItems[servicesStage] : [];
            const incomingPanel = servicePanels[nextPanel];
            const incomingItems = servicePanelItems[nextPanel] ?? [];
            const revealAt = Math.max(0.42, segmentDuration - 1.55);
            const exitDuration = revealTime(0.46);
            const exitStagger = revealTime(0.045);
            const exitEnd = exitDuration + Math.max(0, outgoingItems.length - 1) * exitStagger;
            const exitStart = Math.max(0, revealAt - exitEnd * 0.68);
            servicesTextTimeline = gsap.timeline({
                onComplete: () => {
                    window.clearTimeout(servicesTextWatchdog);
                    servicesTextWatchdog = 0;
                    servicesTextTimeline = null;
                    servicesTextResolve = null;
                    resolve();
                },
            });
            servicesTextTimeline
                .to(outgoingItems, {
                y: -44,
                autoAlpha: 0,
                duration: exitDuration,
                stagger: exitStagger,
                ease: "power3.inOut",
            }, exitStart)
                .set(outgoingPanel, { autoAlpha: 0, pointerEvents: "none" }, exitStart + exitEnd)
                .set(incomingPanel, { y: 0, autoAlpha: 1, pointerEvents: "auto" }, revealAt)
                .fromTo(incomingItems, { y: -24, autoAlpha: 0 }, {
                y: 0,
                autoAlpha: 1,
                duration: revealTime(0.76),
                stagger: revealTime(0.08),
                ease: "power4.out",
            }, revealAt)
                .to({}, { duration: 0.01 }, segmentDuration);
            armServicesTextWatchdog(servicesTextTimeline, resolve, Math.max(1300, (segmentDuration + 0.55) * 1000));
        });
        const scheduleServicesProgressCatchUp = (direction: 1 | -1, token: number) => {
            window.clearTimeout(servicesReleaseTimer);
            servicesReleaseTimer = window.setTimeout(() => {
                servicesReleaseTimer = 0;
                if (disposed || token !== servicesRunToken || !servicesActive || servicesPhase !== "waiting" || !servicesTrigger)
                    return;
                advanceServicesFromProgress(servicesTrigger.progress, direction);
            }, SERVICES_POST_STAGE_GATE_MS + 24);
        };
        const runServicesStage = async (nextStage: number, revealPanel = true) => {
            if (!servicesActive || servicesPhase === "playing")
                return;
            const token = ++servicesRunToken;
            const retryKey = `forward:${nextStage}`;
            beginServicesMediaAttempt(retryKey);
            servicesTransitionDirection = 1;
            const from = nextStage === 0 ? 0 : SERVICES_KEYFRAME_STOPS[nextStage - 1];
            const to = SERVICES_KEYFRAME_STOPS[nextStage];
            const segmentDuration = (to - from) / SERVICES_PLAYBACK_RATE;
            root.dataset.servicesActive = String(nextStage + 1);
            setServicesPhase("preparing");
            setMotionInputState();
            if (isWebKitRuntime() &&
                servicesVideo &&
                Math.abs(servicesVideo.currentTime - from) > 0.12) {
                if (servicesStage >= 0)
                    setServicesStaticStop(servicesStage);
                else
                    setServicesEntryPoster(true);
                const forwardStartReady = await seekServicesFrame(servicesVideo, from, () => token === servicesRunToken && servicesActive);
                if (token !== servicesRunToken || !servicesActive || disposed)
                    return;
                if (!forwardStartReady) {
                    setServicesPhase("idle");
                    servicesMediaRetryTimer = window.setTimeout(() => {
                        servicesMediaRetryTimer = 0;
                        if (token === servicesRunToken &&
                            servicesActive &&
                            !disposed &&
                            servicesPhase === "idle") {
                            void runServicesStage(nextStage, revealPanel);
                        }
                    }, 180);
                    return;
                }
            }
            const mediaReady = root.dataset.servicesMediaFallback === "true"
                ? false
                : await ensureServicesPlayable(servicesVideo, to, () => token === servicesRunToken && servicesActive);
            if (token !== servicesRunToken || !servicesActive || disposed)
                return;
            let permanentFallback = root.dataset.servicesMediaFallback === "true";
            if (!mediaReady && !permanentFallback) {
                if (shouldFailOpenServicesMedia(servicesVideo)) {
                    if (servicesVideo?.error) {
                        activateServicesMediaFallback();
                        permanentFallback = true;
                    }
                    else {
                        root.dataset.servicesTransportFailure = "forward-timeout";
                        setServicesEntryPoster(false);
                        setServicesPanel(nextStage);
                        setServicesStaticStop(nextStage);
                        resetServicesMediaRetry();
                        servicesGateUntil = performance.now() + SERVICES_POST_STAGE_GATE_MS;
                        setServicesPhase("waiting");
                        return;
                    }
                }
            }
            if (!mediaReady && !permanentFallback) {
                setServicesPhase("idle");
                servicesMediaRetryTimer = window.setTimeout(() => {
                    servicesMediaRetryTimer = 0;
                    if (token === servicesRunToken &&
                        servicesActive &&
                        !disposed &&
                        servicesPhase === "idle") {
                        void runServicesStage(nextStage, revealPanel);
                    }
                }, 180);
                return;
            }
            if (mediaReady)
                servicesWarmupClaimRef.current?.();
            setServicesPhase("playing");
            setMotionInputState();
            const [mediaCompleted] = await Promise.all([
                mediaReady
                    ? playMediaSegment(servicesVideo, from, to, SERVICES_PLAYBACK_RATE, () => token === servicesRunToken && servicesActive)
                    : Promise.resolve(),
                revealPanel ? animateServicesPanel(nextStage, segmentDuration) : Promise.resolve(),
            ]);
            if (token !== servicesRunToken || !servicesActive || disposed)
                return;
            if (mediaReady && !mediaCompleted) {
                if (servicesStage >= 0) {
                    setServicesPanel(servicesStage);
                    setServicesStaticStop(servicesStage);
                }
                else {
                    setServicesEntryPoster(true);
                    setServicesStaticStop(null);
                }
                delete root.dataset.servicesMediaDecoded;
                if (servicesVideo)
                    servicesVideo.dataset.segmentState = "buffering";
                if (shouldFailOpenServicesMedia(servicesVideo)) {
                    if (servicesVideo?.error) {
                        activateServicesMediaFallback();
                    }
                    else {
                        root.dataset.servicesTransportFailure = "forward-stall";
                    }
                    setServicesEntryPoster(false);
                    setServicesPanel(nextStage);
                    setServicesStaticStop(nextStage);
                    resetServicesMediaRetry();
                    servicesGateUntil = performance.now() + SERVICES_POST_STAGE_GATE_MS;
                    setServicesPhase("waiting");
                    return;
                }
                setServicesPhase("idle");
                servicesMediaRetryTimer = window.setTimeout(() => {
                    servicesMediaRetryTimer = 0;
                    if (token === servicesRunToken && servicesActive && !disposed && servicesPhase === "idle") {
                        void runServicesStage(nextStage, revealPanel);
                    }
                }, 180);
                return;
            }
            setServicesEntryPoster(false);
            if (mediaReady && mediaCompleted) {
                setServicesStaticStop(null);
                root.dataset.servicesMediaDecoded = "true";
                if (servicesVideo)
                    servicesVideo.dataset.segmentState = "ready";
            }
            else {
                setServicesStaticStop(nextStage);
            }
            setServicesPanel(nextStage);
            resetServicesMediaRetry();
            servicesGateUntil = performance.now() + SERVICES_POST_STAGE_GATE_MS;
            setServicesPhase("waiting");
            scheduleServicesProgressCatchUp(1, token);
        };
        /*
          Finishing the story does not move the page. The reader is standing
          wherever their last gesture left them inside the pinned band; all we do
          is hand the input back and let them carry on scrolling out of it.
        */
        const finishServicesRelease = (previewAfter = false, previewRevealed = false) => {
            resetServicesMediaRetry();
            servicesReleaseToken += 1;
            window.clearTimeout(servicesReleaseTimer);
            servicesReleaseTimer = 0;
            clientsServicesHandoff?.scrollTrigger?.enable();
            clientsServicesHandoff?.scrollTrigger?.refresh();
            clientsServicesHandoff?.scrollTrigger?.update();
            servicesActive = false;
            servicesReleasing = false;
            servicesForwardComplete = false;
            servicesSessionDirection = 0;
            servicesTransitionDirection = 0;
            releaseServicesScroll();
            delete root.dataset.servicesPinned;
            delete root.dataset.servicesActive;
            delete root.dataset.servicesSequence;
            delete root.dataset.servicesSequenceComplete;
            delete root.dataset.servicesVideoDirection;
            delete root.dataset.servicesTarget;
            if (!previewAfter)
                setServicesStaticStop(null);
            setServicesPhase("idle");
            setMotionInputState();
            if (previewAfter)
                showServicesIdlePreview(previewRevealed);
        };
        const releaseServicesForward = async () => {
            if (!servicesActive || servicesPhase !== "waiting" || !servicesTrigger || servicesForwardComplete)
                return;
            const token = ++servicesRunToken;
            const lastStage = SERVICES_KEYFRAME_STOPS.length - 1;
            beginServicesMediaAttempt("forward:hold");
            setServicesPanel(lastStage);
            // Frame 339 is deliberately transparent. Keep the authored stop poster
            // over the decoder while it crosses that cut and lands on frame 340,
            // which is visually identical to stop three and also primes reversal.
            setServicesStaticStop(lastStage);
            setServicesPhase("preparing");
            const finalFrameBuffered = root.dataset.servicesMediaFallback === "true"
                ? false
                : await ensureServicesPlayable(servicesVideo, SERVICES_FORWARD_HOLD_STOP, () => token === servicesRunToken && servicesActive, SERVICES_KEYFRAME_STOPS[lastStage]);
            if (token !== servicesRunToken || !servicesActive || disposed)
                return;
            const finalFrameReady = finalFrameBuffered
                ? await seekServicesFrame(servicesVideo, SERVICES_FORWARD_HOLD_STOP, () => token === servicesRunToken && servicesActive, SERVICES_SEAM_SEEK_TOLERANCE / 2)
                : false;
            if (token !== servicesRunToken || !servicesActive || disposed)
                return;
            if (finalFrameReady) {
                setServicesStaticStop(null);
                root.dataset.servicesMediaDecoded = "true";
                if (servicesVideo)
                    servicesVideo.dataset.segmentState = "ready";
            }
            else if (servicesVideo?.error) {
                activateServicesMediaFallback();
            }
            else {
                // A slow seek is not a decode failure. The stop poster stays as a
                // temporary continuity surface, but the transport remains eligible
                // for a live reverse-entry retry.
                root.dataset.servicesTransportFailure = "final-frame-timeout";
                if (servicesVideo)
                    servicesVideo.dataset.segmentState = "buffering";
            }
            resetServicesMediaRetry();
            servicesForwardComplete = true;
            root.dataset.servicesSequenceComplete = "true";
            root.dataset.servicesVideoDirection = "forward-complete";
            setServicesPanel(lastStage);
            setServicesPhase("waiting");
            // Keep the final authored copy painted until the actual end of the
            // pin; otherwise the remaining band is an empty starfield corridor.
            if (!servicesTrigger.isActive)
                finishServicesRelease();
        };
        /*
          After the authored reverse path has reached stop one, scrolling back
          past the pin rewinds the visual to its opening and hands native input
          straight back. No fourth/cyclic reverse segment is started.
        */
        const rewindServicesToStart = () => {
            servicesRunToken += 1;
            if (servicesVideo)
                mediaRunCancels.get(servicesVideo)?.();
            stopServicesTextTimeline();
            setServicesPanel(0);
            if (servicesVideo)
                servicesVideo.dataset.segmentState = "ready";
            root.dataset.servicesMediaDecoded = "true";
            setServicesStaticStop(null);
            pauseAndSeek(servicesVideo, SERVICES_KEYFRAME_STOPS[0], 0.12);
            finishServicesRelease(true, true);
        };
        const releaseServicesForNavigation = () => {
            if (!servicesActive && !servicesReleasing && !servicesScrollLock && servicesEntryPreparing === 0)
                return;
            cancelServicesEntryPreparation("navigation-release");
            resetServicesMediaRetry();
            servicesRunToken += 1;
            servicesReleaseToken += 1;
            window.clearTimeout(servicesReleaseTimer);
            servicesReleaseTimer = 0;
            if (servicesVideo)
                mediaRunCancels.get(servicesVideo)?.();
            clientsServicesHandoff?.scrollTrigger?.enable();
            clientsServicesHandoff?.scrollTrigger?.refresh();
            clientsServicesHandoff?.scrollTrigger?.update();
            stopServicesTextTimeline();
            servicesActive = false;
            servicesReleasing = false;
            servicesForwardComplete = false;
            servicesSessionDirection = 0;
            servicesTransitionDirection = 0;
            servicesGateUntil = 0;
            setServicesPhase("idle");
            showServicesIdlePreview();
            if (servicesVideo)
                servicesVideo.dataset.segmentState = "idle";
            pauseAndSeek(servicesVideo, 0);
            delete root.dataset.servicesPinned;
            delete root.dataset.servicesInrange;
            delete root.dataset.servicesSequenceComplete;
            delete root.dataset.servicesVideoDirection;
            delete root.dataset.servicesTarget;
            releaseServicesScroll();
            setMotionInputState();
        };
        const resetHowWorkBoundaryPreview = () => {
            delete root.dataset.howWorkPinned;
            ScrollTrigger.getById("how-work-reversible")?.animation?.progress(0);
        };
        const commitServicesForwardEntry = (entrySource: string) => {
            if (servicesActive || servicesReleasing || disposed)
                return;
            servicesEntryPreparing = 0;
            clearServicesEntryRetry();
            delete root.dataset.servicesEntryPreparing;
            root.dataset.servicesEntryPrepared = "true";
            setServicesStopPostersArmed(true);
            servicesWarmupClaimRef.current?.();
            resetServicesMediaRetry();
            delete root.dataset.servicesTransportFailure;
            resetHowWorkBoundaryPreview();
            const preservePreview = root.dataset.servicesPreview === "1";
            servicesActive = true;
            servicesReleasing = false;
            servicesForwardComplete = false;
            servicesSessionDirection = 1;
            root.dataset.servicesEntryDirection = "forward";
            root.dataset.servicesEntrySource = entrySource;
            servicesGateUntil = performance.now() + SERVICES_ENTRY_GATE_MS;
            servicesTransitionDirection = 1;
            setServicesStaticStop(null);
            setServicesEntryPoster(true);
            root.dataset.servicesPinned = "true";
            root.dataset.servicesInrange = "true";
            root.dataset.servicesSequence = "autoplay";
            lockClientsServicesHandoffAtServices();
            delete root.dataset.servicesMediaDecoded;
            if (preservePreview) {
                delete root.dataset.servicesPreview;
                setServicesPanel(0);
            }
            else {
                resetServicesPanels();
            }
            if (servicesVideo)
                servicesVideo.dataset.segmentState = "idle";
            setMotionInputState();
            setServicesPhase("idle");
            void runServicesStage(0, !preservePreview);
        };
        const startServicesForward = (entrySource = "direct") => {
            if (servicesActive || servicesReleasing || disposed || servicesEntryPreparing === 1)
                return;
            cancelServicesEntryPreparation("new-forward-entry");
            const token = servicesEntryToken;
            const entryVideo = servicesVideo;
            servicesEntryPreparing = 1;
            root.dataset.servicesEntryPreparing = "forward";
            delete root.dataset.servicesEntryPrepared;
            delete root.dataset.servicesEntryAbortReason;
            setServicesStopPostersArmed(true);
            resetServicesMediaRetry();
            delete root.dataset.servicesTransportFailure;
            setServicesPhase("preparing");
            setMotionInputState();
            const remainsRelevant = () => {
                let reason = "";
                if (token !== servicesEntryToken)
                    reason = "token-invalidated";
                else if (servicesEntryPreparing !== 1)
                    reason = "preparation-cleared";
                else if (servicesActive)
                    reason = "already-active";
                else if (servicesReleasing)
                    reason = "releasing";
                else if (disposed)
                    reason = "effect-disposed";
                else if (servicesVideoRef.current !== entryVideo)
                    reason = "media-owner-changed";
                else if (programmaticNavigationRef.current && programmaticAnchorRef.current !== "#services")
                    reason = "other-navigation";
                if (reason) {
                    root.dataset.servicesEntryRelevanceFailure = reason;
                    return false;
                }
                if (!isServicesVisuallyNear(1.25)) {
                    root.dataset.servicesEntryRelevanceFailure = "services-not-visible";
                    return false;
                }
                delete root.dataset.servicesEntryRelevanceFailure;
                return true;
            };
            const finishPreparation = () => {
                if (token === servicesEntryToken)
                    cancelServicesEntryPreparation(root.dataset.servicesEntryRelevanceFailure ?? "preflight-not-ready");
            };
            if (!entryVideo || root.dataset.servicesMediaFallback === "true") {
                root.dataset.servicesEntrySkipped = "media-unavailable";
                finishPreparation();
                return;
            }
            void (async () => {
                let mediaReady = false;
                for (let attempt = 0; attempt < 2 && remainsRelevant(); attempt += 1) {
                    root.dataset.servicesEntryAttempt = String(attempt + 1);
                    mediaReady = await ensureServicesEntrySegmentReady(entryVideo, remainsRelevant);
                    if (mediaReady || !remainsRelevant() || entryVideo.error)
                        break;
                    await waitForServicesEntryRetry(180);
                }
                delete root.dataset.servicesEntryAttempt;
                if (!mediaReady || !remainsRelevant()) {
                    if (entryVideo.error) {
                        activateServicesMediaFallback();
                        root.dataset.servicesEntrySkipped = "media-error";
                    }
                    finishPreparation();
                    return;
                }
                const startFrameReady = await seekServicesFrame(entryVideo, 0, remainsRelevant);
                if (!startFrameReady || !remainsRelevant()) {
                    finishPreparation();
                    return;
                }
                delete root.dataset.servicesEntrySkipped;
                commitServicesForwardEntry(entrySource);
            })();
        };
        const startServicesReverseEntry = (entrySource = "trigger-on-enter-back") => {
            if (servicesActive || servicesReleasing || disposed)
                return;
            cancelServicesEntryPreparation("new-reverse-entry");
            resetServicesMediaRetry();
            const token = ++servicesRunToken;
            const lastStage = SERVICES_KEYFRAME_STOPS.length - 1;
            const reverseEntryTime = SERVICES_REVERSE_KEYFRAME_STOPS[lastStage] + SERVICES_SEAM_FRAME_NUDGE;
            servicesActive = true;
            servicesReleasing = false;
            servicesForwardComplete = false;
            servicesSessionDirection = -1;
            servicesTransitionDirection = -1;
            servicesGateUntil = performance.now() + SERVICES_POST_STAGE_GATE_MS;
            root.dataset.servicesEntryDirection = "reverse";
            root.dataset.servicesEntrySource = entrySource;
            root.dataset.servicesPinned = "true";
            root.dataset.servicesInrange = "true";
            root.dataset.servicesSequence = "reverse";
            delete root.dataset.servicesSequenceComplete;
            delete root.dataset.servicesTransportFailure;
            lockClientsServicesHandoffAtServices();
            setServicesStopPostersArmed(true);
            setServicesEntryPoster(false);
            setServicesPanel(lastStage);
            setServicesStaticStop(lastStage);
            if (servicesVideo)
                servicesVideo.dataset.segmentState = "preparing";
            setServicesPhase("waiting");
            scheduleServicesProgressCatchUp(-1, token);

            if (!servicesVideo || root.dataset.servicesMediaFallback === "true")
                return;
            void seekServicesFrame(servicesVideo, reverseEntryTime, () => token === servicesRunToken && servicesActive && servicesSessionDirection === -1, SERVICES_SEAM_SEEK_TOLERANCE).then((ready) => {
                if (!ready || token !== servicesRunToken || !servicesActive || servicesSessionDirection !== -1 || disposed)
                    return;
                setServicesStaticStop(null);
                root.dataset.servicesMediaDecoded = "true";
                root.dataset.servicesReverseEntryFrameDecoded = "true";
                if (servicesVideo)
                    servicesVideo.dataset.segmentState = "ready";
            });
        };
        const runServicesReverseStage = async (nextStage: number) => {
            if (!servicesActive || servicesSessionDirection !== -1 || servicesPhase !== "waiting" || nextStage < 0 || nextStage !== servicesStage - 1)
                return;
            const token = ++servicesRunToken;
            const currentStage = servicesStage;
            const reverseFrom = SERVICES_REVERSE_KEYFRAME_STOPS[currentStage] +
                (currentStage === SERVICES_KEYFRAME_STOPS.length - 1 ? SERVICES_SEAM_FRAME_NUDGE : 0);
            const reverseTo = SERVICES_REVERSE_KEYFRAME_STOPS[nextStage];
            const segmentDuration = (reverseTo - reverseFrom) / SERVICES_PLAYBACK_RATE;
            beginServicesMediaAttempt(`reverse:${currentStage}:${nextStage}`);
            servicesTransitionDirection = -1;
            root.dataset.servicesTarget = String(nextStage + 1);
            setServicesStaticStop(currentStage);
            setServicesPhase("preparing");

            const reverseStartReady = root.dataset.servicesMediaFallback === "true"
                ? false
                : await seekServicesFrame(servicesVideo, reverseFrom, () => token === servicesRunToken && servicesActive && servicesSessionDirection === -1, currentStage === SERVICES_KEYFRAME_STOPS.length - 1
                    ? SERVICES_SEAM_SEEK_TOLERANCE
                    : undefined);
            if (token !== servicesRunToken || !servicesActive || servicesSessionDirection !== -1 || disposed)
                return;
            const reverseMediaReady = reverseStartReady && root.dataset.servicesMediaFallback !== "true"
                ? await ensureServicesPlayable(servicesVideo, reverseTo, () => token === servicesRunToken && servicesActive && servicesSessionDirection === -1, reverseFrom)
                : false;
            if (token !== servicesRunToken || !servicesActive || servicesSessionDirection !== -1 || disposed)
                return;

            if (!reverseMediaReady) {
                if (servicesVideo?.error)
                    activateServicesMediaFallback();
                root.dataset.servicesTransportFailure = servicesVideo?.error ? "reverse-media-error" : "reverse-decode-timeout";
                setServicesPanel(nextStage);
                setServicesStaticStop(nextStage);
                delete root.dataset.servicesTarget;
                resetServicesMediaRetry();
                servicesGateUntil = performance.now() + SERVICES_POST_STAGE_GATE_MS;
                setServicesPhase("waiting");
                scheduleServicesProgressCatchUp(-1, token);
                return;
            }

            servicesWarmupClaimRef.current?.();
            root.dataset.servicesVideoDirection = "reverse-playback";
            setServicesPhase("reverse");
            const [mediaCompleted] = await Promise.all([
                playMediaSegment(servicesVideo, reverseFrom, reverseTo, SERVICES_PLAYBACK_RATE, () => token === servicesRunToken && servicesActive && servicesSessionDirection === -1, true, true, true, isMobileRuntime() ? 2200 : MEDIA_SEGMENT_GRACE_MS),
                animateServicesReversePanel(nextStage, segmentDuration),
            ]);
            if (token !== servicesRunToken || !servicesActive || servicesSessionDirection !== -1 || disposed)
                return;
            delete root.dataset.servicesTarget;
            delete root.dataset.servicesVideoDirection;
            if (!mediaCompleted) {
                root.dataset.servicesTransportFailure = servicesVideo?.error ? "reverse-playback-error" : "reverse-playback-stall";
                setServicesPanel(nextStage);
                setServicesStaticStop(nextStage);
            }
            else {
                setServicesStaticStop(null);
                root.dataset.servicesMediaDecoded = "true";
                if (servicesVideo)
                    servicesVideo.dataset.segmentState = "ready";
                setServicesPanel(nextStage);
            }
            resetServicesMediaRetry();
            servicesGateUntil = performance.now() + SERVICES_POST_STAGE_GATE_MS;
            setServicesPhase("waiting");
            scheduleServicesProgressCatchUp(-1, token);
        };
        servicesControllerRef.current = {
            releaseForNavigation: releaseServicesForNavigation,
        };
        /*
          Which stop is due is read from where the reader has scrolled inside the
          pinned band, not from accumulated gesture deltas. Each stop owns a slice
          of the band: scrolling into it locks the input, plays that one segment
          and hands the input straight back. Reverse entry uses the authored
          palindrome branch and advances monotonically 3 -> 2 -> 1.
        */
        const advanceServicesFromProgress = (progress: number, direction: number) => {
            if (!servicesActive || servicesReleasing || disposed)
                return;
            if (servicesPhase !== "waiting" || performance.now() < servicesGateUntil)
                return;
            const dueStage = SERVICES_STOP_PROGRESS.reduce<number>((stage, threshold, index) => (progress >= threshold ? index : stage), 0);
            if (servicesSessionDirection === -1) {
                if (direction >= 0)
                    return;
                if (dueStage < servicesStage)
                    void runServicesReverseStage(servicesStage - 1);
                return;
            }
            if (servicesSessionDirection !== 1 || direction < 0)
                return;
            const lastStage = SERVICES_KEYFRAME_STOPS.length - 1;
            if (servicesStage >= lastStage) {
                if (!servicesForwardComplete && progress >= SERVICES_EXIT_PROGRESS)
                    void releaseServicesForward();
                return;
            }
            if (dueStage > servicesStage)
                void runServicesStage(servicesStage + 1);
        };
        const lensMotion = compactMotion
            ? {
                intro: { ...getLensPose(0.84, 0.72, 1.52, 1), rotation: -4 },
                vision: { ...getLensPose(0.8, 0.44, 1.68, 0.96), rotation: 0 },
                exit: getLensPose(0.66, 1.34, 0.88, 0),
            }
            : {
                intro: { ...getLensPose(0.73, 0.54, 1.18, 1), rotation: -5 },
                vision: { ...getLensPose(0.82, 0.58, 1.74, 0.96), rotation: 0 },
                exit: getLensPose(0.68, 1.36, 0.9, 0),
            };
        if (compactMotion) {
            gsap.set(".lens-stage", lensMotion.intro);
        }
        gsap.set(".first-two-transition-art", { yPercent: -50, y: 0, autoAlpha: 1 });
        const visionExitAt = compactMotion ? 5.45 : 5.2;
        const visionHoldDuration = 5.92 - visionExitAt;
        heroTimeline = gsap.timeline({
            defaults: { ease: "power2.inOut" },
            scrollTrigger: {
                id: "hero-motion",
                trigger: ".hero-motion",
                start: "top top",
                end: () => `+=${getStableHeroPinDistance()}`,
                scrub: isMacRuntime() ? 0.1 : isMobileRuntime() ? 0.12 : 0.18,
                pin: true,
                anticipatePin: 1,
                refreshPriority: 40,
                invalidateOnRefresh: true,
                onUpdate: (self) => {
                    if (heroTimeline) {
                        setMotionPhase();
                        syncHeroVideoActivity();
                    }
                    root.dataset.motionProgress = self.progress.toFixed(3);
                },
                onScrubComplete: () => {
                    setMotionPhase();
                    syncHeroVideoActivity();
                },
                onEnter: syncHeroVideoActivity,
                onEnterBack: syncHeroVideoActivity,
                onLeave: syncHeroVideoActivity,
                onLeaveBack: syncHeroVideoActivity,
            },
        });
        heroTimelineRef.current = heroTimeline;
        heroTimeline
            .addLabel("heroIntro", 0)
            .addLabel("heroDrift", 0.08)
            .to(".lens-stage", { ...lensMotion.intro, duration: 0.58, ease: "power2.out" }, "heroDrift")
            .addLabel("visionRight", 0.82)
            .to(".hero-copy", { y: -148, autoAlpha: 0, duration: 0.56 }, "visionRight-=0.46")
            .to(".mission-frame", { y: 0, autoAlpha: 1, duration: revealTime(0.58), ease: "power3.out" }, "visionRight")
            .to(".first-two-transition-art", { y: () => -window.innerHeight, duration: 1.54, ease: "none" }, "visionRight-=0.42")
            .to(".mission-story", { y: 0, autoAlpha: 1, duration: revealTime(0.62), ease: "power3.out" }, "visionRight+=0.08")
            .to(missionStoryItems, {
            y: 0,
            autoAlpha: 1,
            duration: revealTime(0.54),
            ease: "power3.out",
            stagger: revealTime(0.08),
        }, "visionRight+=0.14")
            .to(".lens-stage", { ...lensMotion.vision, duration: 0.92, ease: "power2.inOut" }, "visionRight-=0.04")
            .call(() => setVisionLogoArmed(true), [], "visionRight")
            .addLabel("mission", 2.18)
            .addLabel("loopExitHidden", 2.34)
            .to(".first-two-transition-art", { autoAlpha: 0, duration: 0.62, ease: "power2.inOut" }, "loopExitHidden-=0.18")
            .to(".mission-story", { y: -68, autoAlpha: 0, duration: 0.58, ease: "power2.in" }, "loopExitHidden-=0.18")
            .to(".mission-frame", { y: -42, autoAlpha: 0, duration: 0.66 }, "loopExitHidden+=0.04")
            .to(".lens-stage", { ...lensMotion.exit, duration: 1.04, ease: "power3.inOut" }, "loopExitHidden")
            .addLabel("galaxyFadeOut", 2.72)
            .addLabel("secondRevealEnter", 2.92)
            .set(".second-stage", { autoAlpha: 1 }, "secondRevealEnter")
            .to(".second-media", { yPercent: 0, y: 0, scale: 1, autoAlpha: 1, duration: revealTime(0.78), ease: "power3.out" }, "secondRevealEnter")
            .to(".vision-logo-image", { y: 0, scale: 1, autoAlpha: 1, duration: revealTime(0.72), ease: "power3.out" }, "secondRevealEnter+=0.04")
            .to(".vision-reveal-copy > *", {
            y: 0,
            autoAlpha: 1,
            duration: revealTime(0.64),
            ease: "power3.out",
            stagger: revealTime(0.14),
        }, "secondRevealEnter+=0.08")
            .to(".second-media", { y: -22, duration: 1.08, ease: "power2.inOut" }, "secondRevealEnter+=0.82")
            .addLabel("secondVideoComplete", visionExitAt)
            .to(".second-copy", { y: -8, autoAlpha: 1, duration: visionHoldDuration, ease: "none" }, "secondVideoComplete")
            .to(".second-media", { y: -30, autoAlpha: 1, duration: visionHoldDuration, ease: "none" }, "secondVideoComplete")
            .addLabel("galaxyHidden", 5.92);
        const clientsSection = root.querySelector<HTMLElement>(".figma-clients-section");
        let clientsEntranceMoving = false;
        let clientsHandoffMoving = false;
        const syncClientsCardsMoving = () => {
            if (!clientsSection)
                return;
            if (clientsEntranceMoving || clientsHandoffMoving)
                clientsSection.dataset.clientCardsMoving = "true";
            else
                delete clientsSection.dataset.clientCardsMoving;
        };
        const setClientsEntranceMoving = (moving: boolean) => {
            clientsEntranceMoving = moving;
            syncClientsCardsMoving();
        };
        const setClientsHandoffMoving = (moving: boolean) => {
            clientsHandoffMoving = moving;
            syncClientsCardsMoving();
        };
        if (clientsSection) {
            const clientsInner = clientsSection.querySelector<HTMLElement>(".figma-clients-inner");
            const clientsHeadingItems = Array.from(clientsSection.querySelectorAll<HTMLElement>(".figma-clients-kicker, .figma-clients-heading h2 > span, .figma-clients-cta"));
            const clientsCardItems = Array.from(clientsSection.querySelectorAll<HTMLElement>(".figma-client-card"));
            const clientsCardRevealGroups = clientsCardItems.map((card) => {
                const copyBlocks = Array.from(card.querySelectorAll<HTMLElement>(".figma-client-copy-block"));
                return {
                    title: card.querySelector<HTMLElement>("h3"),
                    titleDivider: card.querySelector<HTMLElement>(".figma-client-title-divider"),
                    keyLabel: copyBlocks[0]?.querySelector<HTMLElement>(".figma-client-label") ?? null,
                    keyParagraphs: copyBlocks[0]
                        ? Array.from(copyBlocks[0].querySelectorAll<HTMLElement>(".figma-client-key-text > p"))
                        : [],
                    middleDivider: card.querySelector<HTMLElement>(".figma-client-divider"),
                    momentLabel: copyBlocks[1]?.querySelector<HTMLElement>(".figma-client-label") ?? null,
                    moments: copyBlocks[1]
                        ? Array.from(copyBlocks[1].querySelectorAll<HTMLElement>(".figma-client-moment-list > li"))
                        : [],
                };
            });
            const clientsNoteItems = Array.from(clientsSection.querySelectorAll<HTMLElement>(".figma-clients-scroll-note"));
            const clientsCardStage = clientsSection.querySelector<HTMLElement>(".figma-client-card-stage");
            const clientsScrollElement = root.querySelector<HTMLElement>(".clients-scroll-element-wrap");
            const setClientsHeaderState = (active: boolean) => {
                if (active)
                    root.dataset.clientsInrange = "true";
                else
                    delete root.dataset.clientsInrange;
            };
            const clientsHeaderTrigger = ScrollTrigger.create({
                trigger: clientsSection,
                start: "top 72%",
                end: "bottom top",
                onToggle: (self) => setClientsHeaderState(self.isActive),
                onRefresh: (self) => setClientsHeaderState(self.isActive),
            });
            cleanupCallbacks.push(() => {
                clientsHeaderTrigger.kill();
                delete root.dataset.clientsInrange;
            });
            gsap.set(clientsHeadingItems, { y: 34, autoAlpha: 0 });
            gsap.set(clientsCardItems, { y: 40, autoAlpha: 0 });
            gsap.set(clientsNoteItems, { y: 28, autoAlpha: 0 });
            clientsCardRevealGroups.forEach((group) => {
                if (group.title)
                    gsap.set(group.title, { y: 16, autoAlpha: 0 });
                if (group.titleDivider) {
                    gsap.set(group.titleDivider, { scaleX: 0, autoAlpha: 0, transformOrigin: "0% 50%" });
                }
                if (group.keyLabel)
                    gsap.set(group.keyLabel, { y: 12, autoAlpha: 0 });
                gsap.set(group.keyParagraphs, { y: 14, autoAlpha: 0 });
                if (group.middleDivider) {
                    gsap.set(group.middleDivider, { scaleX: 0, autoAlpha: 0, transformOrigin: "0% 50%" });
                }
                if (group.momentLabel)
                    gsap.set(group.momentLabel, { y: 12, autoAlpha: 0 });
                gsap.set(group.moments, { y: 16, autoAlpha: 0 });
            });
            const clientsEntrance = gsap.timeline({
                defaults: { ease: "power2.out" },
                onStart: () => setClientsEntranceMoving(true),
                onComplete: () => setClientsEntranceMoving(false),
                onReverseComplete: () => setClientsEntranceMoving(false),
                scrollTrigger: {
                    trigger: clientsInner ?? clientsSection,
                    start: "top 96%",
                    end: "top -10%",
                    scrub: isMobileRuntime() ? false : isMacRuntime() ? 0.08 : 0.24,
                    toggleActions: isMobileRuntime() ? "play none none reverse" : undefined,
                    invalidateOnRefresh: true,
                    onUpdate: (self) => setClientsEntranceMoving(self.progress > 0 && self.progress < 1),
                    onScrubComplete: () => setClientsEntranceMoving(false),
                    onLeave: () => {
                        clientsSection.setAttribute("data-client-cards-visible", "true");
                        setClientsEntranceMoving(false);
                    },
                    onEnterBack: () => {
                        clientsSection.removeAttribute("data-client-cards-visible");
                        setClientsEntranceMoving(true);
                    },
                    onLeaveBack: () => {
                        clientsSection.removeAttribute("data-client-cards-visible");
                        setClientsEntranceMoving(false);
                    },
                },
            });
            if (clientsHeadingItems.length) {
                clientsEntrance.to(clientsHeadingItems, { y: 0, autoAlpha: 1, duration: 0.78, stagger: 0.14 }, 0);
            }
            if (clientsCardStage && clientsCardItems.length) {
                clientsCardItems.forEach((card, cardIndex) => {
                    const cardBase = 0.72;
                    const detailBase = 0.72;
                    const group = clientsCardRevealGroups[cardIndex];
                    clientsEntrance.to(card, { y: 0, autoAlpha: 1, duration: 0.58 }, cardBase);
                    if (!group)
                        return;
                    if (group.title) {
                        clientsEntrance.to(group.title, { y: 0, autoAlpha: 1, duration: 0.42 }, detailBase + 0.18);
                    }
                    if (group.titleDivider) {
                        clientsEntrance.to(group.titleDivider, { scaleX: 1, autoAlpha: 1, duration: 0.34 }, detailBase + 0.24);
                    }
                    if (group.keyLabel) {
                        clientsEntrance.to(group.keyLabel, { y: 0, autoAlpha: 1, duration: 0.42 }, detailBase + 0.3);
                    }
                    if (group.keyParagraphs.length) {
                        clientsEntrance.to(group.keyParagraphs, { y: 0, autoAlpha: 1, duration: 0.58, stagger: 0.1 }, detailBase + 0.36);
                    }
                    if (group.middleDivider) {
                        clientsEntrance.to(group.middleDivider, { scaleX: 1, autoAlpha: 1, duration: 0.36 }, detailBase + 0.52);
                    }
                    if (group.momentLabel) {
                        clientsEntrance.to(group.momentLabel, { y: 0, autoAlpha: 1, duration: 0.42 }, detailBase + 0.58);
                    }
                    if (group.moments.length) {
                        clientsEntrance.to(group.moments, { y: 0, autoAlpha: 1, duration: 0.68, stagger: 0.12 }, detailBase + 0.64);
                    }
                });
            }
            if (clientsNoteItems.length) {
                clientsEntrance.to(clientsNoteItems, { y: 0, autoAlpha: 1, duration: 0.68, stagger: 0.1 }, 1.22);
            }
            cleanupCallbacks.push(() => {
                clientsEntranceMoving = false;
                clientsHandoffMoving = false;
                syncClientsCardsMoving();
            });
            if (clientsScrollElement) {
                const clientsPlaneScale = window.innerWidth <= 900 ? 1 : 1.8;
                const syncClientsFlareWillChange = (active: boolean) => {
                    clientsScrollElement.style.willChange = active ? "transform" : "auto";
                };
                const clientsRotation = gsap.fromTo(clientsScrollElement, {
                    rotation: 15,
                    scale: clientsPlaneScale,
                    transformOrigin: "50% 50%",
                }, {
                    rotation: -15,
                    scale: clientsPlaneScale,
                    ease: "none",
                    immediateRender: false,
                    scrollTrigger: {
                        id: "clients-gradient-rotation",
                        trigger: clientsInner ?? clientsSection,
                        start: "top bottom",
                        end: () => window.innerWidth <= 900
                            ? `+=${Math.round(Math.max(document.documentElement.clientHeight, window.visualViewport?.height ?? 0) * 1.05)}`
                            : "bottom bottom",
                        scrub: true,
                        invalidateOnRefresh: true,
                        onToggle: (self) => syncClientsFlareWillChange(self.isActive),
                        onRefresh: (self) => syncClientsFlareWillChange(self.isActive),
                    },
                });
                cleanupCallbacks.push(() => {
                    clientsScrollElement.style.removeProperty("will-change");
                    clientsRotation.scrollTrigger?.kill();
                    clientsRotation.kill();
                });
            }
        }
        const servicesSection = root.querySelector<HTMLElement>(".services-story-section");
        if (servicesSection && clientsSection) {
            const clientsHandoffItems = Array.from(clientsSection.querySelectorAll<HTMLElement>(".figma-clients-heading, .figma-client-card-stage"));
            root.dataset.servicesSequence = "autoplay";
            servicesVideo?.pause();
            clientsSection.style.removeProperty("--clients-handoff-y");
            clientsSection.style.removeProperty("--clients-handoff-opacity");
            if (clientsHandoffItems.length) {
                const clientsStarStage = root.querySelector<HTMLElement>(".first-four-galaxy-stage");
                const servicesStarReveal = servicesSection.querySelector<HTMLElement>(".services-galaxy-stage");
                // The ambient hero gradient and the diagonal flare plate are the two
                // Clients-era backdrops that used to hard-cut on the pin flag. They now
                // scrub out with the cards so Services is handed a clean black stage.
                // Each carries its own resting opacity, so each keeps its own `fromTo`.
                const clientsBackdropLayers = [
                    { element: root.querySelector<HTMLElement>(".first-four-gradient-field"), restingOpacity: 0.86 },
                    { element: root.querySelector<HTMLElement>(".vision-clients-flare-stage"), restingOpacity: 1 },
                ].filter((layer): layer is { element: HTMLElement; restingOpacity: number } => Boolean(layer.element));
                const firstServicesItems = servicePanelItems[0] ?? [];
                const clientsHandoffEase = gsap.parseEase("power2.inOut");
                const syncClientsHandoff = (progress: number) => {
                    const easedProgress = clientsHandoffEase(gsap.utils.clamp(0, 1, progress));
                    gsap.set(clientsHandoffItems, {
                        "--clients-handoff-y": `${-56 * easedProgress}px`,
                        "--clients-handoff-opacity": 1 - easedProgress,
                    });
                };
                const clientsExitTrigger = ScrollTrigger.create({
                    id: "clients-card-exit",
                    trigger: servicesSection,
                    start: "top bottom",
                    end: "top 14%",
                    invalidateOnRefresh: true,
                    onUpdate: (self) => syncClientsHandoff(self.progress),
                    onRefresh: (self) => syncClientsHandoff(self.progress),
                });
                let firstServicesHandoffDirection: 1 | -1 = 1;
                const syncBackdropHandoff = (progress: number) => {
                    const clamped = gsap.utils.clamp(0, 1, progress);
                    const fadeOut = 1 - gsap.utils.clamp(0, 1, clamped / 0.34);
                    clientsBackdropLayers.forEach(({ element, restingOpacity }) => {
                        gsap.set(element, { opacity: restingOpacity * fadeOut });
                    });
                    // Cross-fade the two star surfaces on one shared progress curve.
                    // Their combined opacity stays at one, so neither direction can
                    // expose a black frame after the Clients flare has disappeared.
                    const starHandoff = gsap.utils.clamp(0, 1, (clamped - 0.08) / 0.5);
                    if (clientsStarStage) {
                        gsap.set(clientsStarStage, { opacity: 1 - starHandoff });
                    }
                    if (servicesStarReveal) {
                        gsap.set(servicesStarReveal, { opacity: starHandoff });
                    }
                };
                const syncFirstServicesHandoffY = (progress: number, direction: 1 | -1) => {
                    if (!firstServicesItems.length)
                        return;
                    const start = 0.58;
                    const duration = 0.42;
                    const stagger = 0.03;
                    const hiddenY = direction < 0 ? -44 : 26;
                    firstServicesItems.forEach((item, index) => {
                        const itemProgress = gsap.utils.clamp(0, 1, (progress - start - index * stagger) / duration);
                        gsap.set(item, { y: hiddenY * (1 - itemProgress) });
                    });
                };
                clientsServicesHandoff = gsap.timeline({
                    scrollTrigger: {
                        id: "clients-services-handoff",
                        trigger: servicesSection,
                        start: "top bottom",
                        end: "top 14%",
                        scrub: 0.28,
                        invalidateOnRefresh: true,
                        onUpdate: (self) => {
                            setClientsHandoffMoving(self.progress > 0 && self.progress < 1);
                            firstServicesHandoffDirection = self.direction < 0 ? -1 : 1;
                            syncBackdropHandoff(self.progress);
                            syncFirstServicesHandoffY(self.progress, firstServicesHandoffDirection);
                        },
                        onScrubComplete: () => setClientsHandoffMoving(false),
                        onLeave: () => setClientsHandoffMoving(false),
                        onRefresh: (self) => {
                            syncBackdropHandoff(self.progress);
                            syncFirstServicesHandoffY(self.progress, firstServicesHandoffDirection);
                        },
                        onLeaveBack: () => {
                            setClientsHandoffMoving(false);
                            if (servicesActive || servicesReleasing)
                                return;
                            showServicesIdlePreview();
                            pauseAndSeek(servicesVideo, 0);
                        },
                    },
                });
                syncClientsHandoff(clientsExitTrigger.progress);
                syncBackdropHandoff(clientsServicesHandoff.scrollTrigger?.progress ?? 0);
                /*
                  Handover order matters. Services has to arrive on a finished stage:
                  the Clients backdrops and starfield leave first, the Services stage
                  and its stars come back up on their own, and only then does the copy
                  and the media fade in. Reversed, the reader gets the same order back.
                */
                if (firstServicesItems.length) {
                    clientsServicesHandoff.fromTo(firstServicesItems, { autoAlpha: 0 }, {
                        autoAlpha: 1,
                        duration: 0.42,
                        stagger: 0.03,
                        ease: "power3.out",
                    }, 0.6);
                }
                if (servicesMediaVisuals.length) {
                    clientsServicesHandoff.fromTo(servicesMediaVisuals, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.48, ease: "power2.out" }, 0.56);
                }
                cleanupCallbacks.push(() => {
                    clientsServicesHandoff?.scrollTrigger?.kill();
                    clientsServicesHandoff?.kill();
                    clientsServicesHandoff = null;
                    clientsExitTrigger.kill();
                    clientsHandoffItems.forEach((item) => {
                        item.style.removeProperty("--clients-handoff-y");
                        item.style.removeProperty("--clients-handoff-opacity");
                    });
                    if (clientsStarStage)
                        gsap.set(clientsStarStage, { clearProps: "opacity" });
                    if (servicesStarReveal)
                        gsap.set(servicesStarReveal, { clearProps: "opacity" });
                    if (clientsBackdropLayers.length)
                        gsap.set(clientsBackdropLayers.map((layer) => layer.element), { clearProps: "opacity" });
                    if (firstServicesItems.length)
                        gsap.set(firstServicesItems, { clearProps: "opacity,visibility,transform" });
                    if (servicesMediaVisuals.length) {
                        gsap.set(servicesMediaVisuals, { clearProps: "opacity,visibility" });
                    }
                    setClientsHandoffMoving(false);
                });
            }
            const syncServicesApproach = (active: boolean) => {
                primaryGalaxyRef.current?.setActive(true);
                primaryGalaxyRef.current?.setMotion(active
                    ? {
                        density: isMobileRuntime() || isWebKitRuntime() ? 1.05 : 1,
                        glowIntensity: 0.12,
                        starSpeed: isMobileRuntime() || isWebKitRuntime() ? 0.86 : 1.08,
                        speed: isMobileRuntime() || isWebKitRuntime() ? 1.08 : 1.44,
                        rotationSpeed: isMobileRuntime() || isWebKitRuntime() ? 0.1 : 0.15,
                    }
                    : {
                        density: isMobileRuntime() || isWebKitRuntime() ? 1.05 : 1.3,
                        glowIntensity: 0.12,
                        starSpeed: isMobileRuntime() || isWebKitRuntime() ? 0.86 : 1.08,
                        speed: isMobileRuntime() || isWebKitRuntime() ? 1.08 : 1.44,
                        rotationSpeed: isMobileRuntime() || isWebKitRuntime() ? 0.1 : 0.15,
                    });
                interactiveGalaxyRef.current?.setActive(!active);
                interactiveGalaxyRef.current?.setInteractionEnabled(!active);
                if (active) {
                    root.dataset.servicesInrange = "true";
                }
                else if (!servicesActive && !servicesReleasing) {
                    delete root.dataset.servicesInrange;
                }
            };
            const servicesApproachTrigger = ScrollTrigger.create({
                id: "services-approach",
                trigger: servicesSection,
                start: "top 96%",
                end: "bottom top",
                invalidateOnRefresh: true,
                onToggle: (self) => syncServicesApproach(self.isActive),
                onRefresh: (self) => syncServicesApproach(self.isActive),
            });
            cleanupCallbacks.push(() => servicesApproachTrigger.kill());
            const shouldBypassServicesMotion = () => (programmaticNavigationRef.current && programmaticAnchorRef.current !== "#services") ||
                (!initialHashHandledRef.current && Boolean(window.location.hash) && window.location.hash !== "#services");
            /*
              The band is real document now. It used to be exactly one viewport
              and then cancelled again by a negative margin on the pin spacer,
              because nothing ever scrolled through it - the story advanced on
              gesture deltas while the page was frozen. The stops are read off
              scroll progress instead, so the band has to be long enough to hold
              them: roughly a viewport of reading between each one.
            */
            const getServicesPinDistance = () => Math.round(getVisualViewportHeight() * SERVICES_PIN_VIEWPORTS);
            const isNearServicesTrigger = (trigger: ScrollTrigger, viewportMargin = 1.25) => {
                const viewportHeight = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
                const margin = viewportHeight * viewportMargin;
                return window.scrollY >= trigger.start - margin && window.scrollY <= trigger.end + margin;
            };
            const canStartServicesMotion = (trigger: ScrollTrigger) => isNearServicesTrigger(trigger) && isServicesVisuallyNear();
            servicesTrigger = ScrollTrigger.create({
                id: "services-reversible",
                trigger: servicesSection,
                start: "top top",
                end: () => `+=${getServicesPinDistance()}`,
                pin: useLegacyServicesFlow,
                pinSpacing: true,
                anticipatePin: 1,
                refreshPriority: 30,
                invalidateOnRefresh: true,
                onEnter: (self) => {
                    if (shouldBypassServicesMotion() || !canStartServicesMotion(self))
                        return;
                    startServicesForward("trigger-on-enter");
                },
                onEnterBack: (self) => {
                    if (shouldBypassServicesMotion() || !canStartServicesMotion(self))
                        return;
                    startServicesReverseEntry("trigger-on-enter-back");
                },
                onUpdate: (self) => {
                    if (servicesActive) {
                        advanceServicesFromProgress(self.progress, self.direction);
                        return;
                    }
                    if (self.isActive &&
                        self.direction < 0 &&
                        !servicesReleasing &&
                        servicesPhase === "idle" &&
                        !shouldBypassServicesMotion() &&
                        canStartServicesMotion(self)) {
                        startServicesReverseEntry("trigger-on-update-back");
                        return;
                    }
                    if (!self.isActive ||
                        self.direction < 0 ||
                        servicesReleasing ||
                        servicesPhase !== "idle" ||
                        self.progress >= SERVICES_STOP_PROGRESS[1] ||
                        shouldBypassServicesMotion() ||
                        !canStartServicesMotion(self)) {
                        return;
                    }
                    startServicesForward("trigger-on-update");
                },
                onLeave: () => {
                    // A very large native gesture can leave the pin while the
                    // final-frame seek is still preparing. Leaving the real band
                    // always wins; invalidate that seek instead of retaining an
                    // offscreen Services session.
                    if (servicesActive && servicesSessionDirection === 1) {
                        finishServicesRelease();
                        return;
                    }
                    if (servicesActive && servicesSessionDirection === -1) {
                        finishServicesRelease();
                        return;
                    }
                    if (!servicesActive && !servicesReleasing) {
                        delete root.dataset.servicesPinned;
                        delete root.dataset.servicesInrange;
                    }
                },
                onLeaveBack: () => {
                    cancelServicesEntryPreparation("left-band-backward");
                    if (!servicesActive && !servicesReleasing) {
                        delete root.dataset.servicesPinned;
                        delete root.dataset.servicesInrange;
                        return;
                    }
                    rewindServicesToStart();
                },
            });
            const handleServicesPositionApplied = () => {
                if (programmaticAnchorRef.current === "#services" && servicesTrigger) {
                    showServicesIdlePreview(true);
                    startServicesForward("position-applied");
                }
            };
            window.addEventListener("tasc:scroll-position-applied", handleServicesPositionApplied);
            const settleServicesWhenHidden = (event: Event) => {
                if (event.type !== "pagehide" && document.visibilityState !== "hidden")
                    return;
                cancelServicesEntryPreparation("document-hidden");
                if (!servicesActive || !["playing", "reverse", "releasing"].includes(servicesPhase))
                    return;
                const targetStage = Math.min(SERVICES_KEYFRAME_STOPS.length - 1, Math.max(0, Number(root.dataset.servicesActive ?? 1) - 1));
                servicesRunToken += 1;
                if (servicesVideo)
                    mediaRunCancels.get(servicesVideo)?.();
                stopServicesTextTimeline();
                const targetTime = servicesSessionDirection === -1
                    ? SERVICES_REVERSE_KEYFRAME_STOPS[targetStage]
                    : SERVICES_KEYFRAME_STOPS[targetStage];
                pauseAndSeek(servicesVideo, targetTime, SERVICES_SEAM_SEEK_TOLERANCE / 2);
                setServicesStaticStop(targetStage);
                setServicesPanel(targetStage);
                servicesGateUntil = 0;
                setServicesPhase("waiting");
                setMotionInputState();
            };
            document.addEventListener("visibilitychange", settleServicesWhenHidden);
            window.addEventListener("pagehide", settleServicesWhenHidden);
            cleanupCallbacks.push(() => {
                window.removeEventListener("tasc:scroll-position-applied", handleServicesPositionApplied);
                document.removeEventListener("visibilitychange", settleServicesWhenHidden);
                window.removeEventListener("pagehide", settleServicesWhenHidden);
            });
            showServicesIdlePreview();
        }
        const datumSection = root.querySelector<HTMLElement>(".datum-motion-section");
        if (datumSection) {
            const datumCardsState = datumSection.querySelector<HTMLElement>(".datum-motion-state-cards");
            const datumWaitlistState = datumSection.querySelector<HTMLElement>(".datum-motion-state-waitlist");
            const datumWaitlistSegments = Array.from(datumSection.querySelectorAll<HTMLElement>(".datum-waitlist-segment"));
            if (datumCardsState && datumWaitlistState) {
                const datumHeading = datumCardsState.querySelector<HTMLElement>(".datum-motion-heading");
                const datumCardsRevealItems = Array.from(datumCardsState.querySelectorAll<HTMLElement>(".datum-glass-card.stagger-reveal-item"));
                const datumHeadingItems = Array.from(datumCardsState.querySelectorAll<HTMLElement>(".datum-motion-heading > *"));
                const datumCardsExitItems = [...datumHeadingItems, ...datumCardsRevealItems];
                const datumCardDetailGroups = Array.from(datumCardsState.querySelectorAll<HTMLElement>(".datum-glass-card")).map((card) => Array.from(card.querySelectorAll<HTMLElement>(".datum-card-top, .datum-card-rule, h3, :scope > p")));
                const datumCardDetails = datumCardDetailGroups.flat();
                let datumContentState: "cards" | "waitlist" | "transition" | null = null;
                let stableDatumViewportWidth = getRuntimeViewport().width;
                let stableDatumViewportHeight = getRuntimeViewport().height;
                const getStableDatumPinDistance = () => {
                    const { height: nextHeight, width: nextWidth } = getRuntimeViewport();
                    const isRealViewportChange = Math.abs(nextWidth - stableDatumViewportWidth) > 80 ||
                        Math.abs(nextHeight - stableDatumViewportHeight) >
                            Math.max(180, stableDatumViewportHeight * 0.28);
                    if (isRealViewportChange) {
                        stableDatumViewportWidth = nextWidth;
                        stableDatumViewportHeight = nextHeight;
                    }
                    const coarse = isMobileRuntime();
                    const proportionalTravel = stableDatumViewportHeight * (coarse ? 0.86 : 0.74);
                    return Math.round(Math.min(coarse ? 760 : 700, Math.max(coarse ? 560 : 500, proportionalTravel)));
                };
                gsap.set(datumCardsState, { y: 0, autoAlpha: 0, pointerEvents: "none" });
                gsap.set(datumCardsRevealItems, { y: 46, autoAlpha: 0 });
                if (datumHeading) {
                    gsap.set(datumHeading, { autoAlpha: 1, clearProps: "transform,willChange" });
                }
                gsap.set(datumHeadingItems, { y: 0, autoAlpha: 1, force3D: false });
                gsap.set(datumCardDetails, { y: 0, autoAlpha: 1 });
                gsap.set(datumWaitlistState, { y: 0, autoAlpha: 0, pointerEvents: "none" });
                gsap.set(datumWaitlistSegments, { y: 30, autoAlpha: 0 });
                setRegionInteractive(datumCardsState, false);
                setRegionInteractive(datumWaitlistState, false);
                let datumCardsRevealMoving = false;
                let datumCardsScrubMoving = false;
                let datumResetTimer = 0;
                const syncDatumCardsMoving = () => {
                    if (datumCardsRevealMoving || datumCardsScrubMoving)
                        datumCardsState.dataset.datumCardsMoving = "true";
                    else
                        delete datumCardsState.dataset.datumCardsMoving;
                };
                const setDatumCardsRevealMoving = (moving: boolean) => {
                    datumCardsRevealMoving = moving;
                    syncDatumCardsMoving();
                };
                const setDatumCardsScrubMoving = (moving: boolean) => {
                    datumCardsScrubMoving = moving;
                    syncDatumCardsMoving();
                };
                const cardsRevealTimeline = gsap
                    .timeline({
                    paused: true,
                    onStart: () => setDatumCardsRevealMoving(true),
                    onComplete: () => setDatumCardsRevealMoving(false),
                    onReverseComplete: () => setDatumCardsRevealMoving(false),
                })
                    .set(datumWaitlistState, { pointerEvents: "none" }, 0)
                    .set(datumCardsState, { autoAlpha: 1, pointerEvents: "auto" }, 0)
                    .set(datumHeading ?? [], { autoAlpha: 1, clearProps: "transform,willChange" }, 0)
                    .fromTo(datumCardsRevealItems, { y: 46, autoAlpha: 0 }, {
                    y: 0,
                    autoAlpha: 1,
                    duration: cardRevealTime(1.34),
                    ease: "power4.out",
                    stagger: cardRevealTime(0.2),
                }, 0)
                    .fromTo(datumHeadingItems, { y: 18, autoAlpha: 0 }, {
                    y: 0,
                    autoAlpha: 1,
                    duration: cardRevealTime(0.82),
                    ease: "power3.out",
                    stagger: cardRevealTime(0.14),
                    force3D: false,
                    onComplete: () => {
                        gsap.set(datumHeadingItems, { clearProps: "transform,willChange" });
                    },
                }, 0.1 + CONTENT_REVEAL_LAG)
                    .to(datumWaitlistSegments, { y: 30, autoAlpha: 0, duration: 0.28, stagger: 0.02, ease: "power2.inOut" }, 0)
                    .set(datumWaitlistState, { autoAlpha: 0 }, 0.32);
                datumCardDetailGroups.forEach((items, cardIndex) => {
                    cardsRevealTimeline.fromTo(items, { y: 16, autoAlpha: 0 }, {
                        y: 0,
                        autoAlpha: 1,
                        duration: cardRevealTime(1.02),
                        ease: "power3.out",
                        stagger: cardRevealTime(0.14),
                    }, 0.3 + CONTENT_REVEAL_LAG + cardIndex * cardRevealTime(0.24));
                });
                const resetDatumContent = () => {
                    datumContentState = null;
                    datumCardsRevealMoving = false;
                    datumCardsScrubMoving = false;
                    syncDatumCardsMoving();
                    cardsRevealTimeline.timeScale(1).pause(0);
                    gsap.set(datumCardsState, { y: 0, autoAlpha: 0, pointerEvents: "none" });
                    if (datumHeading) {
                        gsap.set(datumHeading, { autoAlpha: 1, clearProps: "transform,willChange" });
                    }
                    gsap.set(datumCardsRevealItems, { y: 46, autoAlpha: 0 });
                    gsap.set(datumHeadingItems, { y: 18, autoAlpha: 0, force3D: false });
                    gsap.set(datumCardDetails, { y: 16, autoAlpha: 0 });
                    gsap.set(datumWaitlistState, { y: 0, autoAlpha: 0, pointerEvents: "none" });
                    gsap.set(datumWaitlistSegments, { y: 30, autoAlpha: 0 });
                    setRegionInteractive(datumCardsState, false);
                    setRegionInteractive(datumWaitlistState, false);
                };
                const cancelDatumReset = () => {
                    window.clearTimeout(datumResetTimer);
                    datumResetTimer = 0;
                };
                const settleDatumResetAfterScrub = () => {
                    cancelDatumReset();
                    resetDatumContent();
                    // A scrubbed timeline can render its captured start values
                    // after onLeaveBack. Re-assert reset once that short scrub has
                    // settled, unless the reader has already entered again.
                    datumResetTimer = window.setTimeout(() => {
                        datumResetTimer = 0;
                        const trigger = datumTimeline?.scrollTrigger;
                        if (!trigger?.isActive && (trigger?.progress ?? 0) <= 0.001)
                            resetDatumContent();
                    }, 340);
                };
                const showDatumCards = () => {
                    if (datumContentState === "cards")
                        return;
                    datumContentState = "cards";
                    setRegionInteractive(datumCardsState, true);
                    setRegionInteractive(datumWaitlistState, false);
                    gsap.set(datumCardsState, { pointerEvents: "auto" });
                    gsap.set(datumWaitlistState, { pointerEvents: "none" });
                    cardsRevealTimeline.timeScale(1).restart();
                };
                const syncDatumContent = (progress: number) => {
                    const nextState = progress <= 0.44
                        ? "cards"
                        : progress >= 0.8
                            ? "waitlist"
                            : "transition";
                    if (nextState === datumContentState)
                        return;
                    datumContentState = nextState;
                    root.dataset.datumProgress = nextState === "cards" ? "0.000" : nextState === "waitlist" ? "1.000" : "0.500";
                    const cardsInteractive = nextState === "cards";
                    const waitlistInteractive = nextState === "waitlist";
                    setRegionInteractive(datumCardsState, cardsInteractive);
                    setRegionInteractive(datumWaitlistState, waitlistInteractive);
                    gsap.set(datumCardsState, { pointerEvents: cardsInteractive ? "auto" : "none" });
                    gsap.set(datumWaitlistState, { pointerEvents: waitlistInteractive ? "auto" : "none" });
                };
                resetDatumContent();
                // Visibility only arms the card reveal; the pinned transition below
                // is the sole ScrollTrigger owner for Datum state and reversal.
                let datumVisibilityObserver: IntersectionObserver | null = null;
                let datumPinHasActivated = false;
                if (typeof IntersectionObserver !== "undefined") {
                    datumVisibilityObserver = new IntersectionObserver((entries) => {
                        entries.forEach((entry) => {
                            if (entry.isIntersecting) {
                                // IntersectionObserver is only the cold-entry arm.
                                // Once the pin has owned Datum, ScrollTrigger owns
                                // every replay/reset; otherwise a leave-back geometry
                                // update can immediately re-fire this observer and
                                // undo the reset with a second reveal.
                                if (!datumPinHasActivated && datumContentState === null)
                                    showDatumCards();
                                return;
                            }
                            const rootBottom = entry.rootBounds?.bottom ?? getVisualViewportHeight();
                            if (entry.boundingClientRect.top >= rootBottom)
                                resetDatumContent();
                        });
                    }, {
                        rootMargin: "0px 0px -25% 0px",
                        threshold: 0.01,
                    });
                    datumVisibilityObserver.observe(datumSection);
                }
                root.dataset.datumPinned = "false";
                datumTimeline = gsap.timeline({
                    defaults: { ease: "none" },
                    scrollTrigger: {
                        id: "datum-reversible",
                        trigger: datumSection,
                        start: "top top",
                        end: () => `+=${getStableDatumPinDistance()}`,
                        pin: true,
                        pinSpacing: true,
                        anticipatePin: 1,
                        scrub: 0.28,
                        refreshPriority: 10,
                        invalidateOnRefresh: true,
                        onToggle: (self) => {
                            root.dataset.datumPinned = String(self.isActive);
                        },
                        onEnter: (self) => {
                            cancelDatumReset();
                            datumPinHasActivated = true;
                            if (datumContentState === null)
                                showDatumCards();
                            if (cardsRevealTimeline.progress() < 1) {
                                cardsRevealTimeline.timeScale(1).play();
                            }
                            syncDatumContent(self.progress);
                        },
                        onEnterBack: (self) => {
                            cancelDatumReset();
                            datumPinHasActivated = true;
                            syncDatumContent(self.progress);
                        },
                        onUpdate: (self) => {
                            setDatumCardsScrubMoving(self.progress > 0 && self.progress < 1);
                            syncDatumContent(self.progress);
                        },
                        onScrubComplete: () => {
                            setDatumCardsScrubMoving(false);
                            const trigger = datumTimeline?.scrollTrigger;
                            if (!trigger?.isActive && (trigger?.progress ?? 0) <= 0.001)
                                resetDatumContent();
                        },
                        onRefresh: (self) => {
                            if (self.isActive) {
                                syncDatumContent(self.progress);
                            }
                        },
                        onLeave: () => {
                            setDatumCardsScrubMoving(false);
                            syncDatumContent(1);
                        },
                        onLeaveBack: () => {
                            setDatumCardsScrubMoving(false);
                            settleDatumResetAfterScrub();
                        },
                    },
                });
                datumTimeline
                    .addLabel("cards", 0)
                    .to({}, { duration: 0.4 })
                    .to(datumCardsExitItems, {
                    y: -30,
                    autoAlpha: 0,
                    duration: 0.28,
                    stagger: 0.018,
                    ease: "power2.inOut",
                    overwrite: "auto",
                }, 0.4)
                    // Bring the next state up while the last cards are still
                    // readable. The old 0.64 -> 0.72 gap made both states hidden
                    // for a real wheel frame and presented as an empty black page.
                    .set(datumWaitlistState, { autoAlpha: 1, pointerEvents: "none" }, 0.46)
                    .addLabel("waitlist", 0.46)
                    .fromTo(datumWaitlistSegments, { y: 34, autoAlpha: 0 }, {
                    y: 0,
                    autoAlpha: 1,
                    duration: 0.36,
                    stagger: 0.03,
                    ease: "power3.out",
                    immediateRender: false,
                    overwrite: "auto",
                }, 0.47)
                    .set(datumCardsState, { autoAlpha: 0, pointerEvents: "none" }, 0.72)
                    .to({}, { duration: 0.18 });
                cleanupCallbacks.push(() => {
                    datumVisibilityObserver?.disconnect();
                    cancelDatumReset();
                    cardsRevealTimeline.kill();
                    delete root.dataset.datumPinned;
                    delete root.dataset.datumProgress;
                    datumCardsRevealMoving = false;
                    datumCardsScrubMoving = false;
                    syncDatumCardsMoving();
                });
            }
        }
        const processContactSection = root.querySelector<HTMLElement>(".process-contact-section");
        const processContactBg = processContactSection?.querySelector<HTMLElement>(".process-contact-bg");
        if (processContactSection && processContactBg) {
            const setProcessHeaderTone = (active: boolean) => {
                if (active)
                    root.dataset.processInrange = "true";
                else
                    delete root.dataset.processInrange;
            };
            const processHeaderToneTrigger = ScrollTrigger.create({
                id: "process-approach",
                trigger: processContactSection,
                start: "top 12%",
                end: "bottom top",
                onToggle: (self) => setProcessHeaderTone(self.isActive),
                onRefresh: (self) => setProcessHeaderTone(self.isActive),
            });
            gsap.fromTo(processContactBg, { y: 42, autoAlpha: 0 }, {
                y: 0,
                autoAlpha: 1,
                ease: "none",
                scrollTrigger: {
                    trigger: processContactSection,
                    start: "top 90%",
                    end: "top 38%",
                    scrub: true,
                    invalidateOnRefresh: true,
                },
            });
            gsap.fromTo(processContactBg, { "--process-domino-tone": 0 }, {
                "--process-domino-tone": 1,
                ease: "none",
                scrollTrigger: {
                    id: "process-domino-tone",
                    trigger: processContactSection,
                    start: "bottom 140%",
                    end: "bottom 75%",
                    scrub: true,
                    invalidateOnRefresh: true,
                },
            });
            cleanupCallbacks.push(() => {
                processHeaderToneTrigger.kill();
                delete root.dataset.processInrange;
            });
        }
        const revealElements = gsap.utils.toArray<HTMLElement>(".reveal-block").filter((element) => !element.closest(".hero-motion") &&
            !element.closest(".domino-cta-section") &&
            !element.closest(".services-section") &&
            !element.closest(".how-work-motion-section") &&
            !element.closest(".datum-motion-section") &&
            !element.classList.contains("stagger-reveal-group") &&
            !element.closest(".stagger-reveal-group") &&
            !element.classList.contains("process-contact-row"));
        registerManagedRevealElements(revealElements);
        revealElements.forEach((element) => {
            let revealed = false;
            let revealObserver: IntersectionObserver | null = null;
            let revealScrollTrigger: ScrollTrigger | null = null;
            const revealElement = (fromY: number, trigger?: ScrollTrigger) => {
                if (revealed)
                    return;
                revealed = true;
                trigger?.kill(false);
                revealScrollTrigger?.kill(false);
                revealObserver?.disconnect();
                gsap.set(element, { y: fromY, autoAlpha: 0, overwrite: true });
                gsap.to(element, {
                    y: 0,
                    autoAlpha: 1,
                    duration: cardRevealTime(1.34),
                    ease: "power4.out",
                    overwrite: true,
                    onComplete: () => completeManagedReveal([element]),
                });
            };
            registerManagedRevealTrigger(element);
            revealScrollTrigger = ScrollTrigger.create({
                trigger: element,
                start: "top 84%",
                onEnter: (trigger) => revealElement(18, trigger),
                onEnterBack: (trigger) => revealElement(-18, trigger),
            });
            if (typeof IntersectionObserver !== "undefined") {
                revealObserver = new IntersectionObserver((entries) => {
                    if (entries.some((entry) => entry.isIntersecting))
                        revealElement(18);
                }, { threshold: 0.01 });
                revealObserver.observe(element);
                cleanupCallbacks.push(() => revealObserver?.disconnect());
            }
        });
        const staggerRevealGroups = gsap.utils.toArray<HTMLElement>(".stagger-reveal-group").filter((group) => !group.closest(".hero-motion") &&
            !group.closest(".services-section") &&
            !group.closest(".how-work-motion-section") &&
            !group.closest(".datum-motion-section") &&
            !group.closest(".domino-cta-section"));
        staggerRevealGroups.forEach((group) => {
            const items = Array.from(group.querySelectorAll<HTMLElement>(".stagger-reveal-item"));
            const isProcessHeader = group.classList.contains("process-contact-header");
            if (items.length === 0) {
                return;
            }
            let revealed = false;
            let revealObserver: IntersectionObserver | null = null;
            let revealScrollTrigger: ScrollTrigger | null = null;
            registerManagedRevealElements(items);
            registerManagedRevealTrigger(group);
            const revealItems = (fromY: number, trigger?: ScrollTrigger) => {
                if (revealed)
                    return;
                revealed = true;
                trigger?.kill(false);
                revealScrollTrigger?.kill(false);
                revealObserver?.disconnect();
                gsap.set(items, { y: fromY, autoAlpha: 0, overwrite: true });
                gsap.to(items, {
                    y: 0,
                    autoAlpha: 1,
                    duration: cardRevealTime(1.36),
                    ease: "power4.out",
                    stagger: cardRevealTime(0.18),
                    overwrite: true,
                    onComplete: () => completeManagedReveal(items),
                });
            };
            revealScrollTrigger = ScrollTrigger.create({
                trigger: group,
                start: isProcessHeader ? "top 96%" : "top 84%",
                onEnter: (trigger) => revealItems(30, trigger),
                onEnterBack: (trigger) => revealItems(-30, trigger),
            });
            if (typeof IntersectionObserver !== "undefined") {
                revealObserver = new IntersectionObserver((entries) => {
                    if (entries.some((entry) => entry.isIntersecting))
                        revealItems(30);
                }, { threshold: 0.01 });
                revealObserver.observe(group);
                cleanupCallbacks.push(() => revealObserver?.disconnect());
            }
        });
        const processRows = gsap.utils.toArray<HTMLElement>(".process-contact-row");
        if (processRows.length > 0 && processContactSection) {
            const processRowParts = new Map(processRows.map((row) => [
                row,
                Array.from(row.querySelectorAll<HTMLElement>(".process-contact-row-title > span, .process-contact-row-title > h3, :scope > p")),
            ]));
            const processParts = Array.from(processRowParts.values()).flat();
            const processRevealTargets = [...processRows, ...processParts];
            registerManagedRevealElements(processRevealTargets);
            registerManagedRevealTrigger(processContactSection);
            gsap.set(processRevealTargets, { y: 30, autoAlpha: 0 });
            const resetProcessRevealState = (fromY = 30) => {
                processRevealTargets.forEach((target) => delete target.dataset.revealComplete);
                gsap.set(processRevealTargets, { y: fromY, autoAlpha: 0 });
            };
            const processRevealTimeline = gsap.timeline({
                paused: true,
                onComplete: () => completeManagedReveal(processRevealTargets),
                onReverseComplete: () => resetProcessRevealState(-30),
            });
            processRows.forEach((row, rowIndex) => {
                const parts = processRowParts.get(row) ?? [];
                const rowStart = cardRevealTime(rowIndex * 0.19);
                processRevealTimeline.to(row, {
                    y: 0,
                    autoAlpha: 1,
                    duration: cardRevealTime(0.92),
                    ease: "power4.out",
                }, rowStart);
                if (parts.length) {
                    processRevealTimeline.to(parts, {
                        y: 0,
                        autoAlpha: 1,
                        duration: cardRevealTime(0.64),
                        stagger: cardRevealTime(0.08),
                        ease: "power3.out",
                    }, rowStart + cardRevealTime(0.12));
                }
            });
            const revealProcess = (fromY: number) => {
                if (processRevealTimeline.progress() <= 0.001)
                    resetProcessRevealState(fromY);
                processRevealTimeline.timeScale(1).play();
            };
            const processRevealTrigger = ScrollTrigger.create({
                id: "process-sequential-reveal",
                trigger: processContactSection,
                start: "top 82%",
                end: "bottom 18%",
                onEnter: () => revealProcess(30),
                onEnterBack: () => revealProcess(-30),
                onLeaveBack: () => processRevealTimeline.timeScale(1.15).reverse(),
            });
            cleanupCallbacks.push(() => {
                processRevealTrigger.kill(false);
                processRevealTimeline.kill();
            });
        }
        gsap.utils.toArray<HTMLElement>(".motion-divider").forEach((element) => {
            const revealDivider = () => gsap.to(element, { "--line-progress": "100%", duration: cardRevealTime(1.36), ease: "power2.out" });
            const resetDivider = () => gsap.set(element, { "--line-progress": "0%" });
            resetDivider();
            ScrollTrigger.create({
                trigger: element,
                start: "top 84%",
                end: "bottom 8%",
                onEnter: revealDivider,
                onEnterBack: revealDivider,
                onLeave: resetDivider,
                onLeaveBack: resetDivider,
            });
        });
        root.dataset.motionReady = "true";
        document.fonts?.ready.then(refreshScroll);
        lensVideo?.addEventListener("loadedmetadata", handleLensMetadata, { once: true });
        return () => {
            disposed = true;
            cancelServicesEntryPreparation("effect-cleanup");
            servicesRunToken += 1;
            servicesReleaseToken += 1;
            resetServicesMediaRetry();
            window.clearTimeout(servicesReleaseTimer);
            servicesReleaseTimer = 0;
            mediaRunCancels.forEach((cancel) => cancel());
            mediaRunCancels.clear();
            stopServicesTextTimeline();
            servicesActive = false;
            servicesReleasing = false;
            releaseServicesScroll();
            lensVideo?.removeEventListener("loadedmetadata", handleLensMetadata);
            cleanupCallbacks.forEach((cleanup) => cleanup());
            servicesTrigger?.kill();
            servicesVideo?.pause();
            dominoVideo?.pause();
            datumTimeline?.scrollTrigger?.kill();
            datumTimeline?.kill();
            [
                "servicesPinned",
                "servicesInrange",
                "servicesActive",
                "servicesPreview",
                "servicesSequence",
                "servicesPhase",
                "servicesEntryPreparing",
                "servicesEntryPrepared",
                "servicesEntryAttempt",
                "servicesEntrySkipped",
                "servicesEntryAbortReason",
                "servicesEntryRelevanceFailure",
                "servicesMediaDecoded",
                "servicesTransportFailure",
                "servicesReverseTransport",
                "servicesReversePrimeFrame",
                "servicesReversePrimeTime",
                "servicesVideoDirection",
                "servicesStaticStop",
                "servicesEntryPoster",
                "servicesLocked",
                "datumProgress",
                "datumPinned",
                "dominoPlayback",
                "motionInputLocked",
                "wheelScrollRate",
            ].forEach((key) => delete root.dataset[key]);
            if (heroTimelineRef.current === heroTimeline) {
                heroTimelineRef.current = null;
            }
            servicesControllerRef.current = null;
        };
        };
        const initializeMotionRuntime = () => {
            let manualCleanup: (() => void) | null = null;
            let telemetryFrame = 0;
            const scrollTriggerBaseline = new Set(ScrollTrigger.getAll());
            const runtimeContext = gsap.context(() => {
                const cleanup = createMotionRuntime();
                if (typeof cleanup === "function")
                    manualCleanup = cleanup;
            }, root);
            if (!manualCleanup) {
                runtimeContext.revert();
                return;
            }
            telemetryFrame = window.requestAnimationFrame(() => {
                telemetryFrame = window.requestAnimationFrame(() => {
                    telemetryFrame = 0;
                    root.dataset.motionRuntimeScrollTriggerCount = String(ScrollTrigger.getAll().length);
                });
            });
            return () => {
                if (telemetryFrame)
                    window.cancelAnimationFrame(telemetryFrame);
                telemetryFrame = 0;
                const cleanup = manualCleanup as (() => void) | null;
                manualCleanup = null;
                cleanup?.();
                runtimeContext.revert();
                ScrollTrigger.getAll()
                    .filter((trigger) => !scrollTriggerBaseline.has(trigger))
                    .forEach((trigger) => trigger.kill(false));
                const residualRuntimeTriggers = ScrollTrigger.getAll()
                    .filter((trigger) => !scrollTriggerBaseline.has(trigger));
                root.dataset.motionRuntimeResidualScrollTriggerCount = String(residualRuntimeTriggers.length);
                root.dataset.motionRuntimeScrollTriggerCountAfterCleanup = String(ScrollTrigger.getAll().length);
                delete root.dataset.motionRuntimeScrollTriggerCount;
            };
        };
        const requestMotionRuntime = () => {
            const cleanup = initializeMotionRuntime();
            if (typeof cleanup === "function")
                runtimeCleanup = cleanup;
        };
        const disableMotionRuntime = () => {
            const cleanup = runtimeCleanup;
            runtimeCleanup = null;
            cleanup?.();
            runtimeInitialized = false;
            delete root.dataset.motionRuntimeInitialized;
        };
        requestMotionRuntime();
        window.addEventListener("tasc:motion-runtime-request", requestMotionRuntime);
        window.addEventListener("tasc:motion-runtime-disable", disableMotionRuntime);
        return () => {
            window.removeEventListener("tasc:motion-runtime-request", requestMotionRuntime);
            window.removeEventListener("tasc:motion-runtime-disable", disableMotionRuntime);
            disableMotionRuntime();
        };
    }, {
        scope: rootRef,
    });
    useEffect(() => {
        if (!preloaderComplete || !motionAllowed)
            return;
        const root = rootRef.current;
        if (!root)
            return;
        let watchdogTimer = 0;
        let watchdogFrame = 0;
        let scrollIdleTimer = 0;
        const isAtOrAboveViewport = (element: HTMLElement) => {
            const rect = element.getBoundingClientRect();
            const viewportHeight = Math.max(1, window.innerHeight, window.visualViewport?.height ?? 0);
            const viewportWidth = Math.max(1, window.innerWidth, window.visualViewport?.width ?? 0);
            return rect.top < viewportHeight && rect.right > 0 && rect.left < viewportWidth;
        };
        const isHidden = (element: HTMLElement) => {
            const style = window.getComputedStyle(element);
            return style.visibility === "hidden" || Number.parseFloat(style.opacity || "1") <= 0.01;
        };
        const revealStuckElements = () => {
            watchdogFrame = 0;
            const stuckElements = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal-managed="true"]:not([data-reveal-complete="true"])'))
                .filter((element) => isAtOrAboveViewport(element) && isHidden(element));
            const stuckTriggers = new Set(stuckElements.map((element) => element.closest<HTMLElement>('[data-reveal-trigger="true"]'))
                .filter((element): element is HTMLElement => Boolean(element)));
            stuckTriggers.forEach((triggerElement) => {
                const candidates = [
                    ...(triggerElement.matches('[data-reveal-managed="true"]:not([data-reveal-complete="true"])') ? [triggerElement] : []),
                    ...Array.from(triggerElement.querySelectorAll<HTMLElement>('[data-reveal-managed="true"]:not([data-reveal-complete="true"])')),
                ];
                const hiddenTargets = candidates.filter(isHidden);
                if (hiddenTargets.length === 0)
                    return;
                ScrollTrigger.getAll().forEach((trigger) => {
                    if (trigger.trigger === triggerElement)
                        trigger.kill(false);
                });
                gsap.killTweensOf(hiddenTargets);
                gsap.set(hiddenTargets, { y: 0, autoAlpha: 1, overwrite: true });
                hiddenTargets.forEach((element) => {
                    element.dataset.revealComplete = "true";
                });
            });
        };
        const scheduleWatchdog = () => {
            if (watchdogFrame)
                return;
            watchdogFrame = window.requestAnimationFrame(() => {
                watchdogFrame = window.requestAnimationFrame(revealStuckElements);
            });
        };
        const scheduleScrollIdleWatchdog = () => {
            window.clearTimeout(scrollIdleTimer);
            scrollIdleTimer = window.setTimeout(scheduleWatchdog, 900);
        };
        watchdogTimer = window.setTimeout(scheduleWatchdog, 3000);
        const unregisterRevealWatchdogObserver = registerMotionInputObserver("reveal-watchdog", ({ kind }) => {
            if (kind === "scroll")
                scheduleScrollIdleWatchdog();
        });
        window.addEventListener("tasc:scroll-position-applied", scheduleWatchdog);
        return () => {
            window.clearTimeout(watchdogTimer);
            window.clearTimeout(scrollIdleTimer);
            if (watchdogFrame)
                window.cancelAnimationFrame(watchdogFrame);
            unregisterRevealWatchdogObserver();
            window.removeEventListener("tasc:scroll-position-applied", scheduleWatchdog);
        };
    }, [motionAllowed, preloaderComplete]);
    useReversibleScrollStories({
        rootRef,
        dominoVideoRef,
        transportKey: "how-authored-v1",
        enabled: preloaderRevealStarted && motionAllowed,
        story: "how",
    });
    useReversibleScrollStories({
        rootRef,
        dominoVideoRef,
        transportKey: dominoTransportKey,
        enabled: preloaderRevealStarted && motionAllowed,
        story: "domino",
    });
    useEffect(() => {
        if (!preloaderComplete || initialHashHandledRef.current) {
            return;
        }
        const hash = window.location.hash;
        const supportedAnchors = new Set([
            "#clients",
            "#services",
            "#work",
            "#datum",
            "#brief",
            "#process",
            "#contact",
        ]);
        if (!supportedAnchors.has(hash)) {
            initialHashHandledRef.current = true;
            return;
        }
        let layoutFrame = 0;
        let navigationFrame = 0;
        layoutFrame = window.requestAnimationFrame(() => {
            navigationFrame = window.requestAnimationFrame(() => {
                initialHashHandledRef.current = true;
                const currentHash = window.location.hash;
                if (supportedAnchors.has(currentHash))
                    handleAnchorNavigate(currentHash, { replaceHistory: false });
            });
        });
        return () => {
            window.cancelAnimationFrame(layoutFrame);
            window.cancelAnimationFrame(navigationFrame);
        };
    }, [handleAnchorNavigate, motionAllowed, preloaderComplete]);
    useEffect(() => {
        if (!preloaderComplete) {
            return;
        }
        let navigationFrame = 0;
        const isSupportedHash = (hash: string) => hash === "#top" || VISION_LOGO_DEEP_LINKS.has(hash);
        const navigateFromHistory = () => {
            const hash = window.location.hash || "#top";
            if (!isSupportedHash(hash)) {
                return;
            }
            window.cancelAnimationFrame(navigationFrame);
            navigationFrame = window.requestAnimationFrame(() => {
                handleAnchorNavigate(hash, { replaceHistory: false });
            });
        };
        const handlePopState = () => {
            const hash = window.location.hash || "#top";
            if (!isSupportedHash(hash)) {
                return;
            }
            navigateFromHistory();
        };
        window.addEventListener("popstate", handlePopState);
        window.addEventListener("hashchange", navigateFromHistory);
        return () => {
            window.cancelAnimationFrame(navigationFrame);
            window.removeEventListener("popstate", handlePopState);
            window.removeEventListener("hashchange", navigateFromHistory);
        };
    }, [handleAnchorNavigate, motionAllowed, preloaderComplete]);
    /*
      The Datum media used to be a fixed 147% wide plate whose top was cropped by a
      hard-coded clip-path when the screen ran short. On phones the crop ate the
      composition and read as the cards covering the video. Measure what is actually
      free under the card stack and publish it, so the media can size itself to the
      gap instead of being cut.
    */
    useEffect(() => {
        const root = rootRef.current;
        if (!root || !preloaderComplete)
            return;
        const section = root.querySelector<HTMLElement>(".datum-motion-section");
        const cards = root.querySelector<HTMLElement>(".datum-motion-state-cards");
        if (!section || !cards)
            return;
        const compactQuery = window.matchMedia("(max-width: 900px)");
        let frame = 0;
        const publish = () => {
            frame = 0;
            if (!compactQuery.matches) {
                section.style.removeProperty("--datum-media-space");
                return;
            }
            const viewportHeight = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
            const cardsBottom = cards.getBoundingClientRect().bottom - section.getBoundingClientRect().top;
            const space = Math.max(0, Math.round(viewportHeight - cardsBottom - 10));
            section.style.setProperty("--datum-media-space", `${space}px`);
        };
        const schedule = () => {
            if (frame)
                return;
            frame = window.requestAnimationFrame(publish);
        };
        const observer = new ResizeObserver(schedule);
        observer.observe(cards);
        observer.observe(section);
        window.addEventListener("resize", schedule, { passive: true });
        window.visualViewport?.addEventListener("resize", schedule);
        compactQuery.addEventListener("change", schedule);
        schedule();
        return () => {
            observer.disconnect();
            if (frame)
                window.cancelAnimationFrame(frame);
            window.removeEventListener("resize", schedule);
            window.visualViewport?.removeEventListener("resize", schedule);
            compactQuery.removeEventListener("change", schedule);
            section.style.removeProperty("--datum-media-space");
        };
    }, [preloaderComplete]);
    return (<main ref={rootRef} suppressHydrationWarning className={`site-shell ${preloaderComplete ? "site-preloader-complete" : ""} ${heroIntroReady ? "hero-intro-ready" : ""}`} data-js-runtime={motionPreferenceResolved ? "true" : undefined} data-hero-starfield="react-bits-galaxy" data-starfield-mode={!performanceModeResolved || (motionAllowed && galaxyMounted && galaxyStatus === "pending")
            ? "pending"
            : motionAllowed && galaxyMounted && galaxyStatus === "ready"
                ? "galaxy"
                : "static"} data-galaxy-mounted={galaxyMounted ? "true" : "false"} data-hero-video={motionAllowed ? heroVideoState : "fallback"} data-services-galaxy-status={servicesGalaxyStatus} data-services-galaxy-shared="true" data-packed-alpha-owner={packedAlphaOwner} data-services-media-fallback={servicesMediaFallback ? "true" : undefined} data-lower-media-outcome={!motionAllowed
            ? "skipped"
            : lowerMediaHasFallback && lowerMediaSettled
                ? "fallback"
                : lowerMediaPrepared
                    ? "prepared"
                    : "pending"} data-services-media-prepared={servicesMediaPrepared ? "true" : undefined} data-datum-media-armed={datumMediaArmed ? "true" : undefined} data-datum-media-prepared={datumMediaPrepared ? "true" : undefined} data-datum-media-fallback={datumMediaFallback ? "true" : undefined} data-domino-media-prepared={dominoForwardPrepared ? "true" : undefined} data-domino-media-fallback={dominoForwardFallback ? "true" : undefined} data-domino-reverse-media-prepared={dominoReversePrepared ? "true" : undefined} data-domino-reverse-media-fallback={dominoReverseFallback ? "true" : undefined} data-hero-surface-ready={preloaderReady || preloaderRevealStarted ? "true" : undefined} data-mobile-performance={mobilePerformanceMode ? "true" : undefined} data-mac-performance={macPerformanceMode ? "true" : undefined} data-webkit-compatibility={webkitCompatibilityMode ? "true" : undefined} data-services-media={servicesPackedTransportMode ? "packed-alpha-video" : "native-alpha-video"} data-vision-logo-armed={visionLogoArmed ? "true" : undefined} data-galaxy-visibility-root>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      {!preloaderComplete ? (<SitePreloader ready={preloaderReady} onRevealStart={() => {
                if (!window.location.hash)
                    resetToTop();
                motionRuntimeGateRef.current.revealStarted = true;
                setPreloaderRevealStarted(true);
                setHeroIntroReady(true);
                window.dispatchEvent(new Event("tasc:motion-runtime-request"));
            }} onComplete={() => {
                setPreloaderComplete(true);
            }}/>) : null}
      <TascHeader onNavigate={handleAnchorNavigate}/>
      {preloaderComplete ? <CookieConsent /> : null}
      <div className="first-four-galaxy-stage" aria-hidden="true">
        <span className="static-starfield-fallback"/>
        {galaxyMounted ? (<>
            <Galaxy {...GALAXY_SHARED_PROPS} ref={primaryGalaxyRef} className="first-four-galaxy first-four-galaxy-primary" data-galaxy-layer="primary" density={mobilePerformanceMode || webkitCompatibilityMode ? 1.05 : 1.3} starSpeed={mobilePerformanceMode || webkitCompatibilityMode ? 0.86 : 1.08} speed={mobilePerformanceMode || webkitCompatibilityMode ? 1.08 : 1.44} rotationSpeed={mobilePerformanceMode || webkitCompatibilityMode ? 0.1 : 0.15} autoCenterRepulsion={mobilePerformanceMode || webkitCompatibilityMode ? 12 : 20} mouseInteraction={false} visibilityTargetSelector={PRIMARY_GALAXY_VISIBILITY_TARGETS} onStatusChange={setGalaxyStatus} maxDevicePixelRatio={webkitCompatibilityMode
                ? mobilePerformanceMode
                    ? 0.9
                    : 0.86
                : macPerformanceMode
                    ? 0.82
                    : mobilePerformanceMode
                        ? 1
                        : 1} maxFps={mobilePerformanceMode || webkitCompatibilityMode || macPerformanceMode ? 30 : 60}/>
            {interactiveGalaxyEnabled && !webkitCompatibilityMode && !macPerformanceMode ? (<Galaxy {...GALAXY_SHARED_PROPS} ref={interactiveGalaxyRef} className="first-four-galaxy-interactive" data-galaxy-layer="interactive" density={0.5} glowIntensity={0.14} starSpeed={0.6} speed={0.6} autoCenterRepulsion={0} mouseInteraction trackBoundsOnScroll={false} visibilityTargetSelector={INTERACTIVE_GALAXY_VISIBILITY_TARGETS} maxDevicePixelRatio={webkitCompatibilityMode ? 0.3 : macPerformanceMode ? 0.36 : 0.5} maxFps={webkitCompatibilityMode ? 16 : macPerformanceMode ? 18 : 24}/>) : null}
            {interactiveGalaxyEnabled && (webkitCompatibilityMode || macPerformanceMode) ? (<span className="first-four-star-parallax" data-star-layer="interactive-compositor"/>) : null}
          </>) : null}
      </div>
      <div className="vision-clients-flare-stage" aria-hidden="true">
        <div className="clients-scroll-element-wrap">
          <picture className="clients-scroll-element-picture">
            <source media="(max-width: 900px)" type="image/webp" srcSet={clientsFlareArmed ? "/media/clients-flare-white-diagonal-2304x1296-20260801.webp" : undefined}/>
            <Image className="clients-scroll-element" src={clientsFlareArmed ? "/media/clients-flare-white-diagonal-4096x2304-20260801.webp" : CLIENTS_FLARE_PLACEHOLDER} data-design-source="/media/clients-flare-white-diagonal-20260716.svg" alt="" width={4096} height={2304} sizes="180vw" loading={clientsFlareArmed ? "eager" : "lazy"} fetchPriority={clientsFlareArmed ? "high" : "low"} unoptimized/>
          </picture>
        </div>
      </div>
      <div className="first-four-story" data-galaxy-visibility-root>
        <div className="first-four-gradient-field" aria-hidden="true">
          <span className="first-two-transition-art"/>
        </div>

        <HeroSection
          heroFallbackAnimationEligible={heroFallbackAnimationEligible}
          heroFallbackAnimationReady={heroFallbackAnimationReady}
          heroVideoEligible={heroVideoEligible}
          heroVideoState={heroVideoState}
          lightweightMediaMode={lightweightMediaMode}
          mobilePerformanceMode={mobilePerformanceMode}
          motionAllowed={motionAllowed}
          onHeroFallbackAnimationEligibleChange={setHeroFallbackAnimationEligible}
          onHeroFallbackAnimationReadyChange={setHeroFallbackAnimationReady}
          onNavigate={handleAnchorNavigate}
          packedAlphaOwner={packedAlphaOwner}
          visionLogoArmed={visionLogoArmed}
        />

        <ClientsSection onNavigate={handleAnchorNavigate}/>

        <ServicesSection
          activateServicesMediaFallback={activateServicesMediaFallback}
          lightweightMediaMode={lightweightMediaMode}
          motionAllowed={motionAllowed}
          onNavigate={handleAnchorNavigate}
          onNativeLoadedMetadata={() => {
            rootRef.current?.setAttribute("data-services-video-format", "native-alpha-webm");
          }}
          onPackedLoadedMetadata={() => {
            rootRef.current?.setAttribute("data-services-video-format", "packed-alpha-h264");
          }}
          onServicesFrameReady={() => {
            rootRef.current?.setAttribute("data-services-start-frame-decoded", "true");
            recoverServicesMedia();
          }}
          packedAlphaOwner={packedAlphaOwner}
          recoverServicesMedia={recoverServicesMedia}
          servicesMediaArmed={servicesMediaArmed}
          servicesPackedTransportMode={servicesPackedTransportMode}
          servicesStopPostersArmed={servicesStopPostersArmed}
          servicesTransportKey={servicesTransportKey}
          servicesVideoRef={servicesVideoRef}
          servicesVideoSource={servicesVideoSource}
        />
      </div>

      <HowWeWorkSection />

      <DatumSection
        datumLead={datumLead}
        datumMediaArmed={datumMediaArmed}
        datumVideoRef={datumVideoRef}
        datumVideoSource={datumVideoSource}
        lightweightMediaMode={lightweightMediaMode}
        motionAllowed={motionAllowed}
        onMediaFallbackChange={setDatumMediaFallback}
        onMediaPreparedChange={setDatumMediaPrepared}
        webkitCompatibilityMode={webkitCompatibilityMode}
      />

      <ProcessSection/>

      <DominoSection
        dominoLead={dominoLead}
        dominoMediaArmed={dominoMediaArmed}
        dominoReverseMediaArmed={dominoReverseMediaArmed}
        dominoReverseVideoRef={dominoReverseVideoRef}
        dominoTransportKey={dominoTransportKey}
        dominoVideoRef={dominoVideoRef}
        lightweightMediaMode={lightweightMediaMode}
        motionAllowed={motionAllowed}
        onForwardFallbackChange={setDominoForwardFallback}
        onForwardPreparedChange={setDominoForwardPrepared}
        onReverseFallbackChange={setDominoReverseFallback}
        onReversePreparedChange={setDominoReversePrepared}
        reportDominoSourceError={reportDominoSourceError}
        webkitCompatibilityMode={webkitCompatibilityMode}
      />

      <SiteFooter onNavigate={handleAnchorNavigate}/>
    </main>);
}
