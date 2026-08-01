"use client";

export const MAX_WEBGL_RESTORE_ATTEMPTS = 3;

type WebglContext = WebGLRenderingContext | WebGL2RenderingContext;

export function releaseWebglContext(canvas: HTMLCanvasElement, context: WebglContext) {
    canvas.dataset.webglRelease = "intentional";
    context.getExtension("WEBGL_lose_context")?.loseContext();
}

type WebglLifecycleTestHook = {
    failNextReinitializations: (label: string, count: number) => {
        count: number;
        label: string;
    };
};

const artificialRestoreFailures = new Map<string, number>();

const installLifecycleTestHook = () => {
    if (!new URLSearchParams(window.location.search).has("__tasc_webgl_lifecycle_qa"))
        return;
    const target = window as typeof window & {
        __tascWebglLifecycleTest?: WebglLifecycleTestHook;
    };
    target.__tascWebglLifecycleTest ??= {
        failNextReinitializations: (label, count) => {
            const normalizedCount = Math.max(0, Math.min(MAX_WEBGL_RESTORE_ATTEMPTS, Math.floor(count)));
            artificialRestoreFailures.set(label, normalizedCount);
            return { count: normalizedCount, label };
        },
    };
};

const consumeArtificialRestoreFailure = (label: string) => {
    const remaining = artificialRestoreFailures.get(label) ?? 0;
    if (remaining <= 0)
        return false;
    if (remaining === 1)
        artificialRestoreFailures.delete(label);
    else
        artificialRestoreFailures.set(label, remaining - 1);
    return true;
};

type RestorableWebglLifecycleOptions = {
    canvas: HTMLCanvasElement;
    label: string;
    maxAttempts?: number;
    onLost: (attemptsUsed: number) => void;
    onPermanentFailure: (reason: string) => void;
    onRestored: (attemptsUsed: number) => void;
    release?: () => void;
    restore: () => boolean;
};

export function installRestorableWebglLifecycle({ canvas, label, maxAttempts = MAX_WEBGL_RESTORE_ATTEMPTS, onLost, onPermanentFailure, onRestored, release, restore, }: RestorableWebglLifecycleOptions) {
    installLifecycleTestHook();
    let disposed = false;
    let restoreAttempts = 0;
    let retryTimer: number | undefined;
    let restoreEventTimer: number | undefined;
    let permanentlyFailed = false;
    let released = false;

    const clearRetryTimer = () => {
        if (retryTimer === undefined)
            return;
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
    };

    const clearRestoreEventTimer = () => {
        if (restoreEventTimer === undefined)
            return;
        window.clearTimeout(restoreEventTimer);
        restoreEventTimer = undefined;
    };

    const releaseOnce = () => {
        if (released)
            return;
        released = true;
        canvas.dataset.webglRelease = "intentional";
        try {
            release?.();
        }
        catch {
        }
    };

    const detachListeners = () => {
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };

    const fail = (reason: string) => {
        if (disposed || permanentlyFailed)
            return;
        permanentlyFailed = true;
        clearRetryTimer();
        clearRestoreEventTimer();
        canvas.dataset.webglLifecycle = "fallback";
        canvas.dataset.webglFallback = "static";
        canvas.dataset.webglFailureReason = `${label}:${reason}`;
        onPermanentFailure(reason);
        disposed = true;
        detachListeners();
        releaseOnce();
    };

    const tryRestore = () => {
        if (disposed || permanentlyFailed)
            return;
        if (restoreAttempts >= maxAttempts) {
            fail("restore-attempt-limit");
            return;
        }
        restoreAttempts += 1;
        canvas.dataset.webglRestoreAttempts = String(restoreAttempts);
        canvas.dataset.webglLifecycle = "restoring";
        let restored = false;
        if (!consumeArtificialRestoreFailure(label)) {
            try {
                restored = restore();
            }
            catch {
                restored = false;
            }
        }
        if (restored) {
            clearRetryTimer();
            clearRestoreEventTimer();
            delete canvas.dataset.webglFallback;
            canvas.dataset.webglLifecycle = "restored";
            onRestored(restoreAttempts);
            return;
        }
        if (restoreAttempts >= maxAttempts) {
            fail("restore-reinit-failed");
            return;
        }
        retryTimer = window.setTimeout(tryRestore, 140 * restoreAttempts);
    };

    const handleContextLost = (event: Event) => {
        event.preventDefault();
        clearRetryTimer();
        clearRestoreEventTimer();
        canvas.dataset.webglLifecycle = "lost";
        onLost(restoreAttempts);
        if (restoreAttempts >= maxAttempts) {
            fail("context-lost-after-attempt-limit");
            return;
        }
        restoreEventTimer = window.setTimeout(() => fail("restore-event-timeout"), 4500);
    };

    const handleContextRestored = () => {
        clearRetryTimer();
        clearRestoreEventTimer();
        tryRestore();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    canvas.dataset.webglLifecycle = "ready";

    return {
        dispose: () => {
            if (disposed) {
                releaseOnce();
                return;
            }
            disposed = true;
            clearRetryTimer();
            clearRestoreEventTimer();
            detachListeners();
            releaseOnce();
        },
        getAttempts: () => restoreAttempts,
    };
}

export function isLikelyWebKitRuntime() {
    const ua = navigator.userAgent;
    const vendor = navigator.vendor;
    const isIOSWebKit = /iP(ad|hone|od)/.test(ua);
    const isSafariWebKit = /AppleWebKit/i.test(ua) && !/(Chrome|Chromium|Edg|OPR|Firefox|SamsungBrowser)/i.test(ua);
    return isIOSWebKit || vendor === "Apple Computer, Inc." || isSafariWebKit;
}

export function isLikelyMobileRuntime() {
    return window.matchMedia("(pointer: coarse)").matches ||
        window.matchMedia("(max-width: 760px)").matches ||
        navigator.maxTouchPoints > 1;
}
