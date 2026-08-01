import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareReports } from "./compare-t5-physical-safari.mjs";

const buildReport = ({ label, rawRatio, adaptiveRatio, longTasks, manual = true, errors = [], videoProgress = true }) => ({
  schemaVersion: 1,
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
  evidenceFiles: {
    timeline: "timeline.json",
    har: "network.har",
    screenRecording: "screen.mov",
  },
  manual: {
    visualParity: manual,
    scrollSmooth: manual,
    services: manual,
    datum: manual,
    domino: manual,
  },
  metrics: {
    raf: { over16_7Ratio: rawRatio, adaptiveSlowRatio: adaptiveRatio },
    eventLoop: { p95LagMs: 4, maxLagMs: 18 },
    longTasks: { status: "supported", durationSumMs: longTasks, entries: [] },
    videos: [{
      key: "fixture-video",
      firstMediaTime: 0,
      lastMediaTime: videoProgress ? 4 : 0,
      firstCurrentTime: 0,
      lastCurrentTime: videoProgress ? 4 : 0,
      stallWindows: [],
    }],
  },
  journey: { mediaEvents: [] },
  runtimeErrors: errors,
});

const baseline = buildReport({ label: "t4-baseline", rawRatio: 0.2, adaptiveRatio: 0.12, longTasks: 900 });
const passing = buildReport({ label: "t5-candidate", rawRatio: 0.08, adaptiveRatio: 0.05, longTasks: 180 });
const failing = buildReport({ label: "t5-regression", rawRatio: 0.16, adaptiveRatio: 0.09, longTasks: 400, manual: false, errors: [{ message: "fixture" }], videoProgress: false });

const passResult = compareReports(baseline, passing);
assert.equal(passResult.verdict.status, "pass");
assert.equal(passResult.gates.rawFrameBudget2x.pass, true);
assert.equal(passResult.gates.longTasks250ms.pass, true);

const failResult = compareReports(baseline, failing);
assert.equal(failResult.verdict.status, "fail");
assert.equal(failResult.gates.rawFrameBudget2x.pass, false);
assert.equal(failResult.gates.longTasks250ms.pass, false);
assert.equal(failResult.gates.manual.pass, false);
assert.equal(failResult.gates.runtimeErrors.pass, false);

const unsupported = structuredClone(passing);
unsupported.metrics.longTasks = { status: "unsupported", durationSumMs: null, entries: [] };
const unsupportedResult = compareReports(baseline, unsupported);
assert.equal(unsupportedResult.verdict.status, "needs-web-inspector-review");
assert.equal(unsupportedResult.verdict.physicalPass, false);

const probeSource = readFileSync(new URL("./t5-physical-safari-probe.js", import.meta.url), "utf8");
assert.match(probeSource, /requestVideoFrameCallback/);
assert.match(probeSource, /PerformanceObserver/);
assert.match(probeSource, /window\.__tascSafariEvidence/);

process.stdout.write("T5 physical Safari kit verification passed\n");
