import type Lenis from "lenis";
import {
    registerMotionInputStory,
    type MotionInputGesture,
    type MotionInputRegistration,
    type MotionInputReleaseReason,
} from "@/lib/motion-input-bus";

export type MotionStoryDirection = -1 | 1;
export type MotionStoryState = "idle" | "entering" | "waiting" | "transitioning" | "releasing";

export type MotionStoryEntry = {
    direction: MotionStoryDirection;
    lockY?: number;
    stage: number;
};

export type MotionStoryContext = MotionStoryEntry & {
    gesture?: MotionInputGesture;
    state: MotionStoryState;
};

export type MotionStoryTransitionResult = {
    /** The settled stage after the transition. */
    stage?: number;
    /** Keep the controller in `transitioning` until the story calls `settle`. */
    pending?: boolean;
    /** Release the fixed scene after the transition. */
    release?: boolean;
    /** Native document position to apply while releasing. */
    releaseTo?: number | (() => number);
};

export type MotionStoryDefinition = {
    canEnter?: (gesture: MotionInputGesture) => MotionStoryEntry | false;
    getLockY?: () => number | null;
    id: string;
    isReady?: (direction: MotionStoryDirection) => boolean | Promise<boolean>;
    onEnter?: (
        context: MotionStoryContext,
    ) => void | MotionStoryTransitionResult | Promise<void | MotionStoryTransitionResult>;
    onIntent: (
        context: MotionStoryContext,
    ) => void | MotionStoryTransitionResult | Promise<void | MotionStoryTransitionResult>;
    onRelease?: (
        context: MotionStoryContext,
        reason: MotionInputReleaseReason,
    ) => void | Promise<void>;
    priority: number;
    stageCount: number;
};

export type MotionStoryRegistration = {
    beginRelease: () => void;
    beginTransition: (stage?: number) => void;
    enter: (entry: MotionStoryEntry) => Promise<boolean>;
    isActive: () => boolean;
    markProgress: (progress?: number | string) => void;
    release: (
        reason?: MotionInputReleaseReason,
        releaseTo?: number | (() => number),
    ) => Promise<void>;
    settle: (stage?: number) => void;
    unregister: () => void;
    updateLock: (lockY?: number) => void;
};

type ActiveStory = {
    definition: MotionStoryDefinition;
    direction: MotionStoryDirection;
    lockY: number;
    stage: number;
    token: number;
};

const WHEEL_GESTURE_GAP_MS = 190;
const WHEEL_THRESHOLD = 18;
const TOUCH_THRESHOLD = 22;
const TRANSITION_WATCHDOG_MS = 45000;
const GESTURE_RELEASE_FAILSAFE_MS = 30000;

const clampStage = (definition: MotionStoryDefinition, stage: number) =>
    Math.max(0, Math.min(definition.stageCount - 1, Math.round(stage)));

const isEditableTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));

/**
 * The only stage/gesture owner for pinned motion stories.
 *
 * Lenis remains the single document-scroll owner. This controller merely stops it
 * while one authored scene is fixed, converts a complete wheel/touch gesture into
 * one discrete intent, and resumes Lenis at a deliberate release boundary.
 */
export class MotionStoryController {
    private active: ActiveStory | null = null;
    private busRegistration: MotionInputRegistration | null = null;
    private disposed = false;
    private heartbeatTimer = 0;
    private heartbeatToken = 0;
    private state: MotionStoryState = "idle";
    private stories = new Map<string, MotionStoryDefinition>();
    private touchConsumed = false;
    private touchActive = false;
    private touchTotal = 0;
    private transitionToken = 0;
    private transitionWatchdogTimer = 0;
    private gestureReleaseFailsafeTimer = 0;
    private gestureReleaseResolve: (() => void) | null = null;
    private releasePromise: Promise<void> | null = null;
    private wheelConsumed = false;
    private wheelQuietTimer = 0;
    private wheelTotal = 0;

    constructor(
        private readonly root: HTMLElement,
        private readonly getLenis: () => Lenis | null,
    ) {
        root.dataset.motionStoryController = "ready";
    }

    get activeStoryId() {
        return this.active?.definition.id ?? null;
    }

    get currentState() {
        return this.state;
    }

    get isDisposed() {
        return this.disposed;
    }

