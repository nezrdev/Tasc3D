import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

const loadPlaywright = () => {
  try {
    return require("playwright");
  } catch {
    const candidates = [
      process.env.TASC_PLAYWRIGHT_PATH,
      "C:/Users/mziv1/AppData/Roaming/npm/node_modules/playwright",
    ].filter(Boolean);
    const npxRoot = "C:/Users/mziv1/AppData/Local/npm-cache/_npx";
    if (fs.existsSync(npxRoot)) {
      candidates.push(
        ...fs
          .readdirSync(npxRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(npxRoot, entry.name, "node_modules", "playwright"))
          .filter((candidate) => fs.existsSync(candidate))
          .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs),
      );
    }
    const candidate = candidates.find((entry) => fs.existsSync(entry));
    if (!candidate) {
      throw new Error(
        "Playwright is unavailable. Run `npx.cmd --yes --package playwright playwright --version`, then retry.",
      );
    }
    return require(candidate);
  }
};

const playwright = loadPlaywright();

const parseArguments = (argv) => {
  const flags = new Set(["headed", "dry-run", "help", "fail-on-advisory"]);
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const equalsAt = value.indexOf("=");
    if (equalsAt >= 0) {
      parsed[value.slice(2, equalsAt)] = value.slice(equalsAt + 1);
      continue;
    }
    const key = value.slice(2);
    if (flags.has(key)) {
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

const args = parseArguments(process.argv.slice(2));

const HELP = `
TASC cross-device/network deterministic QA

Usage:
  node scripts/tasc-cross-device-network-qa-20260722.mjs [options]

Core filters (comma-separated):
  --url=http://127.0.0.1:3154/
  --preset=smoke|journey|matrix|full
  --engines=chromium,webkit,chrome,edge
  --viewports=desktop,mac,mobile,mobile-large (or 1280x800)
  --inputs=auto,wheel,touch,keyboard
  --caches=cold,warm
  --networks=normal,fast3g,1mbps
  --scenarios=baseline,galaxy,cta,journey
  --repeat=1
  --max-cases=24 (use "all" to disable the guard)
  --cpu-rate=auto|1|4|6 (CDP engines only)
  --output=C:/workflow/output/playwright/tasc-cross-device-network-20260722
  --headed --dry-run --fail-on-advisory

Examples:
  # One bounded Chrome 150 smoke
  node scripts/tasc-cross-device-network-qa-20260722.mjs --engines=chrome --viewports=mobile --inputs=touch --networks=normal --caches=cold --scenarios=baseline,galaxy,cta

  # One complete Safari/WebKit-style forward/reverse/replay journey at 1 Mbps
  node scripts/tasc-cross-device-network-qa-20260722.mjs --preset=journey --engines=webkit --viewports=mobile-large --inputs=touch --networks=1mbps --caches=cold

  # Enumerate the full matrix without running it
  node scripts/tasc-cross-device-network-qa-20260722.mjs --preset=full --dry-run
`;

if (args.help) {
  console.log(HELP.trim());
  process.exit(0);
}

const splitList = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const VIEWPORTS = {
  desktop: {
    name: "desktop",
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
    platform: "windows",
  },
  mac: {
    name: "mac",
    width: 1280,
    height: 800,
    deviceScaleFactor: 2,
    mobile: false,
    platform: "mac",
  },
  mobile: {
    name: "mobile",
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
    platform: "mobile",
  },
  "mobile-large": {
    name: "mobile-large",
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    mobile: true,
    platform: "mobile",
  },
};

const NETWORKS = {
  normal: {
    name: "normal",
    latencyMs: 0,
    downloadBytesPerSecond: -1,
    uploadBytesPerSecond: -1,
    effectiveType: "4g",
    downlinkMbps: 10,
    rttMs: 50,
    defaultCpuRate: 1,
  },
  fast3g: {
    name: "fast3g",
    latencyMs: 150,
    downloadBytesPerSecond: 1_600_000 / 8,
    uploadBytesPerSecond: 750_000 / 8,
    effectiveType: "3g",
    downlinkMbps: 1.6,
    rttMs: 150,
    defaultCpuRate: 4,
  },
  "1mbps": {
    name: "1mbps",
    latencyMs: 100,
    downloadBytesPerSecond: 1_000_000 / 8,
    uploadBytesPerSecond: 500_000 / 8,
    effectiveType: "3g",
    downlinkMbps: 1,
    rttMs: 100,
    defaultCpuRate: 6,
  },
};

const ENGINE_PROFILES = {
  chromium: { name: "chromium", browserType: playwright.chromium, cdp: true },
  webkit: { name: "webkit", browserType: playwright.webkit, cdp: false },
  chrome: {
    name: "chrome",
    browserType: playwright.chromium,
    cdp: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  },
  edge: {
    name: "edge",
    browserType: playwright.chromium,
    cdp: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  },
};

const PRESETS = {
  smoke: {
    engines: ["chromium", "webkit"],
    viewports: ["mac", "mobile"],
    inputs: ["auto"],
    caches: ["cold"],
    networks: ["normal"],
    scenarios: ["baseline", "galaxy", "cta"],
    maxCases: 8,
  },
  journey: {
    engines: ["chromium", "webkit"],
    viewports: ["mac", "mobile"],
    inputs: ["auto"],
    caches: ["cold"],
    networks: ["normal"],
    scenarios: ["baseline", "galaxy", "cta", "journey"],
    maxCases: 8,
  },
  matrix: {
    engines: ["chromium", "webkit", "chrome", "edge"],
    viewports: ["desktop", "mac", "mobile", "mobile-large"],
    inputs: ["auto"],
    caches: ["cold", "warm"],
    networks: ["normal", "fast3g", "1mbps"],
    scenarios: ["baseline", "galaxy", "cta"],
    maxCases: 96,
  },
  full: {
    engines: ["chromium", "webkit", "chrome", "edge"],
    viewports: ["desktop", "mac", "mobile", "mobile-large"],
    inputs: ["wheel", "touch", "keyboard"],
    caches: ["cold", "warm"],
    networks: ["normal", "fast3g", "1mbps"],
    scenarios: ["baseline", "galaxy", "cta", "journey"],
    maxCases: Number.POSITIVE_INFINITY,
  },
};

const presetName = String(args.preset ?? "smoke").toLowerCase();
const preset = PRESETS[presetName];
if (!preset) throw new Error(`Unsupported --preset=${presetName}`);

const resolveViewport = (name) => {
  if (VIEWPORTS[name]) return VIEWPORTS[name];
  const match = /^(\d+)x(\d+)$/.exec(name);
  if (!match) throw new Error(`Unsupported viewport: ${name}`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 280 || height < 480) throw new Error(`Unsafe viewport: ${name}`);
  return {
    name,
    width,
    height,
    deviceScaleFactor: width <= 760 ? 3 : 1,
    mobile: width <= 760,
    platform: width <= 760 ? "mobile" : "windows",
  };
};

const selected = {
  engines: splitList(args.engines).length ? splitList(args.engines) : preset.engines,
  viewports: (splitList(args.viewports).length ? splitList(args.viewports) : preset.viewports).map(
    resolveViewport,
  ),
  inputs: splitList(args.inputs).length ? splitList(args.inputs) : preset.inputs,
  caches: splitList(args.caches).length ? splitList(args.caches) : preset.caches,
  networks: splitList(args.networks).length ? splitList(args.networks) : preset.networks,
  scenarios: splitList(args.scenarios).length ? splitList(args.scenarios) : preset.scenarios,
};

for (const engine of selected.engines) {
  if (!ENGINE_PROFILES[engine]) throw new Error(`Unsupported engine: ${engine}`);
  const executable = ENGINE_PROFILES[engine].executablePath;
  if (executable && !fs.existsSync(executable)) {
    throw new Error(`${engine} executable not found: ${executable}`);
  }
}
for (const input of selected.inputs) {
  if (!["auto", "wheel", "touch", "keyboard"].includes(input)) {
    throw new Error(`Unsupported input: ${input}`);
  }
}
for (const cache of selected.caches) {
  if (!["cold", "warm"].includes(cache)) throw new Error(`Unsupported cache: ${cache}`);
}
for (const network of selected.networks) {
  if (!NETWORKS[network]) throw new Error(`Unsupported network: ${network}`);
}
for (const scenario of selected.scenarios) {
  if (!["baseline", "galaxy", "cta", "journey"].includes(scenario)) {
    throw new Error(`Unsupported scenario: ${scenario}`);
  }
}

const baseUrl = new URL(args.url ?? "http://127.0.0.1:3154/").toString();
const outputRoot = path.resolve(
  args.output ?? "C:/workflow/output/playwright/tasc-cross-device-network-20260722",
);
const repeat = Math.max(1, Number.parseInt(args.repeat ?? "1", 10));
const maxCases =
  String(args["max-cases"] ?? "").toLowerCase() === "all"
    ? Number.POSITIVE_INFINITY
    : args["max-cases"]
      ? Math.max(1, Number.parseInt(args["max-cases"], 10))
      : preset.maxCases;
const forcedCpuRate =
  !args["cpu-rate"] || args["cpu-rate"] === "auto"
    ? null
    : Math.max(1, Number.parseFloat(args["cpu-rate"]));
const headed = Boolean(args.headed);
const dryRun = Boolean(args["dry-run"]);
const failOnAdvisory = Boolean(args["fail-on-advisory"]);

const resolveInput = (input, viewport) =>
  input === "auto" ? (viewport.mobile ? "touch" : "wheel") : input;

const cases = [];
for (let repetition = 1; repetition <= repeat; repetition += 1) {
  for (const engine of selected.engines) {
    for (const viewport of selected.viewports) {
      for (const requestedInput of selected.inputs) {
        for (const cache of selected.caches) {
          for (const network of selected.networks) {
            cases.push({
              repetition,
              engine,
              viewport,
              input: resolveInput(requestedInput, viewport),
              requestedInput,
              cache,
              network,
              scenarios: [...selected.scenarios],
            });
          }
        }
      }
    }
  }
}

if (cases.length > maxCases) {
  throw new Error(
    `Matrix expands to ${cases.length} cases, above --max-cases=${maxCases}. Add filters, increase the guard, or use --max-cases=all.`,
  );
}

const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
const slug = (value) => String(value).replace(/[^a-z0-9_.-]+/gi, "-").replace(/^-|-$/g, "");
const plannedCases = cases.map((entry, index) => ({
  index: index + 1,
  id: slug(
    `${String(index + 1).padStart(3, "0")}-${entry.engine}-${entry.viewport.name}-${entry.input}-${entry.cache}-${entry.network}-r${entry.repetition}`,
  ),
  ...entry,
  viewport: { ...entry.viewport },
}));

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        runId,
        preset: presetName,
        baseUrl,
        outputRoot,
        caseCount: plannedCases.length,
        cases: plannedCases,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

fs.mkdirSync(outputRoot, { recursive: true });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const center = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[center] : (sorted[center - 1] + sorted[center]) / 2;
};
const percentile = (values, fraction) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))];
};

