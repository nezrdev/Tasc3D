"use client";

import { type FormEventHandler, type Ref } from "react";
import { ArrowRight } from "lucide-react";
import { finalImpulseCopy } from "@/data/landing-content";
import { RUNTIME_MEDIA } from "@/data/runtime-media";

const DOMINO_POSTER = RUNTIME_MEDIA.domino.poster;
const DOMINO_VIDEO_MP4 = RUNTIME_MEDIA.domino.forward.desktop;
const DOMINO_VIDEO_MOBILE_MP4 = RUNTIME_MEDIA.domino.forward.mobile;
const DOMINO_VIDEO_WEBM = RUNTIME_MEDIA.domino.forward.chromium.desktop;
const DOMINO_VIDEO_MOBILE_WEBM = RUNTIME_MEDIA.domino.forward.chromium.mobile;
const DOMINO_REVERSE_VIDEO_MP4 = RUNTIME_MEDIA.domino.reverse.desktop;
const DOMINO_REVERSE_VIDEO_MOBILE_MP4 = RUNTIME_MEDIA.domino.reverse.mobile;
const DOMINO_REVERSE_VIDEO_WEBM = RUNTIME_MEDIA.domino.reverse.chromium.desktop;
const DOMINO_REVERSE_VIDEO_MOBILE_WEBM = RUNTIME_MEDIA.domino.reverse.chromium.mobile;

type LeadController = {
    captureFirstInteraction: () => void;
    state: {
        message: string;
        status: string;
    };
    submit: FormEventHandler<HTMLFormElement>;
};

type DominoSectionProps = {
    dominoLead: LeadController;
    dominoMediaArmed: boolean;
    dominoReverseMediaArmed: boolean;
    dominoReverseVideoRef: Ref<HTMLVideoElement>;
    dominoTransportKey: string;
    dominoVideoRef: Ref<HTMLVideoElement>;
    lightweightMediaMode: boolean;
    motionAllowed: boolean;
    onForwardFallbackChange: (fallback: boolean) => void;
    onForwardPreparedChange: (prepared: boolean) => void;
    onReverseFallbackChange: (fallback: boolean) => void;
    onReversePreparedChange: (prepared: boolean) => void;
    reportDominoSourceError: (direction: "forward" | "reverse") => void;
    webkitCompatibilityMode: boolean;
};

