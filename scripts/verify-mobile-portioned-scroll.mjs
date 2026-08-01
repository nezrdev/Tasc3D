import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium, webkit } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const WORK_ROOT = path.join(ROOT, "work");
const BASE_URL = new URL(process.env.TASC_QA_BASE_URL ?? "http://127.0.0.1:3154/").toString();
const HEADED = process.env.TASC_QA_HEADED === "1";
const READY_TIMEOUT_MS = Math.max(10_000, Number(process.env.TASC_QA_READY_TIMEOUT_MS ?? 45_000));
const PORTION_TIMEOUT_MS = Math.max(1_500, Number(process.env.TASC_QA_PORTION_TIMEOUT_MS ?? 9_000));
const SETTLE_TOLERANCE_PX = 8;
const MONOTONIC_TOLERANCE_PX = 2;
const RAPID_SWIPE_COUNT = 5;
const PORTION_DURATION_MS = 420;
const TERMINAL_EARLY_TOLERANCE_MS = 120;
const TERMINAL_LATE_GRACE_MS = 1200;
const RAPID_GESTURE_GAP_MS = 60;
const MAX_JUMP_VIEWPORT_RATIO = 0.95;
const MOVEMENT_OBSERVED_PX = 4;
const EXPECTED_ANCHORS = ["hero", "clients", "services", "how", "datum", "process", "domino", "footer"];
const EXPECTED_ANCHOR_SIGNATURE = EXPECTED_ANCHORS.join("|");

const PROFILES = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 3 },
  "mobile-large": { width: 430, height: 932, deviceScaleFactor: 3 },
};

const ENGINES = {
  chromium: { browserType: chromium, trustedTouch: true },
  webkit: { browserType: webkit, trustedTouch: false },
};

const STORY_PROBES = [
  {
    name: "services",
    hash: "#services",
    owns: (root) => root?.servicesPinned === "true",
  },
  {
    name: "how",
    hash: "#work",
    owns: (root) =>
      root?.howWorkInputOwner === "true" || root?.howWorkPinned === "true",
  },
  {
    name: "domino",
    hash: "#brief",
    owns: (root) =>
      root?.dominoPinned === "true" ||
      [
        "forward",
        "reverse",
        "waiting-media",
        "waiting-seek",
        "waiting-play",
        "waiting-frame",
      ].includes(root?.dominoPlayback),
  },
];