const userAgentFor = (engine, viewport) => {
  if (viewport.mobile) {
    return engine === "webkit"
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36";
  }
  if (viewport.platform === "mac") {
    return engine === "webkit"
      ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
  }
  return undefined;
};

const addBrowserInstrumentation = async (context, networkProfile) => {
  await context.addInitScript(
    ({ connection }) => {
      try {
        localStorage.setItem("tasc_cookie_consent_v1", "qa");
      } catch {
        // about:blank has no storage origin.
      }

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
        } catch {
          // Advisory only; CDP/route throttling remains active.
        }
      }

      const qa = {
        startedAt: performance.now(),
        scroll: [],
        media: [],
        mediaEvents: [],
        longTasks: [],
        rejections: [],
      };
      const cap = (array, maximum) => {
        if (array.length > maximum) array.splice(0, array.length - maximum);
      };
      const rootState = () => {
        const root = document.querySelector(".site-shell");
        return root instanceof HTMLElement
          ? {
              servicesPhase: root.dataset.servicesPhase ?? null,
              servicesActive: root.dataset.servicesActive ?? null,
              servicesPinned: root.dataset.servicesPinned ?? null,
              servicesStaticStop: root.dataset.servicesStaticStop ?? null,
              servicesVideoDirection: root.dataset.servicesVideoDirection ?? null,
              servicesMediaDecoded: root.dataset.servicesMediaDecoded ?? null,
              datumPlayback: root.dataset.datumPlayback ?? null,
              datumProgress: root.dataset.datumProgress ?? null,
              datumPinned: root.dataset.datumPinned ?? null,
              dominoPlayback: root.dataset.dominoPlayback ?? null,
              dominoProgress: root.dataset.dominoProgress ?? null,
              dominoPinned: root.dataset.dominoPinned ?? null,
              motionInputLocked: root.dataset.motionInputLocked ?? null,
              programmaticAnchor: root.dataset.programmaticAnchor ?? null,
              starfieldMode: root.dataset.starfieldMode ?? null,
            }
          : null;
      };
      const buffered = (video) => {
        const ranges = [];
        for (let index = 0; index < video.buffered.length; index += 1) {
          ranges.push([video.buffered.start(index), video.buffered.end(index)]);
        }
        return ranges;
      };
      const describeVideo = (video) => {
        const rect = video.getBoundingClientRect();
        const packedSurface = video.closest(".services-story-video, .lens-safari-animation");
        const surfaceClassName = packedSurface instanceof HTMLElement ? packedSurface.className : "";
        const visibleWidth = Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left));
        const visibleHeight = Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
        const quality = video.getVideoPlaybackQuality?.();
        return {
          key: `${video.className}|${surfaceClassName}|${video.dataset.dominoDirection ?? ""}|${video.currentSrc || video.getAttribute("src") || ""}`,
          className: video.className,
          surfaceClassName,
          direction: video.dataset.dominoDirection ?? null,
          active: video.dataset.dominoActive ?? null,
          segmentState: video.dataset.segmentState ?? null,
          playbackState: video.dataset.playbackState ?? null,
          src: video.currentSrc || video.getAttribute("src") || "",
          currentTime: video.currentTime,
          duration: video.duration,
          readyState: video.readyState,
          networkState: video.networkState,
          paused: video.paused,
          ended: video.ended,
          seeking: video.seeking,
          playbackRate: video.playbackRate,
          errorCode: video.error?.code ?? null,
          buffered: buffered(video),
          visiblePixels: visibleWidth * visibleHeight,
          totalFrames: quality?.totalVideoFrames ?? null,
          droppedFrames: quality?.droppedVideoFrames ?? null,
        };
      };
      const sampleMedia = (reason = "interval") => {
        qa.media.push({
          t: performance.now(),
          reason,
          y: scrollY,
          root: rootState(),
          videos: [...document.querySelectorAll("video")].map(describeVideo),
        });
        cap(qa.media, 24_000);
      };
      qa.sample = sampleMedia;
      qa.reset = () => {
        qa.scroll.length = 0;
        qa.media.length = 0;
        qa.mediaEvents.length = 0;
        qa.longTasks.length = 0;
        qa.rejections.length = 0;
        sampleMedia("reset");
      };
      window.__tascCrossDeviceQa = qa;

      addEventListener(
        "scroll",
        () => {
          qa.scroll.push({ t: performance.now(), y: scrollY, root: rootState() });
          cap(qa.scroll, 30_000);
        },
        { passive: true },
      );
      for (const type of [
        "loadstart",
        "loadedmetadata",
        "loadeddata",
        "canplay",
        "play",
        "playing",
        "pause",
        "waiting",
        "stalled",
        "seeking",
        "seeked",
        "ended",
        "error",
      ]) {
        document.addEventListener(
          type,
          (event) => {
            if (!(event.target instanceof HTMLMediaElement)) return;
            qa.mediaEvents.push({ t: performance.now(), type, video: describeVideo(event.target) });
            cap(qa.mediaEvents, 12_000);
          },
          true,
        );
      }
      addEventListener("unhandledrejection", (event) => {
        qa.rejections.push({ t: performance.now(), reason: String(event.reason) });
        cap(qa.rejections, 2_000);
      });
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            qa.longTasks.push({ t: entry.startTime, duration: entry.duration, name: entry.name });
          }
          cap(qa.longTasks, 4_000);
        });
        observer.observe({ type: "longtask", buffered: true });
      } catch {
        // WebKit may not expose Long Tasks.
      }
      setInterval(() => sampleMedia("interval"), 100);
    },
    {
      connection:
        networkProfile.name === "normal"
          ? null
          : {
              effectiveType: networkProfile.effectiveType,
              downlinkMbps: networkProfile.downlinkMbps,
              rttMs: networkProfile.rttMs,
            },
    },
  );
};

