/*
  What is left of the input bus after the stories stopped fighting over the
  gesture. Nothing claims ownership any more - scrolling is native and the two
  stories that pause the reader do it through the scroll lock. This is now a
  read-only tap on the input stream: anchor settling and the reveal watchdog
  need to know that the reader touched something, nothing needs to consume it.
*/

export type MotionInputDirection = -1 | 0 | 1;

export type MotionInputGesture = {
    at: number;
    deltaX: number;
    deltaY: number;
    direction: MotionInputDirection;
    event: WheelEvent | TouchEvent | KeyboardEvent | Event;
    kind: "wheel" | "touchstart" | "touchmove" | "touchend" | "touchcancel" | "keydown" | "scroll";
    magnitude: number;
    scrollY: number;
    viewportHeight: number;
};

const observers = new Map<string, (gesture: MotionInputGesture) => void>();

let listenersAttached = false;
let touchX: number | null = null;
let touchY: number | null = null;

const readKeyDirection = (event: KeyboardEvent): MotionInputDirection => {
    const forward = event.key === "ArrowDown" ||
        event.key === "PageDown" ||
        event.key === "End" ||
        (event.key === " " && !event.shiftKey);
    const backward = event.key === "ArrowUp" ||
        event.key === "PageUp" ||
        event.key === "Home" ||
        (event.key === " " && event.shiftKey);
    return forward ? 1 : backward ? -1 : 0;
};

const normalizeWheelDelta = (event: WheelEvent) => {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE)
        return event.deltaY * 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE)
        return event.deltaY * Math.max(1, window.visualViewport?.height ?? window.innerHeight);
    return event.deltaY;
};

const createGesture = (kind: MotionInputGesture["kind"], event: MotionInputGesture["event"]): MotionInputGesture => {
    let deltaX = 0;
    let deltaY = 0;
    if (event instanceof WheelEvent) {
        deltaX = event.deltaX;
        deltaY = normalizeWheelDelta(event);
    }
    else if (kind === "touchstart" || kind === "touchmove" || kind === "touchend" || kind === "touchcancel") {
        const touchEvent = event as TouchEvent;
        const touch = touchEvent.touches[0] ?? touchEvent.changedTouches[0];
        if (kind === "touchstart") {
            touchX = touch?.clientX ?? null;
            touchY = touch?.clientY ?? null;
        }
        else if (kind === "touchmove" && touch && touchX !== null && touchY !== null) {
            deltaX = touchX - touch.clientX;
            deltaY = touchY - touch.clientY;
            touchX = touch.clientX;
            touchY = touch.clientY;
        }
        else if (kind === "touchend" || kind === "touchcancel") {
            touchX = null;
            touchY = null;
        }
    }
    else if (event instanceof KeyboardEvent) {
        const direction = readKeyDirection(event);
        deltaY = direction * (event.key === "ArrowDown" || event.key === "ArrowUp"
            ? 64
            : Math.max(1, window.visualViewport?.height ?? window.innerHeight));
    }
    const direction: MotionInputDirection = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
    return {
        at: performance.now(),
        deltaX,
        deltaY,
        direction,
        event,
        kind,
        magnitude: Math.max(Math.abs(deltaX), Math.abs(deltaY)),
        scrollY: window.scrollY,
        viewportHeight: Math.max(1, window.visualViewport?.height ?? window.innerHeight),
    };
};

const dispatchGesture = (gesture: MotionInputGesture) => {
    observers.forEach((observer) => observer(gesture));
};

const handleWheel = (event: WheelEvent) => {
    if (!event.ctrlKey)
        dispatchGesture(createGesture("wheel", event));
};
const handleTouchStart = (event: TouchEvent) => dispatchGesture(createGesture("touchstart", event));
const handleTouchMove = (event: TouchEvent) => dispatchGesture(createGesture("touchmove", event));
const handleTouchEnd = (event: TouchEvent) => dispatchGesture(createGesture("touchend", event));
const handleTouchCancel = (event: TouchEvent) => dispatchGesture(createGesture("touchcancel", event));
const handleKeyDown = (event: KeyboardEvent) => dispatchGesture(createGesture("keydown", event));
const handleScroll = (event: Event) => dispatchGesture(createGesture("scroll", event));

/*
  Every listener here is passive. The bus observes; it must never be able to
  cancel a gesture, or native scrolling stops being native.
*/
const attachListeners = () => {
    if (listenersAttached || typeof window === "undefined")
        return;
    listenersAttached = true;
    window.addEventListener("wheel", handleWheel, { capture: true, passive: true });
    window.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
    window.addEventListener("touchmove", handleTouchMove, { capture: true, passive: true });
    window.addEventListener("touchend", handleTouchEnd, { capture: true, passive: true });
    window.addEventListener("touchcancel", handleTouchCancel, { capture: true, passive: true });
    window.addEventListener("keydown", handleKeyDown, { capture: true, passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
};

const detachListeners = () => {
    if (!listenersAttached || typeof window === "undefined")
        return;
    listenersAttached = false;
    window.removeEventListener("wheel", handleWheel, true);
    window.removeEventListener("touchstart", handleTouchStart, true);
    window.removeEventListener("touchmove", handleTouchMove, true);
    window.removeEventListener("touchend", handleTouchEnd, true);
    window.removeEventListener("touchcancel", handleTouchCancel, true);
    window.removeEventListener("keydown", handleKeyDown, true);
    window.removeEventListener("scroll", handleScroll);
};

export function registerMotionInputObserver(id: string, observer: (gesture: MotionInputGesture) => void) {
    if (observers.has(id))
        throw new Error(`motion input observer already registered: ${id}`);
    observers.set(id, observer);
    attachListeners();
    return () => {
        observers.delete(id);
        if (observers.size === 0)
            detachListeners();
    };
}
