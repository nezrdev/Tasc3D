"use client";

import { type FormEventHandler, type Ref } from "react";
import { ArrowRight } from "lucide-react";
import VisibilityTriggeredVideo from "@/components/VisibilityTriggeredVideo";
import { datumCardsCopy, datumWaitlistCopy } from "@/data/landing-content";
import { RUNTIME_MEDIA } from "@/data/runtime-media";

const DATUM_VIDEO_WEBM = RUNTIME_MEDIA.datum.chromium.desktop;
const DATUM_VIDEO_MOBILE_WEBM = RUNTIME_MEDIA.datum.chromium.mobile;
const DATUM_VIDEO_POSTER = RUNTIME_MEDIA.datum.poster;

type LeadController = {
    captureFirstInteraction: () => void;
    state: {
        message: string;
        status: string;
    };
    submit: FormEventHandler<HTMLFormElement>;
};

type DatumSectionProps = {
    datumLead: LeadController;
    datumMediaArmed: boolean;
    datumVideoRef: Ref<HTMLVideoElement>;
    datumVideoSource: string;
    lightweightMediaMode: boolean;
    motionAllowed: boolean;
    onMediaFallbackChange: (fallback: boolean) => void;
    onMediaPreparedChange: (prepared: boolean) => void;
    webkitCompatibilityMode: boolean;
};

export function DatumSection({
    datumLead,
    datumMediaArmed,
    datumVideoRef,
    datumVideoSource,
    lightweightMediaMode,
    motionAllowed,
    onMediaFallbackChange,
    onMediaPreparedChange,
    webkitCompatibilityMode,
}: DatumSectionProps) {
    return (
        <section className="datum-motion-section glass-editorial-section" id="datum" aria-label="The Datum">
            <div className="datum-motion-media" aria-hidden="true">
                {motionAllowed ? (
                    <VisibilityTriggeredVideo
                        key={datumVideoSource}
                        ref={datumVideoRef}
                        className="datum-motion-video"
                        enabled={datumMediaArmed}
                        hostStateAttribute="data-datum-playback"
                        sources={datumMediaArmed ? [
                            ...(webkitCompatibilityMode
                                ? [{ src: datumVideoSource, type: "video/mp4" }]
                                : []),
                            {
                                src: lightweightMediaMode ? DATUM_VIDEO_MOBILE_WEBM : DATUM_VIDEO_WEBM,
                                type: "video/webm",
                            },
                        ] : []}
                        data-armed={datumMediaArmed ? "true" : "false"}
                        poster={datumMediaArmed ? DATUM_VIDEO_POSTER : undefined}
                        preload={datumMediaArmed ? "auto" : "metadata"}
                        threshold={0.02}
                        armDelayMs={0}
                        playbackRate={1}
                        onLoadedData={() => {
                            onMediaPreparedChange(true);
                            onMediaFallbackChange(false);
                        }}
                        onError={() => {
                            onMediaPreparedChange(false);
                            onMediaFallbackChange(true);
                        }}
                    />
                ) : null}
            </div>

            <div className="datum-motion-content">
                <div className="datum-motion-state datum-motion-state-cards stagger-reveal-group">
                    <div className="datum-motion-heading stagger-reveal-item">
                        <h2>The Datum</h2>
                        <p>A Global Media Network. Built by TASC</p>
                    </div>

                    <div className="datum-card-stack">
                        {datumCardsCopy.map((card) => (
                            <article className="datum-glass-card stagger-reveal-item" key={card.title}>
                                <div className="datum-card-top">
                                    <strong>{card.value}</strong>
                                    <span>
                                        {card.label}
                                        <br />
                                        {card.labelSecondLine}
                                    </span>
                                </div>
                                <span className="datum-card-rule" aria-hidden="true" />
                                <h3>{card.title}</h3>
                                <p>{card.body}</p>
                            </article>
                        ))}
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
                            <input className="datum-waitlist-segment" id="datum-email" name="email" type="email" placeholder="EXAMPLE@MAIL.COM" autoComplete="email" maxLength={254} onFocus={datumLead.captureFirstInteraction} required />
                            <label className="lead-honeypot" aria-hidden="true">
                                Company website
                                <input name="website" type="text" tabIndex={-1} autoComplete="off" />
                            </label>
                        </div>
                        <div className="datum-consent-row">
                            <label className="datum-waitlist-segment">
                                <input name="privacy" type="checkbox" onFocus={datumLead.captureFirstInteraction} required />
                                <span>
                                    I agree to the processing of my personal data and accept the{" "}
                                    <a href="/privacy-policy">Privacy Policy</a>.
                                </span>
                            </label>
                            <button className="datum-submit-button datum-waitlist-segment" type="submit" aria-label="Submit waitlist email" disabled={datumLead.state.status === "submitting"}>
                                {datumLead.state.status === "submitting" ? "Sending" : "Submit"}
                                <ArrowRight aria-hidden="true" size={28} strokeWidth={1.25} />
                            </button>
                        </div>
                        <p className={`lead-form-status is-${datumLead.state.status}`} role={datumLead.state.status === "error" ? "alert" : "status"} aria-live="polite">
                            {datumLead.state.message}
                        </p>
                    </form>
                </div>
            </div>
        </section>
    );
}