const installWebKitNetworkThrottle = async (context, networkProfile, baseOrigin) => {
  if (networkProfile.name === "normal") {
    return { mode: "none", approximated: false, bytes: 0, requestCount: 0 };
  }
  const telemetry = {
    mode: "route-whole-response-aggregate-bandwidth",
    approximated: true,
    bytes: 0,
    requestCount: 0,
    totalScheduledDelayMs: 0,
  };
  let transferAvailableAt = Date.now();
  await context.route("**/*", async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    if (
      target.origin !== baseOrigin ||
      request.method() !== "GET" ||
      request.resourceType() === "websocket"
    ) {
      await route.continue();
      return;
    }
    try {
      const response = await route.fetch({ timeout: 180_000 });
      const body = await response.body();
      const now = Date.now();
      const transferMs = Math.ceil(
        (body.byteLength / Math.max(1, networkProfile.downloadBytesPerSecond)) * 1000,
      );
      const deliveryAt = Math.max(now + networkProfile.latencyMs, transferAvailableAt) + transferMs;
      transferAvailableAt = deliveryAt;
      const waitMs = Math.max(0, deliveryAt - Date.now());
      telemetry.bytes += body.byteLength;
      telemetry.requestCount += 1;
      telemetry.totalScheduledDelayMs += waitMs;
      await delay(waitMs);
      await route.fulfill({ response, body });
    } catch {
      await route.continue();
    }
  });
  return telemetry;
};

const applyChromiumEmulation = async (
  context,
  page,
  networkProfile,
  cacheMode,
  cpuRate,
) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: cacheMode === "cold" });
  if (networkProfile.name !== "normal") {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: networkProfile.latencyMs,
      downloadThroughput: networkProfile.downloadBytesPerSecond,
      uploadThroughput: networkProfile.uploadBytesPerSecond,
      connectionType: "cellular3g",
    });
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
  return {
    mode: networkProfile.name === "normal" ? "cdp-cache-only" : "cdp-streaming",
    approximated: false,
    cpuRate,
    cdp,
  };
};

const waitForSite = async (page, timeoutMs) => {
  const startedAt = Date.now();
  await page.waitForFunction(() => !document.querySelector(".site-preloader"), null, {
    timeout: timeoutMs,
  });
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
  await page.waitForFunction(() => Boolean(document.querySelector(".site-shell")), null, {
    timeout: 15_000,
  });
  await page.waitForTimeout(450);
  return Date.now() - startedAt;
};

const makeTargetUrl = (caseId, phase) => {
  const target = new URL(baseUrl);
  target.searchParams.set("__tasc_cross_device_qa", `${runId}-${caseId}-${phase}`);
  return target.toString();
};

const readPageState = (page) =>
  page.evaluate(() => {
    const root = document.querySelector(".site-shell");
    const describe = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const overlap = Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
      return {
        selector,
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        viewportVisibility: overlap / Math.max(1, Math.min(innerHeight, rect.height)),
        display: style.display,
        visibility: style.visibility,
        opacity: Number.parseFloat(style.opacity),
        pointerEvents: style.pointerEvents,
      };
    };
    const videos = [...document.querySelectorAll("video")].map((video) => {
      const rect = video.getBoundingClientRect();
      const style = getComputedStyle(video);
      const quality = video.getVideoPlaybackQuality?.();
      const packedSurface = video.closest(".services-story-video, .lens-safari-animation");
      const surfaceClassName = packedSurface instanceof HTMLElement ? packedSurface.className : "";
      return {
        className: video.className,
        surfaceClassName,
        src: video.currentSrc || video.getAttribute("src") || "",
        currentTime: video.currentTime,
        duration: video.duration,
        readyState: video.readyState,
        networkState: video.networkState,
        paused: video.paused,
        ended: video.ended,
        seeking: video.seeking,
        playbackRate: video.playbackRate,
        errorCode: video.error?.code ?? null,
        active: video.dataset.dominoActive ?? null,
        direction: video.dataset.dominoDirection ?? null,
        segmentState: video.dataset.segmentState ?? null,
        display: style.display,
        visibility: style.visibility,
        opacity: Number.parseFloat(style.opacity),
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        totalFrames: quality?.totalVideoFrames ?? null,
        droppedFrames: quality?.droppedVideoFrames ?? null,
      };
    });
    return {
      t: performance.now(),
      y: scrollY,
      maxY: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      viewport: {
        width: innerWidth,
        height: innerHeight,
        visualHeight: visualViewport?.height ?? null,
      },
      horizontalOverflow: Math.max(
        0,
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      root: root instanceof HTMLElement ? { ...root.dataset } : null,
      sections: {
        hero: describe(".hero-motion"),
        vision: describe(".second-stage"),
        clients: describe(".figma-clients-section"),
        services: describe(".services-story-section"),
        work: describe(".how-work-motion-section"),
        datum: describe(".datum-motion-section"),
        process: describe(".process-contact-section"),
        domino: describe(".domino-cta-section"),
        footer: describe(".site-footer"),
      },
      servicesVisuals: {
        video: describe(".services-story-video"),
        entryPoster: describe(".services-story-entry-poster"),
        stopPosters: describe(".services-story-stop-posters"),
        fallbackPoster: describe(".services-story-poster"),
      },
      videos,
    };
  });

const screenshot = async (page, directory, name, fullPage = false) => {
  const file = path.join(directory, `${slug(name)}.png`);
  await page.screenshot({ path: file, fullPage, animations: "allow" });
  return file;
};

const visibleVideo = (state, classFragment) =>
  state.videos
    .filter(
      (video) =>
        (video.className.includes(classFragment) || video.surfaceClassName?.includes(classFragment)) &&
        video.display !== "none",
    )
    .sort((left, right) => right.readyState - left.readyState || right.opacity - left.opacity)[0] ?? null;

const addCheck = (caseResult, ok, message, details = {}, severity = "failure") => {
  const record = { ok: Boolean(ok), severity, message, details };
  caseResult.checks.push(record);
  if (!record.ok) {
    if (severity === "advisory") caseResult.advisories.push(message);
    else caseResult.failures.push(message);
  }
  return record;
};

const runBaseline = async (page, caseResult, directory) => {
  if (caseResult.configuration.network.name !== "normal") {
    /* Lower-story <source> nodes are deliberately mounted after the Hero and
       first Services segment settle. On a cold constrained run the old
       baseline sampled that short deferred window and reported an empty Datum
       or Domino source as the wrong transport. Wait for the actual transport
       decision so this assertion proves selection instead of render timing. */
    await page
      .waitForFunction(
        () => {
          const sources = Array.from(document.querySelectorAll("video")).map(
            (video) => video.currentSrc || video.querySelector("source")?.src || "",
          );
          return (
            sources.some((src) => src.includes("services-keyframes")) &&
            sources.some((src) => src.includes("datum-news-loop")) &&
            sources.filter((src) => src.includes("domino-cta-")).length >= 2
          );
        },
        null,
        { timeout: 15_000 },
      )
      .catch(() => undefined);
  }

  const state = await readPageState(page);
  const proof = await screenshot(page, directory, "baseline");
  caseResult.proofFiles.push(proof);
  caseResult.baseline = state;
  addCheck(caseResult, state.horizontalOverflow <= 1, "baseline: no horizontal overflow", {
    horizontalOverflow: state.horizontalOverflow,
  });
  addCheck(caseResult, Boolean(state.sections.hero && state.sections.footer), "baseline: full page structure exists", {
    sections: Object.fromEntries(
      Object.entries(state.sections).map(([key, value]) => [key, Boolean(value)]),
    ),
  });
  addCheck(caseResult, Boolean(state.root), "baseline: site shell is hydrated");
  const mediaErrors = state.videos.filter((video) => video.errorCode != null);
  addCheck(caseResult, mediaErrors.length === 0, "baseline: no media element errors", { mediaErrors });
  if (caseResult.configuration.network.name !== "normal") {
    const selectedSources = {
      services: state.videos.find((video) => video.src.includes("services-keyframes"))?.src ?? "",
      datum: state.videos.find((video) => video.src.includes("datum-news-loop"))?.src ?? "",
      domino: state.videos
        .filter((video) => video.src.includes("domino-cta-"))
        .map((video) => video.src),
    };
    const compactSourcesSelected =
      selectedSources.services.includes("services-keyframes-packed-960-lean-20260721.mp4") &&
      selectedSources.datum.includes("datum-news-loop-mobile-lowbit-20260722.mp4") &&
      selectedSources.domino.length >= 2 &&
      selectedSources.domino.every((src) => /domino-cta-(?:forward|reverse)-mobile-/.test(src));
    addCheck(
      caseResult,
      compactSourcesSelected,
      "baseline: constrained networks select compact media transports",
      { selectedSources },
    );
  }
};

