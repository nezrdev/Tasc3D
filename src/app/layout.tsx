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
            path: "./fonts/roboto/Roboto-Medium.woff2",
            weight: "500",
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
            path: "./fonts/suisse/suisseintl-medium.woff2",
            weight: "500",
            style: "normal",
        },
        {
            path: "./fonts/suisse/SuisseIntl-SemiBold.woff2",
            weight: "600",
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
    preload: false,
});
const webkitCompatibilityBootstrap = `
  try {
    var ua = navigator.userAgent || "";
    var forced = new URLSearchParams(location.search).get("webkitCompat") === "1";
    var appleWebKit = /AppleWebKit/i.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android)/i.test(ua);
    var macOS = /Macintosh|Mac OS X/i.test(ua) || /^Mac/i.test(navigator.platform || "");
    var iOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (forced || macOS || iOS) {
      document.documentElement.setAttribute("data-tasc-macos", "true");
    }
    if (forced || appleWebKit || iOS) {
      document.documentElement.setAttribute("data-tasc-webkit", "true");
    }
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
