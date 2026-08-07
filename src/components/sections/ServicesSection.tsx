"use client";

import { type Ref } from "react";
import PackedAlphaVideo from "@/components/PackedAlphaVideo";
import { GlassCta } from "@/components/GlassCta";
import { ServiceTextLines } from "@/components/ServiceTextLines";
import { journeyCtaLabel, servicesStoryCopy } from "@/data/landing-content";
import { RUNTIME_MEDIA } from "@/data/runtime-media";

const SERVICES_SEQUENCE_POSTER = RUNTIME_MEDIA.services.poster;
const SERVICES_STOP_POSTERS = RUNTIME_MEDIA.services.stopPosters;

type ServicesSectionProps = {
    activateServicesMediaFallback: () => void;
    lightweightMediaMode: boolean;
    motionAllowed: boolean;
    onNavigate: (href: string) => void;
    onNativeLoadedMetadata: () => void;
    onPackedLoadedMetadata: () => void;
    onServicesFrameReady: () => void;
    packedAlphaOwner: "hero" | "services";
    recoverServicesMedia: () => void;
    servicesMediaArmed: boolean;
    servicesPackedTransportMode: boolean;
    servicesStopPostersArmed: boolean;
    servicesTransportKey: string;
    servicesVideoRef: Ref<HTMLVideoElement>;
    servicesVideoSource: string;
};

export function ServicesSection({
    activateServicesMediaFallback,
    lightweightMediaMode,
    motionAllowed,
    onNavigate,
    onNativeLoadedMetadata,
    onPackedLoadedMetadata,
    onServicesFrameReady,
    packedAlphaOwner,
    recoverServicesMedia,
    servicesMediaArmed,
    servicesPackedTransportMode,
    servicesStopPostersArmed,
    servicesTransportKey,
    servicesVideoRef,
    servicesVideoSource,
}: ServicesSectionProps) {
    return (
        <div className="services-story-overlap-shell">
            <section className="services-story-section services-section glass-editorial-section" id="services" aria-label="TASC services scroll story">
                <div className="services-story-scene">
                    <div className="services-galaxy-stage" data-galaxy-visibility-root aria-hidden="true">
                        <div className="services-star-reveal-layer">
                            <span className="static-starfield-fallback static-starfield-services" />
                        </div>
                    </div>
                    <div className="services-story-copy-layer">
                        {servicesStoryCopy.map((service, index) => (
                            <article className={`services-story-panel services-story-card services-story-card-${index + 1}`} data-layout={service.layout} key={service.category}>
                                <div className="services-story-heading">
                                    <p>{service.category}</p>
                                    <h2>
                                        {service.titleLines.map((line) => (
                                            <span key={line}>{line}</span>
                                        ))}
                                    </h2>
                                </div>
                                <div className="services-story-lead-block">
                                    <span className="services-story-rule" aria-hidden="true" />
                                    <p className="services-story-lead">
                                        <ServiceTextLines lines={service.leadLines} highlights={service.leadHighlights} />
                                    </p>
                                </div>
                                <p className="services-story-body">
                                    <ServiceTextLines lines={service.bodyLines} highlights={service.bodyHighlights} />
                                </p>
                                <GlassCta className="figma-cta-primary services-story-cta" href="#brief" onClick={(event) => {
                                    event.preventDefault();
                                    onNavigate("#brief");
                                }}>
                                    <span>{journeyCtaLabel}</span>
                                    <span className="figma-cta-arrow" aria-hidden="true">-&gt;</span>
                                </GlassCta>
                            </article>
                        ))}
                    </div>

                    <div className="services-story-video-wrap" aria-hidden="true">
                        <span className="services-story-entry-poster" style={servicesMediaArmed ? { backgroundImage: `url("${SERVICES_SEQUENCE_POSTER}")` } : undefined} />
                        <span className="services-story-stop-posters">
                            {SERVICES_STOP_POSTERS.map((poster, index) => (
                                <span className="services-story-stop-poster" data-services-stop={index + 1} key={poster} style={servicesStopPostersArmed ? { backgroundImage: `url("${poster}")` } : undefined} />
                            ))}
                        </span>
                        {motionAllowed && servicesPackedTransportMode ? (
                            <PackedAlphaVideo
                                key={servicesTransportKey}
                                ref={servicesVideoRef}
                                armed={servicesMediaArmed}
                                compositeActive={packedAlphaOwner === "services"}
                                className="services-story-video services-story-video-packed"
                                videoClassName="packed-alpha-video-source"
                                src={servicesVideoSource}
                                outputWidth={lightweightMediaMode
                                    ? RUNTIME_MEDIA.services.webkitPacked.mobileOutput.width
                                    : RUNTIME_MEDIA.services.webkitPacked.desktopOutput.width}
                                outputHeight={lightweightMediaMode
                                    ? RUNTIME_MEDIA.services.webkitPacked.mobileOutput.height
                                    : RUNTIME_MEDIA.services.webkitPacked.desktopOutput.height}
                                maxFps={60}
                                preload={servicesMediaArmed ? "auto" : "none"}
                                tabIndex={-1}
                                onLoadedMetadata={onPackedLoadedMetadata}
                                onFirstFrame={onServicesFrameReady}
                                onReady={recoverServicesMedia}
                                onError={activateServicesMediaFallback}
                            />
                        ) : motionAllowed ? (
                            <video
                                key={servicesTransportKey}
                                ref={servicesVideoRef}
                                className="services-story-video"
                                data-armed={servicesMediaArmed ? "true" : "false"}
                                src={servicesMediaArmed ? servicesVideoSource : undefined}
                                muted
                                playsInline
                                preload={servicesMediaArmed ? "auto" : "none"}
                                poster={servicesMediaArmed ? SERVICES_SEQUENCE_POSTER : undefined}
                                disablePictureInPicture
                                tabIndex={-1}
                                onLoadedMetadata={onNativeLoadedMetadata}
                                onLoadedData={onServicesFrameReady}
                                onCanPlay={recoverServicesMedia}
                                onError={activateServicesMediaFallback}
                            />
                        ) : (
                            <span className="services-story-poster" style={servicesMediaArmed ? { backgroundImage: `url("${SERVICES_SEQUENCE_POSTER}")` } : undefined} />
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}