const splitList = (value, fallback) => {
  const parsed = String(value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
};

const selectedEngines = splitList(process.env.TASC_QA_ENGINES, Object.keys(ENGINES));
const selectedProfiles = splitList(process.env.TASC_QA_PROFILES, Object.keys(PROFILES));
const allowPartialMatrix = process.env.TASC_QA_ALLOW_PARTIAL === "1";
const hasExactEntries = (actual, expected) =>
  actual.length === expected.length &&
  new Set(actual).size === expected.length &&
  expected.every((entry) => actual.includes(entry));

for (const engine of selectedEngines) {
  if (!ENGINES[engine]) throw new Error(`Unsupported TASC_QA_ENGINES entry: ${engine}`);
}
for (const profile of selectedProfiles) {
  if (!PROFILES[profile]) throw new Error(`Unsupported TASC_QA_PROFILES entry: ${profile}`);
}
if (
  !allowPartialMatrix &&
  (!hasExactEntries(selectedEngines, Object.keys(ENGINES)) ||
    !hasExactEntries(selectedProfiles, Object.keys(PROFILES)))
) {
  throw new Error(
    "A release run must include chromium, webkit, mobile, and mobile-large; set TASC_QA_ALLOW_PARTIAL=1 for a diagnostic subset.",
  );
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const requestedOutput = process.env.TASC_QA_OUTPUT
  ? path.resolve(ROOT, process.env.TASC_QA_OUTPUT)
  : path.join(WORK_ROOT, `mobile-portioned-scroll-qa-${timestamp}.json`);
const relativeOutput = path.relative(WORK_ROOT, requestedOutput);
if (relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
  throw new Error(`TASC_QA_OUTPUT must stay under ${WORK_ROOT}`);
}

fs.mkdirSync(path.dirname(requestedOutput), { recursive: true });

const fileSha256 = (relativePath) =>
  createHash("sha256").update(fs.readFileSync(path.join(ROOT, relativePath))).digest("hex");
const gitOutput = (...args) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const buildIdentityPath = path.join(ROOT, ".next", "BUILD_ID");
const applicationSourcePaths = [
  "src/components/TascLanding.tsx",
  "src/hooks/useMobilePortionedScroll.ts",
  "src/hooks/useReversibleScrollStories.ts",
];
const latestApplicationSourceMtimeMs = Math.max(
  ...applicationSourcePaths.map((relativePath) => fs.statSync(path.join(ROOT, relativePath)).mtimeMs),
);
const buildIdentityMtimeMs = fs.existsSync(buildIdentityPath)
  ? fs.statSync(buildIdentityPath).mtimeMs
  : null;
const sourceIdentity = {
  gitHead: gitOutput("rev-parse", "HEAD"),
  gitStatus: gitOutput("status", "--short"),
  hookSha256: fileSha256("src/hooks/useMobilePortionedScroll.ts"),
  harnessSha256: fileSha256("scripts/verify-mobile-portioned-scroll.mjs"),
  nextBuildId: fs.existsSync(buildIdentityPath)
    ? fs.readFileSync(buildIdentityPath, "utf8").trim()
    : null,
  buildIdentityMtimeMs,
  latestApplicationSourceMtimeMs,
};

const verifyServedBuildIdentity = async () => {
  if (!sourceIdentity.nextBuildId) {
    throw new Error("The local production build has no .next/BUILD_ID");
  }
  if (
    sourceIdentity.buildIdentityMtimeMs === null ||
    sourceIdentity.buildIdentityMtimeMs < sourceIdentity.latestApplicationSourceMtimeMs
  ) {
    throw new Error("The local production build is older than the T3 application source");
  }
  const identityUrl = new URL(BASE_URL);
  identityUrl.searchParams.set("__tasc_build_identity", timestamp);
  const response = await fetch(identityUrl, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  const html = await response.text();
  if (!response.ok || !html.includes(sourceIdentity.nextBuildId)) {
    throw new Error(
      `TASC_QA_BASE_URL is not serving local build ${sourceIdentity.nextBuildId} (${response.status})`,
    );
  }
  return {
    buildId: sourceIdentity.nextBuildId,
    status: response.status,
    url: identityUrl.toString(),
    verified: true,
  };
};

const servedBuildIdentity = await verifyServedBuildIdentity();

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const round = (value, digits = 2) =>
  Number.isFinite(value) ? Number(Number(value).toFixed(digits)) : null;

const targetUrl = (caseId, phase, hash = "") => {
  const target = new URL(BASE_URL);
  target.searchParams.set("__tasc_mobile_portion_qa", `${caseId}-${phase}-${timestamp}`);
  target.hash = hash;
  return target.toString();
};

const userAgentFor = (engine) =>
  engine === "webkit"
    ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"
    : "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36";

const addCheck = (caseResult, ok, message, details = {}) => {
  const check = { ok: Boolean(ok), message, details };
  caseResult.checks.push(check);
  if (!check.ok) caseResult.failures.push(message);
  return check;
};

const ignoredConsoleMessage = (message) =>
  /maps\.googleapis\.com|maps\.gstatic\.com|MapsJsInternalService/i.test(message);

const installInstrumentation = async (context) => {
  await context.addInitScript(() => {
    try {
      localStorage.setItem("tasc_cookie_consent_v1", "qa");
    } catch {}

    const rootState = () => {
      const root = document.querySelector(".site-shell");
      if (!(root instanceof HTMLElement)) return null;
      return {
        portionAnchorCount: root.dataset.portionAnchorCount ?? null,
        portionAnchors: root.dataset.portionAnchors ?? null,
        portionDuration: root.dataset.portionDuration ?? null,
        portionEase: root.dataset.portionEase ?? null,
        portionTargetIndex: root.dataset.portionTargetIndex ?? null,
        portionTargetY: root.dataset.portionTargetY ?? null,
        portionedScroll: root.dataset.portionedScroll ?? null,
        motionInputLocked: root.dataset.motionInputLocked ?? null,
        servicesActive: root.dataset.servicesActive ?? null,
        servicesInrange: root.dataset.servicesInrange ?? null,
        servicesPhase: root.dataset.servicesPhase ?? null,
        servicesPinned: root.dataset.servicesPinned ?? null,
        howWorkInrange: root.dataset.howWorkInrange ?? null,
        howWorkInputOwner: root.dataset.howWorkInputOwner ?? null,
        howWorkPinned: root.dataset.howWorkPinned ?? null,
        howWorkStep: root.dataset.howWorkStep ?? null,
        howWorkTransitioning: root.dataset.howWorkTransitioning ?? null,
        dominoPinned: root.dataset.dominoPinned ?? null,
        dominoPlayback: root.dataset.dominoPlayback ?? null,
      };
    };

    const qa = {
      events: [],
      frames: [],
      inputs: [],
      scrollEvents: [],
      reset() {
        this.events.length = 0;
        this.frames.length = 0;
        this.inputs.length = 0;
        this.scrollEvents.length = 0;
      },
    };
    window.__tascMobilePortionQa = qa;
    let portionFrame = 0;

    const cap = (array, maximum) => {
      if (array.length > maximum) array.splice(0, array.length - maximum);
    };
    const capturePortionFrame = () => {
      portionFrame = 0;
      qa.frames.push({ t: performance.now(), y: scrollY });
      cap(qa.frames, 20_000);
      if (document.querySelector(".site-shell")?.dataset.portionedScroll) {
        portionFrame = requestAnimationFrame(capturePortionFrame);
      }
    };
    const startPortionFrameSampling = () => {
      if (!portionFrame) portionFrame = requestAnimationFrame(capturePortionFrame);
    };
    const capturePortionEvent = (event) => {
      const detail = event instanceof CustomEvent && event.detail && typeof event.detail === "object"
        ? { ...event.detail }
        : {};
      qa.events.push({
        type: event.type,
        t: performance.now(),
        y: scrollY,
        detail,
        root: rootState(),
      });
      cap(qa.events, 500);
      if (event.type === "tasc:portion-start") startPortionFrameSampling();
    };
    for (const type of [
      "tasc:portion-start",
      "tasc:portion-settled",
      "tasc:portion-interrupted",
    ]) {
      addEventListener(type, capturePortionEvent);
    }
    addEventListener(
      "touchstart",
      () => {
        qa.inputs.push({
          t: performance.now(),
          y: scrollY,
          startCount: qa.events.filter((event) => event.type === "tasc:portion-start").length,
          terminalCount: qa.events.filter(
            (event) =>
              event.type === "tasc:portion-settled" || event.type === "tasc:portion-interrupted",
          ).length,
          root: rootState(),
        });
        cap(qa.inputs, 100);
      },
      { capture: true, passive: true },
    );
    addEventListener(
      "scroll",
      () => {
        qa.scrollEvents.push({ t: performance.now(), y: scrollY });
        cap(qa.scrollEvents, 20_000);
      },
      { passive: true },
    );
    qa.reset();
  });
};

const readPageState = (page) =>
  page.evaluate(() => {
    const root = document.querySelector(".site-shell");
    const preloader = document.querySelector(".site-preloader");
    const preloaderStyle = preloader instanceof HTMLElement ? getComputedStyle(preloader) : null;
    const describeSection = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return {
        selector,
        documentY: scrollY + rect.top,
        rect: {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        },
      };
    };
    return {
      t: performance.now(),
      y: scrollY,
      maxY: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      viewport: {
        width: innerWidth,
        height: innerHeight,
        visualHeight: visualViewport?.height ?? innerHeight,
      },
      coarsePointer: matchMedia("(max-width: 900px) and (pointer: coarse)").matches,
      root: root instanceof HTMLElement ? { ...root.dataset } : null,
      preloader: preloader
        ? {
            present: true,
            opacity: Number.parseFloat(preloaderStyle?.opacity ?? "1"),
            visibility: preloaderStyle?.visibility ?? null,
            display: preloaderStyle?.display ?? null,
          }
        : { present: false },
      sections: {
        services: describeSection(".services-story-section"),
        how: describeSection(".how-work-motion-section"),
        domino: describeSection(".domino-cta-section"),
      },
      events: [...(window.__tascMobilePortionQa?.events ?? [])],
      frames: [...(window.__tascMobilePortionQa?.frames ?? [])],
      inputs: [...(window.__tascMobilePortionQa?.inputs ?? [])],
      scrollEvents: [...(window.__tascMobilePortionQa?.scrollEvents ?? [])],
    };
  });

const waitForScrollQuiet = async (page, stableMs = 180, timeoutMs = 2_000) => {
  const startedAt = Date.now();
  let stableSince = startedAt;
  let lastY = await page.evaluate(() => scrollY);
  while (Date.now() - startedAt < timeoutMs) {
    await page.waitForTimeout(40);
    const y = await page.evaluate(() => scrollY);
    if (Math.abs(y - lastY) > 0.75) stableSince = Date.now();
    lastY = y;
    if (Date.now() - stableSince >= stableMs) {
      return { settled: true, y, elapsedMs: Date.now() - startedAt };
    }
  }
  return { settled: false, y: lastY, elapsedMs: Date.now() - startedAt };
};

const waitForReady = async (page) => {
  await page.waitForFunction(() => Boolean(document.querySelector(".site-shell")), null, {
    timeout: READY_TIMEOUT_MS,
  });
  await page.waitForFunction(
    () => {
      const preloader = document.querySelector(".site-preloader");
      if (!(preloader instanceof HTMLElement)) return true;
      const style = getComputedStyle(preloader);
      return (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") <= 0.01
      );
    },
    null,
    { timeout: READY_TIMEOUT_MS },
  );
  await page.evaluate(
    (timeoutMs) =>
      Promise.race([
        document.fonts?.ready ?? Promise.resolve(),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]),
    Math.min(5_000, READY_TIMEOUT_MS),
  );
  try {
    await page.waitForFunction(
      (expectedSignature) => {
        const root = document.querySelector(".site-shell");
        return (
          Number(root?.dataset.portionAnchorCount ?? 0) === 8 &&
          root?.dataset.portionAnchors === expectedSignature
        );
      },
      EXPECTED_ANCHOR_SIGNATURE,
      { timeout: Math.min(20_000, READY_TIMEOUT_MS) },
    );
  } catch (error) {
    const state = await readPageState(page);
    throw new Error(
      `Mobile portion hook did not expose the exact eight named anchors: ${JSON.stringify({
        expected: EXPECTED_ANCHORS,
        root: state.root,
        preloader: state.preloader,
        error: error.message,
      })}`,
    );
  }
  await page.waitForTimeout(300);
  return readPageState(page);
};

const navigateReady = async (page, caseId, phase, hash = "") => {
  const url = targetUrl(caseId, phase, hash);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS });
  const state = await waitForReady(page);
  return { url, state };
};