const runGalaxy = async (page, caseResult, directory, networkName) => {
  const ready = await page
    .waitForFunction(
      () => document.querySelector(".site-shell")?.getAttribute("data-starfield-mode") === "galaxy",
      null,
      { timeout: networkName === "normal" ? 15_000 : 45_000 },
    )
    .then(() => true)
    .catch(() => false);
  const locator = page.locator(".first-four-galaxy-stage").first();
  const canvasCount = await locator.locator("canvas").count();
  let firstHash = null;
  let secondHash = null;
  let firstFile = null;
  let secondFile = null;
  if (await locator.isVisible().catch(() => false)) {
    firstFile = path.join(directory, "galaxy-frame-a.png");
    secondFile = path.join(directory, "galaxy-frame-b.png");
    const firstBuffer = await locator.screenshot({ path: firstFile, animations: "allow" });
    await page.waitForTimeout(900);
    const secondBuffer = await locator.screenshot({ path: secondFile, animations: "allow" });
    firstHash = sha256(firstBuffer);
    secondHash = sha256(secondBuffer);
    caseResult.proofFiles.push(firstFile, secondFile);
  }
  caseResult.galaxy = { ready, canvasCount, firstHash, secondHash, firstFile, secondFile };
  addCheck(caseResult, ready, "galaxy: live component reaches ready state", { ready, canvasCount });
  addCheck(caseResult, canvasCount >= 1, "galaxy: a real canvas is mounted", { canvasCount });
  addCheck(
    caseResult,
    Boolean(firstHash && secondHash && firstHash !== secondHash),
    "galaxy: rendered frames animate instead of remaining static dots",
    { firstHash, secondHash },
  );
};

const probeClick = async (page, locator, label) => {
  const visible = await locator.isVisible().catch(() => false);
  if (!visible) return { label, visible, hit: false, clicked: false, geometry: null };
  const geometry = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(centerX, centerY);
    const style = getComputedStyle(element);
    return {
      centerX,
      centerY,
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      hit: hit === element || (hit instanceof Element && element.contains(hit)),
      pointerEvents: style.pointerEvents,
      opacity: Number.parseFloat(style.opacity),
      visibility: style.visibility,
      semanticActionable:
        (element instanceof HTMLAnchorElement && Boolean(element.href)) ||
        (element instanceof HTMLButtonElement && !element.disabled),
      ariaDisabled: element.getAttribute("aria-disabled"),
      inert: element.closest("[inert]") !== null,
    };
  });
  /* Use raw pointer coordinates instead of locator.click(). Locator actions
     can invoke scrollIntoView/stability waits and move a pinned story while the
     harness is measuring it. A capture listener cancels the CTA navigation,
     so this still proves a browser-routed pointer click without mutating the
     scroll/hash state. */
  await page.evaluate(() => {
    window.__tascQaClickProbe = [];
    const handler = (event) => {
      const target = event.target instanceof Element ? event.target.closest("a,button") : null;
      window.__tascQaClickProbe.push({
        trusted: event.isTrusted,
        tag: target?.tagName ?? null,
        href: target instanceof HTMLAnchorElement ? target.href : null,
        text: target?.textContent?.trim() ?? null,
      });
      event.preventDefault();
      event.stopImmediatePropagation();
      document.removeEventListener("click", handler, true);
      window.__tascQaClickProbeHandler = null;
    };
    window.__tascQaClickProbeHandler = handler;
    document.addEventListener("click", handler, true);
  });
  let clickError = null;
  try {
    await page.mouse.click(geometry.centerX, geometry.centerY);
  } catch (error) {
    clickError = String(error);
  }
  const events = await page.evaluate(() => {
    const pendingHandler = window.__tascQaClickProbeHandler;
    if (pendingHandler) {
      document.removeEventListener("click", pendingHandler, true);
      window.__tascQaClickProbeHandler = null;
    }
    return window.__tascQaClickProbe ?? [];
  });
  const actionable = Boolean(
    geometry.hit &&
      geometry.semanticActionable &&
      geometry.ariaDisabled !== "true" &&
      !geometry.inert &&
      geometry.pointerEvents !== "none" &&
      geometry.visibility !== "hidden" &&
      geometry.opacity > 0.2 &&
      geometry.rect.width >= 32 &&
      geometry.rect.height >= 32 &&
      events.length > 0,
  );
  return {
    label,
    visible,
    hit: geometry.hit,
    clicked: actionable,
    geometry,
    events,
    clickError,
  };
};

const runCta = async (page, caseResult) => {
  const probes = [];
  probes.push(
    await probeClick(
      page,
      page.locator(".figma-hero-actions .figma-cta-primary").first(),
      "hero-primary",
    ),
  );
  probes.push(
    await probeClick(
      page,
      page.locator(".figma-hero-actions .figma-cta-services").first(),
      "hero-services",
    ),
  );
  caseResult.cta = probes;
  for (const probe of probes) {
    addCheck(
      caseResult,
      probe.visible && probe.hit && probe.clicked,
      `cta: ${probe.label} is visible, hit-testable and clickable`,
      probe,
    );
    addCheck(
      caseResult,
      Boolean(probe.geometry && probe.geometry.rect.height >= 36 && probe.geometry.rect.width >= 120),
      `cta: ${probe.label} keeps a usable hit area`,
      probe,
    );
  }
};

const dispatchSyntheticTouchSwipe = async (page, direction, magnitude) =>
  page.evaluate(
    async ({ sign, distance }) => {
      const centerX = Math.round(innerWidth * 0.5);
      const startY = sign > 0 ? Math.round(innerHeight * 0.74) : Math.round(innerHeight * 0.26);
      const endY = startY - sign * Math.min(Math.round(innerHeight * 0.52), distance);
      const target = document.elementFromPoint(centerX, startY) ?? document.body;
      const makeTouch = (y) => {
        try {
          return new Touch({
            identifier: 42,
            target,
            clientX: centerX,
            clientY: y,
            screenX: centerX,
            screenY: y,
            pageX: centerX,
            pageY: y + scrollY,
            radiusX: 8,
            radiusY: 8,
            rotationAngle: 0,
            force: 0.8,
          });
        } catch {
          return {
            identifier: 42,
            target,
            clientX: centerX,
            clientY: y,
            pageX: centerX,
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
        return { allowed, defaultPrevented: event.defaultPrevented };
      };
      const events = [dispatch("touchstart", startY)];
      let previousY = startY;
      for (let index = 1; index <= 7; index += 1) {
        const y = Math.round(startY + ((endY - startY) * index) / 7);
        const move = dispatch("touchmove", y);
        events.push(move);
        const deltaY = previousY - y;
        if (move.allowed && !move.defaultPrevented) window.scrollBy(0, deltaY);
        previousY = y;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      events.push(dispatch("touchend", endY, true));
      return {
        adapter: "dom-touch-events-with-native-scroll-semantics",
        trusted: false,
        canceledMoves: events.filter((event) => event.defaultPrevented).length,
      };
    },
    { sign: direction, distance: magnitude },
  );

const dispatchChromiumTouchSwipe = async (cdp, page, direction, magnitude) => {
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const x = Math.round(viewport.width * 0.5);
  const startY = direction > 0 ? Math.round(viewport.height * 0.74) : Math.round(viewport.height * 0.26);
  const endY = startY - direction * Math.min(Math.round(viewport.height * 0.52), magnitude);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: startY, radiusX: 8, radiusY: 8, force: 0.8, id: 42 }],
  });
  for (let index = 1; index <= 7; index += 1) {
    const y = Math.round(startY + ((endY - startY) * index) / 7);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 0.8, id: 42 }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  return { adapter: "cdp-native-touch", trusted: true, canceledMoves: null };
};

const sendDirectionalInput = async (session, direction, magnitude, beforeState = null) => {
  const { page, caseSpec, chromiumEmulation } = session;
  if (caseSpec.input === "wheel") {
    await page.mouse.move(caseSpec.viewport.width / 2, caseSpec.viewport.height / 2);
    await page.mouse.wheel(0, direction * magnitude);
    return { adapter: "playwright-wheel", trusted: true };
  }
  if (caseSpec.input === "keyboard") {
    const key = direction > 0 ? "ArrowDown" : "ArrowUp";
    /* A batch of five ArrowDown events can enter Services and consume multiple
       authored stops before the harness gets a chance to observe any of them.
       Keep ordinary-page traversal batched, but switch to one real key press
       while an input-owned story is visible/active. This tests the product's
       keyboard semantics instead of manufacturing a key-repeat burst. */
    const storyIsNear = [beforeState?.sections?.services, beforeState?.sections?.domino].some(
      (section) =>
        section &&
        section.rect.top >= -beforeState.viewport.height * 0.35 &&
        section.rect.top <= beforeState.viewport.height * 1.35,
    );
    const storyOwnsInput =
      beforeState?.root?.motionInputLocked === "true" ||
      Boolean(beforeState?.root?.servicesActive) ||
      Boolean(beforeState?.root?.dominoPlayback);
    const count =
      storyIsNear || storyOwnsInput
        ? 1
        : Math.max(3, Math.round(caseSpec.viewport.height * 0.24 / 40));
    for (let index = 0; index < count; index += 1) await page.keyboard.press(key);
    return { adapter: "playwright-keyboard", trusted: true, key, count };
  }
  if (caseSpec.input === "touch") {
    if (chromiumEmulation?.cdp) {
      return dispatchChromiumTouchSwipe(chromiumEmulation.cdp, page, direction, magnitude);
    }
    return dispatchSyntheticTouchSwipe(page, direction, magnitude);
  }
  throw new Error(`Unhandled input: ${caseSpec.input}`);
};

