import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium, webkit } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const READY_TIMEOUT_MS = 60_000;
const STORY_TIMEOUT_MS = 30_000;
const BROWSER_TYPES = { chromium, webkit };

const parseArgs = (values) => {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const separator = value.indexOf("=");
    if (separator >= 0) {
      result[value.slice(2, separator)] = value.slice(separator + 1);
      continue;
    }
    const next = values[index + 1];
    result[value.slice(2)] = next && !next.startsWith("--") ? next : true;
  }
  return result;
};

const printHelp = () => {
  process.stdout.write([
    "T11 focused browser regression gate",
    "",
    "Usage:",
    "  node scripts/t11-focused-regression-qa.mjs --url=http://127.0.0.1:3139/ --output=docs/t11-focused-regression-qa.json",
    "",
    "Options:",
    "  --url       Stable production-server URL to test",
    "  --output    JSON report path, relative to the repository root or absolute",
    "  --engines   Comma-separated browser engines: chromium,webkit",
    "  --headed    Run visible browsers",
    "  --help      Show this help",
  ].join("\n") + "\n");
};

const args = parseArgs(process.argv.slice(2));
if (args.help === true) {
  printHelp();
  process.exit(0);
}

if (typeof args.url !== "string" || typeof args.output !== "string") {
  printHelp();
  process.stderr.write("\nBoth --url and --output are required.\n");
  process.exit(2);
}

let baseUrl;
try {
  baseUrl = new URL(args.url).toString();
} catch {
  process.stderr.write(`Invalid --url value: ${args.url}\n`);
  process.exit(2);
}

const selectedEngines = typeof args.engines === "string"
  ? [...new Set(args.engines.split(",").map((engine) => engine.trim()).filter(Boolean))]
  : ["chromium", "webkit"];
const invalidEngines = selectedEngines.filter((engine) => !(engine in BROWSER_TYPES));
if (selectedEngines.length === 0 || invalidEngines.length > 0) {
  process.stderr.write(`Invalid --engines value. Supported engines: ${Object.keys(BROWSER_TYPES).join(",")}.\n`);
  process.exit(2);
}

const outputPath = path.isAbsolute(args.output) ? args.output : path.resolve(ROOT, args.output);
const headed = args.headed === true || args.headed === "true";

const createCheckCollector = () => {
  const checks = [];
  return {
    checks,
    check(name, passed, detail = null) {
      checks.push({ name, passed: Boolean(passed), detail });
    },
  };
};

const sameSequence = (actual, expected) =>
  actual.length === expected.length && actual.every((value, index) => value === expected[index]);

const installRuntimeProfile = async (context) => {
  await context.addInitScript(() => {
    const connection = {
      addEventListener: () => undefined,
      downlink: 10,
      effectiveType: "4g",
      onchange: null,
      removeEventListener: () => undefined,
      rtt: 20,
      saveData: false,
      type: "wifi",
    };
    try {
      Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
    } catch {}
    try {
      Object.defineProperty(navigator, "deviceMemory", { configurable: true, value: 8 });
    } catch {}
    try {
      Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, value: 12 });
    } catch {}
  });
};

const waitForSiteReady = async (page, engine) => {
  const target = new URL(baseUrl);
  target.searchParams.set("__tasc_t11_focused_qa", `${engine}-${Date.now()}`);
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
      root.dataset.motionInputBusListeners === "1" &&
      document.documentElement.dataset.tascMobilePerformance === "false";
  }, null, { timeout: READY_TIMEOUT_MS });
  const cookieButton = page.getByRole("button", { name: /accept cookies/i });
  if (await cookieButton.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await cookieButton.evaluate((button) => button.click());
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(250);
};

const navigateTo = async (page, hash, selector) => {
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
  }, { expectedHash: hash, targetSelector: selector }, { timeout: 12_000 });
  await page.waitForTimeout(200);
};

const waitForServicesStop = (page, stage, timeout = STORY_TIMEOUT_MS) =>
  page.waitForFunction((expectedStage) => {
    const root = document.querySelector(".site-shell");
    return root?.dataset.servicesPhase === "waiting" &&
      root.dataset.servicesActive === String(expectedStage) &&
      !root.dataset.programmaticAnchor;
  }, stage, { timeout });

const readServicesStage = (page) => page.evaluate(() => {
  const root = document.querySelector(".site-shell");
  return {
    active: Number(root?.dataset.servicesActive ?? 1),
    phase: root?.dataset.servicesPhase ?? null,
    programmaticAnchor: root?.dataset.programmaticAnchor ?? null,
  };
});