    register(definition: MotionStoryDefinition): MotionStoryRegistration {
        if (this.disposed)
            throw new Error("motion story controller is disposed");
        if (definition.stageCount < 1)
            throw new Error(`motion story must have at least one stage: ${definition.id}`);
        if (this.stories.has(definition.id))
            throw new Error(`motion story already registered: ${definition.id}`);
        this.stories.set(definition.id, definition);
        this.ensureBusRegistration();

        let registered = true;
        return {
            beginRelease: () => {
                if (registered && this.active?.definition.id === definition.id)
                    this.setState("releasing");
            },
            beginTransition: (stage) => {
                if (!registered || this.active?.definition.id !== definition.id)
                    return;
                if (typeof stage === "number")
                    this.active.stage = clampStage(definition, stage);
                this.setState("transitioning");
            },
            enter: (entry) => registered
                ? this.enter(definition.id, entry)
                : Promise.resolve(false),
            isActive: () => registered && this.active?.definition.id === definition.id,
            markProgress: (progress) => {
                if (registered && this.active?.definition.id === definition.id)
                    this.busRegistration?.markProgress(progress);
            },
            release: (reason = "completed", releaseTo) => registered
                ? this.release(definition.id, reason, releaseTo)
                : Promise.resolve(),
            settle: (stage) => {
                if (registered)
                    this.settle(definition.id, stage);
            },
            unregister: () => {
                if (!registered)
                    return;
                registered = false;
                if (this.active?.definition.id === definition.id)
                    void this.release(definition.id, "unregistered");
                this.stories.delete(definition.id);
                if (this.stories.size === 0)
                    this.dispose();
            },
            updateLock: (lockY) => {
                if (!registered || this.active?.definition.id !== definition.id)
                    return;
                this.active.lockY = this.resolveLockY(definition, lockY);
                if (this.state !== "releasing")
                    this.holdPosition();
            },
        };
    }

    async enter(id: string, entry: MotionStoryEntry, gesture?: MotionInputGesture) {
        const definition = this.stories.get(id);
        if (!definition || this.disposed)
            return false;
        if (this.active?.definition.id === id) {
            this.active.direction = entry.direction;
            this.active.stage = clampStage(definition, entry.stage);
            this.active.lockY = this.resolveLockY(definition, entry.lockY);
            this.holdPosition();
            return true;
        }
        if (this.active)
            await this.release(this.active.definition.id, "superseded");

        const token = ++this.transitionToken;
        this.active = {
            definition,
            direction: entry.direction,
            lockY: this.resolveLockY(definition, entry.lockY),
            stage: clampStage(definition, entry.stage),
            token,
        };
        this.busRegistration?.claim(`${id}:entering:${this.active.stage + 1}`);
        this.setState("entering");
        this.consumeEntryGesture(gesture);
        this.holdPosition();

        try {
            const ready = await definition.isReady?.(entry.direction);
            if (ready === false) {
                await this.release(id, "out-of-range");
                return false;
            }
            const result = await definition.onEnter?.(this.context(gesture));
            if (!this.isCurrent(id, token))
                return false;
            await this.applyResult(id, result);
            if (this.isCurrent(id, token) && this.state === "entering" && !result?.pending)
                this.setState("waiting");
            return true;
        }
        catch (error) {
            this.root.dataset.motionStoryError = id;
            console.warn(`[motion-story-controller] ${id} entry failed`, error);
            await this.release(id, "watchdog");
            return false;
        }
    }

    settle(id: string, stage?: number) {
        if (this.active?.definition.id !== id || this.state === "releasing")
            return;
        if (typeof stage === "number")
            this.active.stage = clampStage(this.active.definition, stage);
        this.setState("waiting");
    }

    async release(
        id: string,
        reason: MotionInputReleaseReason = "completed",
        releaseTo?: number | (() => number),
    ) {
        if (this.releasePromise)
            return this.releasePromise;
        this.releasePromise = this.performRelease(id, reason, releaseTo).finally(() => {
            this.releasePromise = null;
        });
        return this.releasePromise;
    }

    releaseActive(reason: MotionInputReleaseReason = "superseded") {
        const id = this.active?.definition.id;
        return id ? this.release(id, reason) : Promise.resolve();
    }

