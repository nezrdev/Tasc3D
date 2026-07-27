"use client";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
export interface GlassSurfaceProps {
    children?: React.ReactNode;
    width?: number | string;
    height?: number | string;
    borderRadius?: number;
    borderWidth?: number;
    brightness?: number;
    opacity?: number;
    blur?: number;
    displace?: number;
    backgroundOpacity?: number;
    saturation?: number;
    fallbackBackgroundOpacity?: number;
    fallbackBlur?: number;
    fallbackSaturation?: number;
    lightweightBackgroundOpacity?: number;
    lightweightBlur?: number;
    lightweightSaturation?: number;
    forceLightweight?: boolean;
    distortionScale?: number;
    redOffset?: number;
    greenOffset?: number;
    blueOffset?: number;
    xChannel?: "R" | "G" | "B";
    yChannel?: "R" | "G" | "B";
    mixBlendMode?: "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference" | "exclusion" | "hue" | "saturation" | "color" | "luminosity" | "plus-darker" | "plus-lighter";
    className?: string;
    style?: React.CSSProperties;
}
type GlassStyle = React.CSSProperties & {
    "--glass-frost"?: number;
    "--glass-saturation"?: number;
};
function supportsSVGFilters(filterId: string) {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return false;
    }
    const isWebkit = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    const isFirefox = /Firefox/.test(navigator.userAgent);
    if (isWebkit || isFirefox) {
        return false;
    }
    const div = document.createElement("div");
    div.style.backdropFilter = `url(#${filterId})`;
    return div.style.backdropFilter !== "";
}
function supportsBackdropFilter() {
    if (typeof window === "undefined" || typeof CSS === "undefined") {
        return false;
    }
    return CSS.supports("backdrop-filter", "blur(10px)") || CSS.supports("-webkit-backdrop-filter", "blur(10px)");
}
const GlassSurface: React.FC<GlassSurfaceProps> = ({ children, width = 200, height = 80, borderRadius = 20, borderWidth = 0.07, brightness = 50, opacity = 0.93, blur = 11, displace = 0, backgroundOpacity = 0, saturation = 1, fallbackBackgroundOpacity, fallbackBlur = 18, fallbackSaturation = 1.8, lightweightBackgroundOpacity = 0.72, lightweightBlur = 0, lightweightSaturation = 1, forceLightweight = false, distortionScale = -180, redOffset = 0, greenOffset = 10, blueOffset = 20, xChannel = "R", yChannel = "G", mixBlendMode = "difference", className = "", style = {}, }) => {
    const uniqueId = useId().replace(/:/g, "-");
    const filterId = `glass-filter-${uniqueId}`;
    const redGradId = `red-grad-${uniqueId}`;
    const blueGradId = `blue-grad-${uniqueId}`;
    const containerRef = useRef<HTMLDivElement>(null);
    const feImageRef = useRef<SVGFEImageElement>(null);
    const redChannelRef = useRef<SVGFEDisplacementMapElement>(null);
    const greenChannelRef = useRef<SVGFEDisplacementMapElement>(null);
    const blueChannelRef = useRef<SVGFEDisplacementMapElement>(null);
    const gaussianBlurRef = useRef<SVGFEGaussianBlurElement>(null);
    const [svgSupported, setSvgSupported] = useState(false);
    const [backdropFilterSupported, setBackdropFilterSupported] = useState(false);
    const [lightweightMode, setLightweightMode] = useState(true);
    const generateDisplacementMap = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        const actualWidth = Math.max(rect?.width || 400, 1);
        const actualHeight = Math.max(rect?.height || 80, 1);
        const edgeSize = Math.min(actualWidth, actualHeight) * (borderWidth * 0.5);
        const svgContent = `
      <svg viewBox="0 0 ${actualWidth} ${actualHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="red"/>
          </linearGradient>
          <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="blue"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" fill="black"></rect>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="url(#${redGradId})" />
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode: ${mixBlendMode}" />
        <rect x="${edgeSize}" y="${edgeSize}" width="${actualWidth - edgeSize * 2}" height="${actualHeight - edgeSize * 2}" rx="${borderRadius}" fill="hsl(0 0% ${brightness}% / ${opacity})" style="filter: blur(${blur}px)" />
      </svg>
    `;
        return `data:image/svg+xml,${encodeURIComponent(svgContent)}`;
    }, [blueGradId, blur, borderRadius, borderWidth, brightness, mixBlendMode, opacity, redGradId]);
    const updateDisplacementMap = useCallback(() => {
        if (lightweightMode) {
            return;
        }
        feImageRef.current?.setAttribute("href", generateDisplacementMap());
    }, [generateDisplacementMap, lightweightMode]);
    useEffect(() => {
        const media = window.matchMedia("(max-width: 900px), (pointer: coarse)");
        let frame = 0;
        const syncCapabilities = () => {
            const device = navigator as Navigator & {
                connection?: {
                    saveData?: boolean;
                };
                deviceMemory?: number;
            };
            const userAgent = navigator.userAgent;
            const forceWebKitCompatibility = document.documentElement.dataset.tascWebkit === "true" ||
                new URLSearchParams(window.location.search).get("webkitCompat") === "1";
            const isAppleWebKit = forceWebKitCompatibility ||
                (/AppleWebKit/i.test(userAgent) &&
                    !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android)/i.test(userAgent));
            const lightweight = forceLightweight ||
                isAppleWebKit ||
                document.documentElement.dataset.tascMacos === "true" ||
                media.matches ||
                Boolean(device.connection?.saveData) ||
                (typeof device.deviceMemory === "number" && device.deviceMemory <= 4) ||
                (typeof device.hardwareConcurrency === "number" && device.hardwareConcurrency <= 4);
            setLightweightMode(lightweight);
            setSvgSupported(!lightweight && supportsSVGFilters(filterId));
            setBackdropFilterSupported(!lightweight && supportsBackdropFilter());
        };
        frame = window.requestAnimationFrame(syncCapabilities);
        media.addEventListener("change", syncCapabilities);
        return () => {
            window.cancelAnimationFrame(frame);
            media.removeEventListener("change", syncCapabilities);
        };
    }, [filterId, forceLightweight]);
    useEffect(() => {
        updateDisplacementMap();
        [
            { ref: redChannelRef, offset: redOffset },
            { ref: greenChannelRef, offset: greenOffset },
            { ref: blueChannelRef, offset: blueOffset },
        ].forEach(({ ref, offset }) => {
            if (!ref.current) {
                return;
            }
            ref.current.setAttribute("scale", (distortionScale + offset).toString());
            ref.current.setAttribute("xChannelSelector", xChannel);
            ref.current.setAttribute("yChannelSelector", yChannel);
        });
        gaussianBlurRef.current?.setAttribute("stdDeviation", displace.toString());
    }, [
        blueOffset,
        displace,
        distortionScale,
        greenOffset,
        redOffset,
        updateDisplacementMap,
        xChannel,
        yChannel,
    ]);
    useEffect(() => {
        if (lightweightMode || !containerRef.current || typeof ResizeObserver === "undefined") {
            return;
        }
        const resizeObserver = new ResizeObserver(() => {
            window.requestAnimationFrame(updateDisplacementMap);
        });
        resizeObserver.observe(containerRef.current);
        return () => {
            resizeObserver.disconnect();
        };
    }, [lightweightMode, updateDisplacementMap]);
    useEffect(() => {
        const frame = window.requestAnimationFrame(updateDisplacementMap);
        return () => {
            window.cancelAnimationFrame(frame);
        };
    }, [height, updateDisplacementMap, width]);
    const baseStyles: GlassStyle = {
        ...style,
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        borderRadius: `${borderRadius}px`,
        "--glass-frost": backgroundOpacity,
        "--glass-saturation": saturation,
    };
    const containerStyles: GlassStyle = lightweightMode
        ? {
            ...baseStyles,
            background: `rgba(8, 11, 12, ${lightweightBackgroundOpacity})`,
            backdropFilter: lightweightBlur > 0 ? `blur(${lightweightBlur}px) saturate(${lightweightSaturation})` : undefined,
            WebkitBackdropFilter: lightweightBlur > 0 ? `blur(${lightweightBlur}px) saturate(${lightweightSaturation})` : undefined,
            border: "1px solid rgba(242, 238, 230, 0.15)",
            boxShadow: `
          inset 0 1px 0 rgba(255, 255, 255, 0.16),
          inset 0 -1px 0 rgba(255, 255, 255, 0.06),
          0 12px 32px rgba(0, 0, 0, 0.28)
        `,
        }
        : svgSupported
            ? {
                ...baseStyles,
                background: `hsl(180 12% 2% / ${backgroundOpacity})`,
                backdropFilter: `url(#${filterId}) blur(${Math.max(0, blur)}px) saturate(${saturation})`,
                WebkitBackdropFilter: `url(#${filterId}) blur(${Math.max(0, blur)}px) saturate(${saturation})`,
                boxShadow: `
          0 0 2px 1px color-mix(in oklch, white, transparent 62%) inset,
          0 0 18px 5px color-mix(in oklch, white, transparent 88%) inset,
          0 18px 54px rgba(0, 0, 0, 0.34),
          0 4px 20px rgba(184, 216, 244, 0.05) inset
        `,
            }
            : {
                ...baseStyles,
                background: `rgba(8, 11, 12, ${fallbackBackgroundOpacity ?? (backdropFilterSupported ? 0.44 : 0.82)})`,
                backdropFilter: backdropFilterSupported
                    ? `blur(${fallbackBlur}px) saturate(${fallbackSaturation}) brightness(1.08)`
                    : undefined,
                WebkitBackdropFilter: backdropFilterSupported
                    ? `blur(${fallbackBlur}px) saturate(${fallbackSaturation}) brightness(1.08)`
                    : undefined,
                border: "1px solid rgba(242, 238, 230, 0.15)",
                boxShadow: `
          inset 0 1px 0 rgba(255, 255, 255, 0.2),
          inset 0 -1px 0 rgba(255, 255, 255, 0.08),
          0 18px 54px rgba(0, 0, 0, 0.34)
        `,
            };
    return (<div ref={containerRef} className={`glass-surface ${className}`} style={containerStyles}>
      {svgSupported && !lightweightMode ? (<svg className="glass-surface-filter" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
            <feImage ref={feImageRef} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>

            <feDisplacementMap ref={redChannelRef} in="SourceGraphic" in2="map" result="dispRed"/>
            <feColorMatrix in="dispRed" type="matrix" values="1 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 1 0" result="red"/>

            <feDisplacementMap ref={greenChannelRef} in="SourceGraphic" in2="map" result="dispGreen"/>
            <feColorMatrix in="dispGreen" type="matrix" values="0 0 0 0 0
                      0 1 0 0 0
                      0 0 0 0 0
                      0 0 0 1 0" result="green"/>

            <feDisplacementMap ref={blueChannelRef} in="SourceGraphic" in2="map" result="dispBlue"/>
            <feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0
                      0 0 0 0 0
                      0 0 1 0 0
                      0 0 0 1 0" result="blue"/>

            <feBlend in="red" in2="green" mode="screen" result="rg"/>
            <feBlend in="rg" in2="blue" mode="screen" result="output"/>
            <feGaussianBlur ref={gaussianBlurRef} in="output" stdDeviation="0.7"/>
          </filter>
        </defs>
        </svg>) : null}

      <div className="glass-surface-content">{children}</div>
    </div>);
};
export default GlassSurface;