const driveServicesToStage = async (page, target) => {
  let lastState = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    lastState = await readServicesStage(page);
    if (lastState.phase === "waiting" && lastState.active === target && !lastState.programmaticAnchor) return;
    if (lastState.active === target && lastState.phase !== "idle") {
      await waitForServicesStop(page, target, 12_000).catch(() => undefined);
      lastState = await readServicesStage(page);
      if (lastState.phase === "waiting" && lastState.active === target && !lastState.programmaticAnchor) return;
      await page.waitForTimeout(220);
      continue;
    }
    if (["preparing", "playing", "releasing", "reverse"].includes(String(lastState.phase))) {
      await page.waitForTimeout(360);
      continue;
    }
    const direction = lastState.phase === "idle" && target === 1
      ? 1
      : target > lastState.active
        ? 1
        : -1;
    await page.mouse.wheel(0, direction * 360);
    try {
      await waitForServicesStop(page, target, 12_000);
      return;
    } catch {
      await page.waitForTimeout(220);
    }
  }
  const runtime = await captureRuntimeState(page).catch(() => null);
  throw new Error(`Services stage ${target} was not reached from ${JSON.stringify(lastState)}; runtime=${JSON.stringify(runtime)}`);
};

const readServicesState = (page) => page.evaluate(() => {
  const root = document.querySelector(".site-shell");
  const video = document.querySelector(".services-story-video-wrap video");
  const currentSrc = video instanceof HTMLVideoElement ? video.currentSrc : "";
  const expectedSource = root?.dataset.servicesSource ?? "";
  return {
    active: root?.dataset.servicesActive ?? null,
    currentSrc: currentSrc || null,
    currentSrcMatchesSource: Boolean(currentSrc && expectedSource) &&
      new URL(currentSrc, window.location.href).pathname === new URL(expectedSource, window.location.href).pathname,
    errorCode: video instanceof HTMLVideoElement ? video.error?.code ?? null : null,
    loadCount: Number(root?.dataset.servicesVideoLoadCount ?? 0),
    mediaDecoded: root?.dataset.servicesMediaDecoded ?? null,
    mediaFallback: root?.dataset.servicesMediaFallback ?? null,
    mediaPrepared: root?.dataset.servicesMediaPrepared ?? null,
    mobilePerformance: document.documentElement.dataset.tascMobilePerformance ?? null,
    networkState: video instanceof HTMLVideoElement ? video.networkState : null,
    nodeId: video instanceof HTMLVideoElement ? video.dataset.servicesNodeId ?? null : null,
    phase: root?.dataset.servicesPhase ?? null,
    readyState: video instanceof HTMLVideoElement ? video.readyState : null,
    sameNode: video === window.__tascT11ServicesVideo,
    segmentState: video instanceof HTMLVideoElement ? video.dataset.segmentState ?? null : null,
    startFrameDecoded: root?.dataset.servicesStartFrameDecoded ?? null,
    staticStop: root?.dataset.servicesStaticStop ?? null,
    source: expectedSource || null,
    sourceAttr: video instanceof HTMLVideoElement ? video.getAttribute("src") : null,
    sourceProfile: root?.dataset.servicesSourceProfile ?? null,
    sourceSwapped: root?.dataset.servicesVideoSourceSwapped ?? null,
    transport: root?.dataset.servicesTransport ?? null,
    videoNodeCount: document.querySelectorAll(".services-story-video-wrap video").length,
  };
});

const captureRuntimeState = (page) => page.evaluate(() => {
  const root = document.querySelector(".site-shell");
  const video = document.querySelector(".services-story-video-wrap video");
  return {
    location: window.location.href,
    rootDataset: root instanceof HTMLElement ? { ...root.dataset } : null,
    scrollY: window.scrollY,
    viewport: { height: window.innerHeight, width: window.innerWidth },
    video: video instanceof HTMLVideoElement ? {
      currentSrc: video.currentSrc || null,
      errorCode: video.error?.code ?? null,
      networkState: video.networkState,
      readyState: video.readyState,
      sourceAttr: video.getAttribute("src"),
    } : null,
    videoNodeCount: document.querySelectorAll(".services-story-video-wrap video").length,
  };
});

const beginServicesTelemetry = (page) => page.evaluate(() => {
  window.__tascT11ServicesObserver?.disconnect();
  const stops = [];
  const sample = () => {
    const root = document.querySelector(".site-shell");
    if (root?.dataset.servicesPhase !== "waiting" || !root.dataset.servicesActive) return;
    const stage = Number(root.dataset.servicesActive);
    if (stops.at(-1) !== stage) stops.push(stage);
  };
  const observer = new MutationObserver(sample);
  observer.observe(document.documentElement, {
    attributeFilter: ["data-services-active", "data-services-phase"],
    attributes: true,
    subtree: true,
  });
  window.__tascT11ServicesStops = stops;
  window.__tascT11ServicesObserver = observer;
  sample();
});

