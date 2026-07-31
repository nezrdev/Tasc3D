"use client";
import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
gsap.registerPlugin(useGSAP);
type SitePreloaderProps = {
    ready: boolean;
    onComplete: () => void;
    onRevealStart?: () => void;
};
const blindCount = 12;
export default function SitePreloader({ ready, onComplete, onRevealStart }: SitePreloaderProps) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const completeRef = useRef(false);
    const revealStartedRef = useRef(false);
    const readyRef = useRef(ready);
    const revealRef = useRef<(() => void) | null>(null);
    const onCompleteRef = useRef(onComplete);
    const onRevealStartRef = useRef(onRevealStart);
    useEffect(() => {
        onCompleteRef.current = onComplete;
        onRevealStartRef.current = onRevealStart;
    }, [onComplete, onRevealStart]);
    useEffect(() => {
        readyRef.current = ready;
        if (ready)
            revealRef.current?.();
    }, [ready]);
    useGSAP(() => {
        const root = rootRef.current;
        if (!root) {
            return;
        }
        const startReveal = () => {
            if (revealStartedRef.current) {
                return;
            }
            revealStartedRef.current = true;
            onRevealStartRef.current?.();
        };
        const finish = () => {
            if (completeRef.current) {
                return;
            }
            startReveal();
            completeRef.current = true;
            if (root) {
                root.style.display = "none";
                root.style.pointerEvents = "none";
            }
            onCompleteRef.current();
        };
        const handleHardFailOpen = () => finish();
        const handleCriticalHide = (event: AnimationEvent) => {
            if (event.animationName === "tasc-preloader-critical-hide") {
                finish();
            }
        };
        window.addEventListener("tasc:preloader-hard-fail-open", handleHardFailOpen);
        root.addEventListener("animationend", handleCriticalHide);
        const criticalHideFinished = typeof root.getAnimations === "function"
            && root.getAnimations().some((animation) =>
                (animation as CSSAnimation).animationName === "tasc-preloader-critical-hide"
                && animation.playState === "finished");
        if (document.documentElement.dataset.tascBootFailOpen === "true" || criticalHideFinished) {
            finish();
            return () => {
                root.removeEventListener("animationend", handleCriticalHide);
                window.removeEventListener("tasc:preloader-hard-fail-open", handleHardFailOpen);
            };
        }
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const compact = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
        const blinds = gsap.utils.toArray<HTMLElement>(".preloader-blind", root);
        const killSwitch = window.setTimeout(() => revealRef.current?.(), 2800);
        gsap.set(root, { autoAlpha: 1 });
        gsap.set(blinds, { scaleX: 1, transformOrigin: "50% 50%" });
        gsap.set(".preloader-logo", { autoAlpha: 1, y: 0 });
        gsap.set(".preloader-progress-fill", { scaleX: 0.04, transformOrigin: "0% 50%" });
        const loadingTween = gsap.to(".preloader-progress-fill", {
            scaleX: 0.86,
            duration: compact ? 0.72 : 0.62,
            ease: "power2.out",
        });
        const timeline = gsap.timeline({
            paused: true,
            defaults: { ease: "power3.inOut" },
            onComplete: finish,
        });
        timeline
            .to(".preloader-progress-fill", { scaleX: 1, duration: reduceMotion ? 0.08 : 0.16, ease: "power1.inOut" })
            .to({}, { duration: reduceMotion ? 0.02 : compact ? 0.06 : 0.04 })
            .to(".preloader-logo", { autoAlpha: 0, y: reduceMotion ? 0 : -14, duration: reduceMotion ? 0.1 : 0.16 })
            .to(blinds, {
            scaleX: 0,
            autoAlpha: 0.22,
            duration: reduceMotion ? 0.1 : compact ? 0.42 : 0.36,
            stagger: { amount: reduceMotion ? 0 : compact ? 0.12 : 0.1, from: "center" },
            onStart: startReveal,
        }, "-=0.08")
            .to(root, { autoAlpha: 0, duration: reduceMotion ? 0.08 : 0.12, ease: "power2.out" }, "-=0.08");
        const reveal = () => {
            if (revealStartedRef.current || completeRef.current || timeline.isActive())
                return;
            startReveal();
            window.clearTimeout(killSwitch);
            loadingTween.kill();
            timeline.play(0);
        };
        revealRef.current = reveal;
        const handleNavigationDeadline = () => reveal();
        window.addEventListener("tasc:preloader-deadline", handleNavigationDeadline);
        if (readyRef.current || document.documentElement.dataset.tascPreloaderDeadline === "true")
            reveal();
        return () => {
            window.clearTimeout(killSwitch);
            root.removeEventListener("animationend", handleCriticalHide);
            window.removeEventListener("tasc:preloader-deadline", handleNavigationDeadline);
            window.removeEventListener("tasc:preloader-hard-fail-open", handleHardFailOpen);
            revealRef.current = null;
            loadingTween.kill();
            timeline.kill();
        };
    }, { scope: rootRef });
    return (<div className="site-preloader" ref={rootRef} role="status" aria-label="Loading TASC">
      <div className="preloader-blinds">
        {Array.from({ length: blindCount }).map((_, index) => (<span className="preloader-blind" key={index}/>))}
      </div>
      <div className="preloader-logo">
        <Image src="/media/tasc-logo-20260710.svg" alt="" width={1271} height={280} priority/>
        <span className="preloader-progress-label" aria-hidden="true">Loading</span>
        <span className="preloader-progress" aria-hidden="true">
          <span className="preloader-progress-fill"/>
        </span>
      </div>
    </div>);
}
