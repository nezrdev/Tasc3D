import type { MouseEvent, ReactNode } from "react";
import GlassSurface from "@/components/GlassSurface";
type GlassCtaProps = {
    children: ReactNode;
    className?: string;
    href: string;
    onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
};
export function GlassCta({ children, className = "", href, onClick, }: GlassCtaProps) {
    return (<a className={`figma-cta figma-cta-glass ${className}`} href={href} onClick={onClick}>
      <GlassSurface width="100%" height="100%" borderRadius={999} borderWidth={0.12} brightness={74} opacity={0.88} blur={20} displace={0.4} backgroundOpacity={0.18} lightweightBackgroundOpacity={0.18} saturation={1.45} distortionScale={-92} redOffset={-18} greenOffset={22} blueOffset={30} mixBlendMode="screen" className="figma-cta-glass-surface">
        <span className="figma-cta-content">{children}</span>
      </GlassSurface>
    </a>);
}
