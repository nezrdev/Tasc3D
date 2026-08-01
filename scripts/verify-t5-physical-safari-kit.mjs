import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareReports } from "./compare-t5-physical-safari.mjs";

const evidenceRoot = mkdtempSync(join(tmpdir(), "tasc-t5-safari-kit-"));

const video = (key, kind, { negative = false, progress = true } = {}) => ({
  key,
  kind,
  className: kind,
  firstCurrentTime: 0,
  lastCurrentTime: progress ? 4 : 0,
  minCurrentTime: 0,
  maxCurrentTime: progress ? 4 : 0,
  positiveDeltaCount: progress ? 8 : 0,
  negativeDeltaCount: negative && progress ? 3 : 0,
  currentTimeSamples: [],
  stallWindows: [],
});

const storySamples = [
  { story: { servicesPhase: "waiting", servicesActive: "1", servicesEntryDirection: "forward" } },
  { story: { servicesPhase: "waiting", servicesActive: "2", servicesEntryDirection: "forward" } },
  { story: { servicesPhase: "waiting", servicesActive: "3", servicesEntryDirection: "forward" } },
  { story: { servicesPhase: "playing", servicesActive: "3", servicesVideoDirection: "reverse-playback" } },
  { story: { servicesPhase: "waiting", servicesActive: "2" } },
  { story: { servicesPhase: "playing", servicesActive: "2", servicesVideoDirection: "reverse-playback" } },
  { story: { servicesPhase: "waiting", servicesActive: "1" } },
  { story: { datumPlayback: "playing" } },
  { story: { dominoPlayback: "forward", dominoPinned: "true" } },
  { story: { dominoPlayback: "complete", dominoPinned: "false" } },
  { story: { dominoPlayback: "reverse", dominoPinned: "true" } },
  { story: { dominoPlayback: "start", dominoPinned: "false" } },
  { story: { dominoPlayback: "forward", dominoPinned: "true" } },
  { story: { dominoPlayback: "complete", dominoPinned: "false" } },
];

const sectionVisits = ["hero", "clients", "services", "how-we-work", "datum", "process", "domino", "footer"]
  .map((section, index) => ({ section, t: index * 1000, y: index * 800 }));

const buildReport = ({
  label,
  rawRatio,
  adaptiveRatio,
  p95 = 32,
  p99 = 50,
  maximum = 100,
  longTasks,
  manual = true,
  errors = [],
  videoProgress = true,
} = {}) => {
  const evidenceFiles = {
    timeline: `${label}-timeline.json`,
    har: `${label}-network.har`,
    screenRecording: `${label}-screen.mov`,
  };
  Object.values(evidenceFiles).forEach((name) => writeFileSync(join(evidenceRoot, name), `${label}:${name}\n`, "utf8"));
  const videos = [
    video(`${label}-services`, "services", { negative: true, progress: videoProgress }),
    video(`${label}-datum`, "datum", { progress: videoProgress }),
    video(`${label}-domino-forward`, "domino-forward", { progress: videoProgress }),
    video(`${label}-domino-reverse`, "domino-reverse", { progress: videoProgress }),
  ];
  return {
    schemaVersion: 1,
    probeVersion: "1.1.0",
    run: {
      label,
      device: "mac-safari",
      url: `http://example.test/${label}`,
      startedAt: "2026-08-01T00:00:00.000Z",
    },
    environment: {
      userAgent: "Safari fixture",
      viewport: { width: 1280, height: 800, devicePixelRatio: 2 },
    },
    evidenceFiles,
    manual: {
      visualParity: manual,
      scrollSmooth: manual,
      services: manual,
      datum: manual,
      domino: manual,
    },
    metrics: {
      raf: {
        over16_7Ratio: rawRatio,
        adaptiveSlowRatio: adaptiveRatio,
        p95Ms: p95,
        p99Ms: p99,
        maxMs: maximum,
      },
      eventLoop: { p95LagMs: 4, maxLagMs: 18 },
      longTasks: { status: "supported", durationSumMs: longTasks, entries: [] },
      videos,
    },
    journey: {
      sectionVisits: structuredClone(sectionVisits),
      storySamples: structuredClone(storySamples),
      mediaEvents: videos.map((entry) => ({ event: "playing", video: entry.key })),
    },
    runtimeErrors: errors,
    computedStyles: {
      ".process-contact-section": { contentVisibility: "visible", containIntrinsicSize: "none" },
      ".site-footer": { contentVisibility: "visible", containIntrinsicSize: "none" },
    },
  };
};

