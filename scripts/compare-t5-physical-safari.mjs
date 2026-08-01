import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const round = (value, digits = 4) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const readNumber = (value) => (Number.isFinite(value) ? value : null);

const improvement = (baseline, candidate) => {
  if (baseline == null || candidate == null) return { factor: null, pass: false, reason: "missing" };
  if (baseline === 0) {
    return candidate === 0
      ? { factor: null, pass: true, reason: "both-zero" }
      : { factor: 0, pass: false, reason: "baseline-zero-candidate-nonzero" };
  }
  if (candidate === 0) return { factor: null, pass: true, reason: "candidate-zero" };
  const factor = baseline / candidate;
  return { factor: round(factor), pass: factor >= 2, reason: factor >= 2 ? "at-least-2x" : "below-2x" };
};

const manualGate = (report) => {
  const values = Object.values(report.manual || {});
  return {
    available: values.length > 0,
    pass: values.length > 0 && values.every(Boolean),
    checks: report.manual || {},
  };
};

const evidenceGate = (report) => {
  const files = report.evidenceFiles || {};
  const missing = ["timeline", "har", "screenRecording"].filter((key) => !files[key]);
  return { pass: missing.length === 0, missing, files };
};

const videoGate = (report) => {
  const videos = report.metrics?.videos || [];
  const mediaErrors = (report.journey?.mediaEvents || []).filter((event) => event.event === "error" || event.errorCode != null);
  const unresolvedStalls = videos.flatMap((video) => (video.stallWindows || [])
    .filter((stall) => stall.resolvedAt == null || stall.durationMs == null)
    .map((stall) => ({ video: video.key, ...stall })));
  const progressing = videos.filter((video) => {
    const first = readNumber(video.firstMediaTime) ?? readNumber(video.firstCurrentTime);
    const last = readNumber(video.lastMediaTime) ?? readNumber(video.lastCurrentTime);
    return first != null && last != null && last > first + 0.01;
  });
  return {
    pass: videos.length > 0 && mediaErrors.length === 0 && unresolvedStalls.length === 0,
    videosObserved: videos.length,
    videosProgressed: progressing.length,
    mediaErrors,
    unresolvedStalls,
  };
};

const longTaskGate = (report) => {
  const metric = report.metrics?.longTasks;
  if (metric?.status === "supported") {
    const total = readNumber(metric.durationSumMs);
    return {
      status: "measured",
      valueMs: total,
      pass: total != null && total <= 250,
      evidenceRequired: false,
    };
  }
  const eventLoop = report.metrics?.eventLoop || {};
  return {
    status: "unsupported-use-timeline",
    valueMs: null,
    pass: false,
    evidenceRequired: true,
    eventLoopP95LagMs: readNumber(eventLoop.p95LagMs),
    eventLoopMaxLagMs: readNumber(eventLoop.maxLagMs),
  };
};

const compatibilityGate = (baseline, candidate) => {
  const differences = [];
  if (baseline.run?.device !== candidate.run?.device) differences.push("device");
  const baselineViewport = baseline.environment?.viewport || {};
  const candidateViewport = candidate.environment?.viewport || {};
  if (Math.abs((baselineViewport.width || 0) - (candidateViewport.width || 0)) > 4) differences.push("viewport-width");
  if (Math.abs((baselineViewport.height || 0) - (candidateViewport.height || 0)) > 4) differences.push("viewport-height");
  if (Math.abs((baselineViewport.devicePixelRatio || 0) - (candidateViewport.devicePixelRatio || 0)) > 0.05) differences.push("device-pixel-ratio");
  if ((baseline.environment?.userAgent || "") !== (candidate.environment?.userAgent || "")) differences.push("user-agent");
  return { pass: differences.length === 0, differences };
};

const validateReport = (report, name) => {
  if (!report || typeof report !== "object") throw new Error(`${name} is not an object`);
  if (report.schemaVersion !== 1) throw new Error(`${name} has unsupported schemaVersion`);
  if (!report.metrics?.raf) throw new Error(`${name} is missing metrics.raf`);
  if (!report.run?.device) throw new Error(`${name} is missing run.device`);
};

export const compareReports = (baseline, candidate) => {
  validateReport(baseline, "baseline");
  validateReport(candidate, "candidate");
  const compatibility = compatibilityGate(baseline, candidate);
  const rawFrame = improvement(
    readNumber(baseline.metrics.raf.over16_7Ratio),
    readNumber(candidate.metrics.raf.over16_7Ratio),
  );
  const adaptiveFrame = improvement(
    readNumber(baseline.metrics.raf.adaptiveSlowRatio),
    readNumber(candidate.metrics.raf.adaptiveSlowRatio),
  );
  const longTasks = longTaskGate(candidate);
  const manual = manualGate(candidate);
  const evidence = evidenceGate(candidate);
  const videos = videoGate(candidate);
  const runtimeErrors = candidate.runtimeErrors || [];
  const automaticPass = compatibility.pass
    && rawFrame.pass
    && longTasks.pass
    && videos.pass
    && runtimeErrors.length === 0;
  const physicalPass = automaticPass && manual.pass && evidence.pass;
  const needsTimelineReview = longTasks.status !== "measured";
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baseline: {
      label: baseline.run.label,
      device: baseline.run.device,
      url: baseline.run.url,
      startedAt: baseline.run.startedAt,
    },
    candidate: {
      label: candidate.run.label,
      device: candidate.run.device,
      url: candidate.run.url,
      startedAt: candidate.run.startedAt,
    },
    gates: {
      compatibility,
      rawFrameBudget2x: rawFrame,
      adaptiveFrameBudget2x: adaptiveFrame,
      longTasks250ms: longTasks,
      manual,
      evidence,
      videos,
      runtimeErrors: { pass: runtimeErrors.length === 0, entries: runtimeErrors },
    },
    verdict: {
      automaticPass,
      physicalPass,
      needsTimelineReview,
      status: physicalPass
        ? "pass"
        : needsTimelineReview
          ? "needs-web-inspector-review"
          : "fail",
    },
  };
};

const runCli = () => {
  const [, , baselinePath, candidatePath, outputPath] = process.argv;
  if (!baselinePath || !candidatePath) {
    process.stderr.write("Usage: node scripts/compare-t5-physical-safari.mjs <baseline.json> <candidate.json> [output.json]\n");
    process.exitCode = 1;
    return;
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));
  const comparison = compareReports(baseline, candidate);
  const serialized = `${JSON.stringify(comparison, null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, serialized, "utf8");
  process.stdout.write(serialized);
  if (!comparison.verdict.physicalPass) process.exitCode = 2;
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) runCli();
