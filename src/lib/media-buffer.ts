export function isMediaBufferedThrough(video: HTMLVideoElement, targetTime: number, startTime = 0) {
    try {
        let sawBufferedRange = false;
        for (let index = 0; index < video.buffered.length; index += 1) {
            sawBufferedRange = true;
            if (video.buffered.start(index) <= startTime + 0.05 &&
                video.buffered.end(index) >= targetTime) {
                return true;
            }
        }
        return (!sawBufferedRange &&
            video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
            video.networkState === HTMLMediaElement.NETWORK_IDLE &&
            Number.isFinite(video.duration) &&
            video.duration >= targetTime);
    }
    catch {
        return false;
    }
}