const resetProbe = async (page, y = 0) => {
  await page.evaluate((targetY) => {
    dispatchEvent(new CustomEvent("tasc:scroll-position-applied"));
    scrollTo({ top: targetY, left: 0, behavior: "auto" });
  }, y);
  await waitForScrollQuiet(page, 160, 2_000);
  await page.evaluate(() => window.__tascMobilePortionQa?.reset?.());
  return readPageState(page);
};

let touchSequence = 0;

const dispatchChromiumTouchSwipe = async (
  cdp,
  page,
  direction,
  { magnitude = 96, steps = 2, stepDelayMs = 8 } = {},
) => {
  const viewport = page.viewportSize() ?? { width: 390, height: 844 };
  const x = Math.max(18, Math.round(viewport.width * 0.08));
  const startY = direction > 0 ? Math.round(viewport.height * 0.72) : Math.round(viewport.height * 0.28);
  const endY = startY - direction * Math.min(Math.round(viewport.height * 0.35), magnitude);
  const id = ++touchSequence;
  const startedAt = Date.now();
  let ended = false;
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: startY, radiusX: 8, radiusY: 8, force: 0.8, id }],
    });
    for (let index = 1; index <= steps; index += 1) {
      const y = Math.round(startY + ((endY - startY) * index) / steps);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 0.8, id }],
      });
      if (stepDelayMs > 0) await page.waitForTimeout(stepDelayMs);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    ended = true;
  } finally {
    if (!ended) {
      await cdp
        .send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] })
        .catch(() => {});
    }
  }
  return {
    adapter: "chromium-cdp-dispatchTouchEvent",
    trusted: true,
    magnitude,
    steps,
    stepDelayMs,
    elapsedMs: Date.now() - startedAt,
  };
};

const dispatchChromiumTouchBurst = async (
  cdp,
  page,
  directions,
  { magnitude = 96, betweenGesturesMs = 0 } = {},
) => {
  const viewport = page.viewportSize() ?? { width: 390, height: 844 };
  const x = Math.max(18, Math.round(viewport.width * 0.08));
  const startedAt = Date.now();
  const adapters = [];
  const commandBatches = [];
  for (const [directionIndex, direction] of directions.entries()) {
    const startY =
      direction > 0 ? Math.round(viewport.height * 0.72) : Math.round(viewport.height * 0.28);
    const endY = startY - direction * Math.min(Math.round(viewport.height * 0.35), magnitude);
    const id = ++touchSequence;
    const dispatchOffsetMs = Date.now() - startedAt;
    commandBatches.push(
      Promise.all([
        cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y: startY, radiusX: 8, radiusY: 8, force: 0.8, id }],
        }),
        cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: endY, radiusX: 8, radiusY: 8, force: 0.8, id }],
        }),
        cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }),
      ]),
    );
    adapters.push({
      adapter: "chromium-cdp-sequential-dispatchTouchEvent-burst",
      trusted: true,
      direction,
      magnitude,
      steps: 1,
      stepDelayMs: 0,
      configuredGapMs: betweenGesturesMs,
      dispatchOffsetMs,
    });
    if (betweenGesturesMs > 0 && directionIndex < directions.length - 1) {
      await delay(betweenGesturesMs);
    }
  }
  await Promise.all(commandBatches);
  const elapsedMs = Date.now() - startedAt;
  return adapters.map((adapter) => ({ ...adapter, elapsedMs }));
};

const dispatchSyntheticTouchSwipe = async (
  page,
  direction,
  { magnitude = 96, steps = 2, stepDelayMs = 8 } = {},
) =>
  page.evaluate(
    async ({ sign, distance, stepCount, delayMs, identifier }) => {
      const x = Math.max(18, Math.round(innerWidth * 0.08));
      const startY = sign > 0 ? Math.round(innerHeight * 0.72) : Math.round(innerHeight * 0.28);
      const endY = startY - sign * Math.min(Math.round(innerHeight * 0.35), distance);
      const hit = document.elementFromPoint(x, startY);
      const target =
        hit instanceof Element && !hit.closest("input,textarea,select,[contenteditable='true']")
          ? hit
          : document.querySelector(".site-shell") ?? document.body;
      const startedAt = performance.now();
      const events = [];

      const makeTouch = (y) => {
        try {
          return new Touch({
            identifier,
            target,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            pageX: x,
            pageY: y + scrollY,
            radiusX: 8,
            radiusY: 8,
            rotationAngle: 0,
            force: 0.8,
          });
        } catch {
          return {
            identifier,
            target,
            clientX: x,
            clientY: y,
            pageX: x,
            pageY: y + scrollY,
          };
        }
      };

      const dispatch = (type, y, ending = false) => {
        const touch = makeTouch(y);
        let event;
        try {
          event = new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            touches: ending ? [] : [touch],
            targetTouches: ending ? [] : [touch],
            changedTouches: [touch],
          });
        } catch {
          event = new Event(type, { bubbles: true, cancelable: true, composed: true });
          Object.defineProperties(event, {
            touches: { value: ending ? [] : [touch] },
            targetTouches: { value: ending ? [] : [touch] },
            changedTouches: { value: [touch] },
          });
        }
        const allowed = target.dispatchEvent(event);
        const record = { type, allowed, defaultPrevented: event.defaultPrevented };
        events.push(record);
        return record;
      };

      dispatch("touchstart", startY);
      let previousY = startY;
      for (let index = 1; index <= stepCount; index += 1) {
        const y = Math.round(startY + ((endY - startY) * index) / stepCount);
        const move = dispatch("touchmove", y);
        const deltaY = previousY - y;
        if (move.allowed && !move.defaultPrevented) scrollBy({ top: deltaY, left: 0, behavior: "auto" });
        previousY = y;
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      dispatch("touchend", endY, true);
      return {
        adapter: "webkit-synthetic-dom-touch-with-cancel-aware-scroll-fallback",
        trusted: false,
        limitation: "Synthetic DOM TouchEvent is not physical iOS Safari input or momentum.",
        magnitude: distance,
        steps: stepCount,
        stepDelayMs: delayMs,
        elapsedMs: performance.now() - startedAt,
        canceledMoves: events.filter((event) => event.type === "touchmove" && event.defaultPrevented).length,
        events,
      };
    },
    {
      sign: direction,
      distance: magnitude,
      stepCount: steps,
      delayMs: stepDelayMs,
      identifier: ++touchSequence,
    },
  );

const sendSwipe = async (session, direction, options) =>
  session.cdp
    ? dispatchChromiumTouchSwipe(session.cdp, session.page, direction, options)
    : dispatchSyntheticTouchSwipe(session.page, direction, options);

