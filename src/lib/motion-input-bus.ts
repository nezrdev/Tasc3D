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

export type MotionInputReleaseReason = "completed" | "out-of-range" | "superseded" | "unregistered" | "watchdog";

export type MotionInputResult = {
    handled?: boolean;
    progress?: number | string;
    release?: boolean;
} | boolean | void;

export type MotionInputStory = {
    canClaim: (gesture: MotionInputGesture) => boolean;
    id: string;
    onGesture: (gesture: MotionInputGesture) => MotionInputResult;
    observe?: (gesture: MotionInputGesture) => void;
    priority: number;
    release: (reason: MotionInputReleaseReason) => void;
    root: HTMLElement;
};

export type MotionInputRegistration = {
    claim: (progress?: number | string) => void;
    isOwner: () => boolean;
    markProgress: (progress?: number | string) => void;
    release: (reason?: MotionInputReleaseReason) => void;
    unregister: () => void;
};

const OWNER_WATCHDOG_MS = 4000;

const stories = new Map<string, MotionInputStory>();
const observers = new Map<string, (gesture: MotionInputGesture) => void>();

let activeOwnerId: string | null = null;
let ownerAcquiredAt = 0;
let ownerLastProgressAt = 0;
let ownerProgressToken = "";
let watchdogTimer = 0;
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

const writeListenerState = () => {
    const value = listenersAttached ? "1" : "0";
    stories.forEach(({ root }) => {
        root.dataset.motionInputBusListeners = value;
    });
};

const clearOwnerState = (owner: MotionInputStory | undefined) => {
    if (!owner)
        return;
    delete owner.root.dataset.motionInputOwner;
    delete owner.root.dataset.motionInputOwnerSince;
};

const emitOwnerChange = (owner: MotionInputStory | undefined, reason: MotionInputReleaseReason | "claimed") => {
    if (typeof window === "undefined")
        return;
    window.dispatchEvent(new CustomEvent("tasc:motion-input-owner-change", {
        detail: {
            owner: owner?.id ?? null,
            reason,
        },
    }));
};

const armWatchdog = () => {
    window.clearTimeout(watchdogTimer);
    watchdogTimer = 0;
    if (!activeOwnerId)
        return;
    const remaining = Math.max(0, OWNER_WATCHDOG_MS - (performance.now() - ownerLastProgressAt));
    watchdogTimer = window.setTimeout(() => {
        watchdogTimer = 0;
        const ownerId = activeOwnerId;
        const owner = ownerId ? stories.get(ownerId) : undefined;
        if (!owner || performance.now() - ownerLastProgressAt < OWNER_WATCHDOG_MS) {
            armWatchdog();
            return;
        }
        owner.root.dataset.motionInputWatchdogRelease = owner.id;
        console.warn(`[motion-input-bus] forced release after ${OWNER_WATCHDOG_MS}ms without progress: ${owner.id}`);
        deactivateOwner("watchdog", true);
    }, remaining);
};

const markOwnerProgress = (id: string, progress?: number | string) => {
    if (activeOwnerId !== id)
        return;
    const nextToken = progress === undefined ? `${performance.now()}` : String(progress);
    if (progress !== undefined && nextToken === ownerProgressToken)
        return;
    ownerProgressToken = nextToken;
    ownerLastProgressAt = performance.now();
    const owner = stories.get(id);
    if (owner)
        owner.root.dataset.motionInputOwnerProgress = nextToken;
    armWatchdog();
};

const deactivateOwner = (reason: MotionInputReleaseReason, notify: boolean) => {
    const ownerId = activeOwnerId;
    const owner = ownerId ? stories.get(ownerId) : undefined;
    activeOwnerId = null;
    ownerAcquiredAt = 0;
    ownerLastProgressAt = 0;
    ownerProgressToken = "";
    window.clearTimeout(watchdogTimer);
    watchdogTimer = 0;
    clearOwnerState(owner);
    if (owner)
        delete owner.root.dataset.motionInputOwnerProgress;
    if (notify)
        owner?.release(reason);
    emitOwnerChange(undefined, reason);
};

