import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium, webkit } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const INPUT_EVENTS = [
  "wheel",
  "touchstart",
  "touchmove",
  "touchend",
  "touchcancel",
  "keydown",
  "scroll",
];
const EXPECTED_STORIES = ["services", "how", "domino", "portion"];
const STORY_TIMEOUT_MS = 18_000;
const READY_TIMEOUT_MS = 45_000;
const WATCHDOG_TIMEOUT_MS = 5_500;
const MAX_SCROLL_JUMP_VIEWPORT_RATIO = 0.95;

const parseArguments = (values) => {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const separator = value.indexOf("=");
    if (separator >= 0) {
      parsed[value.slice(2, separator)] = value.slice(separator + 1);
      continue;
    }
    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[value.slice(2)] = next;
      index += 1;
    } else {
      parsed[value.slice(2)] = true;
    }
  }
  return parsed;
};

const args = parseArguments(process.argv.slice(2));
const requestedUrl = typeof args.url === "string"
  ? new URL(args.url).toString()
  : process.env.TASC_QA_BASE_URL
    ? new URL(process.env.TASC_QA_BASE_URL).toString()
    : null;
const headed = args.headed === true;
const outputPath = typeof args.output === "string" ? path.resolve(ROOT, args.output) : null;
const staticOnly = args.static === true;
const requestedEngines = typeof args.engines === "string"
  ? new Set(args.engines.split(",").map((value) => value.trim()).filter(Boolean))
  : null;

if (!requestedUrl && !staticOnly) {
  throw new Error(
    "T7 browser QA requires --url=http://127.0.0.1:<port>/ or TASC_QA_BASE_URL. Use pnpm qa:t7:static for the explicit static-only gate.",
  );
}

const relativePath = (absolutePath) =>
  path.relative(ROOT, absolutePath).replaceAll(path.sep, "/");

const readSourceTree = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return readSourceTree(absolutePath);
    return /\.(?:ts|tsx|js|jsx)$/.test(entry.name)
      ? [{
          absolutePath,
          path: relativePath(absolutePath),
          source: readFileSync(absolutePath, "utf8"),
        }]
      : [];
  });

const sourceFiles = readSourceTree(path.join(ROOT, "src"));
const sourceByPath = new Map(sourceFiles.map((file) => [file.path, file.source]));

const requiredSource = (relative) => {
  const source = sourceByPath.get(relative);
  if (source === undefined) throw new Error(`Missing source file: ${relative}`);
  return source;
};

const busSource = requiredSource("src/lib/motion-input-bus.ts");
const connectionSource = requiredSource("src/lib/connection-profile.ts");
const layoutSource = requiredSource("src/app/layout.tsx");
const landingSource = requiredSource("src/components/TascLanding.tsx");
const reversibleSource = requiredSource("src/hooks/useReversibleScrollStories.ts");
const portionSource = requiredSource("src/hooks/useMobilePortionedScroll.ts");

const ownerApplicationFiles = [
  { path: "src/components/TascLanding.tsx", source: landingSource },
  { path: "src/hooks/useReversibleScrollStories.ts", source: reversibleSource },
  { path: "src/hooks/useMobilePortionedScroll.ts", source: portionSource },
];
const ownerFiles = [
  { path: "src/lib/motion-input-bus.ts", source: busSource },
  ...ownerApplicationFiles,
];

const createCheckCollector = () => {
  const checks = [];
  const check = (name, passed, detail = null) => {
    checks.push({ name, passed: Boolean(passed), detail });
    return Boolean(passed);
  };
  return { check, checks };
};

const countMatches = (source, expression) => [...source.matchAll(expression)].length;

const sliceBetween = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = startIndex < 0 ? -1 : source.indexOf(end, startIndex + start.length);
  return startIndex >= 0 && endIndex > startIndex
    ? source.slice(startIndex, endIndex)
    : "";
};

