/*
  One mechanism for every story that has to hold the reader still while a video
  segment plays: swallow the input events that would move the document. Nothing
  here ever writes window.scrollY, so a lock can never throw the page around -
  the worst it can do is refuse a gesture, and the reader keeps whatever position
  they scrolled to.

  Every lock carries a deadline. If the media never reaches its last frame the
  lock expires on its own instead of leaving the page stuck for good.
*/

export type ScrollLockHandle = {
    isHeld: () => boolean;
    release: () => void;
};

export const SCROLL_LOCK_SAFETY_MS = 6000;

const SCROLL_KEYS = new Set([
    " ",
    "ArrowDown",
    "ArrowUp",
    "End",
    "Home",
    "PageDown",
    "PageUp",
]);

let ownerToken: symbol | null = null;
let ownerId = "";
let safetyTimer = 0;
let attached = false;

const isEditableTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"));

const swallow = (event: Event) => {
    if (event.cancelable)
        event.preventDefault();
};

const handleWheel = (event: WheelEvent) => {
    if (!event.ctrlKey)
        swallow(event);
};

const handleTouchMove = (event: TouchEvent) => swallow(event);

const handleKeyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target) || !SCROLL_KEYS.has(event.key))
        return;
    swallow(event);
};

const attach = () => {
    if (attached || typeof window === "undefined")
        return;
    attached = true;
    window.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    window.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
    window.addEventListener("keydown", handleKeyDown, { capture: true, passive: false });
};

const detach = () => {
    if (!attached || typeof window === "undefined")
        return;
    attached = false;
    window.removeEventListener("wheel", handleWheel, true);
    window.removeEventListener("touchmove", handleTouchMove, true);
    window.removeEventListener("keydown", handleKeyDown, true);
};

const clear = () => {
    window.clearTimeout(safetyTimer);
    safetyTimer = 0;
    ownerToken = null;
    ownerId = "";
    detach();
    document.documentElement.removeAttribute("data-scroll-lock");
};

/*
  Acquiring while another story holds the lock takes it over rather than
  queueing: two stories can only overlap when one of them is already out of
  range, and the newcomer is the one the reader is actually looking at.
*/
export function acquireScrollLock(id: string, safetyMs = SCROLL_LOCK_SAFETY_MS): ScrollLockHandle {
    const token = Symbol(id);
    window.clearTimeout(safetyTimer);
    ownerToken = token;
    ownerId = id;
    attach();
    document.documentElement.dataset.scrollLock = id;
    safetyTimer = window.setTimeout(() => {
        if (ownerToken !== token)
            return;
        console.warn(`[scroll-lock] released ${id} after ${safetyMs}ms without a finish`);
        document.documentElement.dataset.scrollLockTimeout = id;
        clear();
    }, safetyMs);
    return {
        isHeld: () => ownerToken === token,
        release: () => {
            if (ownerToken === token)
                clear();
        },
    };
}

export const isScrollLocked = () => ownerToken !== null;

export const getScrollLockOwner = () => ownerId;

export function releaseScrollLock() {
    if (ownerToken !== null)
        clear();
}