const transientTransport = (state) => {
  const servicePhase = state.root?.servicesPhase;
  const domino = state.root?.dominoPlayback;
  return (
    ["playing", "reverse", "releasing"].includes(servicePhase) ||
    ["forward", "reverse", "waiting-media", "waiting-seek", "waiting-play", "waiting-frame"].includes(
      domino,
    )
  );
};

const waitForTransport = async (page, networkName) => {
  const timeoutMs = networkName === "normal" ? 20_000 : 60_000;
  const startedAt = Date.now();
  let observed = false;
  let quietSince = 0;
  let last = await readPageState(page);
  await page.waitForTimeout(100);
  while (Date.now() - startedAt < timeoutMs) {
    last = await readPageState(page);
    if (transientTransport(last)) {
      observed = true;
      quietSince = 0;
      await page.waitForTimeout(120);
      continue;
    }
    if (observed) {
      if (!quietSince) quietSince = Date.now();
      /* Services can briefly report `waiting` between a recoverable media
         retry and the next play attempt. Require a real quiet window so the
         next synthetic input cannot be queued during that retry seam and
         falsely skip an authored stop. */
      if (Date.now() - quietSince < 420) {
        await page.waitForTimeout(80);
        continue;
      }
    }
    if (observed || Date.now() - startedAt >= 420) {
      return { timedOut: false, observed, elapsedMs: Date.now() - startedAt, state: last };
    }
    await page.waitForTimeout(80);
  }
  return { timedOut: true, observed, elapsedMs: Date.now() - startedAt, state: last };
};

const captureServicesStop = async (page, pass, direction) => {
  const state = await readPageState(page);
  const phase = state.root?.servicesPhase;
  const active = Number(state.root?.servicesActive ?? 0);
  if (phase !== "waiting" || active < 1 || active > 3) return null;
  const video = visibleVideo(state, "services-story-video");
  return {
    pass,
    direction,
    active,
    phase,
    currentTime: video?.currentTime ?? null,
    readyState: video?.readyState ?? null,
    paused: video?.paused ?? null,
    segmentState: video?.segmentState ?? null,
    staticStop: state.root?.servicesStaticStop ?? null,
    mediaFallback: state.root?.servicesMediaFallback ?? null,
    visuals: state.servicesVisuals,
    source: video?.src ?? null,
    y: state.y,
  };
};

const monitorDatumLoop = async (page, caseResult, directory, networkName) => {
  const initialY = await page.evaluate(() => scrollY);
  const ready = await page
    .waitForFunction(
      () => {
        const video = document.querySelector(".datum-motion-video");
        return video instanceof HTMLVideoElement && video.readyState >= 2 && !video.paused;
      },
      null,
      { timeout: networkName === "normal" ? 15_000 : 45_000 },
    )
    .then(() => true)
    .catch(() => false);
  const samples = [];
  if (ready) {
    /* The authored Datum loop runs at 0.85x, so the 6.7 s asset needs about
       7.9 wall-clock seconds before its first wrap even after play() has
       resolved. Leave enough margin for the first decoded-frame handoff and
       timer scheduling; the former 8.2 s window ended at 6.56/6.70 s on a
       healthy desktop run and produced a false failure. A cold 1 Mbps range
       plus CPU x6 still gets the longer refill window below. */
    const watchMs = networkName === "normal" ? 10_500 : 14_000;
    const startedAt = Date.now();
    while (Date.now() - startedAt < watchMs) {
      const sample = await page.evaluate(() => {
          const video = document.querySelector(".datum-motion-video");
          return video instanceof HTMLVideoElement
            ? {
                t: performance.now(),
                y: scrollY,
                currentTime: video.currentTime,
                duration: video.duration,
                readyState: video.readyState,
                paused: video.paused,
              }
            : null;
        });
      samples.push(sample);
      const usable = samples.filter(Boolean);
      if (
        usable.length > 2 &&
        usable[usable.length - 2].currentTime - usable[usable.length - 1].currentTime > 1
      ) {
        break;
      }
      await page.waitForTimeout(160);
    }
  }
  const usable = samples.filter(Boolean);
  const times = usable.map((sample) => sample.currentTime);
  const movement = times.length ? Math.max(...times) - Math.min(...times) : 0;
  const wrapped = usable.some(
    (sample, index) => index > 0 && usable[index - 1].currentTime - sample.currentTime > 1,
  );
  const scrollDrift = usable.length
    ? Math.max(...usable.map((sample) => Math.abs(sample.y - initialY)))
    : Number.POSITIVE_INFINITY;
  const proof = await screenshot(page, directory, "datum-loop");
  caseResult.proofFiles.push(proof);
  const result = { ready, samples: usable, movement, wrapped, scrollDrift, proof };
  addCheck(caseResult, ready, "datum: loop video becomes decoded and playing", result);
  addCheck(caseResult, movement >= 1.5, "datum: decoded currentTime moves continuously", result);
  addCheck(caseResult, wrapped, "datum: autonomous playback completes a real loop", result);
  /* Native wheel momentum can settle by a few CSS pixels after the 25%
     threshold fires. Treat that sub-frame tail as normal, while still
     failing the section jumps (dozens/hundreds of pixels) reported by the
     client. */
  addCheck(caseResult, scrollDrift <= 12, "datum: loop playback does not jerk the document", result);
  return result;
};

const traverse = async (session, caseResult, directory, direction, pass) => {
  const { page, caseSpec } = session;
  const steps = [];
  const servicesStops = [];
  const capturedStops = new Set();
  let reached = false;
  let stagnant = 0;
  let datumResult = null;
  const maximumInputs = caseSpec.input === "keyboard" ? 420 : 300;
  const magnitude = Math.round(caseSpec.viewport.height * 0.56);
  const startTime = Date.now();

  for (let index = 0; index < maximumInputs; index += 1) {
    const before = await readPageState(page);
    const atTarget = direction > 0 ? before.y >= before.maxY - 3 : before.y <= 3;
    if (atTarget) {
      reached = true;
      break;
    }
    const adapter = await sendDirectionalInput(session, direction, magnitude, before);
    const transport = await waitForTransport(page, caseSpec.network);
    await page.waitForTimeout(caseSpec.input === "touch" ? 90 : 130);
    const after = await readPageState(page);
    const deltaY = after.y - before.y;
    const expectedDelta = direction * deltaY;
    const locked =
      before.root?.motionInputLocked === "true" ||
      after.root?.motionInputLocked === "true" ||
      transport.observed;
    const step = {
      index,
      pass,
      direction,
      adapter,
      before: {
        y: before.y,
        root: before.root,
        sections: before.sections,
        servicesVisuals: before.servicesVisuals,
        horizontalOverflow: before.horizontalOverflow,
      },
      after: {
        y: after.y,
        root: after.root,
        sections: after.sections,
        servicesVisuals: after.servicesVisuals,
        horizontalOverflow: after.horizontalOverflow,
      },
      deltaY,
      normalizedDelta: Math.abs(deltaY) / Math.max(1, after.viewport.height),
      expectedDelta,
      locked,
      transport: {
        timedOut: transport.timedOut,
        observed: transport.observed,
        elapsedMs: transport.elapsedMs,
      },
    };
    steps.push(step);

    if (transport.timedOut) {
      addCheck(caseResult, false, `${pass}: media transport settles before timeout`, step);
      break;
    }
    if (after.horizontalOverflow > 1) {
      addCheck(caseResult, false, `${pass}: no horizontal overflow while scrolling`, step);
      break;
    }

    const stop = await captureServicesStop(page, pass, direction);
    if (stop) {
      const key = `${stop.active}-${Math.round((stop.currentTime ?? -1) * 10)}`;
      if (!capturedStops.has(key)) {
        capturedStops.add(key);
        servicesStops.push(stop);
        const proof = await screenshot(page, directory, `${pass}-services-stop-${stop.active}-${servicesStops.length}`);
        caseResult.proofFiles.push(proof);
        const serviceCta = page
          .locator(`.services-story-card-${stop.active} .services-story-cta`)
          .first();
        if (await serviceCta.isVisible().catch(() => false)) {
          const probe = await probeClick(page, serviceCta, `${pass}-services-${stop.active}`);
          caseResult.cta.push(probe);
          addCheck(
            caseResult,
            probe.visible && probe.hit && probe.clicked,
            `cta: Services stage ${stop.active} remains interactive during ${pass}`,
            probe,
          );
        }
      }
    }

    if (
      !datumResult &&
      pass === "forward-1" &&
      direction > 0 &&
      after.sections.datum?.viewportVisibility >= 0.25
    ) {
      datumResult = await monitorDatumLoop(page, caseResult, directory, caseSpec.network);
    }

    const intentionalHandoff =
      before.root?.dominoPlayback ||
      after.root?.dominoPlayback ||
      before.root?.servicesPhase ||
      after.root?.servicesPhase;
    if (expectedDelta < -12 && !locked && !intentionalHandoff) {
      addCheck(caseResult, false, `${pass}: scroll never moves against the user's direction`, step);
      break;
    }

    if (Math.abs(deltaY) <= 1 && !locked) stagnant += 1;
    else stagnant = 0;
    if (stagnant >= 12) {
      addCheck(caseResult, false, `${pass}: scroll does not become stuck`, {
        stagnant,
        recentSteps: steps.slice(-14),
      });
      break;
    }
  }

  await page.waitForTimeout(800);
  const final = await readPageState(page);
  if (direction > 0) reached = final.y >= final.maxY - 4;
  else reached = final.y <= 4;
  addCheck(caseResult, reached, `${pass}: traversal reaches the ${direction > 0 ? "footer" : "hero"}`, {
    finalY: final.y,
    maxY: final.maxY,
    inputCount: steps.length,
  });
  const proof = await screenshot(page, directory, `${pass}-terminal`);
  caseResult.proofFiles.push(proof);
  return {
    pass,
    direction,
    reached,
    elapsedMs: Date.now() - startTime,
    steps,
    servicesStops,
    datum: datumResult,
    terminal: final,
    proof,
  };
};