    private async performRelease(
        id: string,
        reason: MotionInputReleaseReason,
        releaseTo?: number | (() => number),
    ) {
        const active = this.active;
        if (!active || active.definition.id !== id)
            return;
        const token = ++this.transitionToken;
        this.setState("releasing");
        try {
            await active.definition.onRelease?.(this.context(), reason);
        }
        catch (error) {
            this.root.dataset.motionStoryError = id;
            console.warn(`[motion-story-controller] ${id} release failed`, error);
        }
        if (this.shouldDeferGestureRelease())
            await this.waitForGestureRelease();
        if (this.disposed || this.active !== active || this.transitionToken !== token)
            return;
        const resolvedRelease = typeof releaseTo === "function" ? releaseTo() : releaseTo;
        this.active = null;
        this.state = "idle";
        this.writeState();
        this.busRegistration?.release(reason);
        if (typeof resolvedRelease === "number" && Number.isFinite(resolvedRelease))
            this.applyScrollPosition(resolvedRelease);
        this.getLenis()?.start();
    }

    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        window.clearTimeout(this.wheelQuietTimer);
        window.clearInterval(this.heartbeatTimer);
        window.clearTimeout(this.transitionWatchdogTimer);
        window.clearTimeout(this.gestureReleaseFailsafeTimer);
        this.wheelQuietTimer = 0;
        this.heartbeatTimer = 0;
        this.transitionWatchdogTimer = 0;
        this.gestureReleaseFailsafeTimer = 0;
        this.transitionToken += 1;
        this.finishGestureReleaseWait();
        this.releasePromise = null;
        this.active = null;
        this.stories.clear();
        this.busRegistration?.unregister();
        this.busRegistration = null;
        this.getLenis()?.start();
        delete this.root.dataset.motionStoryController;
        delete this.root.dataset.motionStoryDirection;
        delete this.root.dataset.motionStoryOwner;
        delete this.root.dataset.motionStoryStage;
        delete this.root.dataset.motionStoryState;
    }

    private ensureBusRegistration() {
        if (this.busRegistration)
            return;
        this.busRegistration = registerMotionInputStory({
            id: "story-controller",
            priority: 1000,
            root: this.root,
            canClaim: (gesture) => {
                if (this.disposed)
                    return false;
                if (this.active)
                    return true;
                return gesture.kind !== "scroll" && Boolean(this.findEntry(gesture));
            },
            onGesture: (gesture) => this.handleGesture(gesture),
            release: (reason) => {
                const id = this.active?.definition.id;
                if (id)
                    void this.release(id, reason);
            },
        });
    }

    private findEntry(gesture: MotionInputGesture) {
        return [...this.stories.values()]
            .sort((left, right) => right.priority - left.priority)
            .map((definition) => ({ definition, entry: definition.canEnter?.(gesture) ?? false }))
            .find((candidate) => candidate.entry !== false);
    }

    private handleGesture(gesture: MotionInputGesture) {
        if (gesture.kind === "scroll") {
            if (this.active && this.state !== "releasing")
                this.holdPosition();
            return { handled: false, progress: this.progressToken() };
        }

        if (!this.active) {
            const candidate = this.findEntry(gesture);
            if (!candidate || candidate.entry === false)
                return false;
            this.consumeEntryGesture(gesture);
            void this.enter(candidate.definition.id, candidate.entry, gesture);
            return { handled: true, progress: `${candidate.definition.id}:entering` };
        }

        if (gesture.kind === "touchstart")
            this.touchActive = true;
        else if (gesture.kind === "touchend" || gesture.kind === "touchcancel") {
            this.touchActive = false;
            this.finishGestureReleaseWait();
        }
        const handled = this.shouldOwnEvent(gesture);
        if (!handled)
            return { handled: false, progress: this.progressToken() };
        if (this.state === "releasing") {
            if (gesture.kind === "wheel")
                this.armWheelQuietWindow();
            this.rearmGestureReleaseFailsafe();
            return {
                handled: gesture.kind === "wheel" || gesture.kind === "touchmove" || gesture.kind === "keydown",
                progress: this.progressToken(),
            };
        }

        const direction = this.readDiscreteIntent(gesture);
        if (direction !== 0 && this.state === "waiting")
            void this.transition(direction, gesture);
        const shouldPreventDefault = gesture.kind === "wheel" ||
            gesture.kind === "touchmove" ||
            gesture.kind === "keydown";
        return { handled: shouldPreventDefault, progress: this.progressToken() };
    }

    private shouldOwnEvent(gesture: MotionInputGesture) {
        if (isEditableTarget(gesture.event.target) && gesture.kind !== "wheel")
            return false;
        return gesture.kind === "wheel" ||
            gesture.kind === "touchstart" ||
            gesture.kind === "touchmove" ||
            gesture.kind === "touchend" ||
            gesture.kind === "touchcancel" ||
            gesture.kind === "keydown";
    }

    private readDiscreteIntent(gesture: MotionInputGesture): -1 | 0 | 1 {
        if (gesture.kind === "wheel") {
            this.armWheelQuietWindow();
            if (this.wheelConsumed || gesture.direction === 0)
                return 0;
            this.wheelTotal = this.accumulate(this.wheelTotal, gesture.deltaY);
            if (Math.abs(this.wheelTotal) < WHEEL_THRESHOLD)
                return 0;
            this.wheelConsumed = true;
            this.wheelTotal = 0;
            return gesture.direction;
        }
        if (gesture.kind === "touchstart") {
            this.touchActive = true;
            this.touchConsumed = false;
            this.touchTotal = 0;
            return 0;
        }
        if (gesture.kind === "touchmove") {
            if (this.touchConsumed || gesture.direction === 0)
                return 0;
            this.touchTotal = this.accumulate(this.touchTotal, gesture.deltaY);
            if (Math.abs(this.touchTotal) < TOUCH_THRESHOLD)
                return 0;
            this.touchConsumed = true;
            this.touchTotal = 0;
            return gesture.direction;
        }
        if (gesture.kind === "touchend" || gesture.kind === "touchcancel") {
            this.touchActive = false;
            this.touchConsumed = false;
            this.touchTotal = 0;
            return 0;
        }
        if (gesture.kind === "keydown") {
            const event = gesture.event as KeyboardEvent;
            return event.repeat ? 0 : gesture.direction;
        }
        return 0;
    }

    private consumeEntryGesture(gesture?: MotionInputGesture) {
        if (!gesture) {
            this.wheelConsumed = true;
            this.armWheelQuietWindow();
            return;
        }
        if (gesture.kind === "wheel") {
            this.wheelConsumed = true;
            this.wheelTotal = 0;
            this.armWheelQuietWindow();
        }
        if (gesture.kind === "touchmove") {
            this.touchActive = true;
            this.touchConsumed = true;
        }
    }

    private async transition(direction: MotionStoryDirection, gesture: MotionInputGesture) {
        const active = this.active;
        if (!active || this.state !== "waiting")
            return;
        const id = active.definition.id;
        const token = ++this.transitionToken;
        active.direction = direction;
        this.setState("transitioning");
        try {
            const result = await active.definition.onIntent(this.context(gesture));
            if (!this.isCurrent(id, active.token) || token !== this.transitionToken)
                return;
            await this.applyResult(id, result);
            if (this.active?.definition.id === id && !result?.pending)
                this.setState("waiting");
        }
        catch (error) {
            this.root.dataset.motionStoryError = id;
            console.warn(`[motion-story-controller] ${id} transition failed`, error);
            await this.release(id, "watchdog");
        }
    }

    private async applyResult(id: string, result?: void | MotionStoryTransitionResult) {
        if (!result || this.active?.definition.id !== id)
            return;
        if (typeof result.stage === "number")
            this.active.stage = clampStage(this.active.definition, result.stage);
        if (result.release)
            await this.release(id, "completed", result.releaseTo);
        else
            this.writeState();
    }

    private context(gesture?: MotionInputGesture): MotionStoryContext {
        const active = this.active;
        if (!active)
            throw new Error("motion story context requested without an active story");
        return {
            direction: active.direction,
            gesture,
            lockY: active.lockY,
            stage: active.stage,
            state: this.state,
        };
    }

    private resolveLockY(definition: MotionStoryDefinition, supplied?: number) {
        const value = supplied ?? definition.getLockY?.() ?? window.scrollY;
        return Math.max(0, Math.round(Number.isFinite(value) ? value : window.scrollY));
    }

    private holdPosition() {
        const active = this.active;
        if (!active || this.state === "releasing")
            return;
        const lenis = this.getLenis();
        lenis?.stop();
        if (Math.abs(window.scrollY - active.lockY) <= 1)
            return;
        this.applyScrollPosition(active.lockY, false);
    }

    private applyScrollPosition(target: number, resume = false) {
        const safeTarget = Math.max(0, Math.round(target));
        const lenis = this.getLenis();
        lenis?.scrollTo(safeTarget, { immediate: true, force: true });
        if (Math.abs(window.scrollY - safeTarget) > 1)
            window.scrollTo({ top: safeTarget, left: 0, behavior: "auto" });
        if (resume)
            lenis?.start();
    }

    private setState(state: MotionStoryState) {
        this.state = state;
        this.writeState();
        this.busRegistration?.markProgress(this.progressToken());
        window.clearInterval(this.heartbeatTimer);
        window.clearTimeout(this.transitionWatchdogTimer);
        this.heartbeatTimer = 0;
        this.transitionWatchdogTimer = 0;
        if (state !== "idle" && state !== "releasing") {
            this.heartbeatTimer = window.setInterval(() => {
                this.heartbeatToken += 1;
                this.busRegistration?.markProgress(`${this.progressToken()}:heartbeat-${this.heartbeatToken}`);
            }, 1200);
        }
        if (state === "entering" || state === "transitioning") {
            const id = this.active?.definition.id;
            this.transitionWatchdogTimer = window.setTimeout(() => {
                this.transitionWatchdogTimer = 0;
                if (id && this.active?.definition.id === id &&
                    (this.state === "entering" || this.state === "transitioning")) {
                    this.root.dataset.motionStoryError = `${id}:transition-timeout`;
                    void this.release(id, "watchdog");
                }
            }, TRANSITION_WATCHDOG_MS);
        }
        if (state !== "releasing" && state !== "idle")
            this.holdPosition();
    }

    private writeState() {
        const active = this.active;
        if (!active) {
            delete this.root.dataset.motionStoryDirection;
            delete this.root.dataset.motionStoryOwner;
            delete this.root.dataset.motionStoryStage;
            this.root.dataset.motionStoryState = "idle";
            return;
        }
        this.root.dataset.motionInputOwner = active.definition.id;
        this.root.dataset.motionStoryDirection = String(active.direction);
        this.root.dataset.motionStoryOwner = active.definition.id;
        this.root.dataset.motionStoryStage = String(active.stage + 1);
        this.root.dataset.motionStoryState = this.state;
    }

    private progressToken() {
        const active = this.active;
        return active
            ? `${active.definition.id}:${this.state}:${active.stage + 1}`
            : "idle";
    }

    private isCurrent(id: string, token: number) {
        return this.active?.definition.id === id && this.active.token === token && !this.disposed;
    }

    private accumulate(total: number, delta: number) {
        return total === 0 || Math.sign(total) === Math.sign(delta) ? total + delta : delta;
    }

    private armWheelQuietWindow() {
        window.clearTimeout(this.wheelQuietTimer);
        this.wheelQuietTimer = window.setTimeout(() => {
            this.wheelQuietTimer = 0;
            this.wheelConsumed = false;
            this.wheelTotal = 0;
            this.finishGestureReleaseWait();
        }, WHEEL_GESTURE_GAP_MS);
    }

    private shouldDeferGestureRelease() {
        return this.touchActive || this.wheelQuietTimer !== 0;
    }

    private waitForGestureRelease() {
        if (!this.shouldDeferGestureRelease())
            return Promise.resolve();
        return new Promise<void>((resolve) => {
            this.gestureReleaseResolve = resolve;
            this.rearmGestureReleaseFailsafe();
        });
    }

    private rearmGestureReleaseFailsafe() {
        if (!this.gestureReleaseResolve)
            return;
        window.clearTimeout(this.gestureReleaseFailsafeTimer);
        this.gestureReleaseFailsafeTimer = window.setTimeout(
            () => this.finishGestureReleaseWait(true),
            GESTURE_RELEASE_FAILSAFE_MS,
        );
    }

    private finishGestureReleaseWait(force = false) {
        if (!force && this.shouldDeferGestureRelease())
            return;
        window.clearTimeout(this.gestureReleaseFailsafeTimer);
        this.gestureReleaseFailsafeTimer = 0;
        const resolve = this.gestureReleaseResolve;
        this.gestureReleaseResolve = null;
        resolve?.();
    }
}

const controllers = new WeakMap<HTMLElement, MotionStoryController>();

export const getMotionStoryController = (
    root: HTMLElement,
    getLenis: () => Lenis | null,
) => {
    const existing = controllers.get(root);
    if (existing && !existing.isDisposed)
        return existing;
    const controller = new MotionStoryController(root, getLenis);
    controllers.set(root, controller);
    return controller;
};
