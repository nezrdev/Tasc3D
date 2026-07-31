import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium, webkit } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_OUTPUT = path.join(ROOT, "docs", "perf-baseline-2026-07-31.json");
const VIDEO_PATTERN = /\.(?:mp4|webm|mov|m4v|apng)(?:$|[?#])/i;
const REVEAL_SELECTORS = ".reveal-block,.stagger-reveal-item,.process-contact-row";
const ANCHORS = ["#top", "#clients", "#services", "#work", "#datum", "#process", "#contact"];

const PROFILES = {
  "desktop-1440": {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    platform: "windows",
  },
  "mac-1280": {
    width: 1280,
    height: 800,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    platform: "mac",
  },
  "mobile-390": {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    platform: "mobile",
  },
  "mobile-large-430": {
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    platform: "mobile",
  },
};

const NETWORKS = {
  normal: {
    latencyMs: 0,
    downloadBytesPerSecond: -1,
    uploadBytesPerSecond: -1,
    effectiveType: "4g",
    downlinkMbps: null,
    rttMs: null,
  },
  fast3g: {
    latencyMs: 150,
    downloadBytesPerSecond: 1_600_000 / 8,
    uploadBytesPerSecond: 750_000 / 8,
    effectiveType: "3g",
    downlinkMbps: 1.6,
    rttMs: 150,
  },
  "1mbps": {
    latencyMs: 100,
    downloadBytesPerSecond: 1_000_000 / 8,
    uploadBytesPerSecond: 500_000 / 8,
    effectiveType: "3g",
    downlinkMbps: 1,
    rttMs: 100,
  },
};

const ENGINES = {
  chromium: { browserType: chromium, cdp: true },
  webkit: { browserType: webkit, cdp: false },
};

const PRESETS = {
  all: {
    profiles: Object.keys(PROFILES),
    networks: Object.keys(NETWORKS),
    engines: Object.keys(ENGINES),
  },
  mobile: {
    profiles: ["mobile-390", "mobile-large-430"],
    networks: Object.keys(NETWORKS),
    engines: Object.keys(ENGINES),
  },
  smoke: {
    profiles: ["mobile-390"],
    networks: ["normal"],
    engines: ["chromium"],
  },
};

const parseArguments = (argv) => {
  const booleanFlags = new Set(["help", "headed", "dry-run", "no-server"]);
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const separator = argument.indexOf("=");
    if (separator >= 0) {
      parsed[argument.slice(2, separator)] = argument.slice(separator + 1);
      continue;
    }
    const key = argument.slice(2);
    if (booleanFlags.has(key)) {
      parsed[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    parsed[key] = next;
    index += 1;
  }
  return parsed;
};

const splitList = (value) =>
  String(value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

const args = parseArguments(process.argv.slice(2));
const HELP = `
TASC performance baseline

Usage:
  node scripts/perf-baseline.mjs --preset=all

Options:
  --preset=all|mobile|smoke
  --profiles=desktop-1440,mac-1280,mobile-390,mobile-large-430
  --networks=normal,fast3g,1mbps
  --engines=chromium,webkit
  --url=http://127.0.0.1:3180/
  --output=docs/perf-baseline-2026-07-31.json
  --hold-ms=15000
  --ready-timeout-ms=60000
  --max-cases=24|all
  --headed --dry-run --no-server
`;

if (args.help) {
  console.log(HELP.trim());
  process.exit(0);
}

const presetName = String(args.preset ?? "all").toLowerCase();
const preset = PRESETS[presetName];
if (!preset) throw new Error(`Unsupported preset: ${presetName}`);

const selected = {
  profiles: splitList(args.profiles).length ? splitList(args.profiles) : preset.profiles,
  networks: splitList(args.networks).length ? splitList(args.networks) : preset.networks,
  engines: splitList(args.engines).length ? splitList(args.engines) : preset.engines,
};

for (const profile of selected.profiles) {
  if (!PROFILES[profile]) throw new Error(`Unsupported profile: ${profile}`);
}
for (const network of selected.networks) {
  if (!NETWORKS[network]) throw new Error(`Unsupported network: ${network}`);
}
for (const engine of selected.engines) {
  if (!ENGINES[engine]) throw new Error(`Unsupported engine: ${engine}`);
}

const cases = [];
for (const engine of selected.engines) {
  for (const profile of selected.profiles) {
    for (const network of selected.networks) {
      cases.push({ engine, profile, network });
    }
  }
}

const maxCases =
  String(args["max-cases"] ?? "").toLowerCase() === "all"
    ? Number.POSITIVE_INFINITY
    : Number.parseInt(args["max-cases"] ?? "24", 10);
if (!Number.isFinite(maxCases) && maxCases !== Number.POSITIVE_INFINITY) {
  throw new Error(`Invalid --max-cases=${args["max-cases"]}`);
}
if (cases.length > maxCases) {
  throw new Error(`Matrix has ${cases.length} cases, above --max-cases=${maxCases}`);
}

const holdMs = Math.max(15_000, Number.parseInt(args["hold-ms"] ?? "15000", 10));
const readyTimeoutMs = Math.max(
  holdMs,
  Number.parseInt(args["ready-timeout-ms"] ?? "60000", 10),
);
const outputPath = path.resolve(ROOT, args.output ?? DEFAULT_OUTPUT);
const requestedPort = args.port ? Number.parseInt(args.port, 10) : null;
const requestedUrl = args.url ? new URL(args.url).toString() : null;
const runId = new Date().toISOString().replace(/[:.]/g, "-");

if (args["dry-run"]) {
  console.log(
    JSON.stringify(
      {
        preset: presetName,
        outputPath,
        holdMs,
        readyTimeoutMs,
        caseCount: cases.length,
        cases,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const percentile = (values, fraction) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
};

const metric = (status, value, details = {}) => ({ status, value, ...details });

const round = (value, digits = 2) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : value ?? null;

const waitForHttp = async (url, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2_000) });
      if (response.status >= 200 && response.status < 500) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "unknown error"}`);
};

const reserveAvailablePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: requestedPort ?? 0 }, () => {
      const address = server.address();
      const availablePort = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!availablePort) reject(new Error("Unable to reserve a local port"));
        else resolve(availablePort);
      });
    });
  });

const stopProcessTree = (child) => {
  if (!child || child.exitCode != null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
};

const startServer = async () => {
  if (requestedUrl || args["no-server"]) {
    const baseUrl = requestedUrl ?? `http://127.0.0.1:${requestedPort ?? 3180}/`;
    await waitForHttp(baseUrl, 15_000);
    return { baseUrl, child: null, source: "external" };
  }

  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    throw new Error("No production build found. Run `pnpm build` before perf-baseline.");
  }
  const port = await reserveAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}/`;
  const logDirectory = path.join(ROOT, ".preview-logs");
  fs.mkdirSync(logDirectory, { recursive: true });
  const stdout = fs.openSync(path.join(logDirectory, `perf-baseline-${runId}.out.log`), "a");
  const stderr = fs.openSync(path.join(logDirectory, `perf-baseline-${runId}.err.log`), "a");
  const nextCli = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "start", "-p", String(port)], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1" },
    detached: false,
    stdio: ["ignore", stdout, stderr],
    windowsHide: true,
  });
  try {
    await waitForHttp(baseUrl, 30_000);
    return { baseUrl, child, source: "spawned-next-start" };
  } catch (error) {
    stopProcessTree(child);
    throw error;
  } finally {
    fs.closeSync(stdout);
    fs.closeSync(stderr);
  }
};

const userAgentFor = (engineName, profile) => {
  if (profile.isMobile) {
    return engineName === "webkit"
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36";
  }
  if (profile.platform === "mac") {
    return engineName === "webkit"
      ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
  }
  return undefined;
};

const installInstrumentation = async (context, network) => {
  await context.addInitScript(
    ({ connection, revealSelectors }) => {
      performance.setResourceTimingBufferSize?.(20_000);
      const state = {
        capabilities: {
          paint: false,
          lcp: false,
          cls: false,
          longtask: false,
          jsHeap: Boolean(performance.memory),
          weakRef: typeof WeakRef === "function",
        },
        fcp: null,
        lcp: null,
        layoutShifts: [],
        longTasks: [],
        heapSamples: [],
        heroSurfaceReadyMs: null,
        preloaderCompleteMs: null,
        firstHarnessInputMs: null,
        journeyActive: false,
        journeyFrames: [],
        previousFrameAt: null,
        webglCreatedTotal: 0,
        webglPeakConnectedNonLost: 0,
        webglLost: 0,
        webglRestored: 0,
        contextReferences: [],
      };

      const observe = (type, callback) => {
        try {
          const supported = PerformanceObserver.supportedEntryTypes?.includes(type) ?? false;
          if (!supported) return false;
          const observer = new PerformanceObserver(callback);
          observer.observe({ type, buffered: true });
          return true;
        } catch {
          return false;
        }
      };

      state.capabilities.paint = observe("paint", (list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-contentful-paint") state.fcp = entry.startTime;
        }
      });
      state.capabilities.lcp = observe("largest-contentful-paint", (list) => {
        const entries = list.getEntries();
        const entry = entries[entries.length - 1];
        if (!entry) return;
        const element = entry.element;
        state.lcp = {
          startTime: entry.startTime,
          renderTime: entry.renderTime,
          loadTime: entry.loadTime,
          size: entry.size,
          url: entry.url || null,
          selector:
            element instanceof Element
              ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${
                  element.classList.length ? `.${[...element.classList].slice(0, 3).join(".")}` : ""
                }`
              : null,
        };
      });
      state.capabilities.cls = observe("layout-shift", (list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            state.layoutShifts.push({ startTime: entry.startTime, value: entry.value });
          }
        }
      });
      state.capabilities.longtask = observe("longtask", (list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push({ start: entry.startTime, duration: entry.duration });
        }
      });

      if (connection) {
        const value = {
          effectiveType: connection.effectiveType,
          downlink: connection.downlinkMbps,
          rtt: connection.rttMs,
          saveData: false,
          addEventListener() {},
          removeEventListener() {},
        };
        try {
          Object.defineProperty(navigator, "connection", {
            configurable: true,
            get: () => value,
          });
        } catch {}
      }

      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      const seenContexts = new WeakSet();
      const seenCanvases = new WeakSet();
      const dereferenceContexts = () =>
        state.contextReferences
          .map((reference) => (typeof reference?.deref === "function" ? reference.deref() : reference))
          .filter(Boolean);
      const updateContextPeak = () => {
        let current = 0;
        for (const context of dereferenceContexts()) {
          const canvas = context.canvas;
          const lost = typeof context.isContextLost === "function" && context.isContextLost();
          if (canvas?.isConnected && !lost) current += 1;
        }
        state.webglPeakConnectedNonLost = Math.max(state.webglPeakConnectedNonLost, current);
        return current;
      };
      HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...rest) {
        const context = Reflect.apply(originalGetContext, this, [type, ...rest]);
        if (/^(?:webgl|webgl2|experimental-webgl)$/i.test(String(type)) && context) {
          if (!seenContexts.has(context)) {
            seenContexts.add(context);
            state.webglCreatedTotal += 1;
            state.contextReferences.push(
              typeof WeakRef === "function" ? new WeakRef(context) : context,
            );
          }
          if (!seenCanvases.has(this)) {
            seenCanvases.add(this);
            this.addEventListener("webglcontextlost", () => {
              state.webglLost += 1;
            });
            this.addEventListener("webglcontextrestored", () => {
              state.webglRestored += 1;
            });
          }
          updateContextPeak();
        }
        return context;
      };

      const checkReadiness = () => {
        const main = document.querySelector("main[data-hero-surface-ready='true']");
        if (main && state.heroSurfaceReadyMs == null) state.heroSurfaceReadyMs = performance.now();
        const preloader = document.querySelector(".site-preloader");
        const completeClass = document.documentElement.classList.contains("site-preloader-complete");
        if (!preloader && completeClass && state.preloaderCompleteMs == null) {
          state.preloaderCompleteMs = performance.now();
        }
      };
      const readinessObserver = new MutationObserver(checkReadiness);
      readinessObserver.observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-hero-surface-ready", "class"],
      });
      addEventListener("DOMContentLoaded", checkReadiness, { once: true });

      const heapTimer = setInterval(() => {
        if (performance.memory) {
          state.heapSamples.push({
            t: performance.now(),
            usedJSHeapSize: performance.memory.usedJSHeapSize,
          });
        }
        updateContextPeak();
      }, 250);

      const frame = (timestamp) => {
        if (state.journeyActive && state.previousFrameAt != null) {
          state.journeyFrames.push(timestamp - state.previousFrameAt);
        }
        state.previousFrameAt = timestamp;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);

      const clsSessionWindow = () => {
        const entries = [...state.layoutShifts].sort((left, right) => left.startTime - right.startTime);
        let maximum = 0;
        let windowValue = 0;
        let windowStart = null;
        let previous = null;
        for (const entry of entries) {
          if (
            windowStart == null ||
            previous == null ||
            entry.startTime - previous >= 1_000 ||
            entry.startTime - windowStart >= 5_000
          ) {
            windowStart = entry.startTime;
            windowValue = entry.value;
          } else {
            windowValue += entry.value;
          }
          previous = entry.startTime;
          maximum = Math.max(maximum, windowValue);
        }
        return maximum;
      };

      const describeRenderer = () => {
        const context = dereferenceContexts()[0];
        if (!context) return null;
        try {
          const extension = context.getExtension?.("WEBGL_debug_renderer_info");
          if (!extension) return null;
          return {
            vendor: context.getParameter(extension.UNMASKED_VENDOR_WEBGL),
            renderer: context.getParameter(extension.UNMASKED_RENDERER_WEBGL),
          };
        } catch {
          return null;
        }
      };

      const snapshot = () => {
        const resources = performance.getEntriesByType("resource").map((entry) => ({
          name: entry.name,
          initiatorType: entry.initiatorType,
          startTime: entry.startTime,
          responseEnd: entry.responseEnd,
          transferSize: entry.transferSize,
          encodedBodySize: entry.encodedBodySize,
          decodedBodySize: entry.decodedBodySize,
          duration: entry.duration,
        }));
        const heap = state.heapSamples.map((entry) => entry.usedJSHeapSize);
        return {
          now: performance.now(),
          capabilities: { ...state.capabilities },
          fcp: state.fcp,
          lcp: state.lcp ? { ...state.lcp } : null,
          cls: clsSessionWindow(),
          layoutShifts: [...state.layoutShifts],
          longTasks: [...state.longTasks],
          heapSamples: [...state.heapSamples],
          heapPeak: heap.length ? Math.max(...heap) : null,
          heroSurfaceReadyMs: state.heroSurfaceReadyMs,
          preloaderCompleteMs: state.preloaderCompleteMs,
          firstHarnessInputMs: state.firstHarnessInputMs,
          journeyFrames: [...state.journeyFrames],
          resources,
          webgl: {
            createdTotal: state.webglCreatedTotal,
            currentConnectedNonLost: updateContextPeak(),
            peakConnectedNonLost: state.webglPeakConnectedNonLost,
            lost: state.webglLost,
            restored: state.webglRestored,
            renderer: describeRenderer(),
          },
        };
      };

      window.__tascPerfBaseline = {
        markFirstHarnessInput() {
          if (state.firstHarnessInputMs == null) state.firstHarnessInputMs = performance.now();
          return state.firstHarnessInputMs;
        },
        startJourney() {
          state.journeyFrames.length = 0;
          state.previousFrameAt = null;
          state.journeyActive = true;
        },
        pauseJourney() {
          state.journeyActive = false;
          state.previousFrameAt = null;
        },
        resumeJourney() {
          state.previousFrameAt = null;
          state.journeyActive = true;
        },
        stopJourney() {
          state.journeyActive = false;
          state.previousFrameAt = null;
        },
        hiddenSample(anchor) {
          const intersects = (rect) =>
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < innerHeight &&
            rect.left < innerWidth;
          const describe = (element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            const hidden = style.visibility === "hidden" || Number.parseFloat(style.opacity) <= 0.01;
            if (!hidden || !intersects(rect)) return null;
            return {
              selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${
                element.classList.length ? `.${[...element.classList].slice(0, 3).join(".")}` : ""
              }`,
              opacity: style.opacity,
              visibility: style.visibility,
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
            };
          };
          const expected = [...document.querySelectorAll(revealSelectors)]
            .filter((element) => !element.closest("[aria-hidden='true'],[inert]"))
            .map(describe)
            .filter(Boolean);
          const allHidden = [...document.querySelectorAll("body *")]
            .filter((element) => !element.closest("[aria-hidden='true'],[inert]"))
            .map(describe)
            .filter(Boolean);
          return {
            anchor,
            expected,
            allCount: allHidden.length,
            allDiagnostic: allHidden.slice(0, 250),
          };
        },
        snapshot,
        dispose() {
          clearInterval(heapTimer);
          readinessObserver.disconnect();
        },
      };
    },
    {
      connection:
        network.downlinkMbps == null
          ? null
          : {
              effectiveType: network.effectiveType,
              downlinkMbps: network.downlinkMbps,
              rttMs: network.rttMs,
            },
      revealSelectors: REVEAL_SELECTORS,
    },
  );
};

const installWebKitThrottle = async (context, network, baseOrigin) => {
  if (network.downloadBytesPerSecond < 0) {
    return { mode: "none", approximate: false };
  }
  let availableAt = Date.now();
  await context.route("**/*", async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    if (target.origin !== baseOrigin || request.method() !== "GET") {
      await route.continue();
      return;
    }
    try {
      const response = await route.fetch({ timeout: 180_000 });
      const body = await response.body();
      const transferMs = Math.ceil((body.byteLength / network.downloadBytesPerSecond) * 1_000);
      const deliveryAt = Math.max(Date.now() + network.latencyMs, availableAt) + transferMs;
      availableAt = deliveryAt;
      await delay(Math.max(0, deliveryAt - Date.now()));
      await route.fulfill({ response, body });
    } catch {
      await route.continue();
    }
  });
  return {
    mode: "route-whole-response-aggregate-bandwidth",
    approximate: true,
    caveat: "WebKit responses are buffered before delayed fulfillment; this is not streaming Safari throttling.",
  };
};

const applyChromiumNetwork = async (context, page, network) => {
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  await session.send("Network.setBypassServiceWorker", { bypass: true });
  if (network.downloadBytesPerSecond >= 0) {
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: network.latencyMs,
      downloadThroughput: network.downloadBytesPerSecond,
      uploadThroughput: network.uploadBytesPerSecond,
      connectionType: "cellular3g",
    });
  }
  return session;
};

const waitForJourneyReadiness = async (page, timeoutMs) => {
  const startedAt = Date.now();
  try {
    await page.waitForFunction(
      () =>
        document.querySelector("main[data-hero-surface-ready='true']") &&
        !document.querySelector(".site-preloader"),
      null,
      { timeout: timeoutMs },
    );
    return { ready: true, waitedMs: Date.now() - startedAt };
  } catch (error) {
    return { ready: false, waitedMs: Date.now() - startedAt, error: error.message };
  }
};

const scrollToAnchor = async (page, anchor) => {
  const found = await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!element) return false;
    const top = Math.max(0, scrollY + element.getBoundingClientRect().top - 72);
    scrollTo({ top, behavior: "smooth" });
    return true;
  }, anchor);
  if (!found) return { anchor, found: false };
  await page.waitForTimeout(900);
  return { anchor, found: true };
};

const calculateLegacyTti = (fcp, longTasks, boundaryMs) => {
  if (!Number.isFinite(fcp)) return null;
  const quietWindowMs = 5_000;
  const candidates = [fcp, ...longTasks.map((entry) => entry.start + entry.duration)]
    .filter((value) => value >= fcp && value + quietWindowMs <= boundaryMs)
    .sort((left, right) => left - right);
  for (const candidate of candidates) {
    const hasBlockingTask = longTasks.some(
      (entry) => entry.duration > 50 && entry.start < candidate + quietWindowMs && entry.start + entry.duration > candidate,
    );
    if (!hasBlockingTask) return candidate;
  }
  return null;
};

const summarizeFrames = (frames) => {
  const valid = frames.filter((value) => Number.isFinite(value) && value > 0);
  const cadence = percentile(valid.filter((value) => value <= percentile(valid, 0.5) * 1.25), 0.5);
  const slowThreshold = Number.isFinite(cadence) ? cadence * 1.5 : 25;
  const overBudget = valid.filter((value) => value > 16.7).length;
  const slowFrames = valid.filter((value) => value > slowThreshold).length;
  return {
    thresholdMs: 16.7,
    totalFrames: valid.length,
    overBudgetFrames: overBudget,
    ratio: valid.length ? round(overBudget / valid.length, 4) : null,
    calibratedCadenceMs: round(cadence),
    calibratedSlowThresholdMs: round(slowThreshold),
    calibratedSlowFrames: slowFrames,
    calibratedSlowRatio: valid.length ? round(slowFrames / valid.length, 4) : null,
    p50Ms: round(percentile(valid, 0.5)),
    p95Ms: round(percentile(valid, 0.95)),
    p99Ms: round(percentile(valid, 0.99)),
    maxMs: valid.length ? round(Math.max(...valid)) : null,
  };
};

const summarizeCase = (raw, profile, networkMode, startedRequests, diagnostics) => {
  const boundary = raw.firstHarnessInputMs ?? raw.now;
  const beforeBoundary = raw.resources.filter(
    (entry) => entry.startTime <= boundary && entry.responseEnd > 0 && entry.responseEnd <= boundary,
  );
  const videoResources = beforeBoundary.filter(
    (entry) => entry.initiatorType === "video" || VIDEO_PATTERN.test(entry.name),
  );
  const longTasks15 = raw.longTasks.filter((entry) => entry.start < 15_000);
  const longTasks7 = raw.longTasks.filter((entry) => entry.start < 7_000);
  const blockingInWindow = (entries, startMs, endMs) =>
    entries.reduce((sum, entry) => {
      const taskEnd = entry.start + entry.duration;
      const blockingStart = Math.max(entry.start + 50, startMs);
      const blockingEnd = Math.min(taskEnd, endMs);
      return sum + Math.max(0, blockingEnd - blockingStart);
    }, 0);
  const ttiValue = raw.capabilities.longtask
    ? calculateLegacyTti(raw.fcp, raw.longTasks, boundary)
    : null;
  const tbtValue =
    Number.isFinite(raw.fcp) && Number.isFinite(ttiValue)
      ? blockingInWindow(raw.longTasks, raw.fcp, ttiValue)
      : null;
  const hiddenSamples = raw.hiddenSamples ?? [];
  const hiddenExpectedMaximum = Math.max(
    0,
    ...hiddenSamples.map((sample) => sample.hidden?.expected?.length ?? 0),
  );
  const hiddenAllMaximum = Math.max(0, ...hiddenSamples.map((sample) => sample.hidden?.allCount ?? 0));
  const uniqueVideoRequests = [
    ...new Set([
      ...startedRequests.filter((entry) => entry.video).map((entry) => entry.url),
      ...videoResources.filter((entry) => VIDEO_PATTERN.test(entry.name)).map((entry) => entry.name),
    ]),
  ];
  const transferBytes = beforeBoundary.reduce((sum, entry) => sum + (entry.transferSize || 0), 0);
  const inflightAtBoundary = startedRequests.filter((entry) => entry.inflightAtBoundary).length;
  const eventualBytesForStartedRequests = startedRequests.reduce((sum, entry) => {
    if (!entry.sizes) return sum;
    return (
      sum +
      entry.sizes.requestBodySize +
      entry.sizes.requestHeadersSize +
      entry.sizes.responseBodySize +
      entry.sizes.responseHeadersSize
    );
  }, 0);
  const eventualBytesForCompletedRequests = startedRequests.reduce((sum, entry) => {
    if (!entry.completedBeforeFirstInput || !entry.sizes) return sum;
    return (
      sum +
      entry.sizes.requestBodySize +
      entry.sizes.requestHeadersSize +
      entry.sizes.responseBodySize +
      entry.sizes.responseHeadersSize
    );
  }, 0);
  const transferMetricApproximate =
    networkMode.approximate && transferBytes === 0 && eventualBytesForCompletedRequests > 0;
  const transferMetricBoundaryApproximate = transferMetricApproximate || inflightAtBoundary > 0;

  return {
    lcp: raw.capabilities.lcp
      ? metric(raw.lcp ? "measured" : "not-observed", round(raw.lcp?.startTime), {
          unit: "ms",
          candidate: raw.lcp,
        })
      : metric("unsupported", null, { unit: "ms" }),
    fcp: raw.capabilities.paint
      ? metric(Number.isFinite(raw.fcp) ? "measured" : "not-observed", round(raw.fcp), { unit: "ms" })
      : metric("unsupported", null, { unit: "ms" }),
    tti: raw.capabilities.longtask
      ? metric(Number.isFinite(ttiValue) ? "approximate" : "not-observed", round(ttiValue), {
          unit: "ms",
          method: "legacy 5-second long-task quiet window; not Lighthouse TTI and not a hard cross-engine gate",
        })
      : metric("unsupported", null, {
          unit: "ms",
          method: "Long Tasks API unavailable",
        }),
    tbt: raw.capabilities.longtask
      ? metric(Number.isFinite(tbtValue) ? "approximate" : "not-observed", round(tbtValue), {
          unit: "ms",
          window: "FCP to legacy quiet-window TTI",
          method: "sum of each long task's blocking portion after its first 50 ms, clipped to the FCP-to-TTI window",
          blockingTime0To7sMs: blockingInWindow(raw.longTasks, 0, 7_000),
        })
      : metric("unsupported", null, {
          unit: "ms",
          window: "Long Tasks API unavailable",
        }),
    cls: raw.capabilities.cls
      ? metric("measured", round(raw.cls, 4), { sessionWindow: "1-second gap, 5-second maximum" })
      : metric("unsupported", null),
    bytesBeforeFirstScroll: metric(
      transferMetricBoundaryApproximate ? "approximate" : "measured",
      transferMetricApproximate ? eventualBytesForCompletedRequests : transferBytes,
      {
        unit: "bytes",
        definition: transferMetricApproximate
          ? "eventual Playwright request sizes for requests completed before first harness scroll input; excludes partial bytes from in-flight requests"
          : "sum of PerformanceResourceTiming.transferSize for completed requests before first harness scroll input",
        completedTransferSizeBytes: transferBytes,
        zeroTransferEntries: beforeBoundary.filter((entry) => entry.transferSize === 0).length,
        inflightRequestCountAtBoundary: inflightAtBoundary,
        eventualBytesForCompletedRequestsBeforeFirstScroll: eventualBytesForCompletedRequests,
        eventualBytesForRequestsStartedBeforeFirstScroll: eventualBytesForStartedRequests,
        chromiumEncodedBytesReceivedBeforeFirstScroll: Number.isFinite(
          raw.chromiumEncodedBytesBeforeFirstInput,
        )
          ? metric("measured", raw.chromiumEncodedBytesBeforeFirstInput, { unit: "bytes" })
          : metric("unsupported", null, { unit: "bytes" }),
        caveat:
          inflightAtBoundary > 0
            ? "value is a lower-bound approximation because partial bytes from requests still in flight at the boundary are unavailable in Playwright WebKit; the started-request total is an eventual upper-bound diagnostic"
            : null,
      },
    ),
    videoRequestsBeforeFirstScroll: metric("measured", uniqueVideoRequests, {
      count: uniqueVideoRequests.length,
      resourceTimingUrls: [...new Set(videoResources.map((entry) => entry.name))],
      requests: startedRequests.filter((entry) => entry.video),
    }),
    preloaderRevealMs: metric(
      Number.isFinite(raw.heroSurfaceReadyMs) ? "measured" : "not-observed",
      round(raw.heroSurfaceReadyMs),
      {
        unit: "ms",
        definition: "navigation start to main[data-hero-surface-ready=true]",
        preloaderCompleteMs: round(raw.preloaderCompleteMs),
      },
    ),
    longTasks: raw.capabilities.longtask
      ? metric(
          "measured",
          longTasks15.map((entry) => ({ start: round(entry.start), duration: round(entry.duration) })),
          {
            windowMs: 15_000,
            durationSumMs: round(longTasks15.reduce((sum, entry) => sum + entry.duration, 0)),
            durationSum0To7sMs: round(longTasks7.reduce((sum, entry) => sum + entry.duration, 0)),
          },
        )
      : metric("unsupported", null, { windowMs: 15_000 }),
    total: raw.capabilities.longtask
      ? metric(
          "measured",
          round(longTasks15.reduce((sum, entry) => sum + entry.duration, 0)),
          {
            unit: "ms",
            definition: "sum of long-task durations during the first 15 seconds",
          },
        )
      : metric("unsupported", null, { unit: "ms", windowMs: 15_000 }),
    scrollFrameBudget: metric(
      raw.journeyFrames.length ? "measured" : "not-observed",
      summarizeFrames(raw.journeyFrames),
    ),
    webglContexts: metric("measured", raw.webgl.currentConnectedNonLost, {
      createdTotal: raw.webgl.createdTotal,
      peakConnectedNonLost: raw.webgl.peakConnectedNonLost,
      renderer: raw.webgl.renderer,
    }),
    webglContextLost: metric("measured", raw.webgl.lost, {
      restored: raw.webgl.restored,
    }),
    hiddenInViewport: metric("measured", hiddenAllMaximum, {
      definition: "all hidden or opacity-zero non-aria-hidden elements intersecting the viewport",
      revealContractMaximum: hiddenExpectedMaximum,
      revealContractSelectors: REVEAL_SELECTORS,
      samples: hiddenSamples,
    }),
    jsHeapPeak: raw.capabilities.jsHeap
      ? metric(Number.isFinite(raw.heapPeak) ? "measured" : "not-observed", raw.heapPeak, {
          unit: "bytes",
          samples: raw.heapSamples.length,
          p95Bytes: percentile(
            raw.heapSamples.map((entry) => entry.usedJSHeapSize),
            0.95,
          ),
        })
      : metric("unsupported", null, {
          unit: "bytes",
          reason: "performance.memory is unavailable in this engine",
        }),
    firstHarnessScrollInputMs: round(boundary),
    readiness: raw.readiness,
    capabilities: raw.capabilities,
    networkMode,
    viewport: profile,
    diagnostics,
  };
};

const runCase = async (caseSpec, baseUrl) => {
  const engineProfile = ENGINES[caseSpec.engine];
  const profile = PROFILES[caseSpec.profile];
  const network = NETWORKS[caseSpec.network];
  const id = `${caseSpec.engine}-${caseSpec.profile}-${caseSpec.network}`;
  const result = {
    id,
    configuration: { ...caseSpec },
    status: "running",
    error: null,
  };
  let browser;
  let context;
  try {
    browser = await engineProfile.browserType.launch({
      headless: !args.headed,
      args: engineProfile.cdp ? ["--enable-precise-memory-info"] : [],
    });
    result.environment = {
      browserVersion: browser.version(),
      operatingSystem: `${os.platform()} ${os.release()}`,
      nodeVersion: process.version,
      headless: !args.headed,
      profile,
      network,
      cpuThrottle: null,
    };
    const userAgent = userAgentFor(caseSpec.engine, profile);
    context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.deviceScaleFactor,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      serviceWorkers: "block",
      colorScheme: "dark",
      locale: "en-US",
      timezoneId: "America/Chicago",
      reducedMotion: "no-preference",
      ...(userAgent ? { userAgent } : {}),
    });
    await installInstrumentation(context, network);
    const networkMode = engineProfile.cdp
      ? {
          mode: network.downloadBytesPerSecond < 0 ? "cdp-cache-disabled" : "cdp-streaming",
          approximate: false,
        }
      : await installWebKitThrottle(context, network, new URL(baseUrl).origin);
    const page = await context.newPage();
    const diagnostics = {
      consoleErrors: [],
      pageErrors: [],
      requestFailures: [],
      badResponses: [],
    };
    page.on("console", (message) => {
      if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) diagnostics.badResponses.push({ url: response.url(), status: response.status() });
    });
    const startedRequests = [];
    const requestRecordByRequest = new Map();
    const pendingSizeReads = [];
    let beforeFirstInput = true;
    let chromiumEncodedBytesBeforeFirstInput = 0;
    page.on("request", (request) => {
      if (!beforeFirstInput) return;
      const url = request.url();
      const record = {
        url,
        method: request.method(),
        resourceType: request.resourceType(),
        video: request.resourceType() === "media" || VIDEO_PATTERN.test(url),
        range: request.headers().range ?? null,
        completedBeforeFirstInput: false,
        failed: false,
        inflightAtBoundary: false,
        sizes: null,
      };
      startedRequests.push(record);
      requestRecordByRequest.set(request, record);
    });
    page.on("requestfinished", (request) => {
      const record = requestRecordByRequest.get(request);
      if (!record) return;
      record.completedBeforeFirstInput = beforeFirstInput;
      pendingSizeReads.push(
        request
          .sizes()
          .then((sizes) => {
            record.sizes = sizes;
          })
          .catch(() => {}),
      );
    });
    page.on("requestfailed", (request) => {
      diagnostics.requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? null });
      const record = requestRecordByRequest.get(request);
      if (record) {
        record.failed = true;
        record.completedBeforeFirstInput = beforeFirstInput;
      }
    });

    const cdp = engineProfile.cdp
      ? await applyChromiumNetwork(context, page, network)
      : null;
    cdp?.on("Network.dataReceived", (event) => {
      if (beforeFirstInput) {
        chromiumEncodedBytesBeforeFirstInput += event.encodedDataLength || event.dataLength || 0;
      }
    });
    await page.exposeBinding("__tascClosePerfBoundary", () => {
      if (!beforeFirstInput) return;
      for (const record of startedRequests) {
        record.inflightAtBoundary = !record.completedBeforeFirstInput && !record.failed;
      }
      beforeFirstInput = false;
    });
    const target = new URL(baseUrl);
    target.searchParams.set("perfBaseline", id);
    target.searchParams.set("cold", runId);
    const navigationStartedAt = Date.now();
    await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 180_000 });
    const elapsed = Date.now() - navigationStartedAt;
    if (elapsed < holdMs) await page.waitForTimeout(holdMs - elapsed);
    const readiness = await waitForJourneyReadiness(page, Math.max(1_000, readyTimeoutMs - holdMs));
    const firstAnchor = ANCHORS[1];
    const firstTransition = await page.evaluate(async (selector) => {
      const api = window.__tascPerfBaseline;
      api.markFirstHarnessInput();
      await window.__tascClosePerfBoundary();
      const startupSnapshot = api.snapshot();
      api.startJourney();
      const element = document.querySelector(selector);
      if (!element) return { startupSnapshot, found: false };
      const top = Math.max(0, scrollY + element.getBoundingClientRect().top - 72);
      scrollTo({ top, behavior: "smooth" });
      return { startupSnapshot, found: true };
    }, firstAnchor);
    const startupSnapshot = firstTransition.startupSnapshot;
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__tascPerfBaseline.pauseJourney());
    const hiddenSamples = [
      {
        anchor: firstAnchor,
        found: firstTransition.found,
        hidden: firstTransition.found
          ? await page.evaluate(
              (selector) => window.__tascPerfBaseline.hiddenSample(selector),
              firstAnchor,
            )
          : null,
      },
    ];
    await page.evaluate(() => window.__tascPerfBaseline.resumeJourney());
    for (const anchor of ANCHORS.slice(2)) {
      const sample = await scrollToAnchor(page, anchor);
      await page.evaluate(() => window.__tascPerfBaseline.pauseJourney());
      sample.hidden = sample.found
        ? await page.evaluate(
            (selector) => window.__tascPerfBaseline.hiddenSample(selector),
            anchor,
          )
        : null;
      hiddenSamples.push(sample);
      await page.evaluate(() => window.__tascPerfBaseline.resumeJourney());
    }
    await page.evaluate(() => window.__tascPerfBaseline.stopJourney());
    await page.evaluate(() => scrollTo({ top: 0, behavior: "auto" }));
    await page.waitForTimeout(100);
    hiddenSamples.unshift({
      anchor: "#top",
      found: true,
      hidden: await page.evaluate(() => window.__tascPerfBaseline.hiddenSample("#top")),
    });
    await page.waitForTimeout(100);
    await Promise.allSettled(pendingSizeReads);
    const finalSnapshot = await page.evaluate(() => window.__tascPerfBaseline.snapshot());
    await page.evaluate(() => window.__tascPerfBaseline.dispose());
    if (cdp) await cdp.detach().catch(() => {});
    const raw = {
      ...finalSnapshot,
      fcp: startupSnapshot.fcp,
      lcp: startupSnapshot.lcp,
      cls: startupSnapshot.cls,
      layoutShifts: startupSnapshot.layoutShifts,
      firstHarnessInputMs: startupSnapshot.firstHarnessInputMs,
      resources: startupSnapshot.resources,
      readiness,
      hiddenSamples,
      chromiumEncodedBytesBeforeFirstInput: engineProfile.cdp
        ? chromiumEncodedBytesBeforeFirstInput
        : null,
    };
    result.metrics = summarizeCase(raw, profile, networkMode, startedRequests, diagnostics);
    result.status = "measured";
  } catch (error) {
    result.status = "error";
    result.error = error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
  return result;
};

const git = (...command) => {
  const result = spawnSync("git", command, { cwd: ROOT, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
};

const server = await startServer();
const results = [];
try {
  for (let index = 0; index < cases.length; index += 1) {
    const caseSpec = cases[index];
    console.log(`[${index + 1}/${cases.length}] ${caseSpec.engine}-${caseSpec.profile}-${caseSpec.network}`);
    const result = await runCase(caseSpec, server.baseUrl);
    results.push(result);
    console.log(JSON.stringify({ id: result.id, status: result.status, error: result.error?.message ?? null }));
  }
} finally {
  stopProcessTree(server.child);
}

const requiredMetricNames = [
  "lcp",
  "fcp",
  "tti",
  "tbt",
  "cls",
  "bytesBeforeFirstScroll",
  "videoRequestsBeforeFirstScroll",
  "preloaderRevealMs",
  "longTasks",
  "total",
  "scrollFrameBudget",
  "webglContexts",
  "webglContextLost",
  "hiddenInViewport",
  "jsHeapPeak",
];
const structuralFailures = [];
for (const result of results) {
  if (result.status !== "measured") {
    structuralFailures.push(`${result.id}: ${result.error?.message ?? "case error"}`);
    continue;
  }
  for (const field of requiredMetricNames) {
    if (!result.metrics?.[field] || !("status" in result.metrics[field])) {
      structuralFailures.push(`${result.id}: missing metric ${field}`);
    }
  }
}

const sourceStatus = git("status", "--porcelain") ?? "";
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  source: {
    revision: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    branch: git("branch", "--show-current"),
    dirty: Boolean(sourceStatus),
    statusPorcelain: sourceStatus ? sourceStatus.split(/\r?\n/) : [],
    trackedFileCount: (git("ls-files") ?? "").split(/\r?\n/).filter(Boolean).length,
    url: server.baseUrl,
    serverSource: server.source,
    productionBuild: fs.existsSync(path.join(ROOT, ".next", "BUILD_ID")),
  },
  methodology: {
    coldContext: true,
    serviceWorkers: "blocked",
    cpuThrottle: "disabled",
    startupObservationMs: holdMs,
    readinessTimeoutMs: readyTimeoutMs,
    firstScrollBoundary: "first scroll input issued by this harness after startup observation and readiness wait",
    webkitNetworkCaveat:
      "Throttled WebKit uses buffered route fulfillment and is approximate; it is not equivalent to physical Safari streaming.",
    physicalDeviceBoundary:
      "Playwright WebKit on Windows is not iPhone Safari, iPhone Chrome, Android Chrome, or macOS Safari acceptance.",
  },
  matrix: {
    preset: presetName,
    selected,
    caseCount: cases.length,
  },
  structuralFailures,
  results,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.renameSync(temporaryPath, outputPath);
console.log(JSON.stringify({ outputPath, caseCount: results.length, structuralFailures }, null, 2));

if (structuralFailures.length) process.exitCode = 1;
