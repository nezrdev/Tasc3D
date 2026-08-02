"use client";

import Image from "next/image";
import PackedAlphaVideo from "@/components/PackedAlphaVideo";
import { GlassCta } from "@/components/GlassCta";
import {
    figmaHeroCopy,
    figmaMissionCopy,
    figmaMissionLines,
    journeyCtaLabel,
    secondRevealCopy,
} from "@/data/landing-content";
import { RUNTIME_MEDIA } from "@/data/runtime-media";
import type { HeroVideoState } from "@/types/landing";

const HERO_LENS_VIDEO_WEBM = RUNTIME_MEDIA.hero.nativeAlpha.desktop;
const HERO_LENS_VIDEO_MOBILE_WEBM = RUNTIME_MEDIA.hero.nativeAlpha.mobile;
const HERO_LENS_SAFARI_PACKED_MP4 = RUNTIME_MEDIA.hero.webkitPacked.desktop;
const HERO_LENS_SAFARI_MOBILE_PACKED_MP4 = RUNTIME_MEDIA.hero.webkitPacked.mobile;
const VISION_LOGO_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

type HeroSectionProps = {
    heroFallbackAnimationEligible: boolean;
    heroFallbackAnimationReady: boolean;
    heroVideoEligible: boolean;
    heroVideoState: HeroVideoState;
    lightweightMediaMode: boolean;
    mobilePerformanceMode: boolean;
    motionAllowed: boolean;
    onHeroFallbackAnimationEligibleChange: (eligible: boolean) => void;
    onHeroFallbackAnimationReadyChange: (ready: boolean) => void;
    onNavigate: (href: string) => void;
    packedAlphaOwner: "hero" | "services";
    visionLogoArmed: boolean;
};

export function HeroSection({
    heroFallbackAnimationEligible,
    heroFallbackAnimationReady,
    heroVideoEligible,
    heroVideoState,
    lightweightMediaMode,
    mobilePerformanceMode,
    motionAllowed,
    onHeroFallbackAnimationEligibleChange,
    onHeroFallbackAnimationReadyChange,
    onNavigate,
    packedAlphaOwner,
    visionLogoArmed,
}: HeroSectionProps) {
    return (
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
                        <span className="figma-hero-title-accent" aria-hidden="true">
                            {figmaHeroCopy.accent}
                        </span>
                    </h1>
                    <p className="figma-hero-descriptor hero-descriptor hero-subcopy">{figmaHeroCopy.descriptor}</p>
                    <div className="figma-hero-actions">
                        <GlassCta className="figma-cta-primary" href="#brief" onClick={(event) => {
                            event.preventDefault();
                            onNavigate("#brief");
                        }}>
                            <span>{journeyCtaLabel}</span>
                            <span className="figma-cta-arrow" aria-hidden="true">-&gt;</span>
                        </GlassCta>
                        <a className="figma-cta figma-cta-secondary figma-cta-services" href="#services" onClick={(event) => {
                            event.preventDefault();
                            onNavigate("#services");
                        }}>
                            <span className="figma-cta-content">Move to services</span>
                        </a>
                    </div>
                </div>

                <div className={`lens-stage lens-stage-${motionAllowed ? heroVideoState : "fallback"}`} data-animated-fallback-ready={heroFallbackAnimationReady ? "true" : "false"} aria-label="Looped glass lens animation">
                    <span className="lens-poster" aria-hidden="true" />
                    {motionAllowed && heroFallbackAnimationEligible ? (
                        <PackedAlphaVideo
                            className="lens-safari-animation"
                            compositeActive={packedAlphaOwner === "hero"}
                            videoClassName="packed-alpha-video-source"
                            src={mobilePerformanceMode ? HERO_LENS_SAFARI_MOBILE_PACKED_MP4 : HERO_LENS_SAFARI_PACKED_MP4}
                            outputWidth={mobilePerformanceMode
                                ? RUNTIME_MEDIA.hero.webkitPacked.mobileOutput.width
                                : RUNTIME_MEDIA.hero.webkitPacked.desktopOutput.width}
                            outputHeight={mobilePerformanceMode
                                ? RUNTIME_MEDIA.hero.webkitPacked.mobileOutput.height
                                : RUNTIME_MEDIA.hero.webkitPacked.desktopOutput.height}
                            autoPlay
                            loop
                            preload="auto"
                            pauseWhenOffscreen
                            maxFps={lightweightMediaMode ? 30 : 60}
                            onReady={() => onHeroFallbackAnimationReadyChange(true)}
                            onError={() => {
                                onHeroFallbackAnimationReadyChange(false);
                                onHeroFallbackAnimationEligibleChange(false);
                            }}
                        />
                    ) : null}
                    {motionAllowed && heroVideoEligible ? (
                        <video className="lens-video" loop muted playsInline preload="auto">
                            <source src={HERO_LENS_VIDEO_MOBILE_WEBM} type="video/webm" media="(max-width: 760px)" />
                            <source src={HERO_LENS_VIDEO_WEBM} type="video/webm" />
                        </video>
                    ) : null}
                </div>

                <div className="mission-frame figma-mission-frame" aria-label="TASC mission">
                    <div className="mission-story-positioner">
                        <article className="mission-story">
                            <p className="mission-statement" aria-label={figmaMissionCopy.statement}>
                                {figmaMissionLines.statement.map((line) => (
                                    <span className="mission-copy-line" aria-hidden="true" key={line}>{line}</span>
                                ))}
                            </p>
                            <div className="mission-main-block">
                                <span className="mission-main-rule" aria-hidden="true" />
                                <p aria-label={figmaMissionCopy.main}>
                                    <span className="mission-main-copy mission-main-copy-desktop" aria-hidden="true">
                                        {figmaMissionLines.main.map((line) => (
                                            <span className="mission-copy-line" key={line}>{line}</span>
                                        ))}
                                    </span>
                                    <span className="mission-main-copy mission-main-copy-mobile" aria-hidden="true">
                                        {figmaMissionLines.mainMobile.map((line) => (
                                            <span className="mission-copy-line" key={line}>{line}</span>
                                        ))}
                                    </span>
                                </p>
                            </div>
                            <p className="mission-support" aria-label={figmaMissionCopy.support}>
                                {figmaMissionLines.support.map((line) => (
                                    <span className="mission-copy-line" aria-hidden="true" key={line}>{line}</span>
                                ))}
                            </p>
                            <GlassCta className="figma-cta-primary mission-story-cta" href="#brief" onClick={(event) => {
                                event.preventDefault();
                                onNavigate("#brief");
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
                    <Image
                        className="vision-logo-image"
                        src={visionLogoArmed ? "/media/vision-logo-glass-20260710.webp" : VISION_LOGO_PLACEHOLDER}
                        alt="TASC Strategic Communications Group"
                        width={1600}
                        height={1008}
                        sizes="(max-width: 760px) 112vw, 78vw"
                        loading={visionLogoArmed ? "eager" : "lazy"}
                        fetchPriority={visionLogoArmed ? "high" : "low"}
                        unoptimized={!visionLogoArmed}
                    />
                </div>
            </div>
        </section>
    );
}
