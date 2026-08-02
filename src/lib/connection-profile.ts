type ConnectionSignal = {
    effectiveType?: string;
    saveData?: boolean;
};

type NavigatorWithConnection = Navigator & {
    connection?: ConnectionSignal;
};

export const MEASURED_CONSTRAINED_MEGABITS_PER_SECOND = 1.5;

export const hasExplicitConstrainedConnectionSignal = (navigatorValue: NavigatorWithConnection) =>
    navigatorValue.connection?.saveData === true ||
    navigatorValue.connection?.effectiveType === "slow-2g" ||
    navigatorValue.connection?.effectiveType === "2g";

export const readResourceThroughputMegabitsPerSecond = (entry: PerformanceResourceTiming) => {
    if (entry.duration <= 0 || entry.transferSize <= 0)
        return null;
    return (entry.transferSize * 8) / entry.duration / 1000;
};

const isMediaResource = (entry: PerformanceResourceTiming) =>
    entry.name.includes("/media/") &&
    (entry.initiatorType === "video" || entry.initiatorType === "fetch" || entry.initiatorType === "other");

export const observeFirstMediaThroughput = (
    onMeasurement: (megabitsPerSecond: number, entry: PerformanceResourceTiming) => void,
) => {
    let settled = false;
    let observer: PerformanceObserver | null = null;

    const inspect = (entries: PerformanceEntry[]) => {
        if (settled)
            return;
        for (const candidate of entries) {
            if (candidate.entryType !== "resource")
                continue;
            const resource = candidate as PerformanceResourceTiming;
            if (!isMediaResource(resource))
                continue;
            const throughput = readResourceThroughputMegabitsPerSecond(resource);
            if (throughput === null)
                continue;
            settled = true;
            observer?.disconnect();
            onMeasurement(throughput, resource);
            return;
        }
    };

    if (typeof PerformanceObserver !== "undefined") {
        try {
            observer = new PerformanceObserver((list) => inspect(list.getEntries()));
            observer.observe({ type: "resource", buffered: true });
        }
        catch {
            observer = null;
        }
    }
    inspect(performance.getEntriesByType("resource"));

    return () => {
        settled = true;
        observer?.disconnect();
        observer = null;
    };
};