const sendSwipeBurst = async (session, directions, { betweenGesturesMs = 0 } = {}) => {
  if (session.cdp) {
    return dispatchChromiumTouchBurst(session.cdp, session.page, directions, {
      betweenGesturesMs,
    });
  }
  const adapters = [];
  const startedAt = Date.now();
  for (const direction of directions) {
    const dispatchOffsetMs = Date.now() - startedAt;
    const adapter = await dispatchSyntheticTouchSwipe(session.page, direction, {
        magnitude: 96,
        steps: 1,
        stepDelayMs: 0,
      });
    adapters.push({ ...adapter, configuredGapMs: betweenGesturesMs, dispatchOffsetMs });
    if (betweenGesturesMs > 0 && adapters.length < directions.length) {
      await delay(betweenGesturesMs);
    }
  }
  return adapters;
};

const waitForPortionTerminal = async (page, expectedStartCount) => {
  let eventSettled = true;
  let error = null;
  try {
    await page.waitForFunction(
      (count) => {
        const root = document.querySelector(".site-shell");
        const events = window.__tascMobilePortionQa?.events ?? [];
        const starts = events.filter((event) => event.type === "tasc:portion-start");
        const terminals = events.filter(
          (event) =>
            event.type === "tasc:portion-settled" || event.type === "tasc:portion-interrupted",
        );
        const settled = terminals.filter((event) => event.type === "tasc:portion-settled");
        return (
          starts.length >= count &&
          terminals.length >= count &&
          settled.length >= 1 &&
          !root?.dataset.portionedScroll
        );
      },
      expectedStartCount,
      { timeout: PORTION_TIMEOUT_MS },
    );
  } catch (caught) {
    eventSettled = false;
    error = caught.message;
  }
  const quiet = await waitForScrollQuiet(page, 180, PORTION_TIMEOUT_MS);
  return { settled: eventSettled && quiet.settled, eventSettled, quiet, error };
};

const portionEvents = (state, type) => state.events.filter((event) => event.type === type);

const anchorNamesFrom = (root) =>
  String(root?.portionAnchors ?? "")
    .split("|")
    .filter(Boolean);

const hasExactAnchorNames = (root) =>
  hasExactEntries(anchorNamesFrom(root), EXPECTED_ANCHORS) &&
  anchorNamesFrom(root).every((anchor, index) => anchor === EXPECTED_ANCHORS[index]);

const terminalMatchesStart = (terminal, start) =>
  Boolean(
    terminal &&
      start &&
      Number.isFinite(Number(terminal.detail.index)) &&
      Number.isFinite(Number(terminal.detail.targetY)) &&
      Number(terminal.detail.index) === Number(start.detail.index) &&
      Math.abs(Number(terminal.detail.targetY) - Number(start.detail.targetY)) <= 0.5,
  );

const hasExactPortionEventTypes = (events, expectedTypes) => {
  const observed = events.map((event) => event.type);
  return (
    observed.length === expectedTypes.length &&
    expectedTypes.every((type, index) => observed[index] === type)
  );
};

const boundarySample = (event, label) =>
  event && Number.isFinite(event.t) && Number.isFinite(event.y)
    ? { t: event.t, y: event.y, source: "boundary", label }
    : null;

const rawSamples = (samples, source) =>
  samples
    .filter((sample) => Number.isFinite(sample.t) && Number.isFinite(sample.y))
    .map((sample) => ({ t: sample.t, y: sample.y, source }))
    .sort((left, right) => left.t - right.t);

const framesBetween = (frames, startTimestamp, endTimestamp) =>
  rawSamples(frames, "raf").filter(
    (sample) => sample.t > startTimestamp && sample.t < endTimestamp,
  );

const analyzeDirectionalTrace = (
  frameSamples,
  direction,
  { startBoundary = null, endBoundary = null } = {},
) => {
  const rawFrameSamples = rawSamples(frameSamples, "raf");
  const samples = [startBoundary, ...rawFrameSamples, endBoundary].filter(Boolean);
  const deltas = [];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    deltas.push({
      from: previous,
      to: current,
      dt: current.t - previous.t,
      dy: current.y - previous.y,
    });
  }
  const violations = deltas.filter(
    (entry) => direction * entry.dy < -MONOTONIC_TOLERANCE_PX,
  );
  const frameGaps = [];
  for (let index = 1; index < rawFrameSamples.length; index += 1) {
    frameGaps.push({
      from: rawFrameSamples[index - 1],
      to: rawFrameSamples[index],
      dt: rawFrameSamples[index].t - rawFrameSamples[index - 1].t,
    });
  }
  const worstJumpDelta = deltas.reduce(
    (worst, entry) => (!worst || Math.abs(entry.dy) > Math.abs(worst.dy) ? entry : worst),
    null,
  );
  const maxGapDelta = frameGaps.reduce(
    (worst, entry) => (entry.dt > (worst?.dt ?? -1) ? entry : worst),
    null,
  );
  const movementPx = samples.length
    ? direction > 0
      ? Math.max(...samples.map((entry) => entry.y)) - samples[0].y
      : samples[0].y - Math.min(...samples.map((entry) => entry.y))
    : 0;
  return {
    direction,
    rawFrameSamples,
    samples,
    frameSampleCount: rawFrameSamples.length,
    frameCoverageSufficient: rawFrameSamples.length >= 2,
    sampleCount: samples.length,
    deltaCount: deltas.length,
    movementPx: round(movementPx),
    movementObserved: movementPx >= MOVEMENT_OBSERVED_PX,
    maxJumpPx: round(Math.abs(worstJumpDelta?.dy ?? 0)),
    worstJump: worstJumpDelta
      ? {
          px: round(Math.abs(worstJumpDelta.dy)),
          signedDeltaPx: round(worstJumpDelta.dy),
          from: worstJumpDelta.from,
          to: worstJumpDelta.to,
        }
      : null,
    maxFrameGapMs: round(maxGapDelta?.dt ?? 0),
    maxFrameGap: maxGapDelta
      ? {
          ms: round(maxGapDelta.dt),
          from: maxGapDelta.from,
          to: maxGapDelta.to,
        }
      : null,
    monotonic: violations.length === 0,
    violations,
  };
};

const traceBetweenEvents = (state, direction, startEvent, endEvent, labels) => {
  const start = boundarySample(startEvent, labels.start);
  const end = boundarySample(endEvent, labels.end);
  const frames = start && end ? framesBetween(state.frames, start.t, end.t) : [];
  return analyzeDirectionalTrace(frames, direction, {
    startBoundary: start,
    endBoundary: end,
  });
};

const declaredMotionContract = (root) => {
  const rawDuration = root?.portionDuration;
  const durationSeconds = rawDuration === null || rawDuration === undefined || rawDuration === ""
    ? Number.NaN
    : Number(rawDuration);
  return {
    durationMs: Number.isFinite(durationSeconds) ? round(durationSeconds * 1000) : null,
    ease: root?.portionEase ?? null,
  };
};

const terminalTiming = (root, firstStart, finalStart, terminalEvent) => {
  const declared = declaredMotionContract(root);
  const actualTerminalElapsedMs = finalStart && terminalEvent
    ? round(terminalEvent.t - finalStart.t)
    : null;
  const minimumMs = Number.isFinite(declared.durationMs)
    ? Math.max(0, declared.durationMs - TERMINAL_EARLY_TOLERANCE_MS)
    : null;
  const maximumMs = Number.isFinite(declared.durationMs)
    ? declared.durationMs + TERMINAL_LATE_GRACE_MS
    : null;
  return {
    declared,
    actualTerminalElapsedMs,
    scenarioElapsedMs:
      firstStart && terminalEvent ? round(terminalEvent.t - firstStart.t) : null,
    acceptableTerminalElapsedMs: { minimumMs, maximumMs },
    withinDeclaredTolerance:
      Number.isFinite(actualTerminalElapsedMs) &&
      Number.isFinite(minimumMs) &&
      Number.isFinite(maximumMs) &&
      actualTerminalElapsedMs >= minimumMs &&
      actualTerminalElapsedMs <= maximumMs,
    terminalType: terminalEvent?.type ?? null,
  };
};

