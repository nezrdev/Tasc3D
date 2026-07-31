export type LensPose = {
    x: () => number;
    y: () => number;
    scale: number;
    rotation?: number;
    autoAlpha?: number;
};
export type HeroVideoState = "pending" | "ready" | "fallback";
export type MotionNavigationController = {
    releaseForNavigation: () => void;
};
