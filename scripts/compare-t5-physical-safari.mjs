import { closeSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const manualKeys = ["datum", "domino", "scrollSmooth", "services", "visualParity"];
const requiredSections = ["hero", "clients", "services", "how-we-work", "datum", "process", "domino", "footer"];

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

const compareCeiling = (baseline, candidate, ceiling = null) => {
  const baselineValue = readNumber(baseline);
  const candidateValue = readNumber(candidate);
  if (baselineValue == null || candidateValue == null) {
    return { baseline: baselineValue, candidate: candidateValue, ceiling, pass: false, reason: "missing" };
  }
  const baselinePass = candidateValue <= baselineValue;
  const ceilingPass = ceiling == null || candidateValue <= ceiling;
  return {
    baseline: baselineValue,
    candidate: candidateValue,
    ceiling,
    pass: baselinePass && ceilingPass,
    reason: !baselinePass ? "candidate-worse-than-baseline" : ceilingPass ? "within-limits" : "ceiling-exceeded",
  };
};

const frameDistributionGate = (baseline, candidate) => {
  const p95 = compareCeiling(baseline.metrics.raf.p95Ms, candidate.metrics.raf.p95Ms);
  const p99 = compareCeiling(baseline.metrics.raf.p99Ms, candidate.metrics.raf.p99Ms);
  const maximum = compareCeiling(baseline.metrics.raf.maxMs, candidate.metrics.raf.maxMs, 1000);
  return { pass: p95.pass && p99.pass && maximum.pass, p95, p99, maximum };
};

const manualGate = (report) => {
  const checks = report.manual && typeof report.manual === "object" ? report.manual : {};
  const keys = Object.keys(checks).sort();
  const missing = manualKeys.filter((key) => !keys.includes(key));
  const unexpected = keys.filter((key) => !manualKeys.includes(key));
  const failed = manualKeys.filter((key) => checks[key] !== true);
  return {
    pass: missing.length === 0 && unexpected.length === 0 && failed.length === 0,
    missing,
    unexpected,
    failed,
    checks,
  };
};

const hashFile = (path) => {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = openSync(path, "r");
  try {
    let bytesRead = 0;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
};

const evidenceGate = (report, evidenceRoot) => {
  const references = report.evidenceFiles && typeof report.evidenceFiles === "object" ? report.evidenceFiles : {};
  const required = ["timeline", "har", "screenRecording"];
  const missing = required.filter((key) => typeof references[key] !== "string" || references[key].trim() === "");
  if (missing.length > 0) {
    return { pass: false, status: "missing-references", missing, files: references, verified: [] };
  }
  if (!evidenceRoot) {
    return { pass: false, status: "references-only-unverified", missing: [], files: references, verified: [] };
  }
  const root = resolve(evidenceRoot);
  const verified = [];
  const invalid = [];
  required.forEach((key) => {
    const requested = references[key].trim();
    const path = resolve(root, requested);
    const pathFromRoot = relative(root, path);
    if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
      invalid.push({ key, requested, reason: "outside-evidence-root" });
      return;
    }
    try {
      const stat = statSync(path);
      if (!stat.isFile() || stat.size <= 0) {
        invalid.push({ key, requested, reason: stat.isFile() ? "empty-file" : "not-a-file" });
        return;
      }
      verified.push({ key, requested, path, size: stat.size, sha256: hashFile(path) });
    } catch (error) {
      invalid.push({ key, requested, reason: error instanceof Error ? error.code || error.message : "unreadable" });
    }
  });
  return {
    pass: invalid.length === 0 && verified.length === required.length,
    status: invalid.length === 0 && verified.length === required.length ? "verified" : "invalid-files",
    missing: [],
    invalid,
    files: references,
    verified,
    evidenceRoot: root,
  };
};

const computedStyleGate = (report) => {
  const selectors = [".process-contact-section", ".site-footer"];
  const checks = Object.fromEntries(selectors.map((selector) => {
    const style = report.computedStyles?.[selector];
    const contentVisibility = style?.contentVisibility ?? null;
    const containIntrinsicSize = style?.containIntrinsicSize ?? null;
    const pass = contentVisibility === "visible"
      && typeof containIntrinsicSize === "string"
      && containIntrinsicSize.trim() === "none";
    return [selector, { pass, contentVisibility, containIntrinsicSize }];
  }));
  return { pass: Object.values(checks).every((check) => check.pass), checks };
};

const orderedVisits = (visits, required) => {
  let cursor = -1;
  for (const section of required) {
    cursor = visits.findIndex((value, index) => index > cursor && value === section);
    if (cursor === -1) return false;
  }
  return true;
};

const storyValue = (sample, key) => sample?.story?.[key] ?? sample?.[key] ?? null;

const journeyGate = (report) => {
  const visits = (report.journey?.sectionVisits || []).map((visit) => visit.section).filter(Boolean);
  const missingSections = requiredSections.filter((section) => !visits.includes(section));
  const sectionsInOrder = orderedVisits(visits, requiredSections);
  const storySamples = report.journey?.storySamples || [];
  const reverseMarkerIndex = storySamples.findIndex((sample) => (
    storyValue(sample, "servicesVideoDirection") === "reverse-playback"
      || storyValue(sample, "servicesEntryDirection") === "reverse"
  ));
  const serviceStopsBeforeReverse = new Set(storySamples.slice(0, reverseMarkerIndex < 0 ? storySamples.length : reverseMarkerIndex)
    .filter((sample) => storyValue(sample, "servicesPhase") === "waiting")
    .map((sample) => Number(storyValue(sample, "servicesActive")))
    .filter((value) => [1, 2, 3].includes(value)));
  const serviceStopsAfterReverse = new Set(storySamples.slice(Math.max(0, reverseMarkerIndex))
    .filter((sample) => storyValue(sample, "servicesPhase") === "waiting")
    .map((sample) => Number(storyValue(sample, "servicesActive")))
    .filter((value) => [1, 2, 3].includes(value)));
  const forwardStopsPass = [1, 2, 3].every((stage) => serviceStopsBeforeReverse.has(stage));
  const reverseStopsPass = reverseMarkerIndex >= 0
    && serviceStopsBeforeReverse.has(3)
    && [1, 2].every((stage) => serviceStopsAfterReverse.has(stage));
  const datumPlaying = storySamples.some((sample) => storyValue(sample, "datumPlayback") === "playing");
  const dominoTransitions = [];
  storySamples.forEach((sample) => {
    const value = storyValue(sample, "dominoPlayback");
    if (value && dominoTransitions[dominoTransitions.length - 1] !== value) dominoTransitions.push(value);
  });
  const dominoForwardRuns = dominoTransitions.filter((value) => value === "forward").length;
  const dominoReverseRuns = dominoTransitions.filter((value) => value === "reverse").length;
  const dominoReplayPass = dominoForwardRuns >= 2 && dominoReverseRuns >= 1;
  return {
    pass: missingSections.length === 0
      && sectionsInOrder
      && forwardStopsPass
      && reverseStopsPass
      && datumPlaying
      && dominoReplayPass,
    visits,
    missingSections,
    sectionsInOrder,
    storySamplesObserved: storySamples.length,
    services: {
      forwardStops: [...serviceStopsBeforeReverse].sort(),
      reverseStops: [...serviceStopsAfterReverse].sort(),
      reverseMarkerObserved: reverseMarkerIndex >= 0,
      pass: forwardStopsPass && reverseStopsPass,
    },
    datum: { playingObserved: datumPlaying, pass: datumPlaying },
    domino: { transitions: dominoTransitions, forwardRuns: dominoForwardRuns, reverseRuns: dominoReverseRuns, pass: dominoReplayPass },
  };
};

const videoKind = (video) => {
  if (video.kind) return video.kind;
  const descriptor = `${video.key || ""} ${video.className || ""} ${video.surfaceClassName || ""} ${video.sourceAtStart || ""}`;
  if (/services-story-video|services-|cards60|packed-alpha-video-source/.test(descriptor)) return "services";
  if (/datum-motion-video|datum/.test(descriptor)) return "datum";
  if (video.direction === "forward" || /domino-sequence-forward/.test(descriptor)) return "domino-forward";
  if (video.direction === "reverse" || /domino-sequence-reverse/.test(descriptor)) return "domino-reverse";
  return "other";
};

const videoProgress = (video) => {
  const samples = video.currentTimeSamples || [];
  const sampleTimes = samples.map((sample) => readNumber(sample.currentTime)).filter((value) => value != null);
  const min = readNumber(video.minCurrentTime) ?? (sampleTimes.length ? Math.min(...sampleTimes) : readNumber(video.firstCurrentTime));
  const max = readNumber(video.maxCurrentTime) ?? (sampleTimes.length ? Math.max(...sampleTimes) : readNumber(video.lastCurrentTime));
  let positiveDeltas = readNumber(video.positiveDeltaCount) ?? 0;
  let negativeDeltas = readNumber(video.negativeDeltaCount) ?? 0;
  if (positiveDeltas === 0 && negativeDeltas === 0 && sampleTimes.length > 1) {
    for (let index = 1; index < sampleTimes.length; index += 1) {
      const delta = sampleTimes[index] - sampleTimes[index - 1];
      if (delta > 0.002) positiveDeltas += 1;
      if (delta < -0.002) negativeDeltas += 1;
    }
  }
  const range = min != null && max != null ? max - min : null;
  return { min, max, range, positiveDeltas, negativeDeltas, pass: range != null && range > 0.01 && positiveDeltas > 0 };
};

const videoGate = (report) => {
  const videos = report.metrics?.videos || [];
  const mediaEvents = report.journey?.mediaEvents || [];
  const mediaErrors = mediaEvents.filter((event) => event.event === "error" || event.errorCode != null);
  const unresolvedStalls = videos.flatMap((video) => (video.stallWindows || [])
    .filter((stall) => stall.resolvedAt == null || stall.durationMs == null)
    .map((stall) => ({ video: video.key, ...stall })));
  const details = videos.map((video) => ({ key: video.key, kind: videoKind(video), ...videoProgress(video) }));
  const byKind = (kind) => details.filter((entry) => entry.kind === kind);
  const services = byKind("services");
  const datum = byKind("datum");
  const dominoForward = byKind("domino-forward");
  const dominoReverse = byKind("domino-reverse");
  const servicePass = services.some((entry) => entry.pass && entry.negativeDeltas > 0);
  const datumPass = datum.some((entry) => entry.pass);
  const dominoForwardPass = dominoForward.some((entry) => entry.pass);
  const dominoReversePass = dominoReverse.some((entry) => entry.pass);
  const activeKeys = new Set(mediaEvents
    .filter((event) => event.event === "play" || event.event === "playing")
    .map((event) => event.video));
  const progressByKey = new Map(details.map((entry) => [entry.key, entry.pass]));
  const activeWithoutProgress = [...activeKeys].filter((key) => progressByKey.has(key) && !progressByKey.get(key));
  return {
    pass: servicePass
      && datumPass
      && dominoForwardPass
      && dominoReversePass
      && activeWithoutProgress.length === 0
      && mediaErrors.length === 0
      && unresolvedStalls.length === 0,
    videosObserved: videos.length,
    videosActivated: activeKeys.size,
    details,
    coverage: {
      services: { pass: servicePass, observed: services.length },
      datum: { pass: datumPass, observed: datum.length },
      dominoForward: { pass: dominoForwardPass, observed: dominoForward.length },
      dominoReverse: { pass: dominoReversePass, observed: dominoReverse.length },
    },
    activeWithoutProgress,
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
  if (baseline.probeVersion !== candidate.probeVersion) differences.push("probe-version");
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
  if (!report.probeVersion) throw new Error(`${name} is missing probeVersion`);
  if (!report.metrics?.raf) throw new Error(`${name} is missing metrics.raf`);
  if (!report.run?.device) throw new Error(`${name} is missing run.device`);
};

const pairedGate = (baseline, candidate) => ({ pass: baseline.pass && candidate.pass, baseline, candidate });

const pairedEvidenceGate = (baseline, candidate) => {
  const baselinePaths = new Set((baseline.verified || []).map((entry) => entry.path));
  const reusedPaths = (candidate.verified || []).map((entry) => entry.path).filter((path) => baselinePaths.has(path));
  return { pass: baseline.pass && candidate.pass && reusedPaths.length === 0, baseline, candidate, reusedPaths };
};

export const compareReports = (baseline, candidate, options = {}) => {
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
  const frameDistribution = frameDistributionGate(baseline, candidate);
  const longTasks = longTaskGate(candidate);
  const manual = pairedGate(manualGate(baseline), manualGate(candidate));
  const evidence = pairedEvidenceGate(
    evidenceGate(baseline, options.evidenceRoot),
    evidenceGate(candidate, options.evidenceRoot),
  );
  const computedStyles = computedStyleGate(candidate);
  const journeys = pairedGate(journeyGate(baseline), journeyGate(candidate));
  const videos = pairedGate(videoGate(baseline), videoGate(candidate));
  const runtimeErrors = candidate.runtimeErrors || [];
  const runtimeErrorGate = { pass: runtimeErrors.length === 0, entries: runtimeErrors };
  const nonLongTaskAutomaticPass = compatibility.pass
    && rawFrame.pass
    && adaptiveFrame.pass
    && frameDistribution.pass
    && computedStyles.pass
    && journeys.pass
    && videos.pass
    && runtimeErrorGate.pass;
  const nonLongTaskPhysicalPass = nonLongTaskAutomaticPass && manual.pass && evidence.pass;
  const automaticPass = nonLongTaskAutomaticPass && longTasks.pass;
  const physicalPass = nonLongTaskPhysicalPass && longTasks.pass;
  const needsTimelineReview = nonLongTaskPhysicalPass && longTasks.status !== "measured";
  const status = physicalPass ? "pass" : needsTimelineReview ? "needs-web-inspector-review" : "fail";
  return {
    schemaVersion: 2,
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
      frameDistribution,
      longTasks250ms: longTasks,
      manual,
      evidence,
      computedStyles,
      journeys,
      videos,
      runtimeErrors: runtimeErrorGate,
    },
    verdict: {
      nonLongTaskAutomaticPass,
      nonLongTaskPhysicalPass,
      automaticPass,
      physicalPass,
      needsTimelineReview,
      status,
    },
  };
};

const runCli = () => {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--evidence-root");
  let evidenceRoot = null;
  if (rootIndex >= 0) {
    evidenceRoot = args[rootIndex + 1] || null;
    args.splice(rootIndex, 2);
  }
  const [baselinePath, candidatePath, outputPath] = args;
  if (!baselinePath || !candidatePath || !evidenceRoot) {
    process.stderr.write("Usage: node scripts/compare-t5-physical-safari.mjs <baseline.json> <candidate.json> [output.json] --evidence-root <directory>\n");
    process.exitCode = 1;
    return;
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));
  const comparison = compareReports(baseline, candidate, { evidenceRoot });
  const serialized = `${JSON.stringify(comparison, null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, serialized, "utf8");
  process.stdout.write(serialized);
  if (!comparison.verdict.physicalPass) process.exitCode = 2;
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) runCli();
