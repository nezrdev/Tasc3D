export type MediaPreparationPriority = "hero" | "active-story" | "next-story";

type MediaPreparationJob = {
    id: string;
    priority: MediaPreparationPriority;
    prepare: () => Promise<void> | void;
};

type QueuedMediaPreparationJob = MediaPreparationJob & {
    order: number;
    reject: (reason?: unknown) => void;
    resolve: () => void;
};

const PRIORITY_WEIGHT: Record<MediaPreparationPriority, number> = {
    hero: 300,
    "active-story": 200,
    "next-story": 100,
};

const decoderLabel = (video: HTMLVideoElement) =>
    video.dataset.dominoDirection
        ? `domino-${video.dataset.dominoDirection}`
        : video.classList.contains("services-story-video") || video.classList.contains("packed-alpha-video-source")
            ? video.closest(".services-story-section") ? "services" : "hero"
            : video.classList.contains("datum-motion-video")
                ? "datum"
                : video.classList.contains("lens-video")
                    ? "hero"
                    : "video";

/**
 * Serialises media preparation and keeps the number of playing video decoders
 * bounded. HTTP downloads may remain cached; only active playback consumes a
 * decoder slot.
 */
export class MediaPriorityQueue {
    private activeVideos: HTMLVideoElement[] = [];
    private disposed = false;
    private jobs: QueuedMediaPreparationJob[] = [];
    private nextOrder = 0;
    private preparationRunning = false;
    private suspendedVideos: HTMLVideoElement[] = [];

    constructor(
        private readonly root: HTMLElement,
        readonly maxActiveDecoders: number,
    ) {
        this.maxActiveDecoders = Math.max(1, Math.round(maxActiveDecoders));
        root.dataset.mediaQueue = "ready";
        root.dataset.maxActiveDecoders = String(this.maxActiveDecoders);
        root.addEventListener("play", this.handlePlay, true);
        root.addEventListener("pause", this.handlePause, true);
        root.addEventListener("ended", this.handlePause, true);
        const playingVideos = Array.from(root.querySelectorAll<HTMLVideoElement>("video"))
            .filter((video) => !video.paused && !video.ended);
        this.activeVideos = playingVideos.slice(-this.maxActiveDecoders);
        playingVideos.slice(0, -this.maxActiveDecoders).forEach((video) => video.pause());
        this.writeDecoderState();
    }

    enqueue(job: MediaPreparationJob) {
        if (this.disposed)
            return Promise.reject(new Error("media priority queue is disposed"));
        return new Promise<void>((resolve, reject) => {
            this.jobs.push({
                ...job,
                order: this.nextOrder++,
                reject,
                resolve,
            });
            this.jobs.sort((left, right) =>
                PRIORITY_WEIGHT[right.priority] - PRIORITY_WEIGHT[left.priority] || left.order - right.order);
            void this.drain();
        });
    }

    pauseAll(except?: HTMLVideoElement) {
        this.root.querySelectorAll<HTMLVideoElement>("video").forEach((video) => {
            if (video !== except && !video.paused)
                video.pause();
        });
        this.activeVideos = except && !except.paused ? [except] : [];
        this.writeDecoderState();
    }

    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        const pendingJobs = this.jobs.splice(0);
        pendingJobs.forEach((job) => job.reject(new Error("media priority queue disposed")));
        this.activeVideos.length = 0;
        this.suspendedVideos.length = 0;
        this.root.removeEventListener("play", this.handlePlay, true);
        this.root.removeEventListener("pause", this.handlePause, true);
        this.root.removeEventListener("ended", this.handlePause, true);
        delete this.root.dataset.activeDecoderCount;
        delete this.root.dataset.activeVideoDecoders;
        delete this.root.dataset.backgroundMotionPaused;
        delete this.root.dataset.maxActiveDecoders;
        delete this.root.dataset.mediaQueue;
        delete this.root.dataset.mediaQueueActiveJob;
    }

    private readonly handlePlay = (event: Event) => {
        const video = event.target;
        if (!(video instanceof HTMLVideoElement) || this.disposed)
            return;
        this.activeVideos = this.activeVideos.filter((candidate) => candidate !== video && !candidate.paused);
        this.activeVideos.push(video);
        while (this.activeVideos.length > this.maxActiveDecoders) {
            const displaced = this.activeVideos.shift();
            if (displaced && displaced !== video && !displaced.paused) {
                this.suspendedVideos = this.suspendedVideos.filter((candidate) => candidate !== displaced);
                this.suspendedVideos.push(displaced);
                displaced.pause();
            }
        }
        this.writeDecoderState();
    };

    private readonly handlePause = (event: Event) => {
        const video = event.target;
        if (!(video instanceof HTMLVideoElement) || this.disposed)
            return;
        queueMicrotask(() => {
            this.activeVideos = this.activeVideos.filter((candidate) => !candidate.paused && !candidate.ended);
            this.writeDecoderState();
            this.resumeVisibleLoop();
        });
    };

    private async drain() {
        if (this.preparationRunning || this.disposed)
            return;
        this.preparationRunning = true;
        while (!this.disposed && this.jobs.length) {
            const job = this.jobs.shift();
            if (!job)
                break;
            this.root.dataset.mediaQueueActiveJob = `${job.priority}:${job.id}`;
            try {
                await job.prepare();
                job.resolve();
            }
            catch (error) {
                job.reject(error);
            }
        }
        this.preparationRunning = false;
        if (!this.disposed)
            this.root.dataset.mediaQueueActiveJob = "idle";
    }

    private writeDecoderState() {
        const active = this.activeVideos.filter((video) => !video.paused && !video.ended);
        this.activeVideos = active;
        this.root.dataset.activeDecoderCount = String(active.length);
        this.root.dataset.activeVideoDecoders = active.length
            ? active.map(decoderLabel).join(",")
            : "none";
        this.root.dataset.backgroundMotionPaused = active.length ? "true" : "false";
    }

    private resumeVisibleLoop() {
        if (this.disposed || this.activeVideos.length >= this.maxActiveDecoders)
            return;
        const candidate = this.suspendedVideos.pop();
        if (!candidate || !candidate.isConnected || !candidate.loop || candidate.ended)
            return;
        const rect = candidate.getBoundingClientRect();
        const viewportHeight = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
        if (rect.bottom <= 0 || rect.top >= viewportHeight)
            return;
        void candidate.play().catch(() => undefined);
    }
}