const maxAllowedJumpPx = (state) => state.viewport.visualHeight * MAX_JUMP_VIEWPORT_RATIO;

const hasOrderedInputSequence = (inputs, count) =>
  inputs.length === count &&
  inputs.every(
    (input, index) =>
      input.startCount === index && input.terminalCount === Math.max(0, index - 1),
  );

const startGapsMs = (starts) =>
  starts.slice(1).map((start, index) => round(start.t - starts[index].t));

const dispatchGapsMs = (adapters) =>
  adapters
    .slice(1)
    .map((adapter, index) => round(adapter.dispatchOffsetMs - adapters[index].dispatchOffsetMs));

const settleError = (state, startEvent) =>
  Number.isFinite(Number(startEvent?.detail?.targetY))
    ? Math.abs(state.y - Number(startEvent.detail.targetY))
    : Number.POSITIVE_INFINITY;

const runSingleSwipe = async (session, caseResult) => {
  const initial = await resetProbe(session.page, 0);
  const adapter = await sendSwipe(session, 1);
  const terminal = await waitForPortionTerminal(session.page, 1);
  const state = await readPageState(session.page);
  const starts = portionEvents(state, "tasc:portion-start");
  const settled = portionEvents(state, "tasc:portion-settled");
  const interrupted = portionEvents(state, "tasc:portion-interrupted");
  const start = starts[0] ?? null;
  const terminalEvent = settled[0] ?? null;
  const errorPx = settleError(state, start);
  const trace = traceBetweenEvents(state, 1, start, terminalEvent, {
    start: "single-start",
    end: "single-settled",
  });
  const jumpLimitPx = maxAllowedJumpPx(state);
  const adjacent = Boolean(
    start &&
      Number(start.detail.direction) === 1 &&
      Number.isFinite(Number(start.detail.fromIndex)) &&
      Number.isFinite(Number(start.detail.index)) &&
      Number.isFinite(Number(start.detail.targetY)) &&
      Number(start.detail.fromIndex) === 0 &&
      Number(start.detail.index) === 1,
  );

  const result = {
    initialY: initial.y,
    adapter,
    terminal,
    events: state.events,
    scrollEvents: rawSamples(state.scrollEvents, "scroll"),
    finalY: state.y,
    targetY: Number(start?.detail?.targetY),
    errorPx: round(errorPx),
    timing: terminalTiming(initial.root, start, start, terminalEvent),
    maxAllowedJumpPx: round(jumpLimitPx),
    trace,
  };
  addCheck(
    caseResult,
    Math.abs(initial.y) <= SETTLE_TOLERANCE_PX,
    "single: probe resets to the top anchor before input",
    result,
  );
  addCheck(caseResult, starts.length === 1, "single: exactly one target selection is emitted", result);
  addCheck(caseResult, adjacent, "single: swipe selects one adjacent numeric anchor", result);
  addCheck(
    caseResult,
    terminal.settled &&
      settled.length === 1 &&
      interrupted.length === 0 &&
      terminalMatchesStart(settled[0], start) &&
      hasExactPortionEventTypes(state.events, ["tasc:portion-start", "tasc:portion-settled"]),
    "single: selected target emits one matching settled terminal event",
    result,
  );
  addCheck(
    caseResult,
    errorPx <= SETTLE_TOLERANCE_PX,
    "single: final scroll settles within 8 px of the selected anchor",
    result,
  );
  addCheck(
    caseResult,
    result.timing.withinDeclaredTolerance,
    "single: actual terminal elapsed stays within declared-duration tolerance",
    result,
  );
  addCheck(caseResult, trace.frameCoverageSufficient, "single: at least two rAF frames are sampled", result);
  addCheck(caseResult, trace.monotonic, "single: motion is monotonic in swipe direction", result);
  addCheck(caseResult, trace.movementObserved, "single: directional movement is observed", result);
  addCheck(
    caseResult,
    trace.maxJumpPx <= jumpLimitPx,
    "single: no rAF-sampled jump exceeds 0.95 visual viewport",
    result,
  );
  caseResult.portioned.single = result;
};

const runSameDirectionTwoSwipe = async (session, caseResult) => {
  await navigateReady(session.page, caseResult.id, "same-direction");
  const initial = await resetProbe(session.page, 0);
  const adapters = await sendSwipeBurst(session, [1, 1], {
    betweenGesturesMs: RAPID_GESTURE_GAP_MS,
  });
  const terminal = await waitForPortionTerminal(session.page, 2);
  const state = await readPageState(session.page);
  const starts = portionEvents(state, "tasc:portion-start");
  const settled = portionEvents(state, "tasc:portion-settled");
  const interrupted = portionEvents(state, "tasc:portion-interrupted");
  const first = starts[0] ?? null;
  const second = starts[1] ?? null;
  const terminalEvent = settled[0] ?? null;
  const errorPx = settleError(state, second);
  const trace = traceBetweenEvents(state, 1, first, terminalEvent, {
    start: "same-direction-first-start",
    end: "same-direction-settled",
  });
  const jumpLimitPx = maxAllowedJumpPx(state);
  const gapMs = first && second ? second.t - first.t : Number.POSITIVE_INFINITY;
  const hostGestureGapsMs = dispatchGapsMs(adapters);
  const consecutive = Boolean(
    first &&
      second &&
      Number(first.detail.direction) === 1 &&
      Number(first.detail.fromIndex) === 0 &&
      Number(first.detail.index) === 1 &&
      Number(second.detail.direction) === 1 &&
      Number(second.detail.fromIndex) === 1 &&
      Number(second.detail.index) === 2,
  );
  const lifecycleMatches = Boolean(
    interrupted.length === 1 &&
      settled.length === 1 &&
      terminalMatchesStart(interrupted[0], first) &&
      terminalMatchesStart(terminalEvent, second) &&
      hasExactPortionEventTypes(state.events, [
        "tasc:portion-start",
        "tasc:portion-interrupted",
        "tasc:portion-start",
        "tasc:portion-settled",
      ]),
  );
  const result = {
    initialY: initial.y,
    configuredGapMs: RAPID_GESTURE_GAP_MS,
    actualStartGapMs: round(gapMs),
    hostGestureGapsMs,
    adapters,
    terminal,
    events: state.events,
    inputs: state.inputs,
    scrollEvents: rawSamples(state.scrollEvents, "scroll"),
    finalY: state.y,
    targetY: Number(second?.detail?.targetY),
    errorPx: round(errorPx),
    timing: terminalTiming(initial.root, first, second, terminalEvent),
    maxAllowedJumpPx: round(jumpLimitPx),
    trace,
  };
  addCheck(
    caseResult,
    Math.abs(initial.y) <= SETTLE_TOLERANCE_PX,
    "same-direction: probe starts from the top anchor",
    result,
  );
  addCheck(
    caseResult,
    starts.length === 2 && consecutive,
    "same-direction: two swipes select consecutive anchors 1 and 2",
    result,
  );
  addCheck(
    caseResult,
    hasOrderedInputSequence(state.inputs, 2) &&
      hostGestureGapsMs.length === 1 &&
      hostGestureGapsMs[0] >= RAPID_GESTURE_GAP_MS * 0.75,
    "same-direction: second gesture is a distinct 60 ms-gapped in-flight input",
    result,
  );
  addCheck(
    caseResult,
    terminal.settled && lifecycleMatches,
    "same-direction: first target interrupts and second target settles",
    result,
  );
  addCheck(
    caseResult,
    errorPx <= SETTLE_TOLERANCE_PX,
    "same-direction: second target settles within 8 px",
    result,
  );
  addCheck(
    caseResult,
    result.timing.withinDeclaredTolerance,
    "same-direction: final target terminal elapsed stays within declared-duration tolerance",
    result,
  );
  addCheck(
    caseResult,
    trace.frameCoverageSufficient,
    "same-direction: at least two rAF frames are sampled",
    result,
  );
  addCheck(caseResult, trace.monotonic, "same-direction: motion is monotonic", result);
  addCheck(caseResult, trace.movementObserved, "same-direction: movement is observed", result);
  addCheck(
    caseResult,
    trace.maxJumpPx <= jumpLimitPx,
    "same-direction: no rAF-sampled jump exceeds 0.95 visual viewport",
    result,
  );
  caseResult.portioned.sameDirectionTwo = result;
};