export function DominoSection({
    dominoLead,
    dominoMediaArmed,
    dominoReverseMediaArmed,
    dominoReverseVideoRef,
    dominoTransportKey,
    dominoVideoRef,
    lightweightMediaMode,
    motionAllowed,
    onForwardFallbackChange,
    onForwardPreparedChange,
    onReverseFallbackChange,
    onReversePreparedChange,
    reportDominoSourceError,
    webkitCompatibilityMode,
}: DominoSectionProps) {
    return (
        <section className="domino-cta-section glass-editorial-section" id="brief" aria-label="One impulse CTA">
            <div className="domino-scene">
                <div className="domino-media" aria-label="Autonomous domino animation">
                    <span
                        className="domino-poster"
                        style={{ backgroundImage: `url("${DOMINO_POSTER}")` }}
                        aria-hidden="true"
                    />
                    {motionAllowed ? (
                        <>
                            <video
                                key={`domino-forward-${dominoTransportKey}`}
                                ref={dominoVideoRef}
                                className="domino-sequence domino-sequence-forward"
                                data-domino-direction="forward"
                                data-armed={dominoMediaArmed ? "true" : "false"}
                                poster={DOMINO_POSTER}
                                muted
                                playsInline
                                preload={dominoMediaArmed ? "auto" : "metadata"}
                                disablePictureInPicture
                                tabIndex={-1}
                                onLoadedData={() => {
                                    onForwardPreparedChange(true);
                                    onForwardFallbackChange(false);
                                }}
                                onCanPlay={() => {
                                    onForwardPreparedChange(true);
                                    onForwardFallbackChange(false);
                                }}
                                onError={() => {
                                    onForwardPreparedChange(false);
                                    onForwardFallbackChange(true);
                                }}
                            >
                                {dominoMediaArmed ? (
                                    <>
                                        {webkitCompatibilityMode || lightweightMediaMode ? (
                                            <source src={lightweightMediaMode ? DOMINO_VIDEO_MOBILE_MP4 : DOMINO_VIDEO_MP4} type="video/mp4" onError={() => reportDominoSourceError("forward")} />
                                        ) : null}
                                        <source src={lightweightMediaMode ? DOMINO_VIDEO_MOBILE_WEBM : DOMINO_VIDEO_WEBM} type="video/webm" onError={() => reportDominoSourceError("forward")} />
                                    </>
                                ) : null}
                            </video>
                            <video
                                key={`domino-reverse-${dominoTransportKey}`}
                                ref={dominoReverseVideoRef}
                                className="domino-sequence domino-sequence-reverse"
                                data-domino-direction="reverse"
                                data-armed={dominoReverseMediaArmed ? "true" : "false"}
                                poster={DOMINO_POSTER}
                                muted
                                playsInline
                                preload={dominoReverseMediaArmed ? "auto" : "metadata"}
                                disablePictureInPicture
                                tabIndex={-1}
                                onLoadedData={() => {
                                    onReversePreparedChange(true);
                                    onReverseFallbackChange(false);
                                }}
                                onCanPlay={() => {
                                    onReversePreparedChange(true);
                                    onReverseFallbackChange(false);
                                }}
                                onError={() => {
                                    onReversePreparedChange(false);
                                    onReverseFallbackChange(true);
                                }}
                            >
                                {dominoReverseMediaArmed ? (
                                    <>
                                        {webkitCompatibilityMode || lightweightMediaMode ? (
                                            <source
                                                src={lightweightMediaMode
                                                    ? DOMINO_REVERSE_VIDEO_MOBILE_MP4
                                                    : DOMINO_REVERSE_VIDEO_MP4}
                                                type="video/mp4"
                                                onError={() => reportDominoSourceError("reverse")}
                                            />
                                        ) : null}
                                        <source
                                            src={lightweightMediaMode
                                                ? DOMINO_REVERSE_VIDEO_MOBILE_WEBM
                                                : DOMINO_REVERSE_VIDEO_WEBM}
                                            type="video/webm"
                                            onError={() => reportDominoSourceError("reverse")}
                                        />
                                    </>
                                ) : null}
                            </video>
                        </>
                    ) : null}
                    <div className="domino-loading-state" role="status" aria-live="polite">
                        <span aria-hidden="true" />
                        Preparing motion
                    </div>
                </div>
                <h2 className="domino-video-title" aria-live="polite">
                    <span>{finalImpulseCopy.title}</span>
                    <span>{finalImpulseCopy.accent}</span>
                </h2>
                <div className="domino-form-stage">
                    <div className="domino-copy domino-impulse-copy stagger-reveal-group">
                        <p className="domino-body domino-body-primary stagger-reveal-item">
                            {finalImpulseCopy.bodyPrimary}
                        </p>
                        <p className="domino-body domino-body-signal stagger-reveal-item">
                            {finalImpulseCopy.bodySignal}
                        </p>
                        <form className="domino-impulse-form" data-submit-state={dominoLead.state.status} onSubmit={dominoLead.submit}>
                            <div className="domino-impulse-row stagger-reveal-item">
                                <label className="sr-only" htmlFor="domino-email">
                                    Email
                                </label>
                                <input id="domino-email" name="email" type="email" placeholder="ENTERYOUREMAIL@HERE.COM" required maxLength={254} autoComplete="email" onFocus={dominoLead.captureFirstInteraction} />
                                <button type="submit" disabled={dominoLead.state.status === "submitting"}>
                                    {dominoLead.state.status === "submitting" ? "Sending" : finalImpulseCopy.action}
                                    <ArrowRight aria-hidden="true" size={18} strokeWidth={1.5} />
                                </button>
                            </div>
                            <label className="domino-privacy-row stagger-reveal-item">
                                <input name="privacy" type="checkbox" onFocus={dominoLead.captureFirstInteraction} required />
                                <span className="domino-privacy-desktop">
                                    I agree to the processing of my email under the <a href="/privacy-policy">Privacy Policy</a>.
                                </span>
                                <span className="domino-privacy-mobile">
                                    By clicking you agree to our <a href="/privacy-policy">Policy</a>
                                </span>
                            </label>
                            <label className="lead-honeypot" aria-hidden="true">
                                Company website
                                <input name="website" type="text" tabIndex={-1} autoComplete="off" />
                            </label>
                            <p className={`lead-form-status stagger-reveal-item is-${dominoLead.state.status}`} role={dominoLead.state.status === "error" ? "alert" : "status"} aria-live="polite">
                                {dominoLead.state.message}
                            </p>
                        </form>
                    </div>
                </div>
            </div>
        </section>
    );
}
