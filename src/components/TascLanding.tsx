"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { ArrowRight } from "lucide-react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import CookieConsent from "@/components/CookieConsent";
import { GlassCta } from "@/components/GlassCta";
import { ClientsSection } from "@/components/sections/ClientsSection";
import { HowWeWorkSection } from "@/components/sections/HowWeWorkSection";
import { ProcessSection } from "@/components/sections/ProcessSection";
import { SiteFooter } from "@/components/sections/SiteFooter";
import SitePreloader from "@/components/SitePreloader";
import PackedAlphaVideo from "@/components/PackedAlphaVideo";
import { ServiceTextLines } from "@/components/ServiceTextLines";
import TascHeader from "@/components/TascHeader";
import VisibilityTriggeredVideo from "@/components/VisibilityTriggeredVideo";
import { useMobilePortionedScroll } from "@/hooks/useMobilePortionedScroll";
import { useReversibleScrollStories } from "@/hooks/useReversibleScrollStories";
import type { GalaxyHandle } from "@/components/Galaxy";
import { useLeadSubmission } from "@/hooks/useLeadSubmission";
import { datumCardsCopy, datumWaitlistCopy, figmaHeroCopy, figmaMissionCopy, figmaMissionLines, finalImpulseCopy, journeyCtaLabel, secondRevealCopy, servicesStoryCopy, } from "@/data/landing-content";
import { DOMINO_DURATION, RUNTIME_MEDIA, SERVICES_EXIT_STOP, SERVICES_KEYFRAME_STOPS, SERVICES_REVERSE_KEYFRAME_STOPS, } from "@/data/runtime-media";
import { CONTENT_REVEAL_LAG, revealTime } from "@/lib/tasc-motion-timings";
import { isMediaBufferedThrough } from "@/lib/media-buffer";
import { getVisualViewportHeight } from "@/lib/visibility";
import type { HeroVideoState, LensPose, MotionNavigationController, } from "@/types/landing";
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
const PRIMARY_GALAXY_VISIBILITY_TARGETS = ".hero-motion, .figma-clients-section, .how-work-motion-section";
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
const SERVICES_INPUT_QUIET_MS = 140;
const SERVICES_ENTRY_GATE_MS = 120;
const SERVICES_POST_STAGE_GATE_MS = 150;
const SERVICES_REVERSE_SEEK_FPS = 15;
const MEDIA_SEGMENT_GRACE_MS = 700;
const DOMINO_TIMELINE_GRACE_MS = 460;
const DOMINO_PLAYBACK_RATE = 1.25;
const SERVICES_FIRST_SEGMENT_BUFFER_END = SERVICES_KEYFRAME_STOPS[0] + 2 / 30;
const SERVICES_COMPLETE_STORY_BUFFER_END = Math.max(SERVICES_EXIT_STOP, SERVICES_REVERSE_KEYFRAME_STOPS[0]) + 1 / 60;
const ensurePreloadAuto = (video: HTMLVideoElement | null) => {
    if (!video || video.preload === "auto" || video.dataset.armed !== "true")
        return;
    video.preload = "auto";
};
export function TascLanding() {
    const rootRef = useRef<HTMLElement | null>(null);
    const primaryGalaxyRef = useRef<GalaxyHandle | null>(null);
    const interactiveGalaxyRef = useRef<GalaxyHandle | null>(null);
    const dominoVideoRef = useRef<HTMLVideoElement | null>(null);
    const dominoReverseVideoRef = useRef<HTMLVideoElement | null>(null);
    const servicesVideoRef = useRef<HTMLVideoElement | null>(null);
    const servicesWarmupClaimRef = useRef<(() => void) | null>(null);
    const datumVideoRef = useRef<HTMLVideoElement | null>(null);
    const lenisRef = useRef<Lenis | null>(null);
    const heroTimelineRef = useRef<gsap.core.Timeline | null>(null);
    const servicesControllerRef = useRef<MotionNavigationController | null>(null);
    const dominoControllerRef = useRef<MotionNavigationController | null>(null);
    const programmaticNavigationRef = useRef(false);
    const programmaticAnchorRef = useRef<string | null>(null);
    const anchorSettleCleanupRef = useRef<(() => void) | null>(null);
    const initialHashHandledRef = useRef(false);
    const [motionAllowed, setMotionAllowed] = useState(false);
    const [motionPreferenceResolved, setMotionPreferenceResolved] = useState(false);
    const [performanceModeResolved, setPerformanceModeResolved] = useState(false);
    const [galaxyStatus, setGalaxyStatus] = useState<"pending" | "ready" | "unavailable">("pending");
    const [servicesGalaxyStatus, setServicesGalaxyStatus] = useState<"pending" | "ready" | "unavailable">("pending");
    const [mobilePerformanceMode, setMobilePerformanceMode] = useState(false);
    const [macPerformanceMode, setMacPerformanceMode] = useState(false);
    const [webkitCompatibilityMode, setWebkitCompatibilityMode] = useState(false);
    const [edgeAlphaCompatibilityMode, setEdgeAlphaCompatibilityMode] = useState(false);
    const [packedH264Supported, setPackedH264Supported] = useState(true);
    const [constrainedConnection, setConstrainedConnection] = useState(false);
    const [servicesMediaArmed, setServicesMediaArmed] = useState(false);
    const [servicesStopPostersArmed, setServicesStopPostersArmed] = useState(false);
    const [servicesMediaFallback, setServicesMediaFallback] = useState(false);
    const [datumMediaArmed, setDatumMediaArmed] = useState(false);
    const [dominoMediaArmed, setDominoMediaArmed] = useState(false);
    const [dominoReverseMediaArmed, setDominoReverseMediaArmed] = useState(false);
    const [servicesMediaPrepared, setServicesMediaPrepared] = useState(false);
    const [, setServicesCompleteStoryPrepared] = useState(false);
    const [datumMediaPrepared, setDatumMediaPrepared] = useState(false);
    const [datumMediaFallback, setDatumMediaFallback] = useState(false);
    const [dominoForwardPrepared, setDominoForwardPrepared] = useState(false);
    const [dominoReversePrepared, setDominoReversePrepared] = useState(false);
    const [dominoForwardFallback, setDominoForwardFallback] = useState(false);
    const [dominoReverseFallback, setDominoReverseFallback] = useState(false);
    const [lowerMediaWarmDeadlineReached, setLowerMediaWarmDeadlineReached] = useState(false);
    const [processMapArmed, setProcessMapArmed] = useState(false);
    const [visionLogoArmed, setVisionLogoArmed] = useState(false);
    const [preloaderComplete, setPreloaderComplete] = useState(false);
    const [preloaderRevealStarted, setPreloaderRevealStarted] = useState(false);
    const [criticalStaticAssetsReady, setCriticalStaticAssetsReady] = useState(false);
    const [heroIntroReady, setHeroIntroReady] = useState(false);
    const [interactiveGalaxyArmed, setInteractiveGalaxyArmed] = useState(false);
    const [heroVideoState, setHeroVideoState] = useState<HeroVideoState>("pending");
    const [heroVideoEligible, setHeroVideoEligible] = useState(false);
    const [heroFallbackAnimationEligible, setHeroFallbackAnimationEligible] = useState(false);
    const [heroFallbackAnimationReady, setHeroFallbackAnimationReady] = useState(false);
    const [dominoEmail, setDominoEmail] = useState("");
    const datumLead = useLeadSubmission("datum_waitlist");
    const dominoLead = useLeadSubmission("project_brief");
    const isDominoEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dominoEmail.trim());
    const packedAlphaCompatibilityMode = webkitCompatibilityMode || edgeAlphaCompatibilityMode;
    const lightweightMediaMode = mobilePerformanceMode || constrainedConnection;
    const servicesPackedTransportMode = packedH264Supported;
    const servicesVideoSource = servicesPackedTransportMode
        ? lightweightMediaMode
            ? SERVICES_VIDEO_MOBILE_PACKED_MP4
            : SERVICES_VIDEO_PACKED_MP4
        : lightweightMediaMode || !packedH264Supported
            ? SERVICES_VIDEO_MOBILE_WEBM
            : SERVICES_VIDEO_WEBM;
    const activateServicesMediaFallback = useCallback(() => {
        const root = rootRef.current;
        const video = servicesVideoRef.current;
        const activeStage = Math.min(SERVICES_KEYFRAME_STOPS.length, Math.max(1, Number(root?.dataset.servicesActive ?? 1) || 1));
        video?.pause();
        setServicesStopPostersArmed(true);
        if (video)
            video.dataset.segmentState = "fallback";
        if (root) {
            delete root.dataset.servicesMediaDecoded;
            root.dataset.servicesMediaFallback = "true";
            root.dataset.servicesStaticStop = String(activeStage);
        }
        setServicesMediaFallback(true);
    }, []);
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
        setServicesMediaPrepared(true);
        if (isMediaBufferedThrough(video, SERVICES_COMPLETE_STORY_BUFFER_END)) {
            root.dataset.servicesCompleteStoryWarm = "true";
            setServicesCompleteStoryPrepared(true);
        }
        setServicesMediaFallback(false);
    }, []);
    const armDominoReverseMedia = useCallback(() => {
        rootRef.current?.setAttribute("data-domino-reverse-media-armed", "true");
        setDominoReverseMediaArmed(true);
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
    const heroDecoderLaneReleased = heroVisualReady;
    const lowerMediaPrepared = servicesMediaPrepared &&
        datumMediaPrepared &&
        dominoForwardPrepared;
    const lowerMediaHasFallback = servicesMediaFallback ||
        datumMediaFallback ||
        dominoForwardFallback;
    const lowerMediaSettled = (servicesMediaPrepared || servicesMediaFallback) &&
        (datumMediaPrepared || datumMediaFallback) &&
        (dominoForwardPrepared || dominoForwardFallback);
    const servicesWarmSettled = servicesMediaPrepared || servicesMediaFallback;
    const servicesPriorityWarmSettled = servicesMediaPrepared || servicesMediaFallback;
    const deferredMediaSettled = (datumMediaPrepared || datumMediaFallback) &&
        (dominoForwardPrepared || dominoForwardFallback);
    const lowerMediaWarmReady = !motionAllowed ||
        (servicesPriorityWarmSettled && (lowerMediaWarmDeadlineReached || deferredMediaSettled));
    const preloaderReady = motionPreferenceResolved &&
        performanceModeResolved &&
        criticalStaticAssetsReady &&
        heroVisualReady;
    const interactiveGalaxyEnabled = interactiveGalaxyArmed &&
        motionAllowed &&
        performanceModeResolved &&
        preloaderComplete &&
        !mobilePerformanceMode;
    useEffect(() => {
        if (!motionPreferenceResolved || motionAllowed)
            return;
        const armFrame = window.requestAnimationFrame(() => setVisionLogoArmed(true));
        return () => window.cancelAnimationFrame(armFrame);
    }, [motionAllowed, motionPreferenceResolved]);
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
            ScrollTrigger.config({ ignoreMobileResize: true, limitCallbacks: true });
            setMotionAllowed(!media.matches);
            setMotionPreferenceResolved(true);
        };
        syncMotionPreference();
        media.addEventListener("change", syncMotionPreference);
        return () => media.removeEventListener("change", syncMotionPreference);
    }, []);
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
        const media = window.matchMedia("(max-width: 900px), (pointer: coarse)");
        const syncPerformanceMode = () => {
            const device = navigator as Navigator & {
                connection?: {
                    downlink?: number;
                    effectiveType?: string;
                    saveData?: boolean;
                };
                deviceMemory?: number;
            };
            const lowMemory = typeof device.deviceMemory === "number" && device.deviceMemory <= 4;
            const lowCpu = typeof device.hardwareConcurrency === "number" && device.hardwareConcurrency <= 4;
            const userAgent = navigator.userAgent;
            const codecProbe = document.createElement("video");
            const supportsPackedH264 = codecProbe.canPlayType('video/mp4; codecs="avc1.4D401F"') !== "";
            const isEdge = /\bEdg(?:A|iOS)?\//i.test(userAgent);
            const isSafari = /^((?!chrome|android|crios|fxios|edg|opr).)*safari/i.test(userAgent);
            const isIOS = /iPad|iPhone|iPod/i.test(userAgent) ||
                (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
            const isAppleWebView = /AppleWebKit/i.test(userAgent) &&
                !/(Safari|Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android)/i.test(userAgent);
            const forceWebKitCompatibility = new URLSearchParams(window.location.search).get("webkitCompat") === "1";
            const isAppleWebKit = document.documentElement.dataset.tascWebkit === "true" ||
                forceWebKitCompatibility ||
                isSafari ||
                isIOS ||
                isAppleWebView;
            const isMacOS = document.documentElement.dataset.tascMacos === "true" ||
                /Macintosh|Mac OS X/i.test(userAgent) ||
                /^Mac/i.test(navigator.platform || "") ||
                isIOS;
            setWebkitCompatibilityMode(isAppleWebKit);
            setEdgeAlphaCompatibilityMode(isEdge);
            setPackedH264Supported(supportsPackedH264);
            setMacPerformanceMode(isMacOS);
            setConstrainedConnection(Boolean(device.connection?.saveData) ||
                device.connection?.effectiveType === "slow-2g" ||
                device.connection?.effectiveType === "2g" ||
                device.connection?.effectiveType === "3g" ||
                (typeof device.connection?.downlink === "number" && device.connection.downlink <= 1.5));
            setMobilePerformanceMode(media.matches ||
                (!isMacOS && (lowMemory || lowCpu)) ||
                Boolean(device.connection?.saveData));
            setPerformanceModeResolved(true);
        };
        syncPerformanceMode();
        media.addEventListener("change", syncPerformanceMode);
        return () => media.removeEventListener("change", syncPerformanceMode);
    }, []);
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
            setInteractiveGalaxyArmed(true);
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
        const supportsVp9WebM = document
            .createElement("video")
            .canPlayType('video/webm; codecs="vp9"') !== "";
        const needsAnimatedFallback = isSafari || isIOS || isAppleWebView || isEdge || !supportsVp9WebM;
        const useStaticHero = new URLSearchParams(window.location.search).get("staticHero") === "1";
        root?.setAttribute("data-services-video-composite", needsAnimatedFallback ? "packed-alpha" : "alpha");
        root?.setAttribute("data-hero-video-composite", "alpha");
        root?.setAttribute("data-hero-video-format", useStaticHero ? "static-poster" : needsAnimatedFallback ? "h264-mask-webgl" : "alpha-webm");
        if (!motionPreferenceResolved) {
            return;
        }
        if (!motionAllowed) {
            root?.removeAttribute("data-hero-video-poster-fallback");
            const stateFrame = window.requestAnimationFrame(() => {
                setHeroVideoEligible(false);
                setHeroFallbackAnimationEligible(false);
                setHeroFallbackAnimationReady(false);
                setHeroVideoState("fallback");
            });
            return () => {
                window.cancelAnimationFrame(stateFrame);
            };
        }
        const stateFrame = window.requestAnimationFrame(() => {
            setHeroFallbackAnimationReady(false);
            if (useStaticHero) {
                root?.setAttribute("data-hero-video-poster-fallback", "true");
                setHeroFallbackAnimationEligible(false);
                setHeroVideoState("fallback");
                setHeroVideoEligible(false);
            }
            else if (needsAnimatedFallback) {
                root?.setAttribute("data-hero-video-poster-fallback", "true");
                setHeroFallbackAnimationEligible(true);
                setHeroVideoState("fallback");
                setHeroVideoEligible(false);
            }
            else {
                root?.removeAttribute("data-hero-video-poster-fallback");
                setHeroFallbackAnimationEligible(false);
                setHeroVideoState("pending");
                setHeroVideoEligible(true);
            }
        });
        return () => window.cancelAnimationFrame(stateFrame);
    }, [constrainedConnection, motionAllowed, motionPreferenceResolved]);
    useEffect(() => {
        const root = rootRef.current;
        const video = servicesVideoRef.current;
        root?.setAttribute("data-services-video-composite", servicesPackedTransportMode ? "packed-alpha" : "alpha");
        root?.setAttribute("data-services-video-format", servicesPackedTransportMode ? "packed-alpha-h264" : "alpha-webm");
        if (video)
            video.dataset.armed = servicesMediaArmed ? "true" : "false";
        if (!motionAllowed || !servicesMediaArmed || !video)
            return;
        video.dataset.segmentState = "idle";
        if (video.networkState === HTMLMediaElement.NETWORK_EMPTY)
            video.load();
    }, [motionAllowed, servicesMediaArmed, servicesPackedTransportMode, servicesVideoSource]);
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
        let playPending = false;
        const cleanup = () => {
            media.removeEventListener("loadeddata", markDecodedStart);
            media.removeEventListener("canplay", inspectWarmState);
            media.removeEventListener("canplay", startWarmPlayback);
            media.removeEventListener("playing", markDecodedStart);
            media.removeEventListener("progress", inspectWarmState);
            media.removeEventListener("timeupdate", inspectWarmState);
            media.removeEventListener("waiting", startWarmPlayback);
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
                        media.currentTime = 0;
                    }
                    catch {
                    }
                }
                media.dataset.segmentState = "ready";
            }
            shell.dataset.servicesCompleteStoryWarm = "true";
            setServicesCompleteStoryPrepared(true);
        };
        const completeFirstSegmentWarmup = () => {
            if (firstSegmentSettled || disposed)
                return;
            firstSegmentSettled = true;
            if (!interactiveClaimed) {
                media.pause();
                media.playbackRate = 1;
                try {
                    media.currentTime = 0.001;
                }
                catch {
                }
                media.dataset.segmentState = "ready";
            }
            shell.dataset.servicesFirstSegmentWarm = "true";
            delete shell.dataset.servicesWarmupBlocked;
            setServicesMediaPrepared(true);
            setServicesMediaFallback(false);
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
        async function startWarmPlayback() {
            if (!webkitCompatibilityMode ||
                disposed ||
                completeStorySettled ||
                firstSegmentSettled ||
                interactiveClaimed ||
                playPending ||
                document.hidden ||
                media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                return;
            }
            playPending = true;
            media.muted = true;
            media.playsInline = true;
            try {
                await media.play();
                if (!disposed && !completeStorySettled && !interactiveClaimed) {
                    delete shell.dataset.servicesWarmupBlocked;
                    markDecodedStart();
                }
            }
            catch {
                if (!disposed && !completeStorySettled && !interactiveClaimed) {
                    shell.dataset.servicesWarmupBlocked = "true";
                }
            }
            finally {
                playPending = false;
            }
        }
        media.addEventListener("loadeddata", markDecodedStart);
        media.addEventListener("canplay", inspectWarmState);
        media.addEventListener("playing", markDecodedStart);
        media.addEventListener("progress", inspectWarmState);
        media.addEventListener("timeupdate", inspectWarmState);
        if (webkitCompatibilityMode) {
            media.addEventListener("canplay", startWarmPlayback);
            media.addEventListener("waiting", startWarmPlayback);
        }
        const claimInteractiveOwnership = () => {
            if (disposed || interactiveClaimed)
                return;
            interactiveClaimed = true;
            media.removeEventListener("canplay", startWarmPlayback);
            media.removeEventListener("waiting", startWarmPlayback);
            media.pause();
            delete shell.dataset.servicesWarmupBlocked;
            shell.dataset.servicesWarmupOwner = "interactive";
        };
        servicesWarmupClaimRef.current = claimInteractiveOwnership;
        if (media.networkState === HTMLMediaElement.NETWORK_EMPTY)
            media.load();
        inspectWarmState();
        if (webkitCompatibilityMode)
            void startWarmPlayback();
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
        webkitCompatibilityMode,
    ]);
    useEffect(() => {
        const resetFrame = window.requestAnimationFrame(() => {
            delete rootRef.current?.dataset.servicesStartFrameDecoded;
            delete rootRef.current?.dataset.servicesFirstSegmentWarm;
            delete rootRef.current?.dataset.servicesCompleteStoryWarm;
            delete rootRef.current?.dataset.servicesWarmupBlocked;
            setServicesMediaPrepared(false);
            setServicesCompleteStoryPrepared(false);
            setServicesMediaFallback(false);
            setLowerMediaWarmDeadlineReached(false);
        });
        return () => window.cancelAnimationFrame(resetFrame);
    }, [servicesVideoSource]);
    useEffect(() => {
        const resetFrame = window.requestAnimationFrame(() => {
            setDatumMediaPrepared(false);
            setDatumMediaFallback(false);
        });
        return () => window.cancelAnimationFrame(resetFrame);
    }, [datumVideoSource]);
    useEffect(() => {
        const resetFrame = window.requestAnimationFrame(() => {
            setDominoForwardPrepared(false);
            setDominoReversePrepared(false);
            setDominoForwardFallback(false);
            setDominoReverseFallback(false);
        });
        return () => window.cancelAnimationFrame(resetFrame);
    }, [dominoTransportKey]);
    useEffect(() => {
        if (!motionPreferenceResolved || !performanceModeResolved)
            return;
        if (!motionAllowed)
            return;
        if (!heroDecoderLaneReleased || !servicesWarmSettled)
            return;
        const warmDeadline = window.setTimeout(() => setLowerMediaWarmDeadlineReached(true), constrainedConnection ? (mobilePerformanceMode ? 9000 : 7000) : mobilePerformanceMode ? 6000 : 4500);
        return () => window.clearTimeout(warmDeadline);
    }, [
        constrainedConnection,
        heroDecoderLaneReleased,
        mobilePerformanceMode,
        motionAllowed,
        motionPreferenceResolved,
        performanceModeResolved,
        servicesWarmSettled,
    ]);
    useEffect(() => {
        if (!motionPreferenceResolved || !performanceModeResolved)
            return;
        const armDeepLinkedMedia = () => {
            const hash = window.location.hash;
            if (VISION_LOGO_DEEP_LINKS.has(hash))
                setVisionLogoArmed(true);
            if (hash === "#services") {
                setServicesMediaArmed(true);
                setServicesStopPostersArmed(true);
            }
            if (hash === "#datum" || hash === "#brief") {
                setDatumMediaArmed(true);
                setDominoMediaArmed(true);
            }
            if (hash === "#process" || hash === "#contact") {
                setDatumMediaArmed(true);
                setDominoMediaArmed(true);
                setProcessMapArmed(true);
            }
        };
        armDeepLinkedMedia();
        window.addEventListener("hashchange", armDeepLinkedMedia);
        return () => window.removeEventListener("hashchange", armDeepLinkedMedia);
    }, [motionPreferenceResolved, performanceModeResolved]);
    useEffect(() => {
        if (!motionPreferenceResolved || !preloaderComplete)
            return;
        const root = rootRef.current;
        if (!root)
            return;
        const armFromHash = () => {
            if (VISION_LOGO_DEEP_LINKS.has(window.location.hash))
                setVisionLogoArmed(true);
            if (window.location.hash === "#services") {
                setServicesMediaArmed(true);
                setServicesStopPostersArmed(true);
            }
            if (window.location.hash === "#datum")
                setDatumMediaArmed(true);
            if (window.location.hash === "#brief")
                setDominoMediaArmed(true);
            if (window.location.hash === "#process" || window.location.hash === "#contact") {
                setProcessMapArmed(true);
            }
        };
        armFromHash();
        const targets = new Map<Element, () => void>();
        const register = (selector: string, arm: () => void) => {
            const target = root.querySelector(selector);
            if (target)
                targets.set(target, arm);
        };
        register(".services-story-section", () => {
            setServicesMediaArmed(true);
            setServicesStopPostersArmed(true);
        });
        register(".datum-motion-section", () => setDatumMediaArmed(true));
        register(".domino-cta-section", () => setDominoMediaArmed(true));
        register(".process-contact-section", () => setProcessMapArmed(true));
        const getArmMargin = () => {
            const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
            return mobilePerformanceMode || constrainedConnection
                ? Math.round(viewportHeight * 0.75)
                : Math.max(600, Math.round(viewportHeight));
        };
        const armMargin = getArmMargin();
        const armedTargets = new Set<Element>();
        let observer: IntersectionObserver | null = null;
        let proximityFrame = 0;
        let proximityListenersAttached = false;
        let nearbyReevaluationTimer = 0;
        function stopProximityTracking() {
            observer?.disconnect();
            observer = null;
            if (proximityListenersAttached) {
                window.removeEventListener("scroll", scheduleProximityCheck);
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
            targets.get(target)?.();
            observer?.unobserve(target);
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
                const currentMargin = getArmMargin();
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
            window.addEventListener("scroll", scheduleProximityCheck, { passive: true });
            window.addEventListener("resize", scheduleProximityCheck, { passive: true });
            proximityListenersAttached = true;
            scheduleProximityCheck();
        };
        if ("IntersectionObserver" in window) {
            try {
                observer = new IntersectionObserver((entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting)
                            armTarget(entry.target);
                    });
                }, { rootMargin: `${armMargin}px 0px`, threshold: 0 });
                targets.forEach((_, target) => observer?.observe(target));
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
    }, [constrainedConnection, mobilePerformanceMode, motionPreferenceResolved, preloaderComplete]);
    useEffect(() => {
        if (!dominoMediaArmed)
            return;
        const forwardVideo = dominoVideoRef.current;
        const reverseVideo = dominoReverseVideoRef.current;
        if (!forwardVideo || !reverseVideo)
            return;
        let disposed = false;
        const retryTimers = new Set<number>();
        const failedVideos = new Set<HTMLVideoElement>();
        const retryScheduled = new Set<HTMLVideoElement>();
        const videos = [forwardVideo, ...(dominoReverseMediaArmed ? [reverseVideo] : [])];
        const markPrepared = (video: HTMLVideoElement) => {
            if (disposed || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
                return;
            if (video === forwardVideo) {
                setDominoForwardPrepared(true);
                setDominoForwardFallback(false);
            }
            else {
                setDominoReversePrepared(true);
                setDominoReverseFallback(false);
            }
        };
        const warmVideo = (video: HTMLVideoElement) => {
            if (video.dataset.armed !== "true")
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
            if (video.networkState !== HTMLMediaElement.NETWORK_EMPTY)
                return;
            failedVideos.delete(video);
            video.load();
        };
        const scheduleColdMediaRetry = (video: HTMLVideoElement) => {
            failedVideos.add(video);
            if (retryScheduled.has(video))
                return;
            retryScheduled.add(video);
            [2000, 6000, 12000].forEach((delay, index, delays) => {
                const timer = window.setTimeout(() => {
                    retryTimers.delete(timer);
                    retryColdMedia(video);
                    if (index === delays.length - 1)
                        retryScheduled.delete(video);
                }, delay);
                retryTimers.add(timer);
            });
        };
        const handleForwardPrepared = () => markPrepared(forwardVideo);
        const handleReversePrepared = () => markPrepared(reverseVideo);
        const handleForwardError = () => scheduleColdMediaRetry(forwardVideo);
        const handleReverseError = () => scheduleColdMediaRetry(reverseVideo);
        const handlePageShow = () => videos.forEach(retryColdMedia);
        forwardVideo.addEventListener("loadeddata", handleForwardPrepared);
        forwardVideo.addEventListener("canplay", handleForwardPrepared);
        forwardVideo.addEventListener("error", handleForwardError);
        if (dominoReverseMediaArmed) {
            reverseVideo.addEventListener("loadeddata", handleReversePrepared);
            reverseVideo.addEventListener("canplay", handleReversePrepared);
            reverseVideo.addEventListener("error", handleReverseError);
        }
        videos.forEach(warmVideo);
        window.addEventListener("pageshow", handlePageShow);
        return () => {
            disposed = true;
            retryTimers.forEach((timer) => window.clearTimeout(timer));
            retryTimers.clear();
            forwardVideo.removeEventListener("loadeddata", handleForwardPrepared);
            forwardVideo.removeEventListener("canplay", handleForwardPrepared);
            forwardVideo.removeEventListener("error", handleForwardError);
            reverseVideo.removeEventListener("loadeddata", handleReversePrepared);
            reverseVideo.removeEventListener("canplay", handleReversePrepared);
            reverseVideo.removeEventListener("error", handleReverseError);
            window.removeEventListener("pageshow", handlePageShow);
        };
    }, [dominoMediaArmed, dominoReverseMediaArmed, dominoTransportKey]);
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
            setHeroVideoState("ready");
        };
        const fallBackToPoster = () => {
            if (cancelled) {
                return;
            }
            failed = true;
            readyReleased = false;
            stopChecks();
            video.pause();
            setHeroVideoState("fallback");
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
    }, [heroVideoEligible, motionAllowed]);
    const handleAnchorNavigate = useCallback((href: string, options?: { replaceHistory?: boolean }) => {
        const replaceHistory = options?.replaceHistory !== false;
        if (href === "#services") {
            setServicesMediaArmed(true);
            setServicesStopPostersArmed(true);
        }
        if (VISION_LOGO_DEEP_LINKS.has(href))
            setVisionLogoArmed(true);
        if (href === "#datum")
            setDatumMediaArmed(true);
        if (href === "#brief")
            setDominoMediaArmed(true);
        if (href === "#process" || href === "#contact")
            setProcessMapArmed(true);
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
        dominoControllerRef.current?.releaseForNavigation();
        ScrollTrigger.sort();
        ScrollTrigger.refresh();
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
            const settleTimers: number[] = [];
            const removeIntentListeners = () => {
                window.removeEventListener("wheel", cancelSettle);
                window.removeEventListener("touchstart", cancelSettle);
                window.removeEventListener("pointerdown", cancelSettle);
                window.removeEventListener("keydown", handleNavigationKey);
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
                settleTimers.forEach((timer) => window.clearTimeout(timer));
                completeSettle();
            }
            function handleNavigationKey(event: KeyboardEvent) {
                if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
                    cancelSettle();
                }
            }
            window.addEventListener("wheel", cancelSettle, { passive: true });
            window.addEventListener("touchstart", cancelSettle, { passive: true });
            window.addEventListener("pointerdown", cancelSettle, { passive: true });
            window.addEventListener("keydown", handleNavigationKey);
            anchorSettleCleanupRef.current = cancelSettle;
            const applyPosition = (nextTop: number) => {
                const targetTop = Math.max(0, nextTop);
                if (lenisRef.current) {
                    lenisRef.current.scrollTo(targetTop, {
                        duration: 0.01,
                        immediate: true,
                        force: true,
                    });
                }
                window.scrollTo({ top: targetTop, behavior: "auto" });
                ScrollTrigger.update();
                window.dispatchEvent(new CustomEvent("tasc:scroll-position-applied"));
            };
            if (replaceHistory && window.history?.replaceState) {
                window.history.replaceState(null, "", href);
            }
            applyPosition(top);
            window.requestAnimationFrame(() => {
                if (settleCancelled || !programmaticNavigationRef.current || programmaticAnchorRef.current !== href)
                    return;
                applyPosition(resolveTop?.() ?? top);
            });
            if (resolveTop) {
                const settleDelays = reduceMotion ? [100, 240] : [160, 520];
                settleDelays.forEach((delay, index) => {
                    const timer = window.setTimeout(() => {
                        if (settleCancelled || programmaticAnchorRef.current !== href)
                            return;
                        if (href !== "#services")
                            servicesControllerRef.current?.releaseForNavigation();
                        if (href !== "#brief")
                            dominoControllerRef.current?.releaseForNavigation();
                        const settledTop = resolveTop();
                        if (settledTop !== null)
                            applyPosition(settledTop);
                        if (index === settleDelays.length - 1) {
                            window.requestAnimationFrame(() => {
                                if (settleCancelled || programmaticAnchorRef.current !== href)
                                    return;
                                if (href !== "#services")
                                    servicesControllerRef.current?.releaseForNavigation();
                                if (href !== "#brief")
                                    dominoControllerRef.current?.releaseForNavigation();
                                const finalTop = resolveTop();
                                if (finalTop !== null)
                                    applyPosition(finalTop);
                                window.requestAnimationFrame(() => {
                                    if (!settleCancelled)
                                        completeSettle();
                                });
                            });
                        }
                    }, delay);
                    settleTimers.push(timer);
                });
            }
            else {
                const timer = window.setTimeout(() => {
                    if (!settleCancelled)
                        completeSettle();
                }, reduceMotion ? 120 : 260);
                settleTimers.push(timer);
            }
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
            const resolveWorkTop = () => getPinnedStoryStart("how-work-reversible", ".how-work-motion-section");
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
    }, [motionAllowed]);
    useLayoutEffect(() => {
        const root = rootRef.current;
        const clientsSection = root?.querySelector<HTMLElement>(".figma-clients-section");
        const clientsFlareStage = root?.querySelector<HTMLElement>(".vision-clients-flare-stage");
        const clientsScrollElement = root?.querySelector<HTMLElement>(".clients-scroll-element-wrap");
        if (!root || !clientsSection || !clientsFlareStage || !clientsScrollElement)
            return;
        let frame = 0;
        let stableViewportWidth = window.innerWidth;
        let stableViewportHeight = Math.max(document.documentElement.clientHeight, window.visualViewport?.height ?? window.innerHeight);
        const syncClientsFlareDocumentPosition = () => {
            frame = 0;
            const rootRect = root.getBoundingClientRect();
            const clientsRect = clientsSection.getBoundingClientRect();
            const viewportHeight = stableViewportHeight;
            const compactFlare = window.innerWidth <= 900;
            const angle = (15 * Math.PI) / 180;
            const planeScale = compactFlare ? 1 : 1.42;
            const planeWidth = clientsScrollElement.offsetWidth;
            const planeHeight = clientsScrollElement.offsetHeight;
            const rotatedHeight = Math.abs(planeWidth * Math.sin(angle)) +
                Math.abs(planeHeight * Math.cos(angle));
            const rotatedTopWithinStage = clientsScrollElement.offsetTop + planeHeight / 2 - (rotatedHeight * planeScale) / 2;
            const entryFactor = compactFlare ? 0.82 : 1.24;
            const entryOverlap = Math.min(Math.max(viewportHeight * entryFactor, 520), compactFlare ? 760 : 1680);
            const clientsTopWithinRoot = clientsRect.top - rootRect.top;
            const stageTop = clientsTopWithinRoot - entryOverlap - rotatedTopWithinStage;
            clientsFlareStage.style.top = `${Math.round(stageTop)}px`;
        };
        const scheduleSync = () => {
            if (frame)
                window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(syncClientsFlareDocumentPosition);
        };
        const handleViewportResize = () => {
            const nextWidth = window.innerWidth;
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
        resizeObserver.observe(clientsSection);
        resizeObserver.observe(clientsScrollElement);
        window.addEventListener("resize", handleViewportResize, { passive: true });
        reducedMotionQuery.addEventListener("change", scheduleSync);
        ScrollTrigger.addEventListener("refresh", scheduleSync);
        return () => {
            if (frame)
                window.cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            window.removeEventListener("resize", handleViewportResize);
            reducedMotionQuery.removeEventListener("change", scheduleSync);
            ScrollTrigger.removeEventListener("refresh", scheduleSync);
            clientsFlareStage.style.removeProperty("top");
        };
    }, []);
    useGSAP(() => {
        const root = rootRef.current;
        if (!root || !preloaderRevealStarted || !motionAllowed) {
            return;
        }
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const compactMotion = window.matchMedia("(max-width: 640px)").matches;
        const useLegacyServicesFlow = true;
        const useAutonomousDatumFlow = true;
        const useReversibleHowFlow = true;
        const useReversibleDominoFlow = true;
        let stableHeroViewportWidth = window.innerWidth;
        let stableHeroViewportHeight = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
        const getStableHeroPinDistance = () => {
            const nextWidth = window.innerWidth;
            const nextHeight = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
            const isRealViewportChange = Math.abs(nextWidth - stableHeroViewportWidth) > 80 ||
                Math.abs(nextHeight - stableHeroViewportHeight) > Math.max(180, stableHeroViewportHeight * 0.28);
            if (isRealViewportChange) {
                stableHeroViewportWidth = nextWidth;
                stableHeroViewportHeight = nextHeight;
            }
            const pinMultiplier = macPerformanceMode ? 2.05 : mobilePerformanceMode ? 2.15 : 2.45;
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
            const viewportHeight = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
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
        let refreshId = 0;
        let heroTimeline: gsap.core.Timeline | null = null;
        let servicesTrigger: ScrollTrigger | null = null;
        let clientsServicesHandoff: gsap.core.Timeline | null = null;
        let howWorkTimeline: gsap.core.Timeline | null = null;
        let datumTimeline: gsap.core.Timeline | null = null;
        let ctaTimeline: gsap.core.Timeline | null = null;
        let ctaTrigger: ScrollTrigger | null = null;
        let servicesTextTimeline: gsap.core.Timeline | null = null;
        let servicesTextWatchdog = 0;
        let servicesStage = -1;
        let servicesRunToken = 0;
        let servicesActive = false;
        let servicesReleasing = false;
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
        let servicesPhase: "idle" | "playing" | "waiting" | "releasing" | "reverse" = "idle";
        let servicesEntryDirection: 1 | -1 = 1;
        let servicesLockY = 0;
        let servicesGestureTotal = 0;
        let servicesGateUntil = 0;
        let servicesLastBlockedInputAt = 0;
        let servicesBlockedDirection: 1 | -1 | 0 = 0;
        let servicesTransitionDirection: 1 | -1 | 0 = 0;
        let servicesPendingDirection: 1 | -1 | 0 = 0;
        let servicesPendingMagnitude = 0;
        let servicesPendingTimer = 0;
        let servicesReleaseToken = 0;
        let servicesReleaseTimer = 0;
        let servicesMediaRetryTimer = 0;
        let servicesMediaRetryKey = "";
        let servicesMediaRetryFailures = 0;
        let servicesMediaRetryStartedAt = 0;
        let servicesOwnsLenisLock = false;
        let touchY: number | null = null;
        let servicesTouchStartedAtSettledStop = false;
        let dominoRunToken = 0;
        let dominoInputLocked = false;
        let dominoCompleted = false;
        let dominoLockY = 0;
        let dominoEntryDirection: 1 | -1 = 1;
        let dominoTimelineResolve: (() => void) | null = null;
        let dominoTimelineWatchdog = 0;
        let heroVideoSuspended = false;
        const cleanupCallbacks: Array<() => void> = [];
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
            const slowTransport = mobilePerformanceMode ||
                constrainedConnection ||
                connection?.saveData === true ||
                connection?.effectiveType === "3g";
            const elapsed = performance.now() - servicesMediaRetryStartedAt;
            if (video?.error)
                return true;
            return servicesMediaRetryFailures >= 4 &&
                elapsed >= (slowTransport ? 16000 : 9000);
        };
        const refreshScroll = () => {
            if (!disposed) {
                cancelAnimationFrame(refreshId);
                refreshId = requestAnimationFrame(() => {
                    if (!disposed) {
                        ScrollTrigger.sort();
                        ScrollTrigger.refresh();
                    }
                });
            }
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
        const seekServicesFrame = (video: HTMLVideoElement | null, time: number, isCurrent: () => boolean) => new Promise<boolean>((resolve) => {
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
                const ready = isCurrent() &&
                    !disposed &&
                    media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                    Math.abs(media.currentTime - target) <= 0.12;
                finish(ready);
            };
            const assignTarget = () => {
                if (settled || !isCurrent() || disposed) {
                    finish(false);
                    return;
                }
                media.pause();
                if (!media.seeking && Math.abs(media.currentTime - target) <= 0.12) {
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
            media.addEventListener("seeked", reportTarget);
            media.addEventListener("error", fail);
            timeout = window.setTimeout(() => {
                reportTarget();
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
        const primeWebkitServicesReverseBranch = (stage: number) => {
            if (!webkitCompatibilityMode ||
                !servicesVideo ||
                stage <= 0 ||
                stage >= SERVICES_REVERSE_KEYFRAME_STOPS.length) {
                return;
            }
            setServicesStaticStop(stage);
            servicesVideo.dataset.segmentState = "priming";
            pauseAndSeek(servicesVideo, SERVICES_REVERSE_KEYFRAME_STOPS[stage], 0.12);
        };
        const hasServicesTargetFrame = (video: HTMLVideoElement | null, target: number) => Boolean(video &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            video.dataset.segmentState !== "fallback" &&
            Math.abs(video.currentTime - target) <= 0.12);
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
                    webkitCompatibilityMode &&
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
            const slowNetwork = mobilePerformanceMode ||
                constrainedConnection ||
                connection?.saveData === true ||
                connection?.effectiveType === "3g";
            timeout = window.setTimeout(() => finish(hasWarmFrame()), slowNetwork ? 2800 : 4000);
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
                if (snapToEnd && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
                    pauseAndSeek(video, to, 0.12);
                }
                mediaRunCancels.delete(video);
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
        const scrubServicesMediaReverse = (video: HTMLVideoElement | null, from: number, to: number, durationSeconds: number, fallbackStage: number, isCurrent: () => boolean) => new Promise<void>((resolve) => {
            if (!video) {
                setServicesStaticStop(fallbackStage);
                resolve();
                return;
            }
            const media = video;
            mediaRunCancels.get(media)?.();
            const minimumSeekInterval = 1000 / SERVICES_REVERSE_SEEK_FPS;
            const safeDurationMs = Math.max(1, durationSeconds * 1000);
            let finished = false;
            let started = false;
            let seekInFlight = false;
            let finalRequested = false;
            let finalFramePending = false;
            let latestTarget = from;
            let startedAt = 0;
            let lastSeekAssignedAt = Number.NEGATIVE_INFINITY;
            let stepTimer = 0;
            let metadataTimer = 0;
            let watchdogTimer = 0;
            let finalFrameTimer = 0;
            let seekWatchdogTimer = 0;
            let finalFrameId = 0;
            let lateFinalFrameArmed = false;
            let lateFrameId = 0;
            let lateVideoFrameCallbackId: number | null = null;
            let lastDecodedTime = Number.NaN;
            let lastDecodedMovementAt = 0;
            const targetFrom = getMediaTargetTime(media, from);
            const targetTo = getMediaTargetTime(media, to);
            let scrubFrom = targetFrom;
            const revealLateFinalFrame = () => {
                if (finished || disposed || !isCurrent())
                    return;
                setServicesStaticStop(null);
                root.dataset.servicesMediaDecoded = "true";
                media.dataset.segmentState = "ready";
                media.dataset.scrubState = "settled";
            };
            const handleLateMetadata = () => {
                if (finished || disposed || !isCurrent())
                    return;
                media.pause();
                try {
                    media.currentTime = getMediaTargetTime(media, to);
                }
                catch {
                    return;
                }
                if (typeof media.requestVideoFrameCallback === "function") {
                    lateVideoFrameCallbackId = media.requestVideoFrameCallback(() => {
                        lateVideoFrameCallbackId = null;
                        revealLateFinalFrame();
                    });
                }
                else {
                    lateFrameId = window.requestAnimationFrame(() => {
                        lateFrameId = 0;
                        revealLateFinalFrame();
                    });
                }
            };
            const removeListeners = () => {
                media.removeEventListener("loadedmetadata", begin);
                media.removeEventListener("loadedmetadata", handleLateMetadata);
                media.removeEventListener("seeked", handleSeeked);
                media.removeEventListener("error", handleError);
            };
            const clearTimers = () => {
                window.clearTimeout(stepTimer);
                window.clearTimeout(metadataTimer);
                window.clearTimeout(watchdogTimer);
                window.clearTimeout(finalFrameTimer);
                window.clearTimeout(seekWatchdogTimer);
                if (finalFrameId)
                    window.cancelAnimationFrame(finalFrameId);
                if (lateFrameId)
                    window.cancelAnimationFrame(lateFrameId);
                if (lateVideoFrameCallbackId !== null &&
                    typeof media.cancelVideoFrameCallback === "function") {
                    media.cancelVideoFrameCallback(lateVideoFrameCallbackId);
                }
                stepTimer = 0;
                metadataTimer = 0;
                watchdogTimer = 0;
                finalFrameTimer = 0;
                seekWatchdogTimer = 0;
                finalFrameId = 0;
                lateFrameId = 0;
                lateVideoFrameCallbackId = null;
            };
            const finish = (decoded: boolean) => {
                if (finished)
                    return;
                finished = true;
                clearTimers();
                removeListeners();
                media.pause();
                if (decoded) {
                    setServicesStaticStop(null);
                    root.dataset.servicesMediaDecoded = "true";
                    media.dataset.segmentState = "ready";
                    media.dataset.scrubState = "settled";
                }
                else {
                    setServicesStaticStop(fallbackStage);
                    delete root.dataset.servicesMediaDecoded;
                    media.dataset.segmentState = "fallback";
                    media.dataset.scrubState = "fallback";
                }
                delete root.dataset.servicesVideoDirection;
                if (mediaRunCancels.get(media) === cancelRun)
                    mediaRunCancels.delete(media);
                resolve();
            };
            const armLateFinalFrame = () => {
                if (lateFinalFrameArmed)
                    return;
                lateFinalFrameArmed = true;
                media.addEventListener("loadedmetadata", handleLateMetadata, { once: true });
            };
            const cancelRun = () => finish(false);
            const schedulePump = (delay = minimumSeekInterval) => {
                if (finished || stepTimer)
                    return;
                stepTimer = window.setTimeout(pump, Math.max(0, delay));
            };
            const settleFinalFrame = () => {
                if (finished || finalFramePending)
                    return;
                finalFramePending = true;
                media.pause();
                if (Math.abs(media.currentTime - targetTo) > 1 / 30) {
                    finalFramePending = false;
                    latestTarget = targetTo;
                    seekInFlight = false;
                    lastSeekAssignedAt = Number.NEGATIVE_INFINITY;
                    commitLatestTarget();
                    return;
                }
                let frameReported = false;
                const reportFrame = () => {
                    if (frameReported || finished)
                        return;
                    frameReported = true;
                    const decoded = isCurrent() &&
                        !disposed &&
                        media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                        Math.abs(media.currentTime - targetTo) <= 1 / 30;
                    finish(decoded);
                };
                finalFrameTimer = window.setTimeout(reportFrame, 240);
                if (typeof media.requestVideoFrameCallback === "function") {
                    media.requestVideoFrameCallback(reportFrame);
                }
                else {
                    finalFrameId = window.requestAnimationFrame(reportFrame);
                }
            };
            const markDecodedSeek = () => {
                if (finished || !isCurrent() || disposed)
                    return;
                if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                    if (!Number.isFinite(lastDecodedTime) ||
                        Math.abs(media.currentTime - lastDecodedTime) > 1 / 45) {
                        lastDecodedTime = media.currentTime;
                        lastDecodedMovementAt = performance.now();
                    }
                    setServicesStaticStop(null);
                    root.dataset.servicesMediaDecoded = "true";
                    media.dataset.segmentState = "scrubbing";
                    media.dataset.scrubState = "seeking";
                    media.dataset.scrubTime = media.currentTime.toFixed(3);
                }
            };
            function completeSeek() {
                if (finished || !seekInFlight)
                    return;
                window.clearTimeout(seekWatchdogTimer);
                seekWatchdogTimer = 0;
                seekInFlight = false;
                markDecodedSeek();
                if (finalRequested && Math.abs(media.currentTime - targetTo) <= 1 / 30) {
                    settleFinalFrame();
                    return;
                }
                schedulePump(0);
            }
            const armSeekWatchdog = () => {
                window.clearTimeout(seekWatchdogTimer);
                seekWatchdogTimer = window.setTimeout(() => {
                    seekWatchdogTimer = 0;
                    if (finished || !seekInFlight)
                        return;
                    if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                        !media.seeking) {
                        completeSeek();
                        return;
                    }
                    if (started &&
                        performance.now() - lastDecodedMovementAt > 700 &&
                        media.currentTime - targetTo > 0.16 &&
                        latestTarget < media.currentTime - 0.16) {
                        finish(false);
                        return;
                    }
                    armSeekWatchdog();
                }, 180);
            };
            function commitLatestTarget() {
                if (finished || seekInFlight || !started)
                    return;
                if (!isCurrent() || disposed) {
                    finish(false);
                    return;
                }
                const now = performance.now();
                const remainingThrottle = minimumSeekInterval - (now - lastSeekAssignedAt);
                if (!finalRequested && remainingThrottle > 0) {
                    schedulePump(remainingThrottle);
                    return;
                }
                const clampedTarget = getMediaTargetTime(media, latestTarget);
                if (Math.abs(media.currentTime - clampedTarget) <= 1 / 1000) {
                    markDecodedSeek();
                    if (finalRequested && Math.abs(clampedTarget - targetTo) <= 1 / 1000) {
                        settleFinalFrame();
                    }
                    else {
                        schedulePump();
                    }
                    return;
                }
                seekInFlight = true;
                lastSeekAssignedAt = now;
                media.dataset.segmentState = "scrubbing";
                media.dataset.scrubState = "seeking";
                media.dataset.scrubTarget = clampedTarget.toFixed(3);
                try {
                    media.currentTime = clampedTarget;
                    armSeekWatchdog();
                }
                catch {
                    seekInFlight = false;
                    finish(false);
                }
            }
            function pump() {
                stepTimer = 0;
                if (finished || !started)
                    return;
                if (!isCurrent() || disposed) {
                    finish(false);
                    return;
                }
                const progress = Math.min(1, Math.max(0, (performance.now() - startedAt) / safeDurationMs));
                latestTarget = scrubFrom + (targetTo - scrubFrom) * progress;
                finalRequested = progress >= 1;
                if (!seekInFlight)
                    commitLatestTarget();
                if (!finished && !finalRequested)
                    schedulePump();
            }
            function handleSeeked() {
                if (finished)
                    return;
                completeSeek();
            }
            function handleError() {
                finish(false);
            }
            function begin() {
                if (finished || started)
                    return;
                if (!isCurrent() || disposed) {
                    finish(false);
                    return;
                }
                if (media.readyState < HTMLMediaElement.HAVE_METADATA)
                    return;
                started = true;
                media.pause();
                media.loop = false;
                media.playbackRate = 1;
                root!.dataset.servicesVideoDirection = "reverse-seek";
                root!.dataset.servicesReverseSeekFps = String(SERVICES_REVERSE_SEEK_FPS);
                media.dataset.segmentState = "scrubbing";
                media.dataset.scrubState = "seeking";
                latestTarget = targetFrom;
                lastDecodedTime = media.currentTime;
                lastDecodedMovementAt = performance.now();
                startedAt = performance.now();
                if (Math.abs(media.currentTime - targetFrom) <= 0.14) {
                    scrubFrom = getMediaTargetTime(media, media.currentTime);
                    markDecodedSeek();
                    schedulePump(0);
                }
                else {
                    lastSeekAssignedAt = Number.NEGATIVE_INFINITY;
                    commitLatestTarget();
                }
            }
            setServicesStaticStop(fallbackStage);
            media.pause();
            mediaRunCancels.set(media, cancelRun);
            media.addEventListener("loadedmetadata", begin);
            media.addEventListener("seeked", handleSeeked);
            media.addEventListener("error", handleError);
            watchdogTimer = window.setTimeout(() => {
                if (media.readyState < HTMLMediaElement.HAVE_METADATA)
                    armLateFinalFrame();
                finish(false);
            }, Math.max(1800, safeDurationMs + 900));
            if (media.readyState >= HTMLMediaElement.HAVE_METADATA) {
                begin();
            }
            else {
                ensurePreloadAuto(media);
                if (media.dataset.armed === "true" &&
                    media.networkState === HTMLMediaElement.NETWORK_EMPTY)
                    media.load();
                metadataTimer = window.setTimeout(() => {
                    if (media.readyState < HTMLMediaElement.HAVE_METADATA) {
                        armLateFinalFrame();
                        finish(false);
                    }
                }, 2400);
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
        gsap.set(".how-work-step-copy", { x: -48, y: 0, autoAlpha: 0 });
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
        const lenisPhysicalEventsTarget = macPerformanceMode ? document.createElement("div") : window;
        const lenis = new Lenis({
            eventsTarget: lenisPhysicalEventsTarget,
            duration: macPerformanceMode ? 0.62 : mobilePerformanceMode ? 0.72 : 0.96,
            easing: (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t)),
            smoothWheel: !macPerformanceMode,
            virtualScroll: () => !macPerformanceMode,
            wheelMultiplier: macPerformanceMode ? 1 : mobilePerformanceMode ? 0.38 : 0.35,
            touchMultiplier: mobilePerformanceMode ? 1 : 0.9,
        });
        lenisRef.current = lenis;
        root.dataset.wheelScrollRate = macPerformanceMode ? "native" : "lenis";
        let rafId = 0;
        const raf = (time: number) => {
            lenis.raf(time);
            rafId = requestAnimationFrame(raf);
        };
        const handleSmoothScrollUpdate = () => {
            ScrollTrigger.update();
        };
        lenis.on("scroll", handleSmoothScrollUpdate);
        rafId = requestAnimationFrame(raf);
        let servicesTextResolve: (() => void) | null = null;
        let syncBlockingInputListeners = () => { };
        const releaseServicesLenisLock = (snapTarget?: number) => {
            if (typeof snapTarget === "number" && Number.isFinite(snapTarget)) {
                window.scrollTo({ top: snapTarget, left: 0, behavior: "auto" });
            }
            if (servicesOwnsLenisLock || lenis.isLocked) {
                lenis.scrollTo(window.scrollY, { immediate: true, force: true });
                lenis.start();
            }
            servicesOwnsLenisLock = false;
        };
        const setMotionInputState = () => {
            if (servicesActive || servicesReleasing || dominoInputLocked) {
                root.dataset.motionInputLocked = "true";
            }
            else {
                delete root.dataset.motionInputLocked;
            }
            syncBlockingInputListeners();
        };
        const setServicesPhase = (phase: typeof servicesPhase) => {
            servicesPhase = phase;
            root.dataset.servicesPhase = phase;
        };
        const clearServicesPendingIntent = () => {
            window.clearTimeout(servicesPendingTimer);
            servicesPendingTimer = 0;
            servicesPendingDirection = 0;
            servicesPendingMagnitude = 0;
        };
        const queueServicesIntent = (direction: 1 | -1, gestureMagnitude = 160, threshold = 18, allowTransitionDirection = false) => {
            if (servicesTransitionDirection === 0)
                return;
            if (direction === servicesTransitionDirection && !allowTransitionDirection)
                return;
            if (servicesPendingDirection !== 0 && servicesPendingDirection !== direction) {
                servicesPendingMagnitude = 0;
            }
            servicesPendingMagnitude += Math.abs(gestureMagnitude);
            if (servicesPendingMagnitude >= threshold)
                servicesPendingDirection = direction;
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
            servicesGestureTotal = 0;
            root.dataset.servicesActive = String(nextStage + 1);
            setServicesPhase("playing");
            setMotionInputState();
            if (webkitCompatibilityMode &&
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
                        flushServicesPendingIntent();
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
                    flushServicesPendingIntent();
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
            flushServicesPendingIntent();
        };
        const finishServicesRelease = (target: number, previewAfter = false, previewRevealed = false) => {
            resetServicesMediaRetry();
            const releaseToken = ++servicesReleaseToken;
            clientsServicesHandoff?.scrollTrigger?.enable();
            clientsServicesHandoff?.scrollTrigger?.refresh();
            clientsServicesHandoff?.scrollTrigger?.update();
            const releaseDistance = Math.abs(target - window.scrollY);
            const releaseDuration = Math.min(0.82, Math.max(0.48, (releaseDistance / Math.max(window.innerHeight, 1)) * 0.7));
            servicesActive = false;
            servicesReleasing = true;
            servicesTransitionDirection = 0;
            servicesGestureTotal = 0;
            servicesLastBlockedInputAt = 0;
            servicesBlockedDirection = 0;
            clearServicesPendingIntent();
            setServicesPhase("releasing");
            delete root.dataset.servicesPinned;
            setMotionInputState();
            lenis.start();
            servicesOwnsLenisLock = true;
            let finalized = false;
            const finalizeRelease = (snapToBoundary = false) => {
                if (finalized || releaseToken !== servicesReleaseToken)
                    return;
                finalized = true;
                window.clearTimeout(servicesReleaseTimer);
                servicesReleaseTimer = 0;
                releaseServicesLenisLock(snapToBoundary ? target : undefined);
                servicesReleasing = false;
                delete root.dataset.servicesPinned;
                delete root.dataset.servicesActive;
                delete root.dataset.servicesSequence;
                if (!previewAfter)
                    setServicesStaticStop(null);
                setServicesPhase("idle");
                setMotionInputState();
                if (previewAfter)
                    showServicesIdlePreview(previewRevealed);
            };
            servicesReleaseTimer = window.setTimeout(() => finalizeRelease(true), Math.ceil(releaseDuration * 1000) + 260);
            lenis.scrollTo(target, {
                duration: releaseDuration,
                force: true,
                lock: true,
                onComplete: () => finalizeRelease(false),
            });
        };
        const releaseServicesForward = async () => {
            if (!servicesActive || servicesPhase !== "waiting" || !servicesTrigger)
                return;
            const token = ++servicesRunToken;
            beginServicesMediaAttempt("forward:exit");
            setServicesPhase("releasing");
            servicesGestureTotal = 0;
            const exitMediaReady = root.dataset.servicesMediaFallback === "true"
                ? false
                : await ensureServicesPlayable(servicesVideo, SERVICES_EXIT_STOP, () => token === servicesRunToken && servicesActive);
            if (token !== servicesRunToken || !servicesActive || disposed)
                return;
            if (!exitMediaReady && root.dataset.servicesMediaFallback !== "true") {
                if (shouldFailOpenServicesMedia(servicesVideo)) {
                    if (servicesVideo?.error) {
                        activateServicesMediaFallback();
                    }
                    else {
                        root.dataset.servicesTransportFailure = "exit-timeout";
                        finishServicesRelease(servicesTrigger.end + 1);
                        return;
                    }
                }
                else {
                    if (servicesVideo)
                        servicesVideo.dataset.segmentState = "buffering";
                    setServicesPhase("waiting");
                    servicesMediaRetryTimer = window.setTimeout(() => {
                        servicesMediaRetryTimer = 0;
                        if (token === servicesRunToken && servicesActive && !disposed && servicesPhase === "waiting") {
                            void releaseServicesForward();
                        }
                    }, 180);
                    return;
                }
            }
            const outgoingItems = servicePanelItems[Math.max(0, servicesStage)] ?? [];
            const outgoingPanel = servicePanels[Math.max(0, servicesStage)];
            stopServicesTextTimeline();
            const textExit = new Promise<void>((resolve) => {
                servicesTextResolve = resolve;
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
                    duration: revealTime(0.58),
                    stagger: revealTime(0.06),
                    ease: "power3.inOut",
                })
                    .set(outgoingPanel, { autoAlpha: 0, pointerEvents: "none" });
                armServicesTextWatchdog(servicesTextTimeline, resolve, 1200);
            });
            const [mediaCompleted] = await Promise.all([
                exitMediaReady
                    ? playMediaSegment(servicesVideo, SERVICES_KEYFRAME_STOPS[2], SERVICES_EXIT_STOP, SERVICES_PLAYBACK_RATE, () => token === servicesRunToken && servicesActive)
                    : Promise.resolve(true),
                textExit,
            ]);
            if (token !== servicesRunToken || !servicesActive || disposed)
                return;
            if (!mediaCompleted) {
                setServicesPanel(Math.max(0, servicesStage));
                setServicesStaticStop(Math.max(0, servicesStage));
                if (servicesVideo)
                    servicesVideo.dataset.segmentState = "buffering";
                setServicesPhase("waiting");
                return;
            }
            resetServicesMediaRetry();
            finishServicesRelease(servicesTrigger.end + 1);
        };
        const releaseServicesBackward = () => {
            if (!servicesActive || !servicesTrigger)
                return;
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
            finishServicesRelease(servicesTrigger.start - 1, true, true);
        };
        const releaseServicesForNavigation = () => {
            if (!servicesActive && !servicesReleasing && !servicesOwnsLenisLock)
                return;
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
            servicesTransitionDirection = 0;
            servicesGateUntil = 0;
            servicesLastBlockedInputAt = 0;
            servicesBlockedDirection = 0;
            clearServicesPendingIntent();
            setServicesPhase("idle");
            showServicesIdlePreview();
            if (servicesVideo)
                servicesVideo.dataset.segmentState = "idle";
            pauseAndSeek(servicesVideo, 0);
            delete root.dataset.servicesPinned;
            delete root.dataset.servicesInrange;
            releaseServicesLenisLock();
            setMotionInputState();
        };
        const resetHowWorkBoundaryPreview = () => {
            delete root.dataset.howWorkPinned;
            ScrollTrigger.getById("how-work-reversible")?.animation?.progress(0);
        };
        const startServicesForward = (lockY: number, entryDirection: 1 | -1 = 1) => {
            if (servicesActive || servicesReleasing)
                return;
            setServicesStopPostersArmed(true);
            servicesWarmupClaimRef.current?.();
            resetServicesMediaRetry();
            delete root.dataset.servicesTransportFailure;
            resetHowWorkBoundaryPreview();
            const preservePreview = root.dataset.servicesPreview === "1";
            servicesActive = true;
            servicesReleasing = false;
            servicesEntryDirection = entryDirection;
            servicesLockY = lockY;
            servicesGestureTotal = 0;
            servicesGateUntil = performance.now() + SERVICES_ENTRY_GATE_MS;
            servicesTransitionDirection = 1;
            clearServicesPendingIntent();
            setServicesStaticStop(null);
            setServicesEntryPoster(true);
            root.dataset.servicesPinned = "true";
            root.dataset.servicesInrange = "true";
            root.dataset.servicesSequence = useLegacyServicesFlow ? "autoplay" : "scroll-scrub";
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
            pauseAndSeek(servicesVideo, 0);
            servicesOwnsLenisLock = true;
            lenis.stop();
            lenis.scrollTo(servicesLockY, { immediate: true, force: true });
            setMotionInputState();
            setServicesPhase("idle");
            void runServicesStage(0, !preservePreview);
        };
        const startServicesAtLastStage = (lockY: number) => {
            if (servicesActive || servicesReleasing)
                return;
            setServicesStopPostersArmed(true);
            servicesWarmupClaimRef.current?.();
            resetServicesMediaRetry();
            delete root.dataset.servicesTransportFailure;
            resetHowWorkBoundaryPreview();
            servicesRunToken += 1;
            const lastStage = SERVICES_KEYFRAME_STOPS.length - 1;
            servicesActive = true;
            servicesReleasing = false;
            servicesEntryDirection = -1;
            servicesLockY = lockY;
            servicesGestureTotal = 0;
            servicesGateUntil = 0;
            servicesTransitionDirection = -1;
            clearServicesPendingIntent();
            setServicesEntryPoster(false);
            setServicesStaticStop(lastStage);
            root.dataset.servicesPinned = "true";
            root.dataset.servicesInrange = "true";
            delete root.dataset.howWorkPinned;
            root.dataset.servicesSequence = useLegacyServicesFlow ? "autoplay" : "scroll-scrub";
            lockClientsServicesHandoffAtServices();
            delete root.dataset.servicesPreview;
            setServicesPanel(lastStage);
            if (servicesVideo)
                servicesVideo.dataset.segmentState = "buffering";
            servicesOwnsLenisLock = true;
            lenis.stop();
            lenis.scrollTo(servicesLockY, { immediate: true, force: true });
            window.scrollTo({ top: servicesLockY, left: 0, behavior: "auto" });
            setServicesPhase("playing");
            setMotionInputState();
            setServicesStaticStop(lastStage);
            if (webkitCompatibilityMode) {
                primeWebkitServicesReverseBranch(lastStage);
            }
            else {
                pauseAndSeek(servicesVideo, SERVICES_KEYFRAME_STOPS[lastStage]);
                if (servicesVideo)
                    servicesVideo.dataset.segmentState = "idle";
            }
            delete root.dataset.servicesMediaDecoded;
            servicesTransitionDirection = -1;
            servicesGateUntil = 0;
            setServicesPhase("waiting");
            setMotionInputState();
        };
        servicesControllerRef.current = {
            releaseForNavigation: releaseServicesForNavigation,
        };
        const runServicesReverseStage = async (nextStage: number) => {
            if (!servicesActive || servicesPhase !== "waiting" || nextStage < 0 || nextStage >= servicesStage)
                return;
            const token = ++servicesRunToken;
            beginServicesMediaAttempt(`reverse:${servicesStage}:${nextStage}`);
            const legacyFrom = SERVICES_KEYFRAME_STOPS[servicesStage];
            const legacyTo = SERVICES_KEYFRAME_STOPS[nextStage];
            const reverseFrom = SERVICES_REVERSE_KEYFRAME_STOPS[servicesStage];
            const reverseTo = SERVICES_REVERSE_KEYFRAME_STOPS[nextStage];
            const hasContinuousReverseBranch = SERVICES_REVERSE_KEYFRAME_STOPS.length === SERVICES_KEYFRAME_STOPS.length;
            const useContinuousReverseBranch = hasContinuousReverseBranch && servicesPackedTransportMode;
            const segmentDuration = useContinuousReverseBranch
                ? (reverseTo - reverseFrom) / SERVICES_PLAYBACK_RATE
                : (legacyFrom - legacyTo) / SERVICES_PLAYBACK_RATE;
            servicesTransitionDirection = -1;
            servicesGestureTotal = 0;
            root.dataset.servicesActive = String(nextStage + 1);
            setServicesStaticStop(servicesStage);
            delete root.dataset.servicesMediaDecoded;
            setServicesPhase("playing");
            setMotionInputState();
            if (useContinuousReverseBranch) {
                const reverseStartReady = await seekServicesFrame(servicesVideo, reverseFrom, () => token === servicesRunToken && servicesActive);
                if (token !== servicesRunToken || !servicesActive || disposed)
                    return;
                if (!reverseStartReady) {
                    setServicesStaticStop(servicesStage);
                    if (servicesVideo)
                        servicesVideo.dataset.segmentState = "buffering";
                    setServicesPhase("waiting");
                    servicesMediaRetryTimer = window.setTimeout(() => {
                        servicesMediaRetryTimer = 0;
                        if (token === servicesRunToken &&
                            servicesActive &&
                            !disposed &&
                            servicesPhase === "waiting") {
                            void runServicesReverseStage(nextStage);
                        }
                    }, 180);
                    return;
                }
            }
            if (!webkitCompatibilityMode && !useContinuousReverseBranch) {
                pauseAndSeek(servicesVideo, legacyFrom, 0.12);
            }
            const reverseReadyTarget = useContinuousReverseBranch ? reverseTo : legacyFrom;
            const reverseBufferStart = useContinuousReverseBranch
                ? webkitCompatibilityMode &&
                    servicesStage === SERVICES_KEYFRAME_STOPS.length - 1
                    ? legacyFrom
                    : reverseFrom
                : legacyFrom;
            const reverseMediaReady = root.dataset.servicesMediaFallback === "true"
                ? false
                : await ensureServicesPlayable(servicesVideo, reverseReadyTarget, () => token === servicesRunToken && servicesActive, reverseBufferStart, !webkitCompatibilityMode);
            if (token !== servicesRunToken || !servicesActive || disposed)
                return;
            if (!reverseMediaReady && root.dataset.servicesMediaFallback !== "true") {
                if (shouldFailOpenServicesMedia(servicesVideo)) {
                    if (servicesVideo?.error) {
                        activateServicesMediaFallback();
                    }
                    else {
                        root.dataset.servicesTransportFailure = "reverse-timeout";
                    }
                    setServicesPanel(nextStage);
                    setServicesStaticStop(nextStage);
                    resetServicesMediaRetry();
                    servicesGateUntil = performance.now() + SERVICES_POST_STAGE_GATE_MS;
                    setServicesPhase("waiting");
                    flushServicesPendingIntent();
                    return;
                }
                else {
                    setServicesStaticStop(servicesStage);
                    if (servicesVideo)
                        servicesVideo.dataset.segmentState = "buffering";
                    setServicesPhase("waiting");
                    servicesMediaRetryTimer = window.setTimeout(() => {
                        servicesMediaRetryTimer = 0;
                        if (token === servicesRunToken && servicesActive && !disposed && servicesPhase === "waiting") {
                            void runServicesReverseStage(nextStage);
                        }
                    }, 180);
                    return;
                }
            }
            if (!reverseMediaReady && root.dataset.servicesMediaFallback === "true") {
                setServicesPanel(nextStage);
                setServicesStaticStop(nextStage);
                resetServicesMediaRetry();
                servicesGateUntil = performance.now() + SERVICES_POST_STAGE_GATE_MS;
                setServicesPhase("waiting");
                flushServicesPendingIntent();
                return;
            }
            if (reverseMediaReady)
                servicesWarmupClaimRef.current?.();
            const lastStage = SERVICES_KEYFRAME_STOPS.length - 1;
            const reverseBranchAlreadyPrimed = Boolean(servicesVideo &&
                servicesVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                Math.abs(servicesVideo.currentTime - reverseFrom) <= 0.12);
            let continueFromWarmSeam = false;
            if (webkitCompatibilityMode &&
                useContinuousReverseBranch &&
                !reverseBranchAlreadyPrimed &&
                servicesStage === lastStage &&
                reverseFrom > legacyFrom + 1 / 30) {
                const seamCompleted = await playMediaSegment(servicesVideo, legacyFrom, reverseFrom, 2, () => token === servicesRunToken && servicesActive, false, false);
                if (token !== servicesRunToken || !servicesActive || disposed)
                    return;
                const seamNearReverseStart = servicesVideo
                    ? Math.abs(servicesVideo.currentTime - reverseFrom) <= 0.12
                    : false;
                continueFromWarmSeam = Boolean(servicesVideo &&
                    !servicesVideo.seeking &&
                    (seamCompleted || seamNearReverseStart));
                if (!continueFromWarmSeam) {
                    setServicesStaticStop(servicesStage);
                    if (servicesVideo)
                        servicesVideo.dataset.segmentState = "buffering";
                    if (shouldFailOpenServicesMedia(servicesVideo)) {
                        if (servicesVideo?.error) {
                            activateServicesMediaFallback();
                        }
                        else {
                            root.dataset.servicesTransportFailure = "reverse-seam-stall";
                        }
                        setServicesPanel(nextStage);
                        setServicesStaticStop(nextStage);
                        resetServicesMediaRetry();
                        servicesGateUntil = performance.now() + SERVICES_POST_STAGE_GATE_MS;
                        setServicesPhase("waiting");
                        flushServicesPendingIntent();
                        return;
                    }
                    setServicesPhase("waiting");
                    servicesMediaRetryTimer = window.setTimeout(() => {
                        servicesMediaRetryTimer = 0;
                        if (token === servicesRunToken && servicesActive && !disposed && servicesPhase === "waiting") {
                            void runServicesReverseStage(nextStage);
                        }
                    }, 180);
                    return;
                }
            }
            root.dataset.servicesVideoDirection = useContinuousReverseBranch
                ? "reverse-playback"
                : "reverse-seek-fallback";
            const mediaTransition: Promise<boolean> = useContinuousReverseBranch
                ? playMediaSegment(servicesVideo, reverseFrom, reverseTo, SERVICES_PLAYBACK_RATE, () => token === servicesRunToken && servicesActive, true, true, continueFromWarmSeam, mobilePerformanceMode ? 2200 : MEDIA_SEGMENT_GRACE_MS)
                : scrubServicesMediaReverse(servicesVideo, legacyFrom, legacyTo, segmentDuration, nextStage, () => token === servicesRunToken && servicesActive).then(() => hasServicesTargetFrame(servicesVideo, legacyTo));
            const textTransition = animateServicesReversePanel(nextStage, segmentDuration);
            let mediaCompleted = true;
            if (packedAlphaCompatibilityMode && !useContinuousReverseBranch) {
                await textTransition;
                mediaCompleted = await mediaTransition;
            }
            else {
                [mediaCompleted] = await Promise.all([mediaTransition, textTransition]);
            }
            if (token !== servicesRunToken || !servicesActive || disposed)
                return;
            if (!mediaCompleted) {
                if (webkitCompatibilityMode && !useContinuousReverseBranch) {
                    delete root.dataset.servicesTransportFailure;
                    root.dataset.servicesTransportFallback = "reverse-seek-poster";
                    setServicesPanel(nextStage);
                    setServicesStaticStop(nextStage);
                    if (servicesVideo) {
                        pauseAndSeek(servicesVideo, legacyTo, 0.12);
                        servicesVideo.dataset.segmentState = "fallback";
                    }
                    primeWebkitServicesReverseBranch(nextStage);
                    resetServicesMediaRetry();
                    servicesGateUntil = performance.now() + SERVICES_POST_STAGE_GATE_MS;
                    setServicesPhase("waiting");
                    flushServicesPendingIntent();
                    return;
                }
                setServicesPanel(servicesStage);
                setServicesStaticStop(servicesStage);
                if (servicesVideo)
                    servicesVideo.dataset.segmentState = "buffering";
                if (shouldFailOpenServicesMedia(servicesVideo)) {
                    if (servicesVideo?.error) {
                        activateServicesMediaFallback();
                    }
                    else {
                        root.dataset.servicesTransportFailure = "reverse-stall";
                    }
                    setServicesPanel(nextStage);
                    setServicesStaticStop(nextStage);
                    resetServicesMediaRetry();
                    servicesGateUntil = performance.now() + SERVICES_POST_STAGE_GATE_MS;
                    setServicesPhase("waiting");
                    flushServicesPendingIntent();
                    return;
                }
                setServicesPhase("waiting");
                servicesMediaRetryTimer = window.setTimeout(() => {
                    servicesMediaRetryTimer = 0;
                    if (token === servicesRunToken && servicesActive && !disposed && servicesPhase === "waiting") {
                        void runServicesReverseStage(nextStage);
                    }
                }, 180);
                return;
            }
            const settledTime = useContinuousReverseBranch ? reverseTo : legacyTo;
            pauseAndSeek(servicesVideo, settledTime, 0.12);
            delete root.dataset.servicesVideoDirection;
            delete root.dataset.servicesReverseSeekFps;
            if (mediaCompleted) {
                setServicesStaticStop(null);
                root.dataset.servicesMediaDecoded = "true";
                if (servicesVideo)
                    servicesVideo.dataset.segmentState = "ready";
            }
            else {
                setServicesStaticStop(nextStage);
                delete root.dataset.servicesMediaDecoded;
                if (servicesVideo)
                    servicesVideo.dataset.segmentState = "fallback";
            }
            setServicesPanel(nextStage);
            resetServicesMediaRetry();
            servicesGateUntil = performance.now() + SERVICES_POST_STAGE_GATE_MS;
            setServicesPhase("waiting");
            flushServicesPendingIntent();
        };
        const requestServicesDirection = (direction: 1 | -1) => {
            if (!servicesActive || servicesPhase !== "waiting" || performance.now() < servicesGateUntil) {
                servicesGestureTotal = 0;
                return;
            }
            servicesGestureTotal = 0;
            if (direction < 0) {
                if (servicesStage > 0) {
                    void runServicesReverseStage(servicesStage - 1);
                }
                else {
                    releaseServicesBackward();
                }
            }
            else if (servicesStage < SERVICES_KEYFRAME_STOPS.length - 1) {
                void runServicesStage(servicesStage + 1);
            }
            else {
                void releaseServicesForward();
            }
        };
        function flushServicesPendingIntent() {
            window.clearTimeout(servicesPendingTimer);
            servicesPendingTimer = 0;
            if (!servicesActive || servicesPhase !== "waiting" || servicesPendingDirection === 0)
                return;
            const delay = Math.max(0, servicesGateUntil - performance.now());
            servicesPendingTimer = window.setTimeout(() => {
                servicesPendingTimer = 0;
                if (!servicesActive || servicesPhase !== "waiting" || servicesPendingDirection === 0)
                    return;
                const direction = servicesPendingDirection;
                servicesPendingDirection = 0;
                servicesPendingMagnitude = 0;
                servicesBlockedDirection = 0;
                servicesLastBlockedInputAt = 0;
                requestServicesDirection(direction);
            }, delay);
        }
        const isEditableTarget = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));
        const normalizeWheelDelta = (event: WheelEvent) => {
            if (event.deltaMode === WheelEvent.DOM_DELTA_LINE)
                return event.deltaY * 16;
            if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE)
                return event.deltaY * window.innerHeight;
            return event.deltaY;
        };
        const handleWheelCapture = (event: WheelEvent) => {
            if (event.ctrlKey)
                return;
            if (macPerformanceMode && servicesActive && !servicesReleasing && servicesTrigger && !servicesTrigger.isActive) {
                releaseServicesForNavigation();
                return;
            }
            if (servicesReleasing) {
                event.preventDefault();
                return;
            }
            if (dominoInputLocked) {
                event.preventDefault();
                return;
            }
            if (!servicesActive)
                return;
            event.preventDefault();
            const now = performance.now();
            const delta = normalizeWheelDelta(event);
            if (Math.abs(delta) < 0.01)
                return;
            const direction = delta >= 0 ? 1 : -1;
            const gestureThreshold = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 12 : 18;
            if (servicesPhase !== "waiting") {
                servicesGestureTotal = 0;
                queueServicesIntent(direction, Math.abs(delta), gestureThreshold);
                servicesLastBlockedInputAt = now;
                servicesBlockedDirection = direction;
                return;
            }
            if (now < servicesGateUntil) {
                servicesGestureTotal = 0;
                const deliberatePostStageGesture = Math.abs(delta) >= 72;
                queueServicesIntent(direction, Math.abs(delta), gestureThreshold, deliberatePostStageGesture);
                servicesLastBlockedInputAt = now;
                servicesBlockedDirection = direction;
                flushServicesPendingIntent();
                return;
            }
            if (direction === servicesBlockedDirection &&
                now - servicesLastBlockedInputAt < SERVICES_INPUT_QUIET_MS) {
                servicesGestureTotal = 0;
                return;
            }
            servicesBlockedDirection = 0;
            servicesLastBlockedInputAt = 0;
            servicesGestureTotal += delta;
            if (Math.abs(servicesGestureTotal) >= gestureThreshold) {
                requestServicesDirection(servicesGestureTotal > 0 ? 1 : -1);
            }
        };
        const handleTouchStart = (event: TouchEvent) => {
            servicesTouchStartedAtSettledStop =
                servicesActive && !servicesReleasing && servicesPhase === "waiting";
            if (servicesActive && !servicesReleasing) {
                servicesGestureTotal = 0;
                servicesLastBlockedInputAt = 0;
                servicesBlockedDirection = 0;
            }
            touchY = (servicesActive || servicesReleasing || dominoInputLocked) && event.touches[0]
                ? event.touches[0].clientY
                : null;
        };
        const handleTouchMove = (event: TouchEvent) => {
            if (servicesReleasing) {
                if (event.cancelable)
                    event.preventDefault();
                return;
            }
            if (dominoInputLocked) {
                if (event.cancelable)
                    event.preventDefault();
                return;
            }
            if (!servicesActive || !event.touches[0])
                return;
            const nextY = event.touches[0].clientY;
            if (touchY === null) {
                if (event.cancelable)
                    event.preventDefault();
                touchY = nextY;
                window.scrollTo({ top: servicesLockY, left: 0, behavior: "auto" });
                return;
            }
            const delta = touchY - nextY;
            touchY = nextY;
            if (event.cancelable)
                event.preventDefault();
            const now = performance.now();
            const direction = delta >= 0 ? 1 : -1;
            if (servicesPhase !== "waiting") {
                servicesGestureTotal = 0;
                queueServicesIntent(direction, Math.abs(delta), 10);
                servicesLastBlockedInputAt = now;
                servicesBlockedDirection = direction;
                return;
            }
            if (now < servicesGateUntil) {
                servicesGestureTotal = 0;
                queueServicesIntent(direction, Math.abs(delta), 10, servicesTouchStartedAtSettledStop);
                servicesLastBlockedInputAt = now;
                servicesBlockedDirection = direction;
                flushServicesPendingIntent();
                return;
            }
            if (direction === servicesBlockedDirection &&
                now - servicesLastBlockedInputAt < SERVICES_INPUT_QUIET_MS) {
                servicesGestureTotal = 0;
                return;
            }
            servicesBlockedDirection = 0;
            servicesLastBlockedInputAt = 0;
            servicesGestureTotal += delta;
            if (Math.abs(servicesGestureTotal) >= 10) {
                requestServicesDirection(servicesGestureTotal > 0 ? 1 : -1);
            }
        };
        const handleTouchEnd = () => {
            touchY = null;
            servicesGestureTotal = 0;
            if (servicesTouchStartedAtSettledStop &&
                servicesActive &&
                servicesPhase === "waiting" &&
                servicesPendingDirection !== 0) {
                flushServicesPendingIntent();
            }
            else {
                clearServicesPendingIntent();
            }
            servicesTouchStartedAtSettledStop = false;
            servicesLastBlockedInputAt = 0;
            servicesBlockedDirection = 0;
        };
        const handleKeydownCapture = (event: KeyboardEvent) => {
            const forward = event.key === "ArrowDown" || event.key === "PageDown" || event.key === "End" || (event.key === " " && !event.shiftKey);
            const backward = event.key === "ArrowUp" || event.key === "PageUp" || event.key === "Home" || (event.key === " " && event.shiftKey);
            if (!forward && !backward)
                return;
            if (isEditableTarget(event.target))
                return;
            if (servicesReleasing) {
                event.preventDefault();
                return;
            }
            if (servicesActive) {
                event.preventDefault();
                if (!event.repeat) {
                    const direction = forward ? 1 : -1;
                    if (servicesPhase !== "waiting" || performance.now() < servicesGateUntil) {
                        queueServicesIntent(direction, 160, 18, servicesPhase === "waiting");
                        if (servicesPhase === "waiting")
                            flushServicesPendingIntent();
                    }
                    else {
                        requestServicesDirection(direction);
                    }
                }
                return;
            }
            if (dominoInputLocked) {
                event.preventDefault();
            }
        };
        const maintainPinnedScroll = () => {
            const targetY = servicesActive && !servicesReleasing
                ? servicesLockY
                : dominoInputLocked
                    ? dominoLockY
                    : null;
            if (targetY !== null && Math.abs(window.scrollY - targetY) > 1) {
                window.scrollTo({ top: targetY, left: 0, behavior: "auto" });
            }
        };
        if (useLegacyServicesFlow) {
            let blockingInputAttached = false;
            const attachBlockingInput = () => {
                if (blockingInputAttached)
                    return;
                blockingInputAttached = true;
                window.addEventListener("wheel", handleWheelCapture, { capture: true, passive: false });
                window.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
                window.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
                window.addEventListener("touchend", handleTouchEnd, { capture: true, passive: true });
                window.addEventListener("touchcancel", handleTouchEnd, { capture: true, passive: true });
                window.addEventListener("keydown", handleKeydownCapture, true);
                window.addEventListener("scroll", maintainPinnedScroll, { passive: true });
            };
            const detachBlockingInput = () => {
                if (!blockingInputAttached)
                    return;
                blockingInputAttached = false;
                window.removeEventListener("wheel", handleWheelCapture, true);
                window.removeEventListener("touchstart", handleTouchStart, true);
                window.removeEventListener("touchmove", handleTouchMove, true);
                window.removeEventListener("touchend", handleTouchEnd, true);
                window.removeEventListener("touchcancel", handleTouchEnd, true);
                window.removeEventListener("keydown", handleKeydownCapture, true);
                window.removeEventListener("scroll", maintainPinnedScroll);
            };
            syncBlockingInputListeners = () => {
                if (servicesActive || servicesReleasing || dominoInputLocked)
                    attachBlockingInput();
                else
                    detachBlockingInput();
            };
            syncBlockingInputListeners();
            cleanupCallbacks.push(detachBlockingInput);
        }
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
                scrub: macPerformanceMode ? 0.1 : mobilePerformanceMode ? 0.12 : 0.18,
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
                scrollTrigger: {
                    trigger: clientsInner ?? clientsSection,
                    start: "top 96%",
                    end: "top -10%",
                    scrub: mobilePerformanceMode ? false : macPerformanceMode ? 0.08 : 0.24,
                    toggleActions: mobilePerformanceMode ? "play none none reverse" : undefined,
                    invalidateOnRefresh: true,
                    onLeave: () => clientsSection.setAttribute("data-client-cards-visible", "true"),
                    onEnterBack: () => clientsSection.removeAttribute("data-client-cards-visible"),
                    onLeaveBack: () => clientsSection.removeAttribute("data-client-cards-visible"),
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
            if (clientsScrollElement) {
                const clientsPlaneScale = window.innerWidth <= 900 ? 1 : 1.8;
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
                    },
                });
                cleanupCallbacks.push(() => {
                    clientsRotation.scrollTrigger?.kill();
                    clientsRotation.kill();
                });
            }
        }
        const servicesSection = root.querySelector<HTMLElement>(".services-story-section");
        if (servicesSection && clientsSection) {
            const clientsHandoffItems = Array.from(clientsSection.querySelectorAll<HTMLElement>(".figma-clients-heading, .figma-client-card-stage"));
            root.dataset.servicesSequence = useLegacyServicesFlow ? "autoplay" : "scroll-scrub";
            servicesVideo?.pause();
            clientsSection.style.removeProperty("--clients-handoff-y");
            clientsSection.style.removeProperty("--clients-handoff-opacity");
            if (clientsHandoffItems.length) {
                const clientsStarStage = root.querySelector<HTMLElement>(".first-four-galaxy-stage");
                const servicesStarReveal = servicesSection.querySelector<HTMLElement>(".services-galaxy-stage");
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
                const syncFirstServicesHandoffY = (progress: number, direction: 1 | -1) => {
                    if (!firstServicesItems.length)
                        return;
                    const start = 0.2;
                    const duration = 0.55;
                    const stagger = 0.035;
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
                            firstServicesHandoffDirection = self.direction < 0 ? -1 : 1;
                            syncFirstServicesHandoffY(self.progress, firstServicesHandoffDirection);
                        },
                        onRefresh: (self) => {
                            syncFirstServicesHandoffY(self.progress, firstServicesHandoffDirection);
                        },
                        onLeaveBack: () => {
                            if (servicesActive || servicesReleasing)
                                return;
                            showServicesIdlePreview();
                            pauseAndSeek(servicesVideo, 0);
                        },
                    },
                });
                syncClientsHandoff(clientsExitTrigger.progress);
                if (clientsStarStage) {
                    clientsServicesHandoff.fromTo(clientsStarStage, { opacity: 1 }, { opacity: 0, duration: 0.45, ease: "power2.out" }, 0);
                }
                if (servicesStarReveal) {
                    clientsServicesHandoff.fromTo(servicesStarReveal, { opacity: 0 }, { opacity: 1, duration: 0.82, ease: "power2.inOut" }, 0.2);
                }
                if (firstServicesItems.length) {
                    clientsServicesHandoff.fromTo(firstServicesItems, { autoAlpha: 0 }, {
                        autoAlpha: 1,
                        duration: 0.55,
                        stagger: 0.035,
                        ease: "power3.out",
                    }, 0.46);
                }
                if (servicesMediaVisuals.length) {
                    clientsServicesHandoff.fromTo(servicesMediaVisuals, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, ease: "power2.inOut" }, 0.42);
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
                    if (firstServicesItems.length)
                        gsap.set(firstServicesItems, { clearProps: "opacity,visibility,transform" });
                    if (servicesMediaVisuals.length) {
                        gsap.set(servicesMediaVisuals, { clearProps: "opacity,visibility" });
                    }
                });
            }
            const syncServicesApproach = (active: boolean) => {
                primaryGalaxyRef.current?.setActive(!active);
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
            const shouldBypassServicesMotion = () => !useLegacyServicesFlow ||
                (programmaticNavigationRef.current && programmaticAnchorRef.current !== "#services") ||
                (!initialHashHandledRef.current && Boolean(window.location.hash) && window.location.hash !== "#services");
            const howWorkBoundary = root.querySelector<HTMLElement>(".how-work-motion-section");
            const isNearServicesTrigger = (trigger: ScrollTrigger, viewportMargin = 1.25) => {
                const viewportHeight = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
                const margin = viewportHeight * viewportMargin;
                return window.scrollY >= trigger.start - margin && window.scrollY <= trigger.end + margin;
            };
            const canStartServicesMotion = (trigger: ScrollTrigger) => isNearServicesTrigger(trigger) &&
                isServicesVisuallyNear() &&
                root.dataset.dominoPinned !== "true" &&
                !dominoInputLocked;
            servicesTrigger = ScrollTrigger.create({
                id: "services-reversible",
                trigger: servicesSection,
                start: "top top",
                endTrigger: howWorkBoundary ?? undefined,
                end: () => !useLegacyServicesFlow
                    ? "top top"
                    : howWorkBoundary
                        ? "top top"
                        : `+=${Math.round(Math.max(1, window.visualViewport?.height ?? window.innerHeight))}`,
                pin: useLegacyServicesFlow,
                pinSpacing: !useLegacyServicesFlow,
                anticipatePin: 1,
                refreshPriority: 30,
                invalidateOnRefresh: true,
                onEnter: (self) => {
                    if (shouldBypassServicesMotion() || !canStartServicesMotion(self))
                        return;
                    startServicesForward(self.start + 1);
                },
                onEnterBack: (self) => {
                    if (!canStartServicesMotion(self))
                        return;
                    if (programmaticNavigationRef.current && programmaticAnchorRef.current === "#services") {
                        startServicesForward((servicesTrigger?.start ?? window.scrollY) + 1);
                        return;
                    }
                    if (shouldBypassServicesMotion())
                        return;
                    startServicesAtLastStage(self.end - 1);
                },
                onUpdate: (self) => {
                    if (servicesActive && !isServicesVisuallyNear(1.5)) {
                        releaseServicesForNavigation();
                        return;
                    }
                    if (!self.isActive || shouldBypassServicesMotion() || servicesActive || servicesReleasing)
                        return;
                    if (servicesPhase !== "idle")
                        return;
                    if (self.direction < 0)
                        startServicesAtLastStage(self.end - 1);
                    else
                        startServicesForward(self.start + 1);
                },
                onLeave: (self) => {
                    if (self.direction > 0 &&
                        !servicesActive &&
                        !servicesReleasing &&
                        servicesPhase === "idle" &&
                        !shouldBypassServicesMotion() &&
                        canStartServicesMotion(self)) {
                        startServicesForward(self.start + 1);
                        return;
                    }
                    if (!servicesActive) {
                        delete root.dataset.servicesPinned;
                        delete root.dataset.servicesInrange;
                    }
                },
                onLeaveBack: () => {
                    if (servicesReleasing)
                        return;
                    if (servicesActive) {
                        window.scrollTo({ top: servicesLockY, left: 0, behavior: "auto" });
                        return;
                    }
                    servicesRunToken += 1;
                    servicesReleaseToken += 1;
                    window.clearTimeout(servicesReleaseTimer);
                    servicesReleaseTimer = 0;
                    if (servicesVideo)
                        mediaRunCancels.get(servicesVideo)?.();
                    stopServicesTextTimeline();
                    servicesActive = false;
                    servicesReleasing = false;
                    servicesTransitionDirection = 0;
                    servicesGateUntil = 0;
                    servicesLastBlockedInputAt = 0;
                    servicesBlockedDirection = 0;
                    clearServicesPendingIntent();
                    setServicesPhase("idle");
                    showServicesIdlePreview();
                    pauseAndSeek(servicesVideo, 0);
                    delete root.dataset.servicesPinned;
                    delete root.dataset.servicesInrange;
                    releaseServicesLenisLock();
                    setMotionInputState();
                },
                onRefresh: (self) => {
                    if (servicesActive && (!isNearServicesTrigger(self) || !isServicesVisuallyNear(1.5))) {
                        releaseServicesForNavigation();
                        return;
                    }
                    if (servicesActive) {
                        servicesLockY = servicesEntryDirection < 0 ? self.end - 1 : self.start + 1;
                    }
                },
            });
            const servicesPrelockTrigger = ScrollTrigger.create({
                id: "services-prelock",
                trigger: servicesSection,
                start: "top 12%",
                end: "top top",
                refreshPriority: 31,
                invalidateOnRefresh: true,
                onEnter: (self) => {
                    if (self.direction < 0 ||
                        shouldBypassServicesMotion() ||
                        !canStartServicesMotion(servicesTrigger ?? self) ||
                        servicesActive ||
                        servicesReleasing) {
                        return;
                    }
                    startServicesForward((servicesTrigger?.start ?? self.end) + 1);
                },
            });
            cleanupCallbacks.push(() => servicesPrelockTrigger.kill());
            const startServicesReverseFromPrelock = () => {
                if (shouldBypassServicesMotion() ||
                    servicesActive ||
                    servicesReleasing ||
                    !servicesTrigger) {
                    return;
                }
                startServicesAtLastStage(servicesTrigger.end - 1);
            };
            const servicesReversePrelockTrigger = ScrollTrigger.create({
                id: "services-reverse-prelock",
                trigger: howWorkBoundary ?? servicesSection,
                start: howWorkBoundary ? "top 92%" : "bottom 20%",
                end: howWorkBoundary ? "top 12%" : "bottom top",
                refreshPriority: 31,
                invalidateOnRefresh: true,
                onEnterBack: (self) => {
                    if (self.direction < 0)
                        startServicesReverseFromPrelock();
                },
                onLeaveBack: (self) => {
                    if (self.direction < 0)
                        startServicesReverseFromPrelock();
                },
            });
            cleanupCallbacks.push(() => servicesReversePrelockTrigger.kill());
            if (!useLegacyServicesFlow) {
                servicesTrigger.kill();
                servicesTrigger = null;
            }
            const handleServicesPositionApplied = () => {
                if (programmaticAnchorRef.current === "#services" && servicesTrigger) {
                    startServicesForward(servicesTrigger.start + 1);
                }
            };
            window.addEventListener("tasc:scroll-position-applied", handleServicesPositionApplied);
            const settleServicesWhenHidden = (event: Event) => {
                if (event.type !== "pagehide" && document.visibilityState !== "hidden")
                    return;
                if (!servicesActive || servicesPhase !== "playing")
                    return;
                const targetStage = Math.min(SERVICES_KEYFRAME_STOPS.length - 1, Math.max(0, Number(root.dataset.servicesActive ?? 1) - 1));
                servicesRunToken += 1;
                if (servicesVideo)
                    mediaRunCancels.get(servicesVideo)?.();
                stopServicesTextTimeline();
                clearServicesPendingIntent();
                servicesLastBlockedInputAt = 0;
                servicesBlockedDirection = 0;
                pauseAndSeek(servicesVideo, SERVICES_KEYFRAME_STOPS[targetStage]);
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
            if (useLegacyServicesFlow)
                showServicesIdlePreview();
        }
        const howWorkSection = root.querySelector<HTMLElement>(".how-work-motion-section");
        if (howWorkSection && !useReversibleHowFlow) {
            const howWorkInner = howWorkSection.querySelector<HTMLElement>(".how-work-motion-inner");
            const howWorkIntroItems = Array.from(howWorkSection.querySelectorAll<HTMLElement>(".how-work-motion-kicker, .how-work-motion-title h2 > span, .how-work-motion-support, .how-work-number-row, .how-work-rule, .how-work-copy-stack"));
            const stepNumbers = Array.from(howWorkSection.querySelectorAll<HTMLElement>(".how-work-step-number"));
            const stepCopies = Array.from(howWorkSection.querySelectorAll<HTMLElement>(".how-work-step-copy"));
            const stepCopyItems = stepCopies.map((copy) => Array.from(copy.querySelectorAll<HTMLElement>("h3, p")));
            const inactiveNumber = {
                scale: 0.58,
                autoAlpha: 0.54,
                color: "rgba(119, 177, 244, 0.7)",
                filter: "blur(0px)",
                duration: 0.5,
                ease: "power3.inOut",
            };
            const activeNumber = {
                scale: 1.22,
                autoAlpha: 1,
                color: "#badaff",
                filter: "blur(0px)",
                duration: 0.5,
                ease: "power3.inOut",
            };
            gsap.set(stepCopies, { x: -52, y: 0, autoAlpha: 0 });
            gsap.set(stepCopies[0], { x: 0, y: 0, autoAlpha: 1 });
            gsap.set(stepCopyItems.flat(), { y: 18, autoAlpha: 0 });
            gsap.set(stepNumbers, inactiveNumber);
            gsap.set(stepNumbers[0], activeNumber);
            gsap.set(howWorkIntroItems, { y: 48, autoAlpha: 0 });
            const revealHowWorkIntro = () => {
                gsap.to(howWorkIntroItems, {
                    y: 0,
                    autoAlpha: 1,
                    duration: 0.82,
                    ease: "power4.out",
                    stagger: 0.085,
                    overwrite: true,
                });
                gsap.to(stepCopyItems[0], {
                    y: 0,
                    autoAlpha: 1,
                    duration: 0.46,
                    ease: "power3.out",
                    stagger: 0.075,
                    overwrite: true,
                    delay: 0.18,
                });
            };
            const resetHowWorkIntro = () => {
                gsap.set(howWorkIntroItems, { y: 48, autoAlpha: 0, overwrite: true });
                gsap.set(stepCopyItems[0], { y: 18, autoAlpha: 0, overwrite: true });
            };
            ScrollTrigger.create({
                trigger: howWorkSection,
                start: "top 80%",
                end: "bottom top",
                onEnter: revealHowWorkIntro,
                onEnterBack: revealHowWorkIntro,
                onLeave: resetHowWorkIntro,
                onLeaveBack: resetHowWorkIntro,
            });
            howWorkTimeline = gsap.timeline({
                defaults: { ease: "none" },
                scrollTrigger: {
                    id: "how-work-motion",
                    trigger: howWorkSection,
                    start: "top top",
                    end: () => `+=${Math.round(window.innerHeight * (window.innerWidth <= 760 ? 1 : 0.9))}`,
                    scrub: true,
                    pin: true,
                    anticipatePin: 1,
                    invalidateOnRefresh: true,
                },
            });
            howWorkTimeline
                .addLabel("step1", 0)
                .to({}, { duration: 0.22 })
                .addLabel("step2")
                .to(stepCopies[0], { x: 58, autoAlpha: 0, duration: 0.24, ease: "power3.inOut" }, "step2")
                .to(stepNumbers[0], inactiveNumber, "step2+=0.1")
                .to(stepNumbers[1], activeNumber, "step2+=0.1")
                .fromTo(stepCopies[1], { x: -58, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.32, ease: "power3.out" }, "step2+=0.12")
                .fromTo(stepCopyItems[1], { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.24, stagger: 0.055, ease: "power3.out" }, "step2+=0.18")
                .to({}, { duration: 0.24 })
                .addLabel("step3")
                .to(stepCopies[1], { x: 58, autoAlpha: 0, duration: 0.24, ease: "power3.inOut" }, "step3")
                .to(stepNumbers[1], inactiveNumber, "step3+=0.1")
                .to(stepNumbers[2], activeNumber, "step3+=0.1")
                .fromTo(stepCopies[2], { x: -58, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.32, ease: "power3.out" }, "step3+=0.12")
                .fromTo(stepCopyItems[2], { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.24, stagger: 0.055, ease: "power3.out" }, "step3+=0.18")
                .to({}, { duration: 0.26 });
            if (howWorkInner) {
                howWorkTimeline.to(howWorkInner, { y: -62, autoAlpha: 0, duration: 0.24, ease: "power3.inOut" }, ">-=0.06");
            }
        }
        const datumSection = root.querySelector<HTMLElement>(".datum-motion-section");
        if (datumSection && useAutonomousDatumFlow) {
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
                let stableDatumViewportWidth = window.innerWidth;
                let stableDatumViewportHeight = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
                const getStableDatumPinDistance = () => {
                    const nextWidth = window.innerWidth;
                    const nextHeight = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
                    const isRealViewportChange = Math.abs(nextWidth - stableDatumViewportWidth) > 80 ||
                        Math.abs(nextHeight - stableDatumViewportHeight) >
                            Math.max(180, stableDatumViewportHeight * 0.28);
                    if (isRealViewportChange) {
                        stableDatumViewportWidth = nextWidth;
                        stableDatumViewportHeight = nextHeight;
                    }
                    const coarse = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
                    const proportionalTravel = stableDatumViewportHeight * (coarse ? 0.86 : 0.74);
                    return Math.round(Math.min(coarse ? 760 : 700, Math.max(coarse ? 560 : 500, proportionalTravel)));
                };
                gsap.set(datumCardsState, { y: 0, autoAlpha: 1, pointerEvents: "none" });
                gsap.set(datumCardsRevealItems, { y: 0, autoAlpha: 1 });
                if (datumHeading) {
                    gsap.set(datumHeading, { autoAlpha: 1, clearProps: "transform,willChange" });
                }
                gsap.set(datumHeadingItems, { y: 0, autoAlpha: 1, force3D: false });
                gsap.set(datumCardDetails, { y: 0, autoAlpha: 1 });
                gsap.set(datumWaitlistState, { y: 0, autoAlpha: 0, pointerEvents: "none" });
                gsap.set(datumWaitlistSegments, { y: 30, autoAlpha: 0 });
                setRegionInteractive(datumCardsState, false);
                setRegionInteractive(datumWaitlistState, false);
                const cardsRevealTimeline = gsap
                    .timeline({ paused: true })
                    .set(datumWaitlistState, { pointerEvents: "none" }, 0)
                    .set(datumCardsState, { autoAlpha: 1, pointerEvents: "auto" }, 0)
                    .set(datumHeading ?? [], { autoAlpha: 1, clearProps: "transform,willChange" }, 0)
                    .fromTo(datumCardsRevealItems, { y: 46, autoAlpha: 1 }, {
                    y: 0,
                    autoAlpha: 1,
                    duration: revealTime(1.34),
                    ease: "power4.out",
                    stagger: revealTime(0.2),
                }, 0)
                    .fromTo(datumHeadingItems, { y: 18, autoAlpha: 0 }, {
                    y: 0,
                    autoAlpha: 1,
                    duration: revealTime(0.82),
                    ease: "power3.out",
                    stagger: revealTime(0.14),
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
                        duration: revealTime(1.02),
                        ease: "power3.out",
                        stagger: revealTime(0.14),
                    }, 0.3 + CONTENT_REVEAL_LAG + cardIndex * revealTime(0.24));
                });
                const resetDatumContent = () => {
                    datumContentState = null;
                    cardsRevealTimeline.timeScale(1).pause(0);
                    gsap.set(datumCardsState, { y: 0, autoAlpha: 1, pointerEvents: "none" });
                    if (datumHeading) {
                        gsap.set(datumHeading, { autoAlpha: 1, clearProps: "transform,willChange" });
                    }
                    gsap.set(datumCardsRevealItems, { y: 46, autoAlpha: 1 });
                    gsap.set(datumHeadingItems, { y: 18, autoAlpha: 0, force3D: false });
                    gsap.set(datumCardDetails, { y: 16, autoAlpha: 0 });
                    gsap.set(datumWaitlistState, { y: 0, autoAlpha: 0, pointerEvents: "none" });
                    gsap.set(datumWaitlistSegments, { y: 30, autoAlpha: 0 });
                    setRegionInteractive(datumCardsState, false);
                    setRegionInteractive(datumWaitlistState, false);
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
                    root.dataset.datumProgress = progress.toFixed(3);
                    if (progress < 0.48) {
                        gsap.set(datumCardDetails, { y: 0, autoAlpha: 1 });
                    }
                    const nextState = progress <= 0.44
                        ? "cards"
                        : progress >= 0.8
                            ? "waitlist"
                            : "transition";
                    if (nextState === datumContentState)
                        return;
                    datumContentState = nextState;
                    const cardsInteractive = nextState === "cards";
                    const waitlistInteractive = nextState === "waitlist";
                    setRegionInteractive(datumCardsState, cardsInteractive);
                    setRegionInteractive(datumWaitlistState, waitlistInteractive);
                    gsap.set(datumCardsState, { pointerEvents: cardsInteractive ? "auto" : "none" });
                    gsap.set(datumWaitlistState, { pointerEvents: waitlistInteractive ? "auto" : "none" });
                };
                resetDatumContent();
                const datumVisibilityGuard = ScrollTrigger.create({
                    id: "datum-content-visibility",
                    trigger: datumSection,
                    start: () => `top ${Math.round(getVisualViewportHeight() * (1 - RUNTIME_MEDIA.datum.visibilityRatio))}px`,
                    end: "bottom top",
                    invalidateOnRefresh: true,
                    onEnter: () => {
                        if (datumContentState === null)
                            showDatumCards();
                    },
                });
                const datumVisibilityResetGuard = ScrollTrigger.create({
                    id: "datum-content-reset",
                    trigger: datumSection,
                    start: "top bottom",
                    end: "bottom top",
                    onLeaveBack: () => resetDatumContent(),
                });
                datumTimeline = gsap.timeline({
                    defaults: { ease: "none" },
                    scrollTrigger: {
                        id: "datum-reversible",
                        trigger: datumSection,
                        start: "top top",
                        end: () => `+=${getStableDatumPinDistance()}`,
                        pin: true,
                        pinSpacing: true,
                        scrub: 0.28,
                        refreshPriority: 10,
                        invalidateOnRefresh: true,
                        onToggle: (self) => {
                            root.dataset.datumPinned = String(self.isActive);
                        },
                        onEnter: (self) => {
                            if (datumContentState === null)
                                showDatumCards();
                            if (cardsRevealTimeline.progress() < 1) {
                                cardsRevealTimeline.timeScale(2.25).play();
                            }
                            syncDatumContent(self.progress);
                        },
                        onEnterBack: (self) => {
                            syncDatumContent(self.progress);
                        },
                        onUpdate: (self) => {
                            syncDatumContent(self.progress);
                        },
                        onRefresh: (self) => {
                            if (self.isActive) {
                                syncDatumContent(self.progress);
                            }
                        },
                        onLeave: () => {
                            syncDatumContent(1);
                        },
                        onLeaveBack: () => {
                            syncDatumContent(0);
                        },
                    },
                });
                datumTimeline
                    .addLabel("cards", 0)
                    .to({}, { duration: 0.4 })
                    .to(datumCardsExitItems, {
                    y: -36,
                    autoAlpha: 0,
                    duration: 0.18,
                    stagger: 0.02,
                    ease: "power3.in",
                    overwrite: "auto",
                }, 0.4)
                    .set(datumCardsState, { autoAlpha: 0, pointerEvents: "none" }, 0.64)
                    .set(datumWaitlistState, { autoAlpha: 1, pointerEvents: "none" }, 0.72)
                    .addLabel("waitlist", 0.72)
                    .fromTo(datumWaitlistSegments, { y: 34, autoAlpha: 0 }, {
                    y: 0,
                    autoAlpha: 1,
                    duration: 0.28,
                    stagger: 0.018,
                    ease: "power3.out",
                    immediateRender: false,
                    overwrite: "auto",
                }, 0.74)
                    .to({}, { duration: 0.28 });
                cleanupCallbacks.push(() => {
                    datumVisibilityGuard.kill();
                    datumVisibilityResetGuard.kill();
                    cardsRevealTimeline.kill();
                    delete root.dataset.datumPinned;
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
            cleanupCallbacks.push(() => {
                processHeaderToneTrigger.kill();
                delete root.dataset.processInrange;
            });
        }
        const ctaSection = root.querySelector<HTMLElement>(".domino-cta-section");
        if (ctaSection && !useReversibleDominoFlow) {
            const dominoTargetTime = DOMINO_DURATION - 0.02;
            ctaTimeline = gsap.timeline({
                paused: true,
                defaults: { ease: "power3.out" },
            });
            ctaTimeline
                .addLabel("ctaIntro", 0)
                .to(".domino-media", { scale: 1, autoAlpha: 1, duration: 0.62, ease: "power2.out" }, "ctaIntro")
                .to(".domino-media", { scale: 1.032, duration: 3.18, ease: "power1.inOut" }, "ctaIntro+=0.42")
                .to({}, { duration: 0.01 }, dominoTargetTime);
            const playDominoTimeline = () => new Promise<void>((resolve) => {
                if (!ctaTimeline) {
                    resolve();
                    return;
                }
                const timeline = ctaTimeline;
                window.clearTimeout(dominoTimelineWatchdog);
                dominoTimelineResolve?.();
                dominoTimelineResolve = resolve;
                const settleTimeline = (forceToEnd = false) => {
                    if (dominoTimelineResolve !== resolve)
                        return;
                    window.clearTimeout(dominoTimelineWatchdog);
                    dominoTimelineWatchdog = 0;
                    timeline.eventCallback("onComplete", null);
                    if (forceToEnd)
                        timeline.progress(1).pause();
                    dominoTimelineResolve = null;
                    resolve();
                };
                timeline.eventCallback("onComplete", () => settleTimeline());
                timeline.restart();
                dominoTimelineWatchdog = window.setTimeout(() => settleTimeline(true), Math.ceil((dominoTargetTime + DOMINO_TIMELINE_GRACE_MS / 1000) * 1000));
            });
            const resetDominoPlayback = (resumeScroll = true) => {
                dominoRunToken += 1;
                if (dominoVideo)
                    mediaRunCancels.get(dominoVideo)?.();
                window.clearTimeout(dominoTimelineWatchdog);
                dominoTimelineWatchdog = 0;
                dominoTimelineResolve?.();
                dominoTimelineResolve = null;
                ctaTimeline?.eventCallback("onComplete", null);
                dominoInputLocked = false;
                dominoCompleted = false;
                dominoEntryDirection = 1;
                pauseAndSeek(dominoVideo, 0);
                if (dominoVideo)
                    dominoVideo.dataset.segmentState = "idle";
                ctaTimeline?.pause(0);
                root.dataset.dominoPlayback = "idle";
                setMotionInputState();
                if (resumeScroll)
                    lenis.start();
            };
            const releaseDominoForNavigation = () => {
                resetDominoPlayback();
            };
            dominoControllerRef.current = { releaseForNavigation: releaseDominoForNavigation };
            const completeDominoPlayback = () => {
                if (dominoVideo)
                    mediaRunCancels.get(dominoVideo)?.();
                window.clearTimeout(dominoTimelineWatchdog);
                dominoTimelineWatchdog = 0;
                dominoTimelineResolve?.();
                dominoTimelineResolve = null;
                ctaTimeline?.eventCallback("onComplete", null);
                pauseAndSeek(dominoVideo, dominoTargetTime);
                if (dominoVideo)
                    dominoVideo.dataset.segmentState = "ready";
                ctaTimeline?.progress(1).pause();
                dominoInputLocked = false;
                dominoCompleted = true;
                root.dataset.dominoPlayback = "complete";
                setMotionInputState();
                lenis.start();
            };
            const runDominoAutoplay = async (lockY: number, entryDirection: 1 | -1) => {
                if (dominoInputLocked || dominoCompleted)
                    return;
                const token = ++dominoRunToken;
                dominoInputLocked = true;
                dominoCompleted = false;
                dominoLockY = lockY;
                dominoEntryDirection = entryDirection;
                root.dataset.dominoPlayback = "playing";
                pauseAndSeek(dominoVideo, 0);
                ctaTimeline?.pause(0);
                lenis.stop();
                window.scrollTo({ top: dominoLockY, left: 0, behavior: "auto" });
                setMotionInputState();
                const dominoMediaReady = await ensureServicesPlayable(dominoVideo, dominoTargetTime, () => token === dominoRunToken && dominoInputLocked);
                if (token !== dominoRunToken || !dominoInputLocked || disposed)
                    return;
                if (!dominoMediaReady) {
                    root.dataset.dominoPlayback = "buffering";
                    dominoInputLocked = false;
                    setMotionInputState();
                    lenis.start();
                    return;
                }
                const [mediaCompleted] = await Promise.all([
                    playMediaSegment(dominoVideo, 0, dominoTargetTime, DOMINO_PLAYBACK_RATE, () => token === dominoRunToken && dominoInputLocked),
                    playDominoTimeline(),
                ]);
                if (token !== dominoRunToken || !dominoInputLocked || disposed)
                    return;
                if (!mediaCompleted) {
                    resetDominoPlayback(false);
                    root.dataset.dominoPlayback = "buffering";
                    return;
                }
                completeDominoPlayback();
            };
            const shouldBypassDominoMotion = () => (programmaticNavigationRef.current && programmaticAnchorRef.current !== "#brief") ||
                (!initialHashHandledRef.current && Boolean(window.location.hash) && window.location.hash !== "#brief");
            const ensureDominoEntry = (self: ScrollTrigger, entryDirection: 1 | -1 = 1) => {
                if (shouldBypassDominoMotion() || dominoInputLocked || dominoCompleted)
                    return;
                if (servicesActive || servicesReleasing || servicesOwnsLenisLock) {
                    if (isServicesVisuallyNear(1.5))
                        return;
                    releaseServicesForNavigation();
                }
                void runDominoAutoplay(entryDirection < 0 ? self.end - 1 : self.start + 1, entryDirection);
            };
            const dominoScene = ctaSection.querySelector<HTMLElement>(".domino-scene");
            ctaTrigger = ScrollTrigger.create({
                id: "domino-motion",
                trigger: dominoScene ?? ctaSection,
                start: "top top",
                end: () => `+=${Math.max(48, Math.round(window.innerHeight * 0.08))}`,
                pin: true,
                anticipatePin: 1,
                invalidateOnRefresh: true,
                onEnter: (self) => {
                    ensureDominoEntry(self, 1);
                },
                onEnterBack: (self) => {
                    if (shouldBypassDominoMotion())
                        return;
                    resetDominoPlayback(false);
                    ensureDominoEntry(self, -1);
                },
                onUpdate: (self) => {
                    if (self.isActive && self.direction > 0)
                        ensureDominoEntry(self, 1);
                },
                onLeave: () => {
                    if (dominoInputLocked) {
                        window.scrollTo({ top: dominoLockY, left: 0, behavior: "auto" });
                        return;
                    }
                    if (!dominoCompleted) {
                        resetDominoPlayback();
                        return;
                    }
                    pauseAndSeek(dominoVideo, dominoTargetTime);
                    if (dominoVideo)
                        dominoVideo.dataset.segmentState = "ready";
                    ctaTimeline?.progress(1).pause();
                    root.dataset.dominoPlayback = "complete";
                    lenis.start();
                },
                onLeaveBack: () => {
                    if (dominoInputLocked) {
                        window.scrollTo({ top: dominoLockY, left: 0, behavior: "auto" });
                        return;
                    }
                    resetDominoPlayback();
                },
                onRefresh: (self) => {
                    if (dominoInputLocked)
                        dominoLockY = dominoEntryDirection < 0 ? self.end - 1 : self.start + 1;
                },
            });
            const handleDominoPositionApplied = () => {
                if (programmaticAnchorRef.current === "#brief" && ctaTrigger)
                    ensureDominoEntry(ctaTrigger);
            };
            window.addEventListener("tasc:scroll-position-applied", handleDominoPositionApplied);
            const settleDominoWhenHidden = (event: Event) => {
                if ((event.type === "pagehide" || document.visibilityState === "hidden") && dominoInputLocked) {
                    completeDominoPlayback();
                }
            };
            document.addEventListener("visibilitychange", settleDominoWhenHidden);
            window.addEventListener("pagehide", settleDominoWhenHidden);
            cleanupCallbacks.push(() => {
                window.removeEventListener("tasc:scroll-position-applied", handleDominoPositionApplied);
                document.removeEventListener("visibilitychange", settleDominoWhenHidden);
                window.removeEventListener("pagehide", settleDominoWhenHidden);
            });
        }
        const revealElements = gsap.utils.toArray<HTMLElement>(".reveal-block").filter((element) => !element.closest(".hero-motion") &&
            !element.closest(".domino-cta-section") &&
            !element.closest(".services-section") &&
            !element.classList.contains("stagger-reveal-group") &&
            !element.closest(".stagger-reveal-group") &&
            !element.classList.contains("process-contact-row"));
        revealElements.forEach((element) => {
            const revealElement = (fromY: number) => {
                gsap.set(element, { y: fromY, autoAlpha: 0, overwrite: true });
                gsap.to(element, {
                    y: 0,
                    autoAlpha: 1,
                    duration: revealTime(1.34),
                    ease: "power4.out",
                    overwrite: true,
                });
            };
            gsap.set(element, { y: 18, autoAlpha: 0 });
            ScrollTrigger.create({
                trigger: element,
                start: "top 84%",
                end: "bottom 8%",
                onEnter: () => revealElement(18),
                onEnterBack: () => revealElement(-18),
                onLeave: () => gsap.set(element, { y: -18, autoAlpha: 0, overwrite: true }),
                onLeaveBack: () => gsap.set(element, { y: 18, autoAlpha: 0, overwrite: true }),
            });
        });
        const staggerRevealGroups = gsap.utils.toArray<HTMLElement>(".stagger-reveal-group").filter((group) => !group.closest(".hero-motion") &&
            !group.closest(".services-section") &&
            !group.closest(".how-work-motion-section") &&
            !group.closest(".datum-motion-section"));
        staggerRevealGroups.forEach((group) => {
            const items = Array.from(group.querySelectorAll<HTMLElement>(".stagger-reveal-item"));
            const isProcessHeader = group.classList.contains("process-contact-header");
            if (items.length === 0) {
                return;
            }
            const revealItems = (fromY: number) => {
                gsap.set(items, { y: fromY, autoAlpha: 0, overwrite: true });
                gsap.to(items, {
                    y: 0,
                    autoAlpha: 1,
                    duration: revealTime(1.36),
                    ease: "power4.out",
                    stagger: revealTime(0.18),
                    overwrite: true,
                });
            };
            const resetItems = (toY: number) => {
                gsap.set(items, { y: toY, autoAlpha: 0, overwrite: true });
            };
            gsap.set(items, { y: 30, autoAlpha: 0 });
            ScrollTrigger.create({
                trigger: group,
                start: isProcessHeader ? "top 96%" : "top 84%",
                end: "bottom 8%",
                onEnter: () => revealItems(30),
                onEnterBack: () => revealItems(-30),
                onLeave: () => resetItems(-30),
                onLeaveBack: () => resetItems(30),
            });
        });
        const processRows = gsap.utils.toArray<HTMLElement>(".process-contact-row");
        if (processRows.length > 0) {
            const processRowParts = new Map(processRows.map((row) => [
                row,
                Array.from(row.querySelectorAll<HTMLElement>(".process-contact-row-title > span, .process-contact-row-title > h3, :scope > p")),
            ]));
            gsap.set(processRows, { y: 34, autoAlpha: 0 });
            gsap.set(Array.from(processRowParts.values()).flat(), { y: 16, autoAlpha: 0 });
            const revealProcessBatch = (batch: Element[], reverse = false) => {
                gsap.to(batch, {
                    y: 0,
                    autoAlpha: 1,
                    duration: revealTime(1.34),
                    ease: "power4.out",
                    stagger: revealTime(reverse ? 0.14 : 0.18),
                    overwrite: true,
                });
                batch.forEach((element, batchIndex) => {
                    const row = element as HTMLElement;
                    const parts = processRowParts.get(row);
                    if (!parts?.length)
                        return;
                    gsap.to(parts, {
                        y: 0,
                        autoAlpha: 1,
                        duration: revealTime(0.92),
                        delay: revealTime(0.16 + batchIndex * 0.14),
                        ease: "power3.out",
                        stagger: revealTime(0.12),
                        overwrite: true,
                    });
                });
            };
            const resetProcessBatch = (batch: Element[], toY: number) => {
                gsap.set(batch, { y: toY, autoAlpha: 0, overwrite: true });
                batch.forEach((element) => {
                    const parts = processRowParts.get(element as HTMLElement);
                    if (parts?.length)
                        gsap.set(parts, { y: toY > 0 ? 16 : -16, autoAlpha: 0, overwrite: true });
                });
            };
            ScrollTrigger.batch(processRows, {
                start: "top 80%",
                end: "bottom 8%",
                once: false,
                batchMax: 1,
                onEnter: (batch) => revealProcessBatch(batch),
                onEnterBack: (batch) => revealProcessBatch(batch, true),
                onLeave: (batch) => resetProcessBatch(batch, -34),
                onLeaveBack: (batch) => resetProcessBatch(batch, 34),
            });
        }
        gsap.utils.toArray<HTMLElement>(".motion-divider").forEach((element) => {
            const revealDivider = () => gsap.to(element, { "--line-progress": "100%", duration: revealTime(1.36), ease: "power2.out" });
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
        document.fonts?.ready.then(refreshScroll);
        lensVideo?.addEventListener("loadedmetadata", handleLensMetadata, { once: true });
        return () => {
            disposed = true;
            servicesRunToken += 1;
            servicesReleaseToken += 1;
            dominoRunToken += 1;
            resetServicesMediaRetry();
            window.clearTimeout(servicesReleaseTimer);
            servicesReleaseTimer = 0;
            clearServicesPendingIntent();
            window.clearTimeout(dominoTimelineWatchdog);
            dominoTimelineWatchdog = 0;
            mediaRunCancels.forEach((cancel) => cancel());
            mediaRunCancels.clear();
            dominoTimelineResolve?.();
            dominoTimelineResolve = null;
            stopServicesTextTimeline();
            servicesActive = false;
            servicesReleasing = false;
            dominoInputLocked = false;
            releaseServicesLenisLock();
            lenis.start();
            lensVideo?.removeEventListener("loadedmetadata", handleLensMetadata);
            cleanupCallbacks.forEach((cleanup) => cleanup());
            cancelAnimationFrame(refreshId);
            lenis.off("scroll", handleSmoothScrollUpdate);
            cancelAnimationFrame(rafId);
            servicesTrigger?.kill();
            servicesVideo?.pause();
            dominoVideo?.pause();
            howWorkTimeline?.scrollTrigger?.kill();
            howWorkTimeline?.kill();
            datumTimeline?.scrollTrigger?.kill();
            datumTimeline?.kill();
            ctaTrigger?.kill();
            ctaTimeline?.kill();
            lenis.destroy();
            [
                "servicesPinned",
                "servicesInrange",
                "servicesActive",
                "servicesPreview",
                "servicesSequence",
                "servicesPhase",
                "servicesMediaDecoded",
                "servicesTransportFailure",
                "servicesStaticStop",
                "servicesEntryPoster",
                "datumProgress",
                "datumPinned",
                "dominoPlayback",
                "motionInputLocked",
                "wheelScrollRate",
            ].forEach((key) => delete root.dataset[key]);
            if (lenisRef.current === lenis) {
                lenisRef.current = null;
            }
            if (heroTimelineRef.current === heroTimeline) {
                heroTimelineRef.current = null;
            }
            servicesControllerRef.current = null;
            dominoControllerRef.current = null;
        };
    }, {
        scope: rootRef,
        dependencies: [
            macPerformanceMode,
            mobilePerformanceMode,
            packedAlphaCompatibilityMode,
            preloaderRevealStarted,
            motionAllowed,
        ],
        revertOnUpdate: true,
    });
    useReversibleScrollStories({
        rootRef,
        dominoVideoRef,
        dominoReverseVideoRef,
        lenisRef,
        transportKey: "how-authored-v1",
        enabled: preloaderRevealStarted && motionAllowed,
        story: "how",
    });
    useReversibleScrollStories({
        rootRef,
        dominoVideoRef,
        dominoReverseVideoRef,
        lenisRef,
        transportKey: dominoTransportKey,
        onForwardCompletedOnce: armDominoReverseMedia,
        enabled: preloaderRevealStarted && motionAllowed,
        story: "domino",
    });
    useMobilePortionedScroll({
        rootRef,
        lenisRef,
        enabled: preloaderRevealStarted && motionAllowed,
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
            if (motionAllowed) {
                ScrollTrigger.sort();
                ScrollTrigger.refresh();
            }
            navigationFrame = window.requestAnimationFrame(() => {
                initialHashHandledRef.current = true;
                handleAnchorNavigate(hash, { replaceHistory: false });
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
                if (motionAllowed) {
                    ScrollTrigger.sort();
                    ScrollTrigger.refresh();
                }
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
    return (<main ref={rootRef} className={`site-shell ${preloaderComplete ? "site-preloader-complete" : ""} ${heroIntroReady ? "hero-intro-ready" : ""}`} data-hero-starfield="react-bits-galaxy" data-starfield-mode={!performanceModeResolved || (motionAllowed && galaxyStatus === "pending")
            ? "pending"
            : motionAllowed && galaxyStatus === "ready"
                ? "galaxy"
                : "static"} data-hero-video={motionAllowed ? heroVideoState : "fallback"} data-services-galaxy-status={servicesGalaxyStatus} data-services-media-fallback={servicesMediaFallback ? "true" : undefined} data-lower-media-ready={lowerMediaWarmReady ? "true" : undefined} data-lower-media-outcome={!motionAllowed
            ? "skipped"
            : lowerMediaHasFallback && lowerMediaSettled
                ? "fallback"
                : lowerMediaPrepared
                    ? "prepared"
                    : lowerMediaWarmDeadlineReached
                        ? "deadline"
                        : "pending"} data-services-media-prepared={servicesMediaPrepared ? "true" : undefined} data-datum-media-armed={datumMediaArmed ? "true" : undefined} data-datum-media-prepared={datumMediaPrepared ? "true" : undefined} data-datum-media-fallback={datumMediaFallback ? "true" : undefined} data-domino-media-prepared={dominoForwardPrepared ? "true" : undefined} data-domino-media-fallback={dominoForwardFallback ? "true" : undefined} data-domino-reverse-media-prepared={dominoReversePrepared ? "true" : undefined} data-domino-reverse-media-fallback={dominoReverseFallback ? "true" : undefined} data-hero-surface-ready={preloaderReady || preloaderRevealStarted ? "true" : undefined} data-mobile-performance={mobilePerformanceMode ? "true" : undefined} data-mac-performance={macPerformanceMode ? "true" : undefined} data-webkit-compatibility={webkitCompatibilityMode ? "true" : undefined} data-services-media={servicesPackedTransportMode ? "packed-alpha-video" : "native-alpha-video"} data-vision-logo-armed={visionLogoArmed ? "true" : undefined} data-galaxy-visibility-root>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      {!preloaderComplete ? (<SitePreloader ready={preloaderReady} onRevealStart={() => {
                if (!window.location.hash)
                    resetToTop();
                setPreloaderRevealStarted(true);
                setHeroIntroReady(true);
            }} onComplete={() => {
                setPreloaderComplete(true);
            }}/>) : null}
      <TascHeader onNavigate={handleAnchorNavigate}/>
      {preloaderComplete ? <CookieConsent /> : null}
      <div className="first-four-galaxy-stage" aria-hidden="true">
        <span className="static-starfield-fallback"/>
        {heroIntroReady && motionPreferenceResolved && performanceModeResolved && motionAllowed ? (<>
            <Galaxy {...GALAXY_SHARED_PROPS} ref={primaryGalaxyRef} className="first-four-galaxy first-four-galaxy-primary" data-galaxy-layer="primary" density={mobilePerformanceMode || webkitCompatibilityMode ? 0.72 : 1.3} starSpeed={mobilePerformanceMode || webkitCompatibilityMode ? 0.86 : 1.08} speed={mobilePerformanceMode || webkitCompatibilityMode ? 1.08 : 1.44} rotationSpeed={mobilePerformanceMode || webkitCompatibilityMode ? 0.1 : 0.15} autoCenterRepulsion={mobilePerformanceMode || webkitCompatibilityMode ? 12 : 20} mouseInteraction={false} visibilityTargetSelector={PRIMARY_GALAXY_VISIBILITY_TARGETS} onStatusChange={setGalaxyStatus} maxDevicePixelRatio={webkitCompatibilityMode
                ? mobilePerformanceMode
                    ? 0.9
                    : 0.86
                : macPerformanceMode
                    ? 0.82
                    : mobilePerformanceMode
                        ? 0.9
                        : 0.82} maxFps={mobilePerformanceMode || webkitCompatibilityMode || macPerformanceMode ? 30 : 36}/>
            {interactiveGalaxyEnabled && !webkitCompatibilityMode && !macPerformanceMode ? (<Galaxy {...GALAXY_SHARED_PROPS} ref={interactiveGalaxyRef} className="first-four-galaxy-interactive" data-galaxy-layer="interactive" density={0.5} glowIntensity={0.14} starSpeed={0.6} speed={0.6} autoCenterRepulsion={0} mouseInteraction trackBoundsOnScroll={false} visibilityTargetSelector={INTERACTIVE_GALAXY_VISIBILITY_TARGETS} maxDevicePixelRatio={webkitCompatibilityMode ? 0.3 : macPerformanceMode ? 0.36 : 0.5} maxFps={webkitCompatibilityMode ? 16 : macPerformanceMode ? 18 : 24}/>) : null}
            {interactiveGalaxyEnabled && (webkitCompatibilityMode || macPerformanceMode) ? (<span className="first-four-star-parallax" data-star-layer="interactive-compositor"/>) : null}
          </>) : null}
      </div>
      <div className="vision-clients-flare-stage" aria-hidden="true">
        <div className="clients-scroll-element-wrap">
          <picture className="clients-scroll-element-picture">
            <source media="(max-width: 640px)" srcSet="/media/clients-flare-white-diagonal-20260716.svg"/>
            <source media="(max-width: 900px)" srcSet="/media/clients-flare-white-diagonal-20260716.svg"/>
            <Image className="clients-scroll-element" src="/media/clients-flare-white-diagonal-20260716.svg" data-design-source="/media/clients-flare-white-diagonal-20260716.svg" alt="" width={1920} height={1080} sizes="180vw" loading="eager" fetchPriority="high" unoptimized/>
          </picture>
        </div>
      </div>
      <div className="first-four-story" data-galaxy-visibility-root>
        <div className="first-four-gradient-field" aria-hidden="true">
          <span className="first-two-transition-art"/>
        </div>

        <section id="main-content" className="hero-motion" tabIndex={-1} aria-label="TASC hero and mission animation">
        <div className="hero-grid figma-hero-grid" id="top">
          <div className="hero-copy figma-hero-copy">
            <h1 className="figma-hero-title" aria-label={`${figmaHeroCopy.lead} ${figmaHeroCopy.accent}`}>
              <span className="figma-hero-title-lead" aria-hidden="true">
                <span className="figma-hero-title-lead-desktop">{figmaHeroCopy.lead}</span>
                <span className="figma-hero-title-lead-mobile">
                  <span>Delivering what</span>
                  <span>matters.</span>
                </span>
              </span>
              <span className="figma-hero-title-accent" aria-hidden="true">{figmaHeroCopy.accent}</span>
            </h1>
            <p className="figma-hero-descriptor hero-descriptor hero-subcopy">{figmaHeroCopy.descriptor}</p>
            <div className="figma-hero-actions">
              <GlassCta className="figma-cta-primary" href="#brief" onClick={(event) => {
            event.preventDefault();
            handleAnchorNavigate("#brief");
        }}>
                <span>{journeyCtaLabel}</span>
                <span className="figma-cta-arrow" aria-hidden="true">-&gt;</span>
              </GlassCta>
              <a className="figma-cta figma-cta-secondary figma-cta-services" href="#services" onClick={(event) => {
            event.preventDefault();
            handleAnchorNavigate("#services");
        }}>
                <span className="figma-cta-content">Move to services</span>
              </a>
            </div>
          </div>

          <div className={`lens-stage lens-stage-${motionAllowed ? heroVideoState : "fallback"}`} data-animated-fallback-ready={heroFallbackAnimationReady ? "true" : "false"} aria-label="Looped glass lens animation">
            <span className="lens-poster" aria-hidden="true"/>
            {motionAllowed && heroFallbackAnimationEligible ? (<PackedAlphaVideo className="lens-safari-animation" videoClassName="packed-alpha-video-source" src={mobilePerformanceMode ? HERO_LENS_SAFARI_MOBILE_PACKED_MP4 : HERO_LENS_SAFARI_PACKED_MP4} outputWidth={mobilePerformanceMode
                ? RUNTIME_MEDIA.hero.webkitPacked.mobileOutput.width
                : RUNTIME_MEDIA.hero.webkitPacked.desktopOutput.width} outputHeight={mobilePerformanceMode
                ? RUNTIME_MEDIA.hero.webkitPacked.mobileOutput.height
                : RUNTIME_MEDIA.hero.webkitPacked.desktopOutput.height} autoPlay loop preload="auto" pauseWhenOffscreen maxFps={lightweightMediaMode ? 30 : 60} onReady={() => setHeroFallbackAnimationReady(true)} onError={() => {
                setHeroFallbackAnimationReady(false);
                setHeroFallbackAnimationEligible(false);
            }}/>) : null}
            {motionAllowed && heroVideoEligible ? (<video className="lens-video" loop muted playsInline preload="auto">
                <source src={HERO_LENS_VIDEO_MOBILE_WEBM} type="video/webm" media="(max-width: 760px)"/>
                <source src={HERO_LENS_VIDEO_WEBM} type="video/webm"/>
              </video>) : null}
          </div>

          <div className="mission-frame figma-mission-frame" aria-label="TASC mission">
            <div className="mission-story-positioner">
            <article className="mission-story">
              <p className="mission-statement" aria-label={figmaMissionCopy.statement}>
                {figmaMissionLines.statement.map((line) => (<span className="mission-copy-line" aria-hidden="true" key={line}>{line}</span>))}
              </p>
              <div className="mission-main-block">
                <span className="mission-main-rule" aria-hidden="true"/>
                <p aria-label={figmaMissionCopy.main}>
                  <span className="mission-main-copy mission-main-copy-desktop" aria-hidden="true">
                    {figmaMissionLines.main.map((line) => (<span className="mission-copy-line" key={line}>{line}</span>))}
                  </span>
                  <span className="mission-main-copy mission-main-copy-mobile" aria-hidden="true">
                    {figmaMissionLines.mainMobile.map((line) => (<span className="mission-copy-line" key={line}>{line}</span>))}
                  </span>
                </p>
              </div>
              <p className="mission-support" aria-label={figmaMissionCopy.support}>
                {figmaMissionLines.support.map((line) => (<span className="mission-copy-line" aria-hidden="true" key={line}>{line}</span>))}
              </p>
              <GlassCta className="figma-cta-primary mission-story-cta" href="#brief" onClick={(event) => {
            event.preventDefault();
            handleAnchorNavigate("#brief");
        }}>
                <span className="mission-cta-label mission-cta-label-desktop">{journeyCtaLabel}</span>
                <span className="mission-cta-label mission-cta-label-mobile">{journeyCtaLabel}</span>
                <span className="figma-cta-arrow" aria-hidden="true">-&gt;</span>
              </GlassCta>
            </article>
            </div>
          </div>
        </div>

        <div className="second-stage" aria-label="Our Vision reveal">
          <div className="second-copy vision-reveal-copy">
            <p className="vision-reveal-label">{secondRevealCopy.label}</p>
            <p className="vision-reveal-body">{secondRevealCopy.body}</p>
          </div>
          <div className="second-media vision-logo-media" aria-label="TASC Strategic Communications Group logo">
            <Image className="vision-logo-image" src={visionLogoArmed ? "/media/vision-logo-glass-20260710.webp" : VISION_LOGO_PLACEHOLDER} alt="TASC Strategic Communications Group" width={3430} height={2160} sizes="(max-width: 760px) 112vw, 78vw" loading={visionLogoArmed ? "eager" : "lazy"} fetchPriority={visionLogoArmed ? "high" : "low"} unoptimized={!visionLogoArmed}/>
          </div>
        </div>
        </section>

        <ClientsSection onNavigate={handleAnchorNavigate}/>

        <div className="services-story-overlap-shell">
          <section className="services-story-section services-section glass-editorial-section" id="services" aria-label="TASC services scroll story">
        <div className="services-story-scene">
          <div className="services-galaxy-stage" data-galaxy-visibility-root aria-hidden="true">
            <div className="services-star-reveal-layer">
              <span className="static-starfield-fallback static-starfield-services"/>
              {heroIntroReady && servicesStopPostersArmed ? (<Galaxy {...GALAXY_SHARED_PROPS} className="services-galaxy" data-galaxy-layer="services-passive" density={mobilePerformanceMode ? 0.72 : 1} glowIntensity={mobilePerformanceMode ? 0.1 : 0.12} starSpeed={mobilePerformanceMode ? 0.86 : 1.08} speed={mobilePerformanceMode ? 1.08 : 1.44} rotationSpeed={mobilePerformanceMode ? 0.1 : 0.15} autoCenterRepulsion={mobilePerformanceMode ? 12 : 20} mouseInteraction={false} maxDevicePixelRatio={webkitCompatibilityMode ? 0.9 : mobilePerformanceMode ? 0.9 : 0.85} maxFps={webkitCompatibilityMode || mobilePerformanceMode ? 30 : 36} onStatusChange={setServicesGalaxyStatus}/>) : null}
            </div>
          </div>
          <div className="services-story-copy-layer">
            {servicesStoryCopy.map((service, index) => (<article className={`services-story-panel services-story-card services-story-card-${index + 1}`} data-layout={service.layout} key={service.category}>
                <div className="services-story-heading">
                  <p>{service.category}</p>
                  <h2>
                    {service.titleLines.map((line) => (<span key={line}>{line}</span>))}
                  </h2>
                </div>
                <div className="services-story-lead-block">
                  <span className="services-story-rule" aria-hidden="true"/>
                  <p className="services-story-lead">
                    <ServiceTextLines lines={service.leadLines} highlights={service.leadHighlights}/>
                  </p>
                </div>
                <p className="services-story-body">
                  <ServiceTextLines lines={service.bodyLines} highlights={service.bodyHighlights}/>
                </p>
                <GlassCta className="figma-cta-primary services-story-cta" href="#brief" onClick={(event) => {
                event.preventDefault();
                handleAnchorNavigate("#brief");
            }}>
                  <span>{journeyCtaLabel}</span>
                  <span className="figma-cta-arrow" aria-hidden="true">-&gt;</span>
                </GlassCta>
              </article>))}
          </div>

          <div className="services-story-video-wrap" aria-hidden="true">
            <span className="services-story-entry-poster" style={servicesMediaArmed ? { backgroundImage: `url("${SERVICES_SEQUENCE_POSTER}")` } : undefined}/>
            <span className="services-story-stop-posters">
              {SERVICES_STOP_POSTERS.map((poster, index) => (<span className="services-story-stop-poster" data-services-stop={index + 1} key={poster} style={servicesStopPostersArmed ? { backgroundImage: `url("${poster}")` } : undefined}/>))}
            </span>
            {motionAllowed && servicesPackedTransportMode ? (<PackedAlphaVideo key={servicesVideoSource} ref={servicesVideoRef} armed={servicesMediaArmed} className="services-story-video services-story-video-packed" videoClassName="packed-alpha-video-source" src={servicesVideoSource} outputWidth={lightweightMediaMode
                ? RUNTIME_MEDIA.services.webkitPacked.mobileOutput.width
                : RUNTIME_MEDIA.services.webkitPacked.desktopOutput.width} outputHeight={lightweightMediaMode
                ? RUNTIME_MEDIA.services.webkitPacked.mobileOutput.height
                : RUNTIME_MEDIA.services.webkitPacked.desktopOutput.height} maxFps={RUNTIME_MEDIA.services.fps} preload={servicesMediaArmed ? "auto" : "none"} tabIndex={-1} onLoadedMetadata={() => {
                rootRef.current?.setAttribute("data-services-video-format", "packed-alpha-h264");
            }} onFirstFrame={() => {
                rootRef.current?.setAttribute("data-services-start-frame-decoded", "true");
                recoverServicesMedia();
            }} onReady={recoverServicesMedia} onError={activateServicesMediaFallback}/>) : motionAllowed ? (<video key={servicesVideoSource} ref={servicesVideoRef} className="services-story-video" data-armed={servicesMediaArmed ? "true" : "false"} src={servicesMediaArmed ? servicesVideoSource : undefined} muted playsInline preload={servicesMediaArmed ? "auto" : "none"} poster={servicesMediaArmed ? SERVICES_SEQUENCE_POSTER : undefined} disablePictureInPicture tabIndex={-1} onLoadedMetadata={() => {
                rootRef.current?.setAttribute("data-services-video-format", "alpha-webm");
            }} onLoadedData={() => {
                rootRef.current?.setAttribute("data-services-start-frame-decoded", "true");
                recoverServicesMedia();
            }} onCanPlay={recoverServicesMedia} onError={activateServicesMediaFallback}/>) : (<span className="services-story-poster" style={servicesMediaArmed ? { backgroundImage: `url("${SERVICES_SEQUENCE_POSTER}")` } : undefined}/>)}
          </div>
          </div>
          </section>
        </div>
      </div>

      <HowWeWorkSection />

      <section className="datum-motion-section glass-editorial-section" id="datum" aria-label="The Datum">
        <div className="datum-motion-media" aria-hidden="true">
          {motionAllowed ? (<VisibilityTriggeredVideo key={datumVideoSource} ref={datumVideoRef} className="datum-motion-video" enabled={datumMediaArmed} hostStateAttribute="data-datum-playback" sources={datumMediaArmed ? [
                ...(webkitCompatibilityMode || lightweightMediaMode
                    ? [{ src: datumVideoSource, type: "video/mp4" }]
                    : []),
                {
                    src: lightweightMediaMode ? DATUM_VIDEO_MOBILE_WEBM : DATUM_VIDEO_WEBM,
                    type: "video/webm",
                },
            ] : []} data-armed={datumMediaArmed ? "true" : "false"} poster={datumMediaArmed ? DATUM_VIDEO_POSTER : undefined} preload={datumMediaArmed ? "auto" : "metadata"} threshold={RUNTIME_MEDIA.datum.visibilityRatio} reverseThreshold={0.92} armDelayMs={0} playbackRate={0.85} onLoadedData={() => {
                setDatumMediaPrepared(true);
                setDatumMediaFallback(false);
            }} onError={() => {
                setDatumMediaPrepared(false);
                setDatumMediaFallback(true);
            }}/>) : null}
        </div>

        <div className="datum-motion-content">
          <div className="datum-motion-state datum-motion-state-cards stagger-reveal-group">
            <div className="datum-motion-heading stagger-reveal-item">
              <h2>The Datum</h2>
              <p>A Global Media Network. Built by TASC</p>
            </div>

            <div className="datum-card-stack">
              {datumCardsCopy.map((card) => (<article className="datum-glass-card stagger-reveal-item" key={card.title}>
                  <div className="datum-card-top">
                    <strong>{card.value}</strong>
                    <span>
                      {card.label}
                      <br />
                      {card.labelSecondLine}
                    </span>
                  </div>
                  <span className="datum-card-rule" aria-hidden="true"/>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </article>))}
            </div>
          </div>

          <div className="datum-motion-state datum-motion-state-waitlist">
            <p className="datum-waitlist-eyebrow datum-waitlist-segment">{datumWaitlistCopy.eyebrow}</p>
            <h2>
              <span className="datum-waitlist-segment">{datumWaitlistCopy.headline}</span>
              <span className="datum-waitlist-segment">{datumWaitlistCopy.accent}</span>
            </h2>

            <form className="datum-waitlist-form" data-submit-state={datumLead.state.status} onSubmit={datumLead.submit}>
              <div className="datum-email-row">
                <label className="datum-waitlist-segment" htmlFor="datum-email">Your Email</label>
                <input className="datum-waitlist-segment" id="datum-email" name="email" type="email" placeholder="EXAMPLE@MAIL.COM" autoComplete="email" maxLength={254} required/>
                <label className="lead-honeypot" aria-hidden="true">
                  Company website
                  <input name="website" type="text" tabIndex={-1} autoComplete="off"/>
                </label>
              </div>
              <div className="datum-consent-row">
                <label className="datum-waitlist-segment">
                  <input name="privacy" type="checkbox" required/>
                  <span>
                    I agree to the processing of my personal data and accept the{" "}
                    <a href="/privacy-policy">Privacy Policy</a>.
                  </span>
                </label>
                <button className="datum-submit-button datum-waitlist-segment" type="submit" aria-label="Submit waitlist email" disabled={datumLead.state.status === "submitting"}>
                  {datumLead.state.status === "submitting" ? "Sending" : "Submit"}
                  <ArrowRight aria-hidden="true" size={28} strokeWidth={1.25}/>
                </button>
              </div>
              <p className={`lead-form-status is-${datumLead.state.status}`} role={datumLead.state.status === "error" ? "alert" : "status"} aria-live="polite">
                {datumLead.state.message}
              </p>
            </form>
          </div>
        </div>
      </section>

      <ProcessSection mapArmed={processMapArmed}/>

      <section className="domino-cta-section glass-editorial-section" id="brief" aria-label="One impulse CTA">
        <div className="domino-scene">
          <div className="domino-media" aria-label="Autonomous domino animation">
            {motionAllowed ? (<>
                <video key={`domino-forward-${dominoTransportKey}`} ref={dominoVideoRef} className="domino-sequence domino-sequence-forward" data-domino-direction="forward" data-armed={dominoMediaArmed ? "true" : "false"} muted playsInline preload={dominoMediaArmed ? "auto" : "metadata"} disablePictureInPicture tabIndex={-1} onLoadedData={() => {
                setDominoForwardPrepared(true);
                setDominoForwardFallback(false);
            }} onCanPlay={() => {
                setDominoForwardPrepared(true);
                setDominoForwardFallback(false);
            }} onError={() => {
                setDominoForwardPrepared(false);
                setDominoForwardFallback(true);
            }}>
                {dominoMediaArmed ? (<>
                    {webkitCompatibilityMode || lightweightMediaMode ? (<source src={lightweightMediaMode ? DOMINO_VIDEO_MOBILE_MP4 : DOMINO_VIDEO_MP4} type="video/mp4"/>) : null}
                    <source src={lightweightMediaMode ? DOMINO_VIDEO_MOBILE_WEBM : DOMINO_VIDEO_WEBM} type="video/webm"/>
                  </>) : null}
                </video>
                <video key={`domino-reverse-${dominoTransportKey}`} ref={dominoReverseVideoRef} className="domino-sequence domino-sequence-reverse" data-domino-direction="reverse" data-armed={dominoReverseMediaArmed ? "true" : "false"} muted playsInline preload={dominoReverseMediaArmed ? "auto" : "metadata"} disablePictureInPicture tabIndex={-1} onLoadedData={() => {
                setDominoReversePrepared(true);
                setDominoReverseFallback(false);
            }} onCanPlay={() => {
                setDominoReversePrepared(true);
                setDominoReverseFallback(false);
            }} onError={() => {
                setDominoReversePrepared(false);
                setDominoReverseFallback(true);
            }}>
                  {dominoReverseMediaArmed ? (<>
                      {webkitCompatibilityMode || lightweightMediaMode ? (<source src={lightweightMediaMode
                        ? DOMINO_REVERSE_VIDEO_MOBILE_MP4
                        : DOMINO_REVERSE_VIDEO_MP4} type="video/mp4"/>) : null}
                      <source src={lightweightMediaMode
                    ? DOMINO_REVERSE_VIDEO_MOBILE_WEBM
                    : DOMINO_REVERSE_VIDEO_WEBM} type="video/webm"/>
                    </>) : null}
                </video>
              </>) : null}
            </div>
          <h2 className="domino-video-title" aria-live="polite">
            <span>{finalImpulseCopy.title}</span>
            <span>{finalImpulseCopy.accent}</span>
          </h2>
        </div>

        <div className="domino-form-stage">
          <div className="domino-copy domino-impulse-copy stagger-reveal-group">
            <p className="domino-body domino-body-primary stagger-reveal-item">
              {finalImpulseCopy.bodyPrimary}
            </p>
            <p className="domino-body domino-body-signal stagger-reveal-item">
              {finalImpulseCopy.bodySignal}
            </p>
            <form className="domino-impulse-form" data-submit-state={dominoLead.state.status} onSubmit={async (event) => {
            const saved = await dominoLead.submit(event);
            if (saved)
                setDominoEmail("");
        }}>
              <div className="domino-impulse-row stagger-reveal-item">
                <label className="sr-only" htmlFor="domino-email">
                  Email
                </label>
                <input id="domino-email" name="email" type="email" placeholder="ENTERYOUREMAIL@HERE.COM" value={dominoEmail} required maxLength={254} autoComplete="email" onInput={(event) => setDominoEmail(event.currentTarget.value)} onChange={(event) => setDominoEmail(event.target.value)}/>
                <button className={isDominoEmailValid ? "is-email-valid" : undefined} type="submit" disabled={dominoLead.state.status === "submitting"}>
                  {dominoLead.state.status === "submitting" ? "Sending" : finalImpulseCopy.action}
                  <ArrowRight aria-hidden="true" size={18} strokeWidth={1.5}/>
                </button>
              </div>
              <label className="domino-privacy-row stagger-reveal-item">
                <input name="privacy" type="checkbox" required/>
                <span className="domino-privacy-desktop">
                  I agree to the processing of my email under the <a href="/privacy-policy">Privacy Policy</a>.
                </span>
                <span className="domino-privacy-mobile">
                  By clicking you agree to our <a href="/privacy-policy">Policy</a>
                </span>
              </label>
              <label className="lead-honeypot" aria-hidden="true">
                Company website
                <input name="website" type="text" tabIndex={-1} autoComplete="off"/>
              </label>
              <p className={`lead-form-status stagger-reveal-item is-${dominoLead.state.status}`} role={dominoLead.state.status === "error" ? "alert" : "status"} aria-live="polite">
                {dominoLead.state.message}
              </p>
            </form>
          </div>
        </div>
      </section>

      <SiteFooter onNavigate={handleAnchorNavigate}/>
    </main>);
}