const runOppositeSwipe = async (session, caseResult) => {
  await navigateReady(session.page, caseResult.id, "opposite");
  const initial = await resetProbe(session.page, 0);
  const adapters = await sendSwipeBurst(session, [1, -1], { betweenGesturesMs: 60 });
  const terminal = await waitForPortionTerminal(session.page, 2);
  const state = await readPageState(session.page);
  const starts = portionEvents(state, "tasc:portion-start");
  const settled = portionEvents(state, "tasc:portion-settled");
  const interrupted = portionEvents(state, "tasc:portion-interrupted");
  const forward = starts[0] ?? null;
  const reverse = starts[1] ?? null;
  const terminalEvent = settled[0] ?? null;
  const secondTouchStart = state.inputs[1] ?? null;
  const sharedBoundary = boundarySample(reverse, "opposite-reverse-boundary");
  const forwardTrace = analyzeDirectionalTrace(
    forward && reverse ? framesBetween(state.frames, forward.t, reverse.t) : [],
    1,
    {
      startBoundary: boundarySample(forward, "opposite-forward-start"),
      endBoundary: sharedBoundary,
    },
  );
  const reverseTrace = analyzeDirectionalTrace(
    reverse && terminalEvent ? framesBetween(state.frames, reverse.t, terminalEvent.t) : [],
    -1,
    {
      startBoundary: sharedBoundary,
      endBoundary: boundarySample(terminalEvent, "opposite-settled"),
    },
  );
  const maxJumpPx = Math.max(forwardTrace.maxJumpPx ?? 0, reverseTrace.maxJumpPx ?? 0);
  const jumpLimitPx = maxAllowedJumpPx(state);
  const errorPx = settleError(state, reverse);
  const reversesToOrigin = Boolean(
    forward &&
      reverse &&
      Number(forward.detail.direction) === 1 &&
      Number(reverse.detail.direction) === -1 &&
      Number(reverse.detail.fromIndex) === Number(forward.detail.index) &&
      Number(reverse.detail.index) === Number(forward.detail.fromIndex),
  );
  const reverseIssuedWithinPortion = Boolean(
    forward && reverse && reverse.t - forward.t >= 0 && reverse.t - forward.t < PORTION_DURATION_MS,
  );
  const observedInFlight = Boolean(
    secondTouchStart &&
      secondTouchStart.startCount === 1 &&
      secondTouchStart.terminalCount === 0 &&
      secondTouchStart.root?.portionedScroll,
  );
  const lifecycleMatches = Boolean(
    interrupted.length === 1 &&
      settled.length === 1 &&
      terminalMatchesStart(interrupted[0], forward) &&
      terminalMatchesStart(terminalEvent, reverse) &&
      hasExactPortionEventTypes(state.events, [
        "tasc:portion-start",
        "tasc:portion-interrupted",
        "tasc:portion-start",
        "tasc:portion-settled",
      ]),
  );

  const result = {
    initialY: initial.y,
    configuredGapMs: RAPID_GESTURE_GAP_MS,
    actualStartGapMs: forward && reverse ? round(reverse.t - forward.t) : null,
    observedInFlight,
    secondTouchStart,
    adapters,
    terminal,
    events: state.events,
    inputs: state.inputs,
    scrollEvents: rawSamples(state.scrollEvents, "scroll"),
    finalY: state.y,
    targetY: Number(reverse?.detail?.targetY),
    errorPx: round(errorPx),
    boundarySample: sharedBoundary,
    timing: terminalTiming(initial.root, forward, reverse, terminalEvent),
    forwardTrace,
    reverseTrace,
    maxJumpPx,
    maxAllowedJumpPx: round(jumpLimitPx),
  };
  addCheck(caseResult, starts.length === 2, "opposite: exactly two target selections are emitted", result);
  addCheck(caseResult, reversesToOrigin, "opposite: second gesture reverses to the prior anchor", result);
  addCheck(
    caseResult,
    observedInFlight && reverseIssuedWithinPortion,
    "opposite: reversal is issued while the first target is still active",
    result,
  );
  addCheck(
    caseResult,
    terminal.settled && lifecycleMatches,
    "opposite: first target emits matching interrupted and reverse emits matching settled",
    result,
  );
  addCheck(
    caseResult,
    errorPx <= SETTLE_TOLERANCE_PX,
    "opposite: reversed scroll settles within 8 px of the origin anchor",
    result,
  );
  addCheck(
    caseResult,
    result.timing.withinDeclaredTolerance,
    "opposite: reverse target terminal elapsed stays within declared-duration tolerance",
    result,
  );
  addCheck(
    caseResult,
    forwardTrace.frameSampleCount + reverseTrace.frameSampleCount >= 2,
    "opposite: combined in-flight reversal contains at least two rAF frames",
    result,
  );
  addCheck(
    caseResult,
    forwardTrace.monotonic && reverseTrace.monotonic,
    "opposite: motion is monotonic within each directional phase",
    result,
  );
  addCheck(
    caseResult,
    maxJumpPx <= jumpLimitPx,
    "opposite: no rAF-sampled jump exceeds 0.95 visual viewport",
    result,
  );
  caseResult.portioned.opposite = result;
};

