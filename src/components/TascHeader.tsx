"use client";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import GlassSurface from "@/components/GlassSurface";
gsap.registerPlugin(useGSAP);
type TascHeaderProps = {
    onNavigate: (href: string) => void;
};
const navItems = [
    { label: "Clients", href: "#clients" },
    { label: "Services", href: "#services" },
    { label: "How we work", href: "#work" },
    { label: "The Datum", href: "#datum" },
    { label: "Process", href: "#process" },
];
const mobileNotes = [
    "Two client profiles",
    "Three services",
    "How execution works",
    "Media network layer",
    "Five-step workflow",
];
const headerActions = [
    { label: "Contact us", href: "#contact", variant: "glass" },
    { label: "Submit a request", href: "#brief", variant: "light" },
] as const;
export default function TascHeader({ onNavigate }: TascHeaderProps) {
    const [open, setOpen] = useState(false);
    const headerRef = useRef<HTMLElement | null>(null);
    const toggleRef = useRef<HTMLButtonElement | null>(null);
    const initializedRef = useRef(false);
    const navigate = useCallback((event: MouseEvent<HTMLAnchorElement>, href: string) => {
        event.preventDefault();
        onNavigate(href);
        setOpen(false);
    }, [onNavigate]);
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
                window.requestAnimationFrame(() => toggleRef.current?.focus());
            }
        };
        const handlePointerDown = (event: PointerEvent) => {
            if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const handleResize = () => {
            if (window.matchMedia("(min-width: 901px)").matches) {
                setOpen(false);
            }
        };
        const handleScroll = () => {
            setOpen(false);
        };
        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("pointerdown", handlePointerDown);
        window.addEventListener("resize", handleResize);
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("pointerdown", handlePointerDown);
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("scroll", handleScroll);
        };
    }, []);
    useGSAP(() => {
        const panel = headerRef.current?.querySelector<HTMLElement>(".mobile-menu-panel");
        const cards = gsap.utils.toArray<HTMLElement>(".mobile-menu-card", headerRef.current ?? undefined);
        if (!panel) {
            return;
        }
        gsap.killTweensOf([panel, ...cards]);
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!initializedRef.current) {
            initializedRef.current = true;
            gsap.set(panel, { autoAlpha: 0, y: -10, scale: 0.985, pointerEvents: "none" });
            gsap.set(cards, { autoAlpha: 0, y: 20 });
        }
        if (reduceMotion) {
            gsap.set(panel, {
                autoAlpha: open ? 1 : 0,
                y: open ? 0 : -10,
                scale: open ? 1 : 0.985,
                pointerEvents: open ? "auto" : "none",
            });
            gsap.set(cards, { autoAlpha: open ? 1 : 0, y: open ? 0 : 20 });
            return;
        }
        if (open) {
            gsap.set(panel, { pointerEvents: "auto" });
            gsap
                .timeline({ defaults: { ease: "power3.out", overwrite: "auto" } })
                .to(panel, { autoAlpha: 1, y: 0, scale: 1, duration: 0.38 })
                .to(cards, { autoAlpha: 1, y: 0, duration: 0.34, stagger: 0.045 }, "-=0.2");
        }
        else {
            gsap
                .timeline({ defaults: { ease: "power2.inOut", overwrite: "auto" } })
                .to(cards, { autoAlpha: 0, y: 12, duration: 0.16, stagger: 0.025 })
                .to(panel, { autoAlpha: 0, y: -10, scale: 0.985, duration: 0.22, pointerEvents: "none" }, "-=0.1");
        }
    }, { scope: headerRef, dependencies: [open] });
    return (<header ref={headerRef} className={`site-header ${open ? "is-menu-open" : ""}`}>
      <GlassSurface forceLightweight width="100%" height="var(--header-h)" borderRadius={0} borderWidth={0.05} brightness={50} opacity={0.72} blur={5} displace={0.45} backgroundOpacity={0.16} saturation={1.08} fallbackBackgroundOpacity={0.18} fallbackBlur={6} fallbackSaturation={1.08} lightweightBackgroundOpacity={0.42} lightweightBlur={4} lightweightSaturation={1.06} distortionScale={-32} redOffset={-8} greenOffset={4} blueOffset={10} mixBlendMode="screen" className="site-header-glass">
        <div className="site-header-inner">
          <a className="brand-mark" href="#top" aria-label="TASC home" onClick={(event) => navigate(event, "#top")}>
            <Image className="brand-logo" src="/media/tasc-logo-20260710.svg" alt="TASC" width={1271} height={280} priority/>
          </a>

          <nav className="site-nav" aria-label="Primary navigation">
            {navItems.map((item) => (<a key={item.href} href={item.href} onClick={(event) => navigate(event, item.href)}>
                {item.label}
              </a>))}
          </nav>

          <div className="header-actions" aria-label="Header actions">
            {headerActions.map((action) => (<a className={`header-action-cta header-action-cta-${action.variant}`} href={action.href} key={action.label} onClick={(event) => navigate(event, action.href)}>
                {action.variant === "glass" ? (<GlassSurface width="100%" height="100%" borderRadius={24} borderWidth={0.055} brightness={60} opacity={1} blur={18} displace={1} backgroundOpacity={0.35} saturation={0} distortionScale={-70} redOffset={-50} greenOffset={50} blueOffset={-50} mixBlendMode="screen" className="header-action-glass-surface">
                    <span>{action.label}</span>
                    <ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.8}/>
                  </GlassSurface>) : (action.label)}
              </a>))}
          </div>

          <button ref={toggleRef} type="button" className="mobile-menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="tasc-mobile-menu" onClick={() => setOpen((current) => !current)}>
            {open ? <X aria-hidden="true" size={21} strokeWidth={1.8}/> : <Menu aria-hidden="true" size={22} strokeWidth={1.8}/>}
          </button>
        </div>
      </GlassSurface>

      <div id="tasc-mobile-menu" className="mobile-menu-panel" aria-hidden={!open}>
        <div className="mobile-menu-glass">
          <nav className="mobile-menu-list" aria-label="Mobile navigation">
            {navItems.map((item, index) => (<a className="mobile-menu-card" key={item.href} href={item.href} tabIndex={open ? undefined : -1} onClick={(event) => navigate(event, item.href)}>
                <span>
                  <strong>{item.label}</strong>
                  <small>{mobileNotes[index]}</small>
                </span>
                <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.7}/>
              </a>))}
            {headerActions.map((action) => (<a className={`mobile-menu-card mobile-brief-card mobile-menu-card-${action.variant}`} href={action.href} key={action.label} tabIndex={open ? undefined : -1} onClick={(event) => navigate(event, action.href)}>
                <span>
                  <strong>{action.label}</strong>
                  <small>{action.variant === "glass" ? "Get in Touch" : "One impulse"}</small>
                </span>
                <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.7}/>
              </a>))}
          </nav>
        </div>
      </div>
    </header>);
}