const runStaticContracts = () => {
  const { check, checks } = createCheckCollector();

  const listenerCalls = [];
  for (const file of ownerFiles) {
    const expression = /(?:window|document|globalThis)\.addEventListener\(\s*["'](wheel|touchstart|touchmove|touchend|touchcancel|keydown|scroll)["']/g;
    for (const match of file.source.matchAll(expression)) {
      listenerCalls.push({ event: match[1], path: file.path });
    }
  }
  const removalCalls = [];
  for (const file of ownerFiles) {
    const expression = /(?:window|document|globalThis)\.removeEventListener\(\s*["'](wheel|touchstart|touchmove|touchend|touchcancel|keydown|scroll)["']/g;
    for (const match of file.source.matchAll(expression)) {
      removalCalls.push({ event: match[1], path: file.path });
    }
  }
  const listenersAreCentralized = INPUT_EVENTS.every((event) => {
    const additions = listenerCalls.filter((entry) => entry.event === event);
    const removals = removalCalls.filter((entry) => entry.event === event);
    return additions.length === 1 &&
      additions[0].path === "src/lib/motion-input-bus.ts" &&
      removals.length === 1 &&
      removals[0].path === "src/lib/motion-input-bus.ts";
  });
  check(
    "one owner-level listener set handles every input event",
    listenersAreCentralized && listenerCalls.length === INPUT_EVENTS.length,
    { additions: listenerCalls, removals: removalCalls },
  );
  check(
    "listener attachment is idempotent and detached after the final registration",
    busSource.includes("if (listenersAttached || typeof window === \"undefined\")") &&
      busSource.includes("if (!listenersAttached || typeof window === \"undefined\")") &&
      countMatches(busSource, /stories\.size === 0 && observers\.size === 0/g) >= 2,
  );

  check(
    "owner watchdog is exactly 4000ms",
    /const\s+OWNER_WATCHDOG_MS\s*=\s*4000\s*;/.test(busSource) &&
      (busSource.includes('owner.release("watchdog")') ||
        busSource.includes('deactivateOwner("watchdog", true)')) &&
      busSource.includes("ownerLastProgressAt"),
  );

  const registrationCalls = [];
  for (const file of sourceFiles) {
    const expression = /registerMotionInputStory\s*\(\s*\{/g;
    for (const match of file.source.matchAll(expression)) {
      const callPrefix = file.source.slice(match.index, match.index + 1_200);
      const id = callPrefix.match(/\bid\s*:\s*["']([^"']+)["']/)?.[1] ?? null;
      registrationCalls.push({ id, path: file.path });
    }
  }
  const registrationIds = registrationCalls.map((entry) => entry.id).filter(Boolean);
  check(
    "exactly four motion stories are registered",
    registrationCalls.length === EXPECTED_STORIES.length &&
      registrationIds.length === EXPECTED_STORIES.length &&
      new Set(registrationIds).size === EXPECTED_STORIES.length &&
      EXPECTED_STORIES.every((id) => registrationIds.includes(id)),
    registrationCalls,
  );

  const stopImmediateOwners = sourceFiles
    .filter(({ source }) => source.includes("stopImmediatePropagation"))
    .map(({ path: sourcePath }) => sourcePath);
  check(
    "application source has no stopImmediatePropagation arbitration",
    stopImmediateOwners.length === 0,
    stopImmediateOwners,
  );

  const ownerDatasetNames = [
    "motionInputLocked",
    "servicesPinned",
    "howWorkInputOwner",
    "dominoPinned",
  ];
  const datasetReadViolations = [];
  for (const file of ownerApplicationFiles) {
    const lines = file.source.split(/\r?\n/);
    lines.forEach((line, index) => {
      let remainder = line;
      for (const name of ownerDatasetNames) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        remainder = remainder
          .replace(new RegExp(`delete\\s+[\\w$]+\\.dataset\\.${escaped}\\b`, "g"), "")
          .replace(new RegExp(`[\\w$]+\\.dataset\\.${escaped}\\s*=(?!=)`, "g"), "");
        if (new RegExp(`\\.dataset\\.${escaped}\\b`).test(remainder)) {
          datasetReadViolations.push(`${file.path}:${index + 1}:${name}`);
        }
      }
    });
    const attributeReadExpression = /(?:getAttribute|hasAttribute|matches|closest|querySelector)\([^\n]*data-(?:motion-input-locked|services-pinned|how-work-input-owner|domino-pinned)/g;
    for (const match of file.source.matchAll(attributeReadExpression)) {
      const line = file.source.slice(0, match.index).split(/\r?\n/).length;
      datasetReadViolations.push(`${file.path}:${line}:attribute-api`);
    }
  }
  check(
    "owner data attributes are write-only CSS/QA telemetry",
    datasetReadViolations.length === 0,
    datasetReadViolations,
  );
  check(
    "owner arbitration reads the motion bus state",
    ownerApplicationFiles.every(({ source }) => source.includes("getMotionInputOwnerId")),
  );

  const explicitConnectionSignal = sliceBetween(
    connectionSource,
    "export const hasExplicitConstrainedConnectionSignal",
    "export const readResourceThroughputMegabitsPerSecond",
  );
  const initialPerformanceProfile = sliceBetween(
    layoutSource,
    "const webkitCompatibilityBootstrap = `",
    "const preloaderNavigationFailOpen = `",
  );
  check(
    "initial constrained profile accepts only saveData, slow-2g, and 2g",
    explicitConnectionSignal.includes("saveData === true") &&
      explicitConnectionSignal.includes('effectiveType === "slow-2g"') &&
      explicitConnectionSignal.includes('effectiveType === "2g"') &&
      !explicitConnectionSignal.includes("downlink") &&
      !/["']3g["']/.test(explicitConnectionSignal) &&
      initialPerformanceProfile.includes('connection.saveData === true') &&
      initialPerformanceProfile.includes('connection.effectiveType === "slow-2g"') &&
      initialPerformanceProfile.includes('connection.effectiveType === "2g"') &&
      !initialPerformanceProfile.includes("downlink") &&
      !/effectiveType\s*===\s*["']3g["']/.test(initialPerformanceProfile),
  );

  check(
    "first media throughput uses PerformanceResourceTiming transferSize/duration",
    connectionSource.includes("PerformanceResourceTiming") &&
      /\(entry\.transferSize\s*\*\s*8\)\s*\/\s*entry\.duration\s*\/\s*1000/.test(connectionSource) &&
      connectionSource.includes("new PerformanceObserver") &&
      /observer\.observe\(\{\s*type:\s*["']resource["'],\s*buffered:\s*true\s*\}\)/.test(connectionSource) &&
      connectionSource.includes('entry.name.includes("/media/")') &&
      landingSource.includes("observeFirstMediaThroughput((megabitsPerSecond)") &&
      landingSource.includes("measuredMediaThroughputMbps"),
  );

  return {
    checks,
    passed: checks.every((entry) => entry.passed),
  };
};

const buildSourcePaths = sourceFiles.map(({ absolutePath }) => absolutePath);
const buildIdentityPath = path.join(ROOT, ".next", "BUILD_ID");

const verifyBuildIdentity = async (baseUrl) => {
  const { check, checks } = createCheckCollector();
  const localBuildId = existsSync(buildIdentityPath)
    ? readFileSync(buildIdentityPath, "utf8").trim()
    : null;
  const buildMtimeMs = localBuildId ? statSync(buildIdentityPath).mtimeMs : null;
  const latestSourceMtimeMs = Math.max(...buildSourcePaths.map((sourcePath) => statSync(sourcePath).mtimeMs));
  const identityUrl = new URL(baseUrl);
  identityUrl.searchParams.set("__tasc_t7_build_identity", String(Date.now()));

  let responseStatus = null;
  let html = "";
  let requestError = null;
  try {
    const response = await fetch(identityUrl, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(10_000),
    });
    responseStatus = response.status;
    html = await response.text();
  } catch (error) {
    requestError = error instanceof Error ? error.message : String(error);
  }

  check("target URL responds successfully", responseStatus !== null && responseStatus >= 200 && responseStatus < 400, {
    error: requestError,
    status: responseStatus,
    url: identityUrl.toString(),
  });
  check("local production BUILD_ID exists", Boolean(localBuildId), { localBuildId });
  check(
    "production build is not older than application source",
    buildMtimeMs !== null && buildMtimeMs >= latestSourceMtimeMs,
    { buildMtimeMs, latestSourceMtimeMs },
  );
  check(
    "target serves the local production BUILD_ID",
    Boolean(localBuildId && html.includes(localBuildId)),
    { localBuildId, responseStatus },
  );

  return {
    checks,
    localBuildId,
    passed: checks.every((entry) => entry.passed),
    sourceSha256: createHash("sha256")
      .update(buildSourcePaths.map((sourcePath) => readFileSync(sourcePath)).join("\n"))
      .digest("hex"),
  };
};

const browserConfigurations = [
  { name: "chromium-desktop", browserType: chromium },
  { name: "webkit-desktop", browserType: webkit },
].filter(({ name }) => !requestedEngines || requestedEngines.has(name.split("-")[0]));

const installInstrumentation = async (context) => {
  await context.addInitScript(({ maxJumpRatio }) => {
    const connection = {
      addEventListener: () => undefined,
      downlink: 0.35,
      effectiveType: "4g",
      onchange: null,
      removeEventListener: () => undefined,
      rtt: 40,
      saveData: false,
      type: "wifi",
    };
    let connectionOverrideApplied = false;
    try {
      Object.defineProperty(navigator, "connection", {
        configurable: true,
        value: connection,
      });
      connectionOverrideApplied = navigator.connection?.downlink === 0.35;
    } catch {
      connectionOverrideApplied = false;
    }
    try {
      Object.defineProperty(navigator, "deviceMemory", { configurable: true, value: 8 });
    } catch {}
    try {
      Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, value: 12 });
    } catch {}

    const state = {
      connectionOverrideApplied,
      howSteps: [],
      maxOwnerCount: 0,
      ownerCollisions: [],
      ownerEvents: [],
      ownerSamples: [],
      scroll: {
        active: null,
        sessions: [],
      },
      servicesStops: [],
    };

    const pushDistinct = (list, value) => {
      if (value !== null && list.at(-1) !== value) list.push(value);
    };
    const sampleOwners = (reason) => {
      const owners = [...document.querySelectorAll("[data-motion-input-owner]")].map((element) => ({
        owner: element.getAttribute("data-motion-input-owner"),
        tag: element.tagName.toLowerCase(),
      }));
      state.maxOwnerCount = Math.max(state.maxOwnerCount, owners.length);
      if (owners.length > 1 && state.ownerCollisions.length < 8) {
        state.ownerCollisions.push({ at: performance.now(), owners, reason });
      }
      if (state.ownerSamples.length < 48 && (owners.length > 0 || state.ownerSamples.length < 4)) {
        state.ownerSamples.push({ at: performance.now(), owners, reason });
      }
    };
    const sampleStories = () => {
      const root = document.querySelector(".site-shell");
      if (!(root instanceof HTMLElement)) return;
      if (root.dataset.servicesPhase === "waiting" && root.dataset.servicesActive) {
        pushDistinct(state.servicesStops, Number(root.dataset.servicesActive));
      }
      if (root.dataset.howWorkStep) {
        pushDistinct(state.howSteps, Number(root.dataset.howWorkStep));
      }
    };
    const endScrollSession = () => {
      if (!state.scroll.active) return null;
      const completed = state.scroll.active;
      state.scroll.sessions.push(completed);
      state.scroll.active = null;
      return completed;
    };

    window.addEventListener("tasc:motion-input-owner-change", (event) => {
      if (state.ownerEvents.length < 80) {
        state.ownerEvents.push({
          at: performance.now(),
          owner: event.detail?.owner ?? null,
          reason: event.detail?.reason ?? null,
        });
      }
      queueMicrotask(() => sampleOwners("owner-change"));
    });
    window.addEventListener("scroll", () => {
      const active = state.scroll.active;
      if (!active) return;
      const nextY = window.scrollY;
      const delta = Math.abs(nextY - active.lastY);
      active.events += 1;
      active.maxDelta = Math.max(active.maxDelta, delta);
      active.maxRatio = Math.max(active.maxRatio, delta / Math.max(1, window.innerHeight));
      if (delta > window.innerHeight * maxJumpRatio && active.largeJumps.length < 8) {
        active.largeJumps.push({ delta, from: active.lastY, to: nextY });
      }
      active.lastY = nextY;
    }, { passive: true });

    const beginObserving = () => {
      const observer = new MutationObserver(() => {
        sampleOwners("mutation");
        sampleStories();
      });
      observer.observe(document.documentElement, {
        attributeFilter: [
          "data-motion-input-owner",
          "data-services-active",
          "data-services-phase",
          "data-how-work-step",
        ],
        attributes: true,
        subtree: true,
      });
      sampleOwners("dom-ready");
      sampleStories();
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", beginObserving, { once: true });
    } else {
      beginObserving();
    }

    window.__t7Qa = state;
    window.__t7QaControl = {
      beginScroll(label) {
        endScrollSession();
        state.scroll.active = {
          events: 0,
          label,
          largeJumps: [],
          lastY: window.scrollY,
          maxDelta: 0,
          maxRatio: 0,
          startedAt: performance.now(),
        };
      },
      endScroll: endScrollSession,
      resetHow(step = null) {
        state.howSteps = step === null ? [] : [Number(step)];
      },
      resetServices(stage = null) {
        state.servicesStops = stage === null ? [] : [Number(stage)];
      },
      sampleOwners,
      sampleStories,
    };
  }, { maxJumpRatio: MAX_SCROLL_JUMP_VIEWPORT_RATIO });
};

const waitForSiteReady = async (page, baseUrl, caseName) => {
  const target = new URL(baseUrl);
  target.searchParams.set("__tasc_t7_qa", `${caseName}-${Date.now()}`);
  const response = await page.goto(target.toString(), {
    timeout: READY_TIMEOUT_MS,
    waitUntil: "domcontentloaded",
  });
  if (!response || response.status() >= 400) {
    throw new Error(`navigation returned ${response?.status() ?? "no response"}`);
  }
  await page.waitForFunction(() => {
    const root = document.querySelector(".site-shell");
    return root?.dataset.motionReady === "true" &&
      root.dataset.motionInputBusListeners === "1";
  }, null, { timeout: READY_TIMEOUT_MS });
  const cookieButton = page.getByRole("button", { name: /accept cookies/i });
  if (await cookieButton.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await cookieButton.evaluate((button) => button.click());
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(250);
};

const navigateTo = async (page, hash, selector) => {
  await page.evaluate(() => window.__t7QaControl?.endScroll());
  const clicked = await page.evaluate((targetHash) => {
    const link = document.querySelector(`.site-header a[href="${targetHash}"]`);
    if (!(link instanceof HTMLAnchorElement)) return false;
    link.click();
    return true;
  }, hash);
  if (!clicked) throw new Error(`header link ${hash} is missing`);
  await page.waitForFunction(({ expectedHash, targetSelector }) => {
    const root = document.querySelector(".site-shell");
    const target = document.querySelector(targetSelector);
    const rect = target?.getBoundingClientRect();
    return window.location.hash === expectedHash &&
      !root?.dataset.programmaticAnchor &&
      Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight);
  }, { expectedHash: hash, targetSelector: selector }, { timeout: 9_000 });
  await page.waitForTimeout(180);
};

const waitForServicesStop = (page, stage) =>
  page.waitForFunction((expectedStage) => {
    const root = document.querySelector(".site-shell");
    return root?.dataset.servicesPhase === "waiting" &&
      root.dataset.servicesActive === String(expectedStage) &&
      !root.dataset.programmaticAnchor;
  }, stage, { timeout: STORY_TIMEOUT_MS });

const waitForHowStep = (page, step) =>
  page.waitForFunction((expectedStep) => {
    const root = document.querySelector(".site-shell");
    return root?.dataset.howWorkStep === String(expectedStep) &&
      !root.dataset.howWorkTransitioning &&
      !root.dataset.programmaticAnchor;
  }, step, { timeout: STORY_TIMEOUT_MS });

const sameSequence = (actual, expected) =>
  actual.length === expected.length && actual.every((value, index) => value === expected[index]);

const runBrowserCase = async (configuration, baseUrl) => {
  const { check, checks } = createCheckCollector();
  const browserErrors = [];
  const importantRequestFailures = [];
  const servicesRequests = [];
  const gestureMovements = [];
  let browser = null;
  let context = null;
  let page = null;
  let servicesTraversalCompleted = false;
  let howTraversalCompleted = false;
  let howJourneySequence = [];
  let watchdog = { tested: false, reason: "How owner was not reached" };

  try {
    browser = await configuration.browserType.launch({ headless: !headed });
    context = await browser.newContext({
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      reducedMotion: "no-preference",
      serviceWorkers: "block",
      viewport: { width: 1440, height: 900 },
    });
    await installInstrumentation(context);
    page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
    page.on("request", (request) => {
      if (request.url().includes("services-keyframes")) servicesRequests.push(request.url());
    });
    page.on("requestfailed", (request) => {
      if (["document", "script", "stylesheet"].includes(request.resourceType())) {
        importantRequestFailures.push(`${request.resourceType()}: ${request.url()} (${request.failure()?.errorText ?? "failed"})`);
      }
    });
    page.on("response", (response) => {
      if (
        response.status() >= 400 &&
        ["document", "script", "stylesheet"].includes(response.request().resourceType())
      ) {
        importantRequestFailures.push(`${response.request().resourceType()}: ${response.url()} (${response.status()})`);
      }
    });

    await waitForSiteReady(page, baseUrl, configuration.name);

    const identity = await page.evaluate(() => {
      const root = document.querySelector(".site-shell");
      return {
        connection: {
          downlink: navigator.connection?.downlink ?? null,
          effectiveType: navigator.connection?.effectiveType ?? null,
          saveData: navigator.connection?.saveData ?? null,
        },
        connectionOverrideApplied: window.__t7Qa?.connectionOverrideApplied ?? false,
        listeners: root?.getAttribute("data-motion-input-bus-listeners") ?? null,
        mobilePerformance: root?.getAttribute("data-mobile-performance") ?? null,
        shell: root instanceof HTMLElement,
        title: document.title,
      };
    });
    check("TASC page identity is present", identity.shell && /TASC/i.test(identity.title), identity);
    check("motion input bus reports one listener set", identity.listeners === "1", identity.listeners);
    check(
      "injected false downlink signal is active",
      identity.connectionOverrideApplied &&
        identity.connection.downlink === 0.35 &&
        identity.connection.effectiveType === "4g" &&
        identity.connection.saveData === false,
      identity.connection,
    );
    check(
      "downlink=0.35 does not select the mobile performance profile on desktop",
      identity.mobilePerformance === null,
      identity.mobilePerformance,
    );

    try {
      await navigateTo(page, "#services", ".services-story-section");
      await waitForServicesStop(page, 1);
      await page.evaluate(() => {
        window.__t7QaControl?.resetServices(1);
        window.__t7QaControl?.beginScroll("services-forward-reverse");
      });

      const servicesTargets = [2, 3, 2, 1];
      for (const target of servicesTargets) {
        const beforeY = await page.evaluate(() => window.scrollY);
        await page.mouse.wheel(0, target > Number((await page.evaluate(() => document.querySelector(".site-shell")?.dataset.servicesActive ?? "1"))) ? 240 : -240);
        await waitForServicesStop(page, target);
        const afterY = await page.evaluate(() => window.scrollY);
        gestureMovements.push({ delta: Math.abs(afterY - beforeY), story: "services", target });
        await page.waitForTimeout(240);
      }
      servicesTraversalCompleted = true;

      const mediaProfile = await page.evaluate(() => {
        const root = document.querySelector(".site-shell");
        const nodes = [...document.querySelectorAll(".services-story-video-wrap video, .services-story-video-wrap source")];
        const urls = nodes.flatMap((node) => [
          node.getAttribute("src"),
          node instanceof HTMLVideoElement ? node.currentSrc : null,
        ]).filter(Boolean);
        return {
          measuredConnectionProfile: root?.dataset.measuredConnectionProfile ?? null,
          mobilePerformance: root?.getAttribute("data-mobile-performance") ?? null,
          urls,
        };
      });
      const allServicesUrls = [...new Set([...mediaProfile.urls, ...servicesRequests])];
      const selectedServicesRequests = servicesRequests.filter((url) => /services-keyframes-/.test(url));
      const firstSelectedServiceMedia = selectedServicesRequests[0] ?? allServicesUrls[0] ?? null;
      const initialServiceMediaIsDesktop = firstSelectedServiceMedia !== null &&
        /services-keyframes-(?:desktop-final|packed-1280)/.test(firstSelectedServiceMedia);
      check(
        "false downlink initially selects desktop Services media",
        mediaProfile.mobilePerformance === null && initialServiceMediaIsDesktop,
        { ...mediaProfile, firstSelectedServiceMedia, requests: servicesRequests },
      );
    } catch (error) {
      const debugState = await page.evaluate(() => {
        const root = document.querySelector(".site-shell");
        const video = document.querySelector(".services-story-video-wrap video");
        return {
          active: root?.dataset.servicesActive ?? null,
          constrained: document.documentElement.dataset.tascConstrainedConnection ?? null,
          measuredConnectionProfile: root?.dataset.measuredConnectionProfile ?? null,
          mediaPrepared: root?.dataset.servicesMediaPrepared ?? null,
          owner: root?.dataset.motionInputOwner ?? null,
          phase: root?.dataset.servicesPhase ?? null,
          source: root?.dataset.servicesSource ?? null,
          sourceProfile: root?.dataset.servicesSourceProfile ?? null,
          videoCurrentSrc: video?.currentSrc ?? null,
          videoError: video?.error?.code ?? null,
          videoReadyState: video?.readyState ?? null,
        };
      }).catch(() => null);
      check("Services forward/reverse journey completes", false, {
        error: error instanceof Error ? error.message : String(error),
        state: debugState,
      });
    } finally {
      if (page) await page.evaluate(() => window.__t7QaControl?.endScroll()).catch(() => undefined);
    }

    const servicesSequence = await page.evaluate(() => window.__t7Qa?.servicesStops ?? []);
    check(
      "Services waiting stops are strictly 1->2->3->2->1",
      servicesTraversalCompleted && sameSequence(servicesSequence, [1, 2, 3, 2, 1]),
      servicesSequence,
    );

    try {
      await navigateTo(page, "#work", ".how-work-motion-section");
      await waitForHowStep(page, 1);
      await page.evaluate(() => {
        window.__t7QaControl?.resetHow(1);
        window.__t7QaControl?.beginScroll("how-forward-reverse-watchdog");
      });
      const howTargets = [2, 3, 2, 1];
      for (const target of howTargets) {
        const currentStep = Number(await page.evaluate(() => document.querySelector(".site-shell")?.dataset.howWorkStep ?? "1"));
        const beforeY = await page.evaluate(() => window.scrollY);
        await page.mouse.wheel(0, target > currentStep ? 180 : -180);
        await waitForHowStep(page, target);
        const afterY = await page.evaluate(() => window.scrollY);
        gestureMovements.push({ delta: Math.abs(afterY - beforeY), story: "how", target });
        await page.waitForTimeout(260);
      }
      howTraversalCompleted = true;
      howJourneySequence = await page.evaluate(() => window.__t7Qa?.howSteps ?? []);
    } catch (error) {
      check("How forward/reverse journey completes", false, error instanceof Error ? error.message : String(error));
    } finally {
      if (page) await page.evaluate(() => window.__t7QaControl?.endScroll()).catch(() => undefined);
    }

    check(
      "How steps are reachable forward and reverse",
      howTraversalCompleted && sameSequence(howJourneySequence, [1, 2, 3, 2, 1]),
      howJourneySequence,
    );

    if (howTraversalCompleted) {
      try {
        await navigateTo(page, "#top", ".hero-motion");
        await navigateTo(page, "#work", ".how-work-motion-section");
        await waitForHowStep(page, 1);
        await page.evaluate(() => window.__t7QaControl?.beginScroll("how-watchdog"));
        const beforeY = await page.evaluate(() => window.scrollY);
        await page.mouse.wheel(0, 180);
        await waitForHowStep(page, 2);
        const afterY = await page.evaluate(() => window.scrollY);
        gestureMovements.push({ delta: Math.abs(afterY - beforeY), story: "how-watchdog-setup", target: 2 });
        const ownerBeforeWatchdog = await page.evaluate(() =>
          document.querySelector(".site-shell")?.getAttribute("data-motion-input-owner") ?? null,
        );
        check("How safely exposes the bus owner for the watchdog probe", ownerBeforeWatchdog === "how", ownerBeforeWatchdog);
        if (ownerBeforeWatchdog === "how") {
          watchdog = { tested: true, observed: false };
          const observed = await page.waitForFunction(() => {
            const root = document.querySelector(".site-shell");
            return root?.dataset.motionInputWatchdogRelease === "how" &&
              !root.dataset.motionInputOwner &&
              !root.dataset.howWorkInputOwner;
          }, null, { timeout: WATCHDOG_TIMEOUT_MS }).then(() => true).catch(() => false);
          watchdog = { tested: true, observed };
          check("4000ms watchdog releases a stalled owner", observed, watchdog);
          if (observed) {
            await page.evaluate(() => window.__t7QaControl?.endScroll());
            await navigateTo(page, "#datum", ".datum-motion-section");
            const failOpenState = await page.evaluate(() => {
              const root = document.querySelector(".site-shell");
              const target = document.querySelector(".datum-motion-section");
              const rect = target?.getBoundingClientRect();
              return {
                owner: root?.dataset.motionInputOwner ?? null,
                pendingAnchor: root?.dataset.programmaticAnchor ?? null,
                targetVisible: Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight),
              };
            });
            check(
              "watchdog fails open and later navigation remains reachable",
              failOpenState.pendingAnchor === null && failOpenState.targetVisible,
              failOpenState,
            );
          }
        }
      } catch (error) {
        watchdog = {
          tested: false,
          reason: error instanceof Error ? error.message : String(error),
        };
        check("watchdog probe can be armed safely", false, watchdog);
      } finally {
        if (page) await page.evaluate(() => window.__t7QaControl?.endScroll()).catch(() => undefined);
      }
    }

    const telemetry = await page.evaluate(() => {
      window.__t7QaControl?.sampleOwners("final");
      const root = document.querySelector(".site-shell");
      return {
        listeners: root?.dataset.motionInputBusListeners ?? null,
        maxOwnerCount: window.__t7Qa?.maxOwnerCount ?? null,
        ownerCollisions: window.__t7Qa?.ownerCollisions ?? [],
        ownerEvents: window.__t7Qa?.ownerEvents ?? [],
        ownerSamples: window.__t7Qa?.ownerSamples ?? [],
        scrollSessions: window.__t7Qa?.scroll.sessions ?? [],
        viewportHeight: window.innerHeight,
      };
    });
    check("no sample contains more than one motion input owner", telemetry.maxOwnerCount <= 1, {
      maxOwnerCount: telemetry.maxOwnerCount,
      ownerCollisions: telemetry.ownerCollisions,
      ownerSamples: telemetry.ownerSamples,
    });
    check("motion input listener set stays attached once", telemetry.listeners === "1", telemetry.listeners);
    const maxAllowedJump = telemetry.viewportHeight * MAX_SCROLL_JUMP_VIEWPORT_RATIO;
    const largeGestureMovements = gestureMovements.filter(({ delta }) => delta > maxAllowedJump);
    const largeEventJumps = telemetry.scrollSessions.flatMap((session) =>
      session.largeJumps.map((jump) => ({ ...jump, label: session.label })),
    );
    check(
      "story input never teleports by a viewport",
      largeGestureMovements.length === 0 && largeEventJumps.length === 0,
      { gestureMovements, largeEventJumps, maxAllowedJump },
    );
  } catch (error) {
    check("browser case completed", false, error instanceof Error ? error.stack ?? error.message : String(error));
  } finally {
    if (page && !page.isClosed()) {
      check(
        "page has no runtime or critical asset errors",
        browserErrors.length === 0 && importantRequestFailures.length === 0,
        { browserErrors, importantRequestFailures },
      );
    }
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }

  return {
    checks,
    name: configuration.name,
    passed: checks.every((entry) => entry.passed),
    watchdog,
  };
};

const staticContracts = runStaticContracts();
let buildIdentity = null;
const browsers = [];

if (requestedUrl) {
  buildIdentity = await verifyBuildIdentity(requestedUrl);
  for (const configuration of browserConfigurations) {
    browsers.push(await runBrowserCase(configuration, requestedUrl));
  }
}

const summary = {
  browsers,
  buildIdentity,
  generatedAt: new Date().toISOString(),
  mode: requestedUrl ? "static-and-browser" : "static-only",
  passed: staticContracts.passed &&
    (!buildIdentity || buildIdentity.passed) &&
    browsers.every((result) => result.passed),
  staticContracts,
  url: requestedUrl,
};

const serializedSummary = `${JSON.stringify(summary, null, 2)}\n`;
if (outputPath) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serializedSummary, "utf8");
}
console.log(serializedSummary);
if (!summary.passed) process.exitCode = 1;