try {
  const baseline = buildReport({ label: "t4-baseline", rawRatio: 0.2, adaptiveRatio: 0.12, p95: 40, p99: 70, maximum: 180, longTasks: 900 });
  const passing = buildReport({ label: "t5-candidate", rawRatio: 0.08, adaptiveRatio: 0.05, p95: 30, p99: 55, maximum: 120, longTasks: 180 });
  const options = { evidenceRoot };

  const passResult = compareReports(baseline, passing, options);
  assert.equal(passResult.verdict.status, "pass");
  assert.equal(passResult.gates.rawFrameBudget2x.pass, true);
  assert.equal(passResult.gates.adaptiveFrameBudget2x.pass, true);
  assert.equal(passResult.gates.frameDistribution.pass, true);
  assert.equal(passResult.gates.computedStyles.pass, true);
  assert.equal(passResult.gates.journeys.pass, true);
  assert.equal(passResult.gates.videos.pass, true);
  assert.equal(passResult.gates.evidence.pass, true);

  const adaptiveFailure = structuredClone(passing);
  adaptiveFailure.metrics.raf.adaptiveSlowRatio = 0.2;
  const adaptiveResult = compareReports(baseline, adaptiveFailure, options);
  assert.equal(adaptiveResult.gates.rawFrameBudget2x.pass, true);
  assert.equal(adaptiveResult.gates.adaptiveFrameBudget2x.pass, false);
  assert.equal(adaptiveResult.verdict.status, "fail");

  const distributionFailure = structuredClone(passing);
  distributionFailure.metrics.raf.p99Ms = 1700;
  distributionFailure.metrics.raf.maxMs = 2500;
  const distributionResult = compareReports(baseline, distributionFailure, options);
  assert.equal(distributionResult.gates.frameDistribution.pass, false);
  assert.equal(distributionResult.verdict.status, "fail");

  const styleFailure = structuredClone(passing);
  styleFailure.computedStyles[".site-footer"] = { contentVisibility: "auto", containIntrinsicSize: "auto 1000px" };
  const styleResult = compareReports(baseline, styleFailure, options);
  assert.equal(styleResult.gates.computedStyles.pass, false);
  assert.equal(styleResult.verdict.status, "fail");

  const intrinsicFailure = structuredClone(passing);
  intrinsicFailure.computedStyles[".process-contact-section"].containIntrinsicSize = "none 100px";
  const intrinsicResult = compareReports(baseline, intrinsicFailure, options);
  assert.equal(intrinsicResult.gates.computedStyles.pass, false);
  assert.equal(intrinsicResult.verdict.status, "fail");

  const manualFailure = structuredClone(passing);
  delete manualFailure.manual.domino;
  manualFailure.manual.extra = true;
  const manualResult = compareReports(baseline, manualFailure, options);
  assert.equal(manualResult.gates.manual.candidate.pass, false);
  assert.deepEqual(manualResult.gates.manual.candidate.missing, ["domino"]);
  assert.deepEqual(manualResult.gates.manual.candidate.unexpected, ["extra"]);
  assert.equal(manualResult.verdict.status, "fail");

  const journeyFailure = structuredClone(passing);
  journeyFailure.journey.sectionVisits = journeyFailure.journey.sectionVisits.filter((visit) => visit.section !== "datum");
  const journeyResult = compareReports(baseline, journeyFailure, options);
  assert.equal(journeyResult.gates.journeys.candidate.pass, false);
  assert.equal(journeyResult.verdict.status, "fail");

  const reverseOrderFailure = structuredClone(passing);
  reverseOrderFailure.journey.storySamples = [
    ...storySamples.slice(0, 3),
    { story: { servicesPhase: "playing", servicesActive: "3", servicesVideoDirection: "reverse-playback" } },
    { story: { servicesPhase: "waiting", servicesActive: "2", servicesEntryDirection: "forward", servicesVideoDirection: "forward-playback" } },
    { story: { servicesPhase: "playing", servicesActive: "2", servicesVideoDirection: "reverse-playback" } },
    { story: { servicesPhase: "waiting", servicesActive: "1", servicesEntryDirection: "forward", servicesVideoDirection: "forward-playback" } },
    ...storySamples.slice(7),
  ];
  const reverseOrderResult = compareReports(baseline, reverseOrderFailure, options);
  assert.equal(reverseOrderResult.gates.journeys.candidate.services.pass, false);
  assert.equal(reverseOrderResult.verdict.status, "fail");

  const extraReverseStopFailure = structuredClone(passing);
  extraReverseStopFailure.journey.storySamples = [
    ...storySamples.slice(0, 5),
    { story: { servicesPhase: "waiting", servicesActive: "3" } },
    ...storySamples.slice(5),
  ];
  const extraReverseStopResult = compareReports(baseline, extraReverseStopFailure, options);
  assert.deepEqual(extraReverseStopResult.gates.journeys.candidate.services.reverseWaitingStops, [2, 3, 1]);
  assert.equal(extraReverseStopResult.gates.journeys.candidate.services.pass, false);
  assert.equal(extraReverseStopResult.verdict.status, "fail");

  const splitMarkerFailure = structuredClone(passing);
  splitMarkerFailure.journey.storySamples = [
    ...storySamples.slice(0, 3),
    { story: { servicesPhase: "playing", servicesActive: "3", servicesVideoDirection: "reverse-playback" } },
    { story: { servicesPhase: "playing", servicesActive: "3", servicesVideoDirection: "forward-playback" } },
    { story: { servicesPhase: "playing", servicesActive: "3", servicesVideoDirection: "reverse-playback" } },
    { story: { servicesPhase: "waiting", servicesActive: "2" } },
    { story: { servicesPhase: "waiting", servicesActive: "1" } },
    ...storySamples.slice(7),
  ];
  const splitMarkerResult = compareReports(baseline, splitMarkerFailure, options);
  assert.deepEqual(splitMarkerResult.gates.journeys.candidate.services.reverseLifecycle, ["marker", "unexpected-direction:forward-playback", "marker", "wait2", "wait1"]);
  assert.equal(splitMarkerResult.gates.journeys.candidate.services.pass, false);
  assert.equal(splitMarkerResult.verdict.status, "fail");

  const unexpectedServicesDirection = structuredClone(passing);
  unexpectedServicesDirection.journey.storySamples = [
    ...storySamples.slice(0, 4),
    { story: { servicesPhase: "waiting", servicesActive: "3", servicesVideoDirection: "forward-playback" } },
    ...storySamples.slice(4),
  ];
  const unexpectedServicesResult = compareReports(baseline, unexpectedServicesDirection, options);
  assert.ok(unexpectedServicesResult.gates.journeys.candidate.services.reverseDetailedLifecycle.includes("unexpected-direction:forward-playback"));
  assert.equal(unexpectedServicesResult.gates.journeys.candidate.services.pass, false);
  assert.equal(unexpectedServicesResult.verdict.status, "fail");

  const dominoOrderFailure = structuredClone(passing);
  dominoOrderFailure.journey.storySamples = [
    ...storySamples.slice(0, 8),
    { story: { dominoPlayback: "forward" } },
    { story: { dominoPlayback: "complete" } },
    { story: { dominoPlayback: "forward" } },
    { story: { dominoPlayback: "complete" } },
    { story: { dominoPlayback: "reverse" } },
    { story: { dominoPlayback: "start" } },
  ];
  const dominoOrderResult = compareReports(baseline, dominoOrderFailure, options);
  assert.equal(dominoOrderResult.gates.journeys.candidate.domino.pass, false);
  assert.equal(dominoOrderResult.verdict.status, "fail");

  const extraDominoCycleFailure = structuredClone(passing);
  extraDominoCycleFailure.journey.storySamples = [
    ...storySamples.slice(0, 8),
    { story: { dominoPlayback: "forward" } },
    { story: { dominoPlayback: "complete" } },
    { story: { dominoPlayback: "reverse" } },
    { story: { dominoPlayback: "start" } },
    { story: { dominoPlayback: "reverse" } },
    { story: { dominoPlayback: "start" } },
    { story: { dominoPlayback: "forward" } },
    { story: { dominoPlayback: "complete" } },
  ];
  const extraDominoCycleResult = compareReports(baseline, extraDominoCycleFailure, options);
  assert.equal(extraDominoCycleResult.gates.journeys.candidate.domino.pass, false);
  assert.equal(extraDominoCycleResult.verdict.status, "fail");

  const unexpectedDominoState = structuredClone(passing);
  unexpectedDominoState.journey.storySamples = [
    ...storySamples.slice(0, 9),
    { story: { dominoPlayback: "fault" } },
    ...storySamples.slice(9),
  ];
  const unexpectedDominoResult = compareReports(baseline, unexpectedDominoState, options);
  assert.deepEqual(unexpectedDominoResult.gates.journeys.candidate.domino.unexpected, ["fault"]);
  assert.equal(unexpectedDominoResult.gates.journeys.candidate.domino.pass, false);
  assert.equal(unexpectedDominoResult.verdict.status, "fail");

  const oneVideoFailure = structuredClone(passing);
  oneVideoFailure.metrics.videos = oneVideoFailure.metrics.videos.slice(0, 1);
  oneVideoFailure.journey.mediaEvents = oneVideoFailure.journey.mediaEvents.slice(0, 1);
  const oneVideoResult = compareReports(baseline, oneVideoFailure, options);
  assert.equal(oneVideoResult.gates.videos.candidate.pass, false);
  assert.equal(oneVideoResult.verdict.status, "fail");

  const unknownActiveVideo = structuredClone(passing);
  unknownActiveVideo.journey.mediaEvents.push({ event: "playing", video: "unknown-active" });
  const unknownActiveResult = compareReports(baseline, unknownActiveVideo, options);
  assert.deepEqual(unknownActiveResult.gates.videos.candidate.activeWithoutProgress, ["unknown-active"]);
  assert.equal(unknownActiveResult.verdict.status, "fail");

  const evidenceFailure = structuredClone(passing);
  evidenceFailure.evidenceFiles.har = "missing-network.har";
  const evidenceResult = compareReports(baseline, evidenceFailure, options);
  assert.equal(evidenceResult.gates.evidence.candidate.pass, false);
  assert.equal(evidenceResult.verdict.status, "fail");

  const reusedEvidence = structuredClone(passing);
  reusedEvidence.evidenceFiles = structuredClone(baseline.evidenceFiles);
  const reusedEvidenceResult = compareReports(baseline, reusedEvidence, options);
  assert.equal(reusedEvidenceResult.gates.evidence.pass, false);
  assert.equal(reusedEvidenceResult.gates.evidence.reusedPaths.length, 3);
  assert.equal(reusedEvidenceResult.verdict.status, "fail");

  const internallyReusedEvidence = structuredClone(passing);
  internallyReusedEvidence.evidenceFiles.har = internallyReusedEvidence.evidenceFiles.timeline;
  const internallyReusedEvidenceResult = compareReports(baseline, internallyReusedEvidence, options);
  assert.equal(internallyReusedEvidenceResult.gates.evidence.candidate.pass, false);
  assert.deepEqual(internallyReusedEvidenceResult.gates.evidence.candidate.duplicates[0].keys, ["timeline", "har"]);
  assert.equal(internallyReusedEvidenceResult.verdict.status, "fail");

  const outsideRoot = mkdtempSync(join(tmpdir(), "tasc-t5-safari-outside-"));
  try {
    writeFileSync(join(outsideRoot, "escape.har"), "outside\n", "utf8");
    symlinkSync(outsideRoot, join(evidenceRoot, "outside-link"), "junction");
    const escapedEvidence = structuredClone(passing);
    escapedEvidence.evidenceFiles.har = "outside-link/escape.har";
    const escapedEvidenceResult = compareReports(baseline, escapedEvidence, options);
    assert.equal(escapedEvidenceResult.gates.evidence.candidate.pass, false);
    assert.equal(escapedEvidenceResult.gates.evidence.candidate.invalid[0].reason, "resolved-outside-evidence-root");
    assert.equal(escapedEvidenceResult.verdict.status, "fail");
  } finally {
    rmSync(join(evidenceRoot, "outside-link"), { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  }

  const noRootResult = compareReports(baseline, passing);
  assert.equal(noRootResult.gates.evidence.pass, false);
  assert.equal(noRootResult.gates.evidence.candidate.status, "references-only-unverified");
  assert.equal(noRootResult.verdict.status, "fail");

  const unsupported = structuredClone(passing);
  unsupported.metrics.longTasks = { status: "unsupported", durationSumMs: null, entries: [] };
  const unsupportedResult = compareReports(baseline, unsupported, options);
  assert.equal(unsupportedResult.verdict.status, "needs-web-inspector-review");
  assert.equal(unsupportedResult.verdict.physicalPass, false);

  const unsupportedHardFailure = structuredClone(unsupported);
  unsupportedHardFailure.runtimeErrors = [{ message: "fixture" }];
  const unsupportedHardResult = compareReports(baseline, unsupportedHardFailure, options);
  assert.equal(unsupportedHardResult.verdict.status, "fail");
  assert.equal(unsupportedHardResult.verdict.needsTimelineReview, false);

  const badVideo = buildReport({
    label: "t5-bad-video",
    rawRatio: 0.08,
    adaptiveRatio: 0.05,
    p95: 30,
    p99: 55,
    maximum: 120,
    longTasks: 180,
    videoProgress: false,
  });
  const badVideoResult = compareReports(baseline, badVideo, options);
  assert.equal(badVideoResult.gates.videos.candidate.pass, false);
  assert.equal(badVideoResult.verdict.status, "fail");

  const probeSource = readFileSync(new URL("./t5-physical-safari-probe.js", import.meta.url), "utf8");
  assert.match(probeSource, /requestVideoFrameCallback/);
  assert.match(probeSource, /PerformanceObserver/);
  assert.match(probeSource, /storySamples/);
  assert.match(probeSource, /is-recording/);
  assert.match(probeSource, /display:none!important/);
  assert.match(probeSource, /videoClassification/);
  assert.match(probeSource, /window\.__tascSafariEvidence/);

  process.stdout.write("T5 physical Safari kit verification passed\n");
} finally {
  rmSync(evidenceRoot, { recursive: true, force: true });
}