const probeSynchronousLayoutReads = (page) => page.evaluate(() => {
  const root = document.querySelector(".site-shell");
  const lockState = {
    dominoPinned: root?.dataset.dominoPinned ?? null,
    howOwner: root?.dataset.howWorkInputOwner ?? null,
    motionOwner: root?.dataset.motionInputOwner ?? null,
    programmaticAnchor: root?.dataset.programmaticAnchor ?? null,
    servicesActive: root?.dataset.servicesActive ?? null,
    servicesPhase: root?.dataset.servicesPhase ?? null,
  };
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "getBoundingClientRect");
  if (!descriptor || typeof descriptor.value !== "function") {
    return { calls: null, dispatchReturned: false, lockState, restored: false };
  }
  const nativeMethod = descriptor.value;
  let calls = 0;
  const callTargets = [];
  Object.defineProperty(Element.prototype, "getBoundingClientRect", {
    ...descriptor,
    value(...methodArgs) {
      calls += 1;
      if (callTargets.length < 8) {
        callTargets.push({ className: this instanceof HTMLElement ? this.className : "", tagName: this.tagName });
      }
      return nativeMethod.apply(this, methodArgs);
    },
  });
  let dispatchReturned = false;
  try {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaY: 64,
      view: window,
    });
    document.documentElement.dispatchEvent(event);
    dispatchReturned = true;
  } finally {
    Object.defineProperty(Element.prototype, "getBoundingClientRect", descriptor);
  }
  return {
    calls,
    callTargets,
    dispatchReturned,
    lockState,
    restored: Element.prototype.getBoundingClientRect === nativeMethod,
  };
});

