import { ScrollTrigger } from "gsap/ScrollTrigger";

const DEFAULT_REFRESH_DELAY_MS = 300;

let refreshTimer = 0;
let refreshFrame = 0;

export function scheduleScrollTriggerRefresh(delayMs = DEFAULT_REFRESH_DELAY_MS) {
    if (typeof window === "undefined")
        return;
    window.clearTimeout(refreshTimer);
    if (refreshFrame)
        window.cancelAnimationFrame(refreshFrame);
    refreshTimer = window.setTimeout(() => {
        refreshTimer = 0;
        refreshFrame = window.requestAnimationFrame(() => {
            refreshFrame = 0;
            ScrollTrigger.sort();
            ScrollTrigger.refresh();
        });
    }, Math.max(0, delayMs));
}
