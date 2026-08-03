import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import {
    PRELOADER_HARD_FAIL_OPEN_MS,
    PRELOADER_SOFT_REVEAL_MS,
} from "@/lib/preloader-timing";
import { SITE_DESCRIPTION, SITE_NAME, SITE_OG_IMAGE, SITE_TITLE, SITE_URL } from "@/lib/site-seo";
import "./globals.css";
import "./clients-final.css";
import "./motion-final.css";
import "./process-final.css";
import "./safari-safe.css";
import "./responsive-flow.css";
import "./browser-stability.css";
import "./mobile-typography.css";
import "./mobile-layout.css";
import "./interaction-polish.css";
import "./services-media-final.css";
const roboto = localFont({
    src: [
        {
            path: "./fonts/roboto/Roboto-Light.woff2",
            weight: "300",
            style: "normal",
        },
        {
            path: "./fonts/roboto/Roboto-Regular.woff2",
            weight: "400",
            style: "normal",
        },
        {
            path: "./fonts/roboto/Roboto-Bold.woff2",
            weight: "700",
            style: "normal",
        },
    ],
    variable: "--font-roboto",
    display: "swap",
    preload: false,
});
const suisse = localFont({
    src: [
        {
            path: "./fonts/suisse/suisseintl-light.woff2",
            weight: "300",
            style: "normal",
        },
        {
            path: "./fonts/suisse/SuisseIntl-Regular.woff2",
            weight: "400",
            style: "normal",
        },
        {
            path: "./fonts/suisse/SuisseIntl-Bold.woff2",
            weight: "700",
            style: "normal",
        },
    ],
    variable: "--font-suisse",
    display: "swap",
    preload: true,
});
const webkitCompatibilityBootstrap = `
  try {
    var ua = navigator.userAgent || "";
    var forced = new URLSearchParams(location.search).get("webkitCompat") === "1";
    var forcePacked = new URLSearchParams(location.search).get("forcePacked") === "1";
    var appleWebKit = /AppleWebKit/i.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android)/i.test(ua);
    var macOS = /Macintosh|Mac OS X/i.test(ua) || /^Mac/i.test(navigator.platform || "");
    var iOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var edge = /\\bEdg(?:A|iOS)?\\//i.test(ua);
    var appleWebView = /AppleWebKit/i.test(ua) && !/(Safari|Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android)/i.test(ua);
    var knownChromiumAlpha = /(?:Chrome|Chromium)\\//i.test(ua) && !edge && !/\\b(?:OPR|SamsungBrowser)\\//i.test(ua) && !iOS && !appleWebView;
    var codecProbe = document.createElement("video");
    var packedH264 = codecProbe.canPlayType('video/mp4; codecs="avc1.4D401F"') !== "";
    var nativeAlphaWebM = knownChromiumAlpha && codecProbe.canPlayType('video/webm; codecs="vp9"') !== "";
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var constrained = !!(connection && (connection.saveData === true || connection.effectiveType === "slow-2g" || connection.effectiveType === "2g"));
    var reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var coarsePointer = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    var viewportWidth = Math.max(1, document.documentElement.clientWidth || (window.visualViewport && window.visualViewport.width) || window.innerWidth || 1);
    var viewportHeight = Math.max(1, document.documentElement.clientHeight || (window.visualViewport && window.visualViewport.height) || window.innerHeight || 1);
    var lowMemory = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4;
    var lowCpu = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4;
    var webkit = forced || appleWebKit || iOS || appleWebView;
    var macPerformance = forced || macOS || iOS;
    var mobilePerformance = viewportWidth <= 900 || coarsePointer || (!macPerformance && (lowMemory || lowCpu)) || !!(connection && connection.saveData);
    var root = document.documentElement;
    root.dataset.tascMotionAllowed = String(!reducedMotion);
    root.dataset.tascMobilePerformance = String(mobilePerformance);
    root.dataset.tascMacos = String(macPerformance);
    root.dataset.tascWebkit = String(webkit);
    root.dataset.tascEdgeAlpha = String(edge);
    root.dataset.tascPackedH264Supported = String(packedH264);
    root.dataset.tascNativeAlphaWebmSupported = String(nativeAlphaWebM);
    root.dataset.tascForcePacked = String(forcePacked);
    root.dataset.tascConstrainedConnection = String(constrained);
    root.dataset.tascCoarsePointer = String(coarsePointer);
    root.dataset.tascViewportWidth = String(Math.round(viewportWidth));
    root.dataset.tascViewportHeight = String(Math.round(viewportHeight));
    root.dataset.tascProfileReady = "true";
  } catch (error) {}
`;
const preloaderNavigationFailOpen = `
  try {
    var revealWait = ${PRELOADER_SOFT_REVEAL_MS};
    var hardWait = ${PRELOADER_HARD_FAIL_OPEN_MS};
    var scheduleFromNavigation = function (wait, callback) {
      setTimeout(callback, Math.max(0, wait - performance.now()));
    };
    scheduleFromNavigation(revealWait, function () {
      document.documentElement.setAttribute("data-tasc-preloader-deadline", "true");
      window.dispatchEvent(new Event("tasc:preloader-deadline"));
    });
    scheduleFromNavigation(hardWait, function () {
      document.documentElement.setAttribute("data-tasc-boot-fail-open", "true");
      window.dispatchEvent(new Event("tasc:preloader-hard-fail-open"));
      var main = document.querySelector("main.site-shell");
      if (main) {
        main.setAttribute("data-hero-surface-ready", "true");
      }
    });
  } catch (error) {}
`;
const preloaderCriticalFailOpenCss = `
  @keyframes tasc-preloader-critical-hide {
    to { opacity: 0; visibility: hidden; pointer-events: none; }
  }
  @keyframes tasc-hero-critical-reveal {
    to { opacity: 1; visibility: visible; transform: translate3d(0, 0, 0); }
  }
  .site-preloader {
    animation: tasc-preloader-critical-hide 1ms step-start ${PRELOADER_HARD_FAIL_OPEN_MS}ms 1 normal forwards;
  }
  .site-shell:not(.site-preloader-complete) .figma-hero-title > span,
  .site-shell:not(.site-preloader-complete) .hero-subcopy,
  .site-shell:not(.site-preloader-complete) .figma-hero-actions .figma-cta {
    animation: tasc-hero-critical-reveal 1ms step-start ${PRELOADER_HARD_FAIL_OPEN_MS}ms 1 normal forwards;
  }
`;
export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    title: {
        default: SITE_TITLE,
        template: "%s | TASC",
    },
    description: SITE_DESCRIPTION,
    keywords: [
        "global strategic communications agency",
        "international marketing agency",
        "global advertising group",
        "corporate communications",
        "government communications",
        "reputation management agency",
        "strategic communications Dubai",
        "communications agency UAE",
    ],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: "business",
    alternates: {
        canonical: "/",
    },
    icons: {
        icon: "/favicon.ico",
        shortcut: "/favicon.ico",
        apple: "/media/tasc-logo-20260710.svg",
    },
    openGraph: {
        type: "website",
        url: SITE_URL,
        siteName: SITE_NAME,
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        images: [SITE_OG_IMAGE],
    },
    twitter: {
        card: "summary_large_image",
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        images: [SITE_OG_IMAGE.url],
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
        },
    },
};
export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    themeColor: "#000000",
};
export default function RootLayout({ children }: Readonly<{
    children: React.ReactNode;
}>) {
    return (<html lang="en" className={`${roboto.variable} ${suisse.variable}`} suppressHydrationWarning>
      <head>
        <style id="tasc-preloader-critical-fail-open" dangerouslySetInnerHTML={{ __html: preloaderCriticalFailOpenCss }}/>
        <script id="tasc-webkit-compatibility-bootstrap" dangerouslySetInnerHTML={{ __html: webkitCompatibilityBootstrap }}/>
        <script id="tasc-preloader-navigation-fail-open" dangerouslySetInnerHTML={{ __html: preloaderNavigationFailOpen }}/>
      </head>
      <body>
        <script id="tasc-demo-scroll-reset" dangerouslySetInnerHTML={{
            __html: "try{history.scrollRestoration='manual';if(!location.hash){window.scrollTo(0,0);document.documentElement.scrollTop=0;document.body&&(document.body.scrollTop=0);}}catch(e){}",
        }}/>
        {children}
      </body>
    </html>);
}