const runBrowserCase = async (engine, browserType) => {
  const { checks, check } = createCheckCollector();
  const errors = [];
  const criticalRequestFailures = [];
  let browser;
  let context;
  let page;
  let states = {};
  let servicesStops = [];
  let layoutReadProbe = null;
  let failureState = null;
  let runtimeFinal = null;

  try {
    browser = await browserType.launch({ headless: !headed });
    context = await browser.newContext({
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      reducedMotion: "no-preference",
      serviceWorkers: "block",
      viewport: { width: 960, height: 800 },
    });
    await installRuntimeProfile(context);
    page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("requestfailed", (request) => {
      if (["document", "script", "stylesheet"].includes(request.resourceType())) {
        criticalRequestFailures.push(`${request.resourceType()}: ${request.url()} (${request.failure()?.errorText ?? "failed"})`);
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && ["document", "script", "stylesheet"].includes(response.request().resourceType())) {
        criticalRequestFailures.push(`${response.request().resourceType()}: ${response.url()} (${response.status()})`);
      }
    });

    await waitForSiteReady(page, engine);
    await navigateTo(page, "#services", ".services-story-section");
    await driveServicesToStage(page, 1);
    await page.evaluate(() => {
      window.__tascT11ServicesVideo = document.querySelector(".services-story-video-wrap video");
    });
    states.beforeSwap = await readServicesState(page);

    await page.setViewportSize({ width: 879, height: 800 });
    await page.waitForFunction((expectedLoadCount) => {
      const root = document.querySelector(".site-shell");
      const video = document.querySelector(".services-story-video-wrap video");
      return document.documentElement.dataset.tascMobilePerformance === "true" &&
        root?.dataset.servicesSourceProfile === "mobile" &&
        root.dataset.servicesVideoSourceSwapped === "true" &&
        Number(root.dataset.servicesVideoLoadCount ?? 0) >= expectedLoadCount &&
        video === window.__tascT11ServicesVideo &&
        video?.getAttribute("src") === root.dataset.servicesSource &&
        Boolean(video?.currentSrc) &&
        new URL(video.currentSrc, window.location.href).pathname ===
          new URL(root.dataset.servicesSource, window.location.href).pathname;
    }, states.beforeSwap.loadCount + 1, { timeout: 12_000 });
    await driveServicesToStage(page, 1);
    await page.waitForFunction(() => {
      const root = document.querySelector(".site-shell");
      const video = document.querySelector(".services-story-video-wrap video");
      return root?.dataset.servicesMediaFallback === "true" ||
        (video instanceof HTMLVideoElement &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.error === null) ||
        (video instanceof HTMLVideoElement &&
          video.error === null &&
          video.dataset.segmentState === "ready" &&
          root?.dataset.servicesStaticStop);
    }, null, { timeout: 12_000 }).catch(() => undefined);
    states.afterSwap = await readServicesState(page);

    const sourceTransitionPass = states.beforeSwap.mobilePerformance === "false" &&
      states.beforeSwap.sourceProfile === "desktop" &&
      states.afterSwap.mobilePerformance === "true" &&
      states.afterSwap.sourceProfile === "mobile" &&
      states.afterSwap.source !== states.beforeSwap.source &&
      states.afterSwap.sourceAttr === states.afterSwap.source &&
      states.afterSwap.currentSrcMatchesSource &&
      states.afterSwap.loadCount === states.beforeSwap.loadCount + 1 &&
      states.afterSwap.sourceSwapped === "true" &&
      states.afterSwap.nodeId === states.beforeSwap.nodeId &&
      states.afterSwap.sameNode &&
      states.afterSwap.videoNodeCount === 1 &&
      states.afterSwap.transport === states.beforeSwap.transport;
    check("resize performs a real Services desktop-to-mobile source swap", sourceTransitionPass, states);
    const mediaUsableAfterSwap = states.afterSwap.mediaFallback === "true" ||
      (states.afterSwap.readyState >= 2 && states.afterSwap.errorCode === null) ||
      (states.afterSwap.errorCode === null &&
        states.afterSwap.segmentState === "ready" &&
        (states.afterSwap.staticStop !== null ||
          states.afterSwap.mediaPrepared === "true" ||
          states.afterSwap.startFrameDecoded === "true"));
    check("swapped Services media has a decoded, fallback, or poster-safe visual path", mediaUsableAfterSwap, states.afterSwap);

    await beginServicesTelemetry(page);
    await page.evaluate(() => {
      window.__t7QaControl?.resetServices(1);
      window.__t7QaControl?.beginScroll("t11-focused-source-swap");
    });
    for (const target of [2, 3, 2, 1]) {
      await driveServicesToStage(page, target);
      await page.waitForTimeout(320);
    }
    servicesStops = await page.evaluate(() => window.__tascT11ServicesStops ?? []);
    check("Services waiting stops are exactly 1->2->3->2->1 after the source swap", sameSequence(servicesStops, [1, 2, 3, 2, 1]), servicesStops);

    await page.setViewportSize({ width: 960, height: 800 });
    await page.waitForFunction(() => document.documentElement.dataset.tascMobilePerformance === "false", null, { timeout: 8_000 });
    await navigateTo(page, "#top", ".hero-motion");
    await page.waitForFunction(() => {
      const root = document.querySelector(".site-shell");
      return !root?.dataset.motionInputOwner &&
        !root?.dataset.programmaticAnchor &&
        !root?.dataset.howWorkInputOwner &&
        !root?.dataset.dominoPinned &&
        !root?.dataset.servicesActive &&
        root?.dataset.servicesPhase === "idle";
    }, null, { timeout: 12_000 });
    await page.waitForTimeout(200);
    layoutReadProbe = await probeSynchronousLayoutReads(page);
    const outsideStoryLocks = Object.values(layoutReadProbe.lockState).every((value) => value === null || value === "idle");
    check("wheel layout-read probe starts outside all story locks", outsideStoryLocks, layoutReadProbe.lockState);
    check(
      "one wheel event performs no more than one synchronous getBoundingClientRect call",
      layoutReadProbe.dispatchReturned && layoutReadProbe.restored && layoutReadProbe.calls !== null && layoutReadProbe.calls <= 1,
      layoutReadProbe,
    );
    check("browser runtime has no critical errors", errors.length === 0 && criticalRequestFailures.length === 0, {
      criticalRequestFailures,
      errors,
    });
    runtimeFinal = await captureRuntimeState(page);
  } catch (error) {
    failureState = page ? await captureRuntimeState(page).catch(() => null) : null;
    check("focused browser journey completes", false, {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      runtime: failureState,
    });
  } finally {
    await page?.evaluate(() => window.__tascT11ServicesObserver?.disconnect()).catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }

  return {
    engine,
    passed: checks.every((entry) => entry.passed),
    checks,
    criticalRequestFailures,
    errors,
    failureState,
    layoutReadProbe,
    runtimeFinal,
    servicesStops,
    states,
  };
};

const browserResults = [];
for (const engine of selectedEngines) {
  browserResults.push(await runBrowserCase(engine, BROWSER_TYPES[engine]));
}

const report = {
  generatedAt: new Date().toISOString(),
  passed: browserResults.every((entry) => entry.passed),
  url: baseUrl,
  engines: selectedEngines,
  browserResults,
};

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