const runFiveSwipeScenario = async (
  session,
  caseResult,
  { key, label, betweenGesturesMs },
) => {
  await navigateReady(session.page, caseResult.id, key);
  const initial = await resetProbe(session.page, 0);
  const hostStartedAt = Date.now();
  const adapters = await sendSwipeBurst(
    session,
    Array.from({ length: RAPID_SWIPE_COUNT }, () => 1),
    { betweenGesturesMs },
  );
  const hostDispatchMs = Date.now() - hostStartedAt;
  const terminal = await waitForPortionTerminal(session.page, RAPID_SWIPE_COUNT);
  const state = await readPageState(session.page);
  const starts = portionEvents(state, "tasc:portion-start");
  const settled = portionEvents(state, "tasc:portion-settled");
  const interrupted = portionEvents(state, "tasc:portion-interrupted");
  const first = starts[0] ?? null;
  const final = starts.at(-1) ?? null;
  const terminalEvent = settled[0] ?? null;
  const baseIndex = Number(first?.detail?.fromIndex);
  const expectedIndices = Number.isFinite(baseIndex)
    ? Array.from({ length: RAPID_SWIPE_COUNT }, (_, index) => baseIndex + index + 1)
    : [];
  const observedIndices = starts.map((event) => Number(event.detail.index));
  const observedFromIndices = starts.map((event) => Number(event.detail.fromIndex));
  const consecutive =
    starts.length === RAPID_SWIPE_COUNT &&
    starts.every((event) => Number(event.detail.direction) === 1) &&
    expectedIndices.every((value, index) => observedIndices[index] === value) &&
    starts.every((event, index) =>
      index === 0
        ? Number(event.detail.fromIndex) === baseIndex
        : Number(event.detail.fromIndex) === observedIndices[index - 1],
    );
  const burstDurationMs = starts.length >= 2 ? starts.at(-1).t - starts[0].t : Number.POSITIVE_INFINITY;
  const observedStartGapsMs = startGapsMs(starts);
  const hostGestureGapsMs = dispatchGapsMs(adapters);
  const errorPx = settleError(state, final);
  const trace = traceBetweenEvents(state, 1, first, terminalEvent, {
    start: `${key}-first-start`,
    end: `${key}-settled`,
  });
  const jumpLimitPx = maxAllowedJumpPx(state);
  const inputSequenceMatches = hasOrderedInputSequence(state.inputs, RAPID_SWIPE_COUNT);
  const lifecycleMatches = Boolean(
    interrupted.length === RAPID_SWIPE_COUNT - 1 &&
      settled.length === 1 &&
      starts
        .slice(0, -1)
        .every((start, index) => terminalMatchesStart(interrupted[index], start)) &&
      terminalMatchesStart(terminalEvent, final) &&
      hasExactPortionEventTypes(
        state.events,
        Array.from({ length: RAPID_SWIPE_COUNT }, (_, index) =>
          index === 0
            ? ["tasc:portion-start"]
            : ["tasc:portion-interrupted", "tasc:portion-start"],
        ).flat().concat("tasc:portion-settled"),
      ),
  );

  const result = {
    initialY: initial.y,
    configuredGapMs: betweenGesturesMs,
    adapters,
    terminal,
    events: state.events,
    inputs: state.inputs,
    scrollEvents: rawSamples(state.scrollEvents, "scroll"),
    hostDispatchMs,
    actualSelectionWindowMs: round(burstDurationMs),
    actualStartGapsMs: observedStartGapsMs,
    hostGestureGapsMs,
    expectedIndices,
    observedIndices,
    observedFromIndices,
    finalY: state.y,
    targetY: Number(final?.detail?.targetY),
    errorPx: round(errorPx),
    timing: terminalTiming(initial.root, first, final, terminalEvent),
    maxAllowedJumpPx: round(jumpLimitPx),
    trace,
  };
  addCheck(
    caseResult,
    Math.abs(initial.y) <= SETTLE_TOLERANCE_PX && baseIndex === 0,
    `${label}: probe starts from the top anchor`,
    result,
  );
  addCheck(
    caseResult,
    starts.length === RAPID_SWIPE_COUNT,
    `${label}: exactly five target selections are emitted`,
    result,
  );
  addCheck(
    caseResult,
    inputSequenceMatches,
    `${label}: five touch starts are observed in ordered in-flight sequence`,
    result,
  );
  addCheck(
    caseResult,
    adapters.every((adapter) => adapter.configuredGapMs === betweenGesturesMs) &&
      (betweenGesturesMs === 0 ||
        (hostGestureGapsMs.length === RAPID_SWIPE_COUNT - 1 &&
          hostGestureGapsMs.every((gap) => gap >= betweenGesturesMs * 0.75))),
    betweenGesturesMs === 0
      ? `${label}: adapter uses a true zero-delay retarget burst`
      : `${label}: four distinct gesture gaps preserve the configured 60 ms cadence`,
    result,
  );
  addCheck(
    caseResult,
    burstDurationMs < PORTION_DURATION_MS,
    `${label}: all five selections occur within one declared portion window`,
    result,
  );
  addCheck(
    caseResult,
    consecutive,
    `${label}: target indices advance through five consecutive boundaries without a skip`,
    result,
  );
  addCheck(
    caseResult,
    terminal.settled && lifecycleMatches,
    `${label}: four matching targets interrupt and the fifth matching target settles`,
    result,
  );
  addCheck(
    caseResult,
    errorPx <= SETTLE_TOLERANCE_PX,
    `${label}: final scroll settles within 8 px of the fifth target`,
    result,
  );
  addCheck(
    caseResult,
    result.timing.withinDeclaredTolerance,
    `${label}: final target terminal elapsed stays within declared-duration tolerance`,
    result,
  );
  addCheck(
    caseResult,
    trace.frameCoverageSufficient,
    `${label}: at least two rAF frames are sampled`,
    result,
  );
  addCheck(caseResult, trace.monotonic, `${label}: motion stays monotonic`, result);
  addCheck(caseResult, trace.movementObserved, `${label}: movement is observed`, result);
  addCheck(
    caseResult,
    trace.maxJumpPx <= jumpLimitPx,
    `${label}: no rAF-sampled jump exceeds 0.95 visual viewport`,
    result,
  );
  caseResult.portioned[key] = result;
};

const runRapidFive = (session, caseResult) =>
  runFiveSwipeScenario(session, caseResult, {
    key: "rapidFive",
    label: "rapid-five",
    betweenGesturesMs: RAPID_GESTURE_GAP_MS,
  });

const runZeroDelayRetargetStress = (session, caseResult) =>
  runFiveSwipeScenario(session, caseResult, {
    key: "zeroDelayRetargetStress",
    label: "retarget-stress",
    betweenGesturesMs: 0,
  });

const waitForStoryOwner = async (page, storyName) =>
  page
    .waitForFunction(
      (name) => {
        const root = document.querySelector(".site-shell");
        if (!(root instanceof HTMLElement)) return false;
        if (name === "services") {
          return root.dataset.servicesPinned === "true" && !root.dataset.programmaticAnchor;
        }
        if (name === "how") {
          return (
            (root.dataset.howWorkInputOwner === "true" || root.dataset.howWorkPinned === "true") &&
            !root.dataset.programmaticAnchor
          );
        }
        return (
          !root.dataset.programmaticAnchor &&
          (root.dataset.dominoPinned === "true" ||
            [
              "forward",
              "reverse",
              "waiting-media",
              "waiting-seek",
              "waiting-play",
              "waiting-frame",
            ].includes(root.dataset.dominoPlayback ?? ""))
        );
      },
      storyName,
      { timeout: 8_000 },
    )
    .then(() => true)
    .catch(() => false);