const validateServicesStops = (caseResult, traversals) => {
  const forwardExpected = [3, 187 / 30, 307 / 30];
  const reverseExpected = { 2: 460 / 30, 1: 557 / 30 };
  for (const traversal of traversals) {
    const stops = traversal.servicesStops;
    if (traversal.direction > 0) {
      for (let stage = 1; stage <= 3; stage += 1) {
        const candidates = stops.filter((stop) => stop.active === stage);
        const exact = candidates.some(
          (stop) => Number.isFinite(stop.currentTime) && Math.abs(stop.currentTime - forwardExpected[stage - 1]) <= 0.22,
        );
        addCheck(
          caseResult,
          exact,
          `services: ${traversal.pass} pauses on authored stop ${stage}`,
          { expected: forwardExpected[stage - 1], candidates },
        );
      }
    } else {
      for (const [stageText, expected] of Object.entries(reverseExpected)) {
        const stage = Number(stageText);
        const candidates = stops.filter((stop) => stop.active === stage);
        const exact = candidates.some(
          (stop) => Number.isFinite(stop.currentTime) && Math.abs(stop.currentTime - expected) <= 0.24,
        );
        addCheck(caseResult, exact, `services: reverse pauses on authored stop ${stage}`, {
          expected,
          candidates,
        });
      }
    }
    /* Reverse entry intentionally paints the authored stop-three poster while
       the first reverse GOP is armed. A traversal can also sample the same
       authored stage twice while it is releasing its input lock. Judge one
       decoded representative per authored stage so that a later transient
       buffering sample cannot turn an already-proven stop into a false
       slideshow failure. */
    const expectedStages = traversal.pass === "reverse" ? [2, 1] : [1, 2, 3];
    const isDecodedStop = (stop) =>
      Boolean(stop) &&
      !stop.mediaFallback &&
      !stop.staticStop &&
      stop.readyState >= 2 &&
      stop.segmentState === "ready" &&
      (stop.visuals?.video?.opacity ?? 1) > 0.05 &&
      (stop.visuals?.stopPosters?.opacity ?? 0) <= 0.05;
    const transportStops = expectedStages.map(
      (stage) =>
        stops.find((stop) => stop.active === stage && isDecodedStop(stop)) ??
        stops.find((stop) => stop.active === stage) ??
        null,
    );
    addCheck(
      caseResult,
      transportStops.length === expectedStages.length && transportStops.every(isDecodedStop),
      `services: ${traversal.pass} uses decoded video, not slideshow posters`,
      { stops, transportStops, expectedStages },
    );
  }
};

const groupDominoSessions = (mediaSamples) => {
  const sessions = [];
  let current = null;
  for (const sample of mediaSamples) {
    const playback = sample.root?.dominoPlayback;
    const direction = playback === "forward" || playback === "reverse" ? playback : null;
    if (!direction) {
      if (current) {
        sessions.push(current);
        current = null;
      }
      continue;
    }
    const active = sample.videos.find(
      (video) => video.className.includes("domino-sequence") && video.active === "true",
    );
    if (!current || current.direction !== direction) {
      if (current) sessions.push(current);
      current = { direction, samples: [] };
    }
    if (active) current.samples.push({ t: sample.t, video: active, y: sample.y });
  }
  if (current) sessions.push(current);
  return sessions
    .filter((session) => session.samples.length >= 2)
    .map((session) => {
      const times = session.samples.map((sample) => sample.video.currentTime);
      return {
        direction: session.direction,
        sampleCount: session.samples.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        movement: Math.max(...times) - Math.min(...times),
        duration: Math.max(...session.samples.map((sample) => sample.video.duration || 0)),
        maxReadyState: Math.max(...session.samples.map((sample) => sample.video.readyState)),
        source: session.samples.at(-1).video.src,
      };
    });
};

const analyzeScrollTrace = (scroll, viewportHeight) => {
  const deltas = [];
  const jumps = [];
  for (let index = 1; index < scroll.length; index += 1) {
    const previous = scroll[index - 1];
    const current = scroll[index];
    const dt = Math.max(0.1, current.t - previous.t);
    const dy = current.y - previous.y;
    const locked =
      previous.root?.motionInputLocked === "true" ||
      current.root?.motionInputLocked === "true" ||
      previous.root?.dominoPlayback === "forward" ||
      previous.root?.dominoPlayback === "reverse" ||
      current.root?.dominoPlayback === "complete" ||
      current.root?.dominoPlayback === "start" ||
      previous.root?.servicesPhase === "releasing" ||
      current.root?.servicesPhase === "releasing" ||
      previous.root?.programmaticAnchor ||
      current.root?.programmaticAnchor;
    const record = {
      t: current.t,
      dt,
      dy,
      velocityPxPerMs: dy / dt,
      normalizedDelta: Math.abs(dy) / Math.max(1, viewportHeight),
      locked: Boolean(locked),
    };
    deltas.push(record);
    if (!locked && dt <= 160 && Math.abs(dy) > viewportHeight * 0.95) jumps.push(record);
  }
  const velocities = deltas.filter((delta) => !delta.locked).map((delta) => Math.abs(delta.velocityPxPerMs));
  return {
    sampleCount: scroll.length,
    deltaCount: deltas.length,
    jumps,
    medianVelocityPxPerMs: median(velocities),
    p95VelocityPxPerMs: percentile(velocities, 0.95),
    maxVelocityPxPerMs: velocities.length ? Math.max(...velocities) : null,
  };
};