const activateOwner = (story: MotionInputStory, progress?: number | string) => {
    if (activeOwnerId === story.id) {
        if (progress !== undefined)
            markOwnerProgress(story.id, progress);
        return;
    }
    if (activeOwnerId)
        deactivateOwner("superseded", true);
    activeOwnerId = story.id;
    ownerAcquiredAt = performance.now();
    ownerLastProgressAt = ownerAcquiredAt;
    ownerProgressToken = progress === undefined ? "claimed" : String(progress);
    story.root.dataset.motionInputOwner = story.id;
    story.root.dataset.motionInputOwnerSince = String(Math.round(ownerAcquiredAt));
    story.root.dataset.motionInputOwnerProgress = ownerProgressToken;
    emitOwnerChange(story, "claimed");
    armWatchdog();
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

const orderedStories = () => [...stories.values()].sort((left, right) => right.priority - left.priority);

const dispatchGesture = (gesture: MotionInputGesture) => {
    observers.forEach((observer) => observer(gesture));
    for (const story of orderedStories())
        story.observe?.(gesture);

    let owner = activeOwnerId ? stories.get(activeOwnerId) : undefined;
    if (gesture.kind !== "scroll" && owner && !owner.canClaim(gesture)) {
        deactivateOwner("out-of-range", true);
        owner = undefined;
    }
    if (!owner && gesture.kind !== "scroll") {
        owner = orderedStories().find((story) => story.canClaim(gesture));
        if (owner)
            activateOwner(owner);
    }
    if (!owner)
        return;

    const result = owner.onGesture(gesture);
    const normalized = typeof result === "boolean" ? { handled: result } : result ?? {};
    if (activeOwnerId === owner.id && normalized.progress !== undefined)
        markOwnerProgress(owner.id, normalized.progress);
    if (normalized.handled && gesture.event.cancelable && !gesture.event.defaultPrevented)
        gesture.event.preventDefault();
    if (activeOwnerId === owner.id && normalized.release)
        deactivateOwner("completed", false);
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

const attachListeners = () => {
    if (listenersAttached || typeof window === "undefined")
        return;
    listenersAttached = true;
    window.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    window.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
    window.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
    window.addEventListener("touchend", handleTouchEnd, { capture: true, passive: true });
    window.addEventListener("touchcancel", handleTouchCancel, { capture: true, passive: true });
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("scroll", handleScroll, { passive: true });
    writeListenerState();
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
    writeListenerState();
};

export function registerMotionInputStory(story: MotionInputStory): MotionInputRegistration {
    const previous = stories.get(story.id);
    if (previous)
        throw new Error(`motion input story already registered: ${story.id}`);
    stories.set(story.id, story);
    story.root.dataset.motionInputBus = "ready";
    attachListeners();
    writeListenerState();

    let registered = true;
    return {
        claim: (progress) => {
            if (registered)
                activateOwner(story, progress);
        },
        isOwner: () => registered && activeOwnerId === story.id,
        markProgress: (progress) => {
            if (registered)
                markOwnerProgress(story.id, progress);
        },
        release: (reason = "completed") => {
            if (registered && activeOwnerId === story.id)
                deactivateOwner(reason, false);
        },
        unregister: () => {
            if (!registered)
                return;
            registered = false;
            if (activeOwnerId === story.id)
                deactivateOwner("unregistered", false);
            stories.delete(story.id);
            const rootStillRegistered = [...stories.values()].some((candidate) => candidate.root === story.root);
            if (!rootStillRegistered) {
                delete story.root.dataset.motionInputBus;
                delete story.root.dataset.motionInputBusListeners;
            }
            if (stories.size === 0 && observers.size === 0)
                detachListeners();
        },
    };
}

export function registerMotionInputObserver(id: string, observer: (gesture: MotionInputGesture) => void) {
    if (observers.has(id))
        throw new Error(`motion input observer already registered: ${id}`);
    observers.set(id, observer);
    attachListeners();
    return () => {
        observers.delete(id);
        if (stories.size === 0 && observers.size === 0)
            detachListeners();
    };
}

export const MOTION_INPUT_OWNER_WATCHDOG_MS = OWNER_WATCHDOG_MS;

export const getMotionInputOwnerId = () => activeOwnerId;