const runStoryProbe = async (session, caseResult, story) => {
  const navigation = await navigateReady(
    session.page,
    caseResult.id,
    `story-${story.name}`,
    story.hash,
  );
  const sectionFound = Boolean(navigation.state.sections[story.name]);
  const ownerObserved = sectionFound ? await waitForStoryOwner(session.page, story.name) : false;
  await session.page.evaluate(() => window.__tascMobilePortionQa?.reset?.());
  const before = await readPageState(session.page);
  const adapter = await sendSwipe(session, 1, { magnitude: 96, steps: 2, stepDelayMs: 8 });
  await session.page.waitForTimeout(420);
  const after = await readPageState(session.page);
  const startEvents = portionEvents(after, "tasc:portion-start");
  const reachable = ownerObserved || story.owns(before.root) || story.owns(after.root);
  const result = {
    navigation,
    hash: story.hash,
    sectionFound,
    ownerObserved,
    before: { y: before.y, root: before.root, section: before.sections[story.name] },
    after: { y: after.y, root: after.root, section: after.sections[story.name] },
    adapter,
    portionEvents: after.events,
  };
  addCheck(caseResult, sectionFound && reachable, `story: ${story.name} input owner is reachable`, result);
  addCheck(
    caseResult,
    startEvents.length === 0,
    `story: global portion scroll yields the gesture to ${story.name}`,
    result,
  );
  caseResult.stories[story.name] = result;
};

const runCase = async (engineName, profileName) => {
  const engine = ENGINES[engineName];
  const profile = PROFILES[profileName];
  const id = `${engineName}-${profileName}`;
  const caseResult = {
    schemaVersion: 1,
    id,
    startedAt: new Date().toISOString(),
    configuration: {
      engine: engineName,
      profile: profileName,
      viewport: profile,
      baseUrl: BASE_URL,
      input: engine.trustedTouch
        ? {
            adapter: "Chromium CDP Input.dispatchTouchEvent",
            trusted: true,
          }
        : {
            adapter: "Synthetic DOM TouchEvent with cancel-aware scroll fallback",
            trusted: false,
            limitation: "Not physical iOS Safari input, hardware scrolling, or momentum.",
          },
    },
    checks: [],
    failures: [],
    diagnostics: { consoleErrors: [], pageErrors: [] },
    portioned: {},
    stories: {},
  };

  let browser;
  let context;
  try {
    browser = await engine.browserType.launch({ headless: !HEADED });
    caseResult.configuration.browserVersion = browser.version();
    context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.deviceScaleFactor,
      isMobile: true,
      hasTouch: true,
      colorScheme: "dark",
      reducedMotion: "no-preference",
      locale: "en-US",
      timezoneId: "America/Chicago",
      serviceWorkers: "block",
      userAgent: userAgentFor(engineName),
    });
    await installInstrumentation(context);
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error" && !ignoredConsoleMessage(message.text())) {
        caseResult.diagnostics.consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => caseResult.diagnostics.pageErrors.push(error.message));
    const cdp = engine.trustedTouch ? await context.newCDPSession(page) : null;
    const session = { page, context, cdp, engineName, profileName };

    const navigation = await navigateReady(page, id, "portioned");
    caseResult.navigation = navigation;
    caseResult.motionContract = declaredMotionContract(navigation.state.root);
    addCheck(caseResult, navigation.state.coarsePointer, "environment: compact coarse-pointer mode is active", {
      state: navigation.state,
    });
    addCheck(
      caseResult,
      Number(navigation.state.root?.portionAnchorCount ?? 0) === EXPECTED_ANCHORS.length &&
        hasExactAnchorNames(navigation.state.root),
      "environment: exact named anchors are hero, clients, services, how, datum, process, domino, footer",
      { expected: EXPECTED_ANCHORS, root: navigation.state.root },
    );
    addCheck(
      caseResult,
      caseResult.motionContract.durationMs === PORTION_DURATION_MS &&
        caseResult.motionContract.ease === "power2.out",
      "environment: declared portion motion is 420 ms with power2.out easing",
      { declared: caseResult.motionContract },
    );

    await runSingleSwipe(session, caseResult);
    await runSameDirectionTwoSwipe(session, caseResult);
    await runOppositeSwipe(session, caseResult);
    await runRapidFive(session, caseResult);
    await runZeroDelayRetargetStress(session, caseResult);
    for (const story of STORY_PROBES) await runStoryProbe(session, caseResult, story);

    addCheck(
      caseResult,
      caseResult.diagnostics.pageErrors.length === 0 && caseResult.diagnostics.consoleErrors.length === 0,
      "runtime: no page or actionable console errors",
      caseResult.diagnostics,
    );
    await cdp?.detach().catch(() => {});
  } catch (error) {
    addCheck(caseResult, false, "harness: case completes without exception", {
      error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    });
  } finally {
    caseResult.completedAt = new Date().toISOString();
    caseResult.passed = caseResult.failures.length === 0;
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
  return caseResult;
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    script: path.relative(ROOT, import.meta.filename).replaceAll("\\", "/"),
    baseUrl: BASE_URL,
    output: requestedOutput,
  },
  sourceIdentity,
  servedBuildIdentity,
  environment: {
    node: process.version,
    operatingSystem: `${os.platform()} ${os.release()}`,
    headed: HEADED,
    physicalSafariBoundary:
      "Playwright WebKit on Windows uses synthetic DOM touch in this harness and is not physical iOS Safari acceptance.",
  },
  contract: {
    settleTolerancePx: SETTLE_TOLERANCE_PX,
    monotonicTolerancePx: MONOTONIC_TOLERANCE_PX,
    rapidSwipeCount: RAPID_SWIPE_COUNT,
    realisticGestureGapMs: RAPID_GESTURE_GAP_MS,
    zeroDelayRetargetStressGapMs: 0,
    declaredDurationMs: PORTION_DURATION_MS,
    declaredEase: "power2.out",
    terminalEarlyToleranceMs: TERMINAL_EARLY_TOLERANCE_MS,
    terminalLateGraceMs: TERMINAL_LATE_GRACE_MS,
    expectedAnchors: EXPECTED_ANCHORS,
    maximumSampledJumpViewportRatio: MAX_JUMP_VIEWPORT_RATIO,
    frameSampling: "requestAnimationFrame only; scroll events are recorded separately",
    events: ["tasc:portion-start", "tasc:portion-settled", "tasc:portion-interrupted"],
  },
  matrix: {
    engines: selectedEngines,
    profiles: selectedProfiles,
    caseCount: selectedEngines.length * selectedProfiles.length,
    partialAllowed: allowPartialMatrix,
  },
  summary: null,
  cases: [],
};

const writeReport = () => {
  report.summary = {
    caseCount: report.cases.length,
    passedCount: report.cases.filter((entry) => entry.passed).length,
    failedCount: report.cases.filter((entry) => !entry.passed).length,
    checkCount: report.cases.reduce((sum, entry) => sum + entry.checks.length, 0),
    failureCount: report.cases.reduce((sum, entry) => sum + entry.failures.length, 0),
    webkitSyntheticCases: report.cases.filter(
      (entry) => entry.configuration.engine === "webkit" && entry.configuration.input.trusted === false,
    ).length,
  };
  const temporaryPath = `${requestedOutput}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, requestedOutput);
};

for (const engineName of selectedEngines) {
  for (const profileName of selectedProfiles) {
    const id = `${engineName}-${profileName}`;
    console.log(`[T3] ${id}`);
    const result = await runCase(engineName, profileName);
    report.cases.push(result);
    writeReport();
    console.log(
      JSON.stringify({
        id,
        passed: result.passed,
        checkCount: result.checks.length,
        failures: result.failures,
      }),
    );
  }
}

writeReport();
console.log(
  JSON.stringify(
    {
      output: requestedOutput,
      ...report.summary,
    },
    null,
    2,
  ),
);

if (report.summary.failedCount > 0) process.exitCode = 1;