const analyzeMediaStalls = (mediaSamples) => {
  const byVideo = new Map();
  for (const sample of mediaSamples) {
    for (const video of sample.videos) {
      const decodedPlayback = !video.paused && video.readyState >= 3;
      const activeTransport =
        decodedPlayback && (((video.className.includes("services-story-video") ||
          video.surfaceClassName?.includes("services-story-video")) &&
          ["playing", "reverse"].includes(sample.root?.servicesPhase) &&
          ["playing", "scrubbing"].includes(video.segmentState)) ||
        (video.className.includes("domino-sequence") &&
          video.active === "true" &&
          ["forward", "reverse"].includes(sample.root?.dominoPlayback) &&
          video.segmentState === "playing") ||
        (video.className.includes("datum-motion-video") &&
          video.visiblePixels > 0 &&
          video.playbackState === "playing"));
      if (!activeTransport) continue;
      if (!byVideo.has(video.key)) byVideo.set(video.key, []);
      byVideo.get(video.key).push({ t: sample.t, currentTime: video.currentTime, video });
    }
  }
  return [...byVideo.entries()].map(([key, samples]) => {
    let freezeStartedAt = null;
    let maxFreezeMs = 0;
    let previous = null;
    for (const sample of samples) {
      /* Samples are intentionally omitted while a transport is offscreen or
         waiting at an authored keyframe. Do not bridge that inactive gap and
         report it as a frozen decoded frame when the same video becomes
         active again later in the down/up/replay journey. */
      const continuousActiveWindow = previous && sample.t - previous.t <= 650;
      if (
        !continuousActiveWindow ||
        Math.abs(sample.currentTime - previous.currentTime) > 1 / 120
      ) {
        freezeStartedAt = sample.t;
      } else if (freezeStartedAt != null) {
        maxFreezeMs = Math.max(maxFreezeMs, sample.t - freezeStartedAt);
      }
      previous = sample;
    }
    const latest = samples.at(-1)?.video;
    const dropRatio =
      latest?.totalFrames > 0 && latest?.droppedFrames != null
        ? latest.droppedFrames / latest.totalFrames
        : null;
    return {
      key,
      sampleCount: samples.length,
      minTime: Math.min(...samples.map((sample) => sample.currentTime)),
      maxTime: Math.max(...samples.map((sample) => sample.currentTime)),
      movement:
        Math.max(...samples.map((sample) => sample.currentTime)) -
        Math.min(...samples.map((sample) => sample.currentTime)),
      maxFreezeMs,
      dropRatio,
      readyState: latest?.readyState ?? null,
      errorCode: latest?.errorCode ?? null,
    };
  });
};

const runJourney = async (session, caseResult, directory) => {
  const { page, caseSpec } = session;
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.__tascCrossDeviceQa?.reset?.();
  });
  await page.waitForTimeout(600);
  const traversals = [];
  traversals.push(await traverse(session, caseResult, directory, 1, "forward-1"));
  traversals.push(await traverse(session, caseResult, directory, -1, "reverse"));
  traversals.push(await traverse(session, caseResult, directory, 1, "forward-2"));
  validateServicesStops(caseResult, traversals);

  const servicesJourneyStates = traversals.flatMap((traversal) =>
    traversal.steps.flatMap((step) => [
      { pass: traversal.pass, position: "before", ...step.before },
      { pass: traversal.pass, position: "after", ...step.after },
    ]),
  );
  const conflictingServicesSurfaces = servicesJourneyStates.filter(
    (state) =>
      state.root?.servicesMediaDecoded === "true" &&
      state.root?.servicesStaticStop != null,
  );
  const isPaintedSurface = (surface) =>
    Boolean(
      surface &&
        surface.display !== "none" &&
        surface.visibility !== "hidden" &&
        (surface.opacity ?? 0) > 0.05 &&
        (surface.viewportVisibility ?? 0) > 0.01,
    );
  const blankServicesTransportStates = servicesJourneyStates.filter((state) => {
    const phase = state.root?.servicesPhase;
    const transportOwnsFrame =
      state.root?.servicesInrange === "true" &&
      (phase === "playing" || phase === "waiting" || phase === "releasing");
    if (!transportOwnsFrame || (state.sections?.services?.viewportVisibility ?? 0) <= 0.01) return false;
    const surfaces = state.servicesVisuals ?? {};
    return ![
      surfaces.video,
      surfaces.entryPoster,
      surfaces.stopPosters,
      surfaces.fallbackPoster,
    ].some(isPaintedSurface);
  });
  const hiddenDecodedServicesStates = servicesJourneyStates.filter((state) => {
    const phase = state.root?.servicesPhase;
    const decodedSurfaceOwnsFrame =
      state.root?.servicesInrange === "true" &&
      state.root?.servicesMediaDecoded === "true" &&
      state.root?.servicesStaticStop == null &&
      state.root?.servicesMediaFallback !== "true" &&
      (phase === "playing" || phase === "waiting" || phase === "releasing");
    if (!decodedSurfaceOwnsFrame || (state.sections?.services?.viewportVisibility ?? 0) <= 0.01) return false;
    return !isPaintedSurface(state.servicesVisuals?.video);
  });
  addCheck(
    caseResult,
    conflictingServicesSurfaces.length === 0,
    "services: decoded video and static poster state never conflict",
    { conflictingServicesSurfaces },
  );
  addCheck(
    caseResult,
    blankServicesTransportStates.length === 0,
    "services: a painted media surface remains present through transport and release",
    { blankServicesTransportStates },
  );
  addCheck(
    caseResult,
    hiddenDecodedServicesStates.length === 0,
    "services: decoded live surface remains visible while transport owns the frame",
    { hiddenDecodedServicesStates },
  );

  const telemetry = await page.evaluate(() => window.__tascCrossDeviceQa ?? null);
  const scrollAnalysis = analyzeScrollTrace(telemetry?.scroll ?? [], caseSpec.viewport.height);
  const mediaStalls = analyzeMediaStalls(telemetry?.media ?? []);
  const dominoSessions = groupDominoSessions(telemetry?.media ?? []);
  const forwardDomino = dominoSessions.filter((session) => session.direction === "forward");
  const reverseDomino = dominoSessions.filter((session) => session.direction === "reverse");

  addCheck(caseResult, scrollAnalysis.jumps.length === 0, "journey: no unexplained viewport-sized scroll jumps", {
    scrollAnalysis,
  });
  addCheck(
    caseResult,
    mediaStalls.every((stall) => stall.maxFreezeMs <= 900 && stall.errorCode == null),
    "journey: active videos do not freeze into a slideshow",
    { mediaStalls },
  );
  addCheck(
    caseResult,
    mediaStalls.every((stall) => stall.dropRatio == null || stall.dropRatio <= 0.25),
    "journey: decoded-frame drop ratio stays below 25 percent",
    { mediaStalls },
    "advisory",
  );
  addCheck(
    caseResult,
    forwardDomino.length >= 2 && forwardDomino.slice(0, 2).every((session) => session.movement >= 2.6),
    "domino: forward animation plays on first entry and replay",
    { dominoSessions },
  );
  addCheck(
    caseResult,
    reverseDomino.length >= 1 && reverseDomino.some((session) => session.movement >= 2.6),
    "domino: reverse animation is decoded and played",
    { dominoSessions },
  );

  const passMedians = Object.fromEntries(
    traversals.map((traversal) => [
      traversal.pass,
      median(
        traversal.steps
          .filter((step) => !step.locked && step.expectedDelta > 1)
          .map((step) => step.normalizedDelta),
      ),
    ]),
  );
  const first = passMedians["forward-1"];
  const reverse = passMedians.reverse;
  const replay = passMedians["forward-2"];
  const ratios = {
    forwardReverse:
      first && reverse ? Math.max(first, reverse) / Math.max(0.001, Math.min(first, reverse)) : null,
    firstReplay:
      first && replay ? Math.max(first, replay) / Math.max(0.001, Math.min(first, replay)) : null,
  };
  addCheck(
    caseResult,
    ratios.forwardReverse == null || ratios.forwardReverse <= 2.2,
    "journey: forward and reverse ordinary-scroll speeds remain comparable",
    { passMedians, ratios },
  );
  addCheck(
    caseResult,
    ratios.firstReplay == null || ratios.firstReplay <= 1.8,
    "journey: replay scroll speed remains stable",
    { passMedians, ratios },
  );

  caseResult.journey = {
    traversals,
    scrollAnalysis,
    mediaStalls,
    dominoSessions,
    passMedians,
    ratios,
    telemetry: {
      mediaEvents: telemetry?.mediaEvents ?? [],
      longTasks: telemetry?.longTasks ?? [],
      rejections: telemetry?.rejections ?? [],
      scrollSampleCount: telemetry?.scroll?.length ?? 0,
      mediaSampleCount: telemetry?.media?.length ?? 0,
    },
  };
};

const filterDiagnostics = (caseResult) => {
  const ignoredRequest = (entry) =>
    /ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(entry.errorText ?? "") ||
    /google\.com\/maps|maps\.googleapis\.com|maps\.gstatic\.com/i.test(entry.url);
  const ignoredConsole = (message) =>
    /maps\.googleapis\.com|maps\.gstatic\.com|MapsJsInternalService/i.test(message);
  const hardRequestFailures = caseResult.diagnostics.requestFailures.filter(
    (entry) => !ignoredRequest(entry),
  );
  const hardResponses = caseResult.diagnostics.badResponses.filter(
    (entry) => !/google\.com\/maps|maps\.googleapis\.com|maps\.gstatic\.com/i.test(entry.url),
  );
  const consoleErrors = caseResult.diagnostics.consoleErrors.filter(
    (entry) => !ignoredConsole(entry),
  );
  addCheck(
    caseResult,
    consoleErrors.length === 0 && caseResult.diagnostics.pageErrors.length === 0,
    "runtime: no console or page errors",
    { consoleErrors, pageErrors: caseResult.diagnostics.pageErrors },
  );
  addCheck(caseResult, hardRequestFailures.length === 0, "runtime: no hard request failures", {
    hardRequestFailures,
  });
  addCheck(caseResult, hardResponses.length === 0, "runtime: no HTTP error responses", {
    hardResponses,
  });
  const mediaErrors = caseResult.diagnostics.mediaResponses.filter(
    (entry) => entry.status >= 400 || entry.status === 0,
  );
  addCheck(caseResult, mediaErrors.length === 0, "runtime: every requested media asset succeeds", {
    mediaErrors,
  });
};

const runCase = async (caseSpec) => {
  const profile = ENGINE_PROFILES[caseSpec.engine];
  const networkProfile = NETWORKS[caseSpec.network];
  const cpuRate = forcedCpuRate ?? networkProfile.defaultCpuRate;
  const directory = path.join(outputRoot, caseSpec.id);
  fs.mkdirSync(directory, { recursive: true });

  const caseResult = {
    schemaVersion: 1,
    id: caseSpec.id,
    startedAt: new Date().toISOString(),
    configuration: {
      engine: caseSpec.engine,
      browserFamily: profile.cdp ? "chromium" : "webkit",
      executablePath: profile.executablePath ?? null,
      viewport: caseSpec.viewport,
      input: caseSpec.input,
      cache: caseSpec.cache,
      network: networkProfile,
      cpuRate: profile.cdp ? cpuRate : null,
      cpuThrottleSupported: profile.cdp,
      scenarios: caseSpec.scenarios,
      baseUrl,
    },
    checks: [],
    failures: [],
    advisories: [],
    proofFiles: [],
    cta: [],
    diagnostics: {
      consoleErrors: [],
      consoleWarnings: [],
      pageErrors: [],
      requestFailures: [],
      badResponses: [],
      mediaResponses: [],
    },
  };

  let browser;
  let context;
  try {
    browser = await profile.browserType.launch({
      headless: !headed,
      ...(profile.executablePath ? { executablePath: profile.executablePath } : {}),
    });
    caseResult.configuration.browserVersion = browser.version();
    const ua = userAgentFor(caseSpec.engine, caseSpec.viewport);
    context = await browser.newContext({
      viewport: { width: caseSpec.viewport.width, height: caseSpec.viewport.height },
      deviceScaleFactor: caseSpec.viewport.deviceScaleFactor,
      isMobile: caseSpec.viewport.mobile,
      hasTouch: caseSpec.viewport.mobile || caseSpec.input === "touch",
      colorScheme: "dark",
      reducedMotion: "no-preference",
      locale: "en-US",
      timezoneId: "America/Chicago",
      serviceWorkers: "block",
      ...(ua ? { userAgent: ua } : {}),
    });
    await addBrowserInstrumentation(context, networkProfile);
    const webkitThrottle = profile.cdp
      ? null
      : await installWebKitNetworkThrottle(context, networkProfile, new URL(baseUrl).origin);
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") caseResult.diagnostics.consoleErrors.push(message.text());
      if (message.type() === "warning") caseResult.diagnostics.consoleWarnings.push(message.text());
    });
    page.on("pageerror", (error) => caseResult.diagnostics.pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      caseResult.diagnostics.requestFailures.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        errorText: request.failure()?.errorText ?? "unknown",
      });
    });
    page.on("response", (response) => {
      const request = response.request();
      const record = {
        url: response.url(),
        status: response.status(),
        resourceType: request.resourceType(),
        fromServiceWorker: response.fromServiceWorker(),
      };
      if (response.status() >= 400) caseResult.diagnostics.badResponses.push(record);
      if (
        request.resourceType() === "media" ||
        /\.(?:mp4|webm|mov|apng)(?:\?|$)/i.test(response.url())
      ) {
        caseResult.diagnostics.mediaResponses.push(record);
      }
    });

    const chromiumEmulation = profile.cdp
      ? await applyChromiumEmulation(context, page, networkProfile, caseSpec.cache, cpuRate)
      : null;
    caseResult.emulation = {
      network: chromiumEmulation
        ? {
            mode: chromiumEmulation.mode,
            approximated: chromiumEmulation.approximated,
          }
        : webkitThrottle,
      cpu: profile.cdp
        ? { supported: true, appliedRate: cpuRate }
        : { supported: false, appliedRate: null },
      input:
        caseSpec.input === "touch" && !profile.cdp
          ? { mode: "DOM TouchEvent plus cancel-aware scroll fallback", trusted: false }
          : { mode: caseSpec.input, trusted: true },
    };

    const navigationTimeout = networkProfile.name === "normal" ? 60_000 : 180_000;
    if (caseSpec.cache === "warm") {
      await page.goto(makeTargetUrl(caseSpec.id, "warmup"), {
        waitUntil: "domcontentloaded",
        timeout: navigationTimeout,
      });
      await waitForSite(page, navigationTimeout);
      await page.waitForTimeout(networkProfile.name === "normal" ? 1_800 : 4_000);
    }
    const finalUrl = makeTargetUrl(caseSpec.id, "measured");
    const navigationStartedAt = Date.now();
    await page.goto(finalUrl, { waitUntil: "domcontentloaded", timeout: navigationTimeout });
    const preloaderMs = await waitForSite(page, navigationTimeout);
    caseResult.load = {
      finalUrl,
      totalNavigationMs: Date.now() - navigationStartedAt,
      preloaderMs,
    };

    const session = { page, context, browser, caseSpec, chromiumEmulation };
    if (caseSpec.scenarios.includes("baseline")) await runBaseline(page, caseResult, directory);
    if (caseSpec.scenarios.includes("galaxy")) {
      await runGalaxy(page, caseResult, directory, networkProfile.name);
    }
    if (caseSpec.scenarios.includes("cta")) await runCta(page, caseResult);
    if (caseSpec.scenarios.includes("journey")) {
      await runJourney(session, caseResult, directory);
    }
    filterDiagnostics(caseResult);
  } catch (error) {
    caseResult.failures.push("harness: case completed without exception");
    caseResult.checks.push({
      ok: false,
      severity: "failure",
      message: "harness: case completed without exception",
      details: {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
      },
    });
  } finally {
    caseResult.completedAt = new Date().toISOString();
    caseResult.passed =
      caseResult.failures.length === 0 && (!failOnAdvisory || caseResult.advisories.length === 0);
    fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(caseResult, null, 2));
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
  return caseResult;
};

const results = [];
for (const caseSpec of plannedCases) {
  console.log(`[${caseSpec.index}/${plannedCases.length}] ${caseSpec.id}`);
  const result = await runCase(caseSpec);
  results.push(result);
  console.log(
    JSON.stringify(
      {
        id: result.id,
        passed: result.passed,
        failures: result.failures,
        advisories: result.advisories,
        resultFile: path.join(outputRoot, result.id, "results.json"),
      },
      null,
      2,
    ),
  );
}

const speedGroups = new Map();
for (const result of results) {
  const medianStep = result.journey?.passMedians?.["forward-1"];
  if (!Number.isFinite(medianStep)) continue;
  const key = `${result.configuration.input}|${result.configuration.cache}|${result.configuration.network.name}`;
  if (!speedGroups.has(key)) speedGroups.set(key, []);
  speedGroups.get(key).push({ id: result.id, medianNormalizedStep: medianStep });
}
const crossCaseSpeed = [...speedGroups.entries()].map(([key, entries]) => {
  const values = entries.map((entry) => entry.medianNormalizedStep);
  const ratio =
    values.length >= 2
      ? Math.max(...values) / Math.max(0.001, Math.min(...values))
      : null;
  return {
    key,
    entries,
    ratio,
    comparable: values.length >= 2,
    ok: ratio == null || ratio <= 2.4,
  };
});

const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  runId,
  preset: presetName,
  baseUrl,
  caseCount: results.length,
  passedCount: results.filter((result) => result.passed).length,
  failedCount: results.filter((result) => !result.passed).length,
  advisoryCount: results.reduce((sum, result) => sum + result.advisories.length, 0),
  crossCaseSpeed,
  crossCaseSpeedFailures: crossCaseSpeed.filter((group) => !group.ok),
  cases: results.map((result) => ({
    id: result.id,
    passed: result.passed,
    failures: result.failures,
    advisories: result.advisories,
    configuration: result.configuration,
    resultFile: path.join(outputRoot, result.id, "results.json"),
    proofFiles: result.proofFiles,
  })),
};

const summaryPath = path.join(outputRoot, "summary.json");
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, cases: summary.cases.map(({ proofFiles, ...rest }) => rest) }, null, 2));

if (summary.failedCount > 0 || summary.crossCaseSpeedFailures.length > 0) process.exitCode = 1;
