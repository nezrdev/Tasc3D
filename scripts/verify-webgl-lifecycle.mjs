import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
      throw new Error("Playwright is unavailable. Run `pnpm install --frozen-lockfile`, then retry.");
    }
    return require(candidate);
  }
};

const playwright = loadPlaywright();
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.join(projectRoot, "work");

const HELP = `
TASC WebGL lifecycle QA

Usage:
  node scripts/verify-webgl-lifecycle.mjs [options]

Options:
  --url=http://127.0.0.1:3154/       Running app URL
  --engines=chromium,webkit          Browser engines to run
  --output=work/webgl-lifecycle.json Output JSON path
  --timeout=45000                    Per-wait timeout in ms
  --services-delay-ms=0              Delay the first Services media request
  --headed                           Show browsers
  --dry-run                          Print planned matrix/checks without launching browsers
  --help                             Print this help

Hard gates:
  - mobile initial and Services phases keep all live, non-lost WebGL contexts at peak/current <= 2
  - Galaxy canvas is painted and animated
  - Services uses decoded video, not poster-only fallback
  - WEBGL_lose_context recovery is verified for Galaxy and PackedAlpha when present
  - three artificial reinit failures reach static fallback only through an app-provided test hook
`.trim();

const parseArguments = (argv) => {
  const flags = new Set(["headed", "dry-run", "help"]);
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

const splitList = (value, fallback) => {
  const parsed = String(value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
};

const args = parseArguments(process.argv.slice(2));
if (args.help) {
  console.log(HELP);
  process.exit(0);
}

const ENGINES = {
  chromium: playwright.chromium,
  webkit: playwright.webkit,
};

const selectedEngines = splitList(args.engines, ["chromium", "webkit"]);
for (const engine of selectedEngines) {
  if (!ENGINES[engine]) throw new Error(`Unsupported --engines entry: ${engine}`);
}

const baseUrl = new URL(args.url ?? "http://127.0.0.1:3154/").toString();
const timeoutMs = Math.max(5_000, Number.parseInt(args.timeout ?? "45000", 10));
const servicesDelayMs = Math.max(0, Number.parseInt(args["services-delay-ms"] ?? "0", 10));
const headed = Boolean(args.headed);
const dryRun = Boolean(args["dry-run"]);
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const requestedOutput = args.output
  ? path.resolve(projectRoot, args.output)
  : path.join(workRoot, `webgl-lifecycle-${runId}.json`);

const MOBILE_PROFILE = {
  name: "mobile",
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
};

const CHECKS = [
  "initial: all live non-lost WebGL contexts peak/current <= 2",
  "services: all live non-lost WebGL contexts peak/current <= 2",
  "galaxy: canvas is painted and animated",
  "services: decoded video is visible instead of poster-only fallback",
  "galaxy: WEBGL_lose_context restores and lifecycle reports ready/restored",
  "packed-alpha: WEBGL_lose_context restores and lifecycle reports ready/restored when present",
  "fallback: three artificial reinit failures reach static fallback via app test hook",
  "runtime: no actionable console/page/request errors",
];

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        runId,
        baseUrl,
        output: requestedOutput,
        engines: selectedEngines,
        profile: MOBILE_PROFILE,
        timeoutMs,
        servicesDelayMs,
        checks: CHECKS,
        note: "Dry run only; no browser was launched.",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

fs.mkdirSync(path.dirname(requestedOutput), { recursive: true });

const userAgentFor = (engine) =>
  engine === "webkit"
    ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"
    : "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36";

const addCheck = (caseResult, ok, message, details = {}) => {
  const record = { ok: Boolean(ok), message, details };
  caseResult.checks.push(record);
  if (!record.ok) caseResult.failures.push(message);
  return record;
};

const addUnsupported = (caseResult, message, details = {}) => {
  const record = { message, details };
  caseResult.unsupported.push(record);
  return record;
};

const ignoredRequestFailure = (entry) =>
  /ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(entry.errorText ?? "") ||
  /google\.com\/maps|maps\.googleapis\.com|maps\.gstatic\.com/i.test(entry.url);

const ignoredConsoleMessage = (message) =>
  /maps\.googleapis\.com|maps\.gstatic\.com|MapsJsInternalService/i.test(message);

const targetUrl = (caseId, forcePacked) => {
  const target = new URL(baseUrl);
  target.searchParams.set("__tasc_webgl_lifecycle_qa", `${caseId}-${runId}`);
  if (forcePacked) target.searchParams.set("forcePacked", "1");
  return target.toString();
};

const installInstrumentation = async (context) => {
  await context.addInitScript(() => {
    try {
      localStorage.setItem("tasc_cookie_consent_v1", "qa");
    } catch {}

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const records = [];
    const contextToRecord = new WeakMap();
    let sequence = 0;
    let peakConnectedNonLost = 0;

    const textFor = (element) => {
      const parts = [];
      let current = element;
      for (let depth = 0; current instanceof Element && depth < 4; depth += 1) {
        parts.push(
          [
            current.tagName.toLowerCase(),
            current.id ? `#${current.id}` : "",
            current.className ? `.${String(current.className).replace(/\s+/g, ".")}` : "",
            [...current.attributes]
              .filter((attribute) => attribute.name.startsWith("data-"))
              .map((attribute) => `[${attribute.name}=${attribute.value}]`)
              .join(""),
          ].join(""),
        );
        current = current.parentElement;
      }
      return parts.join(" ");
    };

    const roleFor = (canvas) => {
      if (
        canvas.matches(".galaxy-canvas-element") ||
        canvas.closest(".galaxy-canvas, .first-four-galaxy-stage, .services-galaxy-stage")
      ) {
        return "galaxy";
      }
      if (
        canvas.closest(
          ".services-story-video-packed, .lens-safari-animation, [data-packed-alpha-video]",
        )
      ) {
        return "packed-alpha";
      }
      const text = textFor(canvas).toLowerCase();
      if (/galaxy|starfield|stars|services-galaxy|hero/.test(text)) return "galaxy";
      if (/packed|alpha|lens-safari|services-story-video/.test(text)) return "packed-alpha";
      return "unknown";
    };

    const lifecycleFor = (canvas) => {
      const candidates = [];
      let current = canvas;
      for (let depth = 0; current instanceof HTMLElement && depth < 5; depth += 1) {
        candidates.push({
          tag: current.tagName.toLowerCase(),
          id: current.id || null,
          className: current.className ? String(current.className) : "",
          dataset: { ...current.dataset },
          lifecycle:
            current.dataset.webglLifecycle ??
            current.dataset.webglStatus ??
            current.dataset.glLifecycle ??
            current.dataset.glStatus ??
            current.dataset.renderLifecycle ??
            current.dataset.renderStatus ??
            current.dataset.lifecycle ??
            null,
          attempts:
            current.dataset.webglRestoreAttempts ??
            current.dataset.packedAlphaRestoreAttempts ??
            current.dataset.galaxyRestoreAttempts ??
            current.dataset.webglAttempts ??
            current.dataset.webglReinitAttempts ??
            current.dataset.glAttempts ??
            current.dataset.reinitAttempts ??
            null,
        });
        current = current.parentElement;
      }
      return candidates;
    };

    const contextIsLost = (record) => {
      if (record.lost) return true;
      try {
        return record.context.isContextLost();
      } catch {
        return false;
      }
    };

    const serializeRecord = (record) => {
      const rect = record.canvas.getBoundingClientRect();
      const lifecycle = lifecycleFor(record.canvas);
      const lifecycleValues = lifecycle.map((entry) => entry.lifecycle).filter(Boolean);
      const attemptValues = lifecycle
        .map((entry) => Number(entry.attempts))
        .filter((value) => Number.isFinite(value));
      const galaxyFrameValues = lifecycle
        .map((entry) => Number(entry.dataset.galaxyFrameCount))
        .filter((value) => Number.isFinite(value));
      const galaxyPhaseValues = lifecycle
        .map((entry) => Number(entry.dataset.galaxyFramePhase))
        .filter((value) => Number.isFinite(value));
      const packedAlphaFrameValues = lifecycle
        .map((entry) => Number(entry.dataset.packedAlphaFrameCount))
        .filter((value) => Number.isFinite(value));
      return {
        id: record.id,
        type: record.type,
        role: roleFor(record.canvas),
        connected: record.canvas.isConnected,
        lost: contextIsLost(record),
        width: record.canvas.width,
        height: record.canvas.height,
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        visiblePixels:
          Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left)) *
          Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top)),
        descriptor: textFor(record.canvas),
        lifecycle,
        lifecycleValues,
        attempts: attemptValues.length ? Math.max(...attemptValues) : null,
        galaxyFrameCount: galaxyFrameValues.length ? Math.max(...galaxyFrameValues) : null,
        galaxyFramePhase: galaxyPhaseValues.length ? Math.max(...galaxyPhaseValues) : null,
        packedAlphaFrameCount: packedAlphaFrameValues.length
          ? Math.max(...packedAlphaFrameValues)
          : null,
        lostEvents: record.lostEvents,
        restoredEvents: record.restoredEvents,
        createdAt: record.createdAt,
      };
    };

    const refreshPeak = () => {
      const current = records.filter((record) => !contextIsLost(record)).length;
      peakConnectedNonLost = Math.max(peakConnectedNonLost, current);
      return current;
    };

    HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...rest) {
      const context = originalGetContext.call(this, type, ...rest);
      if (context && /webgl/i.test(String(type)) && !contextToRecord.has(context)) {
        const record = {
          id: ++sequence,
          type: String(type),
          canvas: this,
          context,
          lost: false,
          lostEvents: 0,
          restoredEvents: 0,
          createdAt: performance.now(),
        };
        contextToRecord.set(context, record);
        records.push(record);
        try {
          this.dataset.tascWebglQaId = String(record.id);
        } catch {}
        this.addEventListener(
          "webglcontextlost",
          () => {
            record.lost = true;
            record.lostEvents += 1;
            window.__tascWebglQa.events.push({
              type: "webglcontextlost",
              id: record.id,
              role: roleFor(record.canvas),
              t: performance.now(),
            });
          },
          false,
        );
        this.addEventListener(
          "webglcontextrestored",
          () => {
            record.lost = false;
            record.restoredEvents += 1;
            window.__tascWebglQa.events.push({
              type: "webglcontextrestored",
              id: record.id,
              role: roleFor(record.canvas),
              t: performance.now(),
            });
            refreshPeak();
          },
          false,
        );
        refreshPeak();
      }
      return context;
    };

    const snapshot = (label) => {
      const contexts = records.map(serializeRecord);
      const currentConnectedNonLost = refreshPeak();
      const entry = {
        label,
        t: performance.now(),
        y: scrollY,
        currentConnectedNonLost,
        peakConnectedNonLost,
        contexts,
      };
      window.__tascWebglQa.snapshots.push(entry);
      return entry;
    };

    const visibleContextsByRole = (role) =>
      records
        .map(serializeRecord)
        .filter((record) => record.role === role && record.connected && record.visiblePixels > 0);

    const contextsByRole = (role) =>
      records.map(serializeRecord).filter((record) => record.role === role);

    const forceLose = (role) => {
      const record = records.find((candidate) => {
        const serialized = serializeRecord(candidate);
        return serialized.role === role && serialized.connected && !serialized.lost;
      });
      if (!record) return { supported: false, reason: `no connected non-lost ${role} WebGL context` };
      const extension = record.context.getExtension("WEBGL_lose_context");
      if (!extension) return { supported: false, reason: "WEBGL_lose_context extension unavailable", id: record.id };
      extension.loseContext();
      window.setTimeout(() => {
        try {
          extension.restoreContext();
        } catch {}
      }, 120);
      return { supported: true, id: record.id, role };
    };

    const testHook = () =>
      window.__tascWebglLifecycleTest ??
      window.__TASC_WEBGL_LIFECYCLE_TEST__ ??
      window.__tascWebglTest ??
      null;

    const triggerArtificialFailures = async (role, count) => {
      const hook = testHook();
      if (!hook || typeof hook !== "object") {
        return { supported: false, reason: "no WebGL lifecycle test hook was exposed" };
      }
      const candidates = [
        "failNextReinitializations",
        "forceReinitFailures",
        "setArtificialReinitFailures",
        "triggerReinitFailures",
      ];
      const methodName = candidates.find((name) => typeof hook[name] === "function");
      if (!methodName) {
        return {
          supported: false,
          reason: "test hook exists but exposes no recognized reinit-failure method",
          hookKeys: Object.keys(hook),
        };
      }
      try {
        const result = await hook[methodName](role, count);
        return { supported: true, methodName, result: result ?? null };
      } catch (error) {
        return {
          supported: true,
          methodName,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };

    const staticFallbackState = (role) => {
      const selectors =
        role === "packed-alpha"
          ? [
              "[data-packed-alpha-fallback='static']",
              ".services-story-poster",
              ".services-story-entry-poster",
              ".services-story-stop-posters",
            ]
          : [
              "[data-galaxy-fallback='static']",
              ".static-starfield-fallback",
              ".static-starfield-services",
              ".safari-static-starfield",
              ".services-static-starfield",
              ".starfield-fallback",
            ];
      const visible = selectors
        .map((selector) => {
          const element = document.querySelector(selector);
          if (!(element instanceof HTMLElement)) return null;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const visiblePixels =
            Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left)) *
            Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
          return {
            selector,
            display: style.display,
            visibility: style.visibility,
            opacity: Number.parseFloat(style.opacity),
            visiblePixels,
            lifecycle: element.dataset.webglLifecycle ?? element.dataset.webglStatus ?? null,
          };
        })
        .filter(
          (entry) =>
            entry &&
            entry.display !== "none" &&
            entry.visibility !== "hidden" &&
            entry.opacity > 0.05 &&
            entry.visiblePixels > 0,
        );
      return { visible };
    };

    window.__tascWebglQa = {
      events: [],
      snapshots: [],
      snapshot,
      canvasByRole(role) {
        const record = records.find((candidate) => {
          const serialized = serializeRecord(candidate);
          return serialized.role === role && serialized.connected && serialized.visiblePixels > 0;
        });
        return record ? { role, record: serializeRecord(record) } : null;
      },
      visibleContextsByRole,
      contextsByRole,
      forceLose,
      triggerArtificialFailures,
      staticFallbackState,
      summary() {
        return snapshot("summary");
      },
    };
  });
};

const waitForReady = async (page, timeout) => {
  await page.waitForSelector(".site-shell", { timeout });
  await page.waitForFunction(
    () => {
      const root = document.querySelector(".site-shell");
      if (!(root instanceof HTMLElement)) return false;
      const preloader = document.querySelector(".site-preloader");
      const preloaderHidden =
        !(preloader instanceof HTMLElement) ||
        (() => {
          const style = getComputedStyle(preloader);
          return (
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number.parseFloat(style.opacity || "1") <= 0.01
          );
        })();
      return (
        root.dataset.jsRuntime === "true" &&
        root.dataset.heroSurfaceReady === "true" &&
        root.dataset.starfieldMode !== "pending" &&
        root.classList.contains("site-preloader-complete") &&
        preloaderHidden
      );
    },
    null,
    { timeout },
  );
  await page.waitForTimeout(300);
};

const readSnapshot = (page, label) => page.evaluate((name) => window.__tascWebglQa?.snapshot(name), label);

const checkContextBudget = (caseResult, label, snapshot) => {
  addCheck(
    caseResult,
    snapshot.currentConnectedNonLost <= 2 && snapshot.peakConnectedNonLost <= 2,
    `${label}: all live non-lost WebGL contexts peak/current <= 2`,
    {
      currentConnectedNonLost: snapshot.currentConnectedNonLost,
      peakConnectedNonLost: snapshot.peakConnectedNonLost,
      contexts: snapshot.contexts,
    },
  );
};

const beginGalaxyScreenshotCapture = (page) =>
  page.evaluate(() => {
    const target = window.__tascWebglQa?.canvasByRole?.("galaxy") ?? null;
    const id = target?.record?.id;
    const canvas = id ? document.querySelector(`canvas[data-tasc-webgl-qa-id="${id}"]`) : null;
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { ok: false, reason: "no visible instrumented Galaxy canvas", target };
    }

    document.getElementById("tasc-galaxy-screenshot-isolation")?.remove();
    document
      .querySelectorAll("[data-tasc-galaxy-screenshot-ancestor], [data-tasc-galaxy-screenshot-target]")
      .forEach((element) => {
        delete element.dataset.tascGalaxyScreenshotAncestor;
        delete element.dataset.tascGalaxyScreenshotTarget;
      });

    canvas.dataset.tascGalaxyScreenshotTarget = "true";
    let ancestor = canvas.parentElement;
    while (ancestor && ancestor !== document.body) {
      ancestor.dataset.tascGalaxyScreenshotAncestor = "true";
      ancestor = ancestor.parentElement;
    }

    const style = document.createElement("style");
    style.id = "tasc-galaxy-screenshot-isolation";
    style.textContent = `
      html[data-tasc-galaxy-screenshot="true"] body {
        background: #000 !important;
      }
      html[data-tasc-galaxy-screenshot="true"] body * {
        visibility: hidden !important;
      }
      html[data-tasc-galaxy-screenshot="true"] [data-tasc-galaxy-screenshot-ancestor="true"] {
        visibility: visible !important;
        opacity: 1 !important;
        background: transparent !important;
        box-shadow: none !important;
        filter: none !important;
      }
      html[data-tasc-galaxy-screenshot="true"] canvas[data-tasc-galaxy-screenshot-target="true"] {
        visibility: visible !important;
        opacity: 1 !important;
        filter: none !important;
      }
    `;
    document.head.append(style);
    document.documentElement.dataset.tascGalaxyScreenshot = "true";

    const rect = canvas.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(innerWidth, rect.right);
    const bottom = Math.min(innerHeight, rect.bottom);
    const width = Math.floor(right - left);
    const height = Math.floor(bottom - top);
    if (width < 2 || height < 2) {
      return { ok: false, reason: "Galaxy canvas has no screenshotable viewport area", target, rect: { left, top, right, bottom } };
    }

    return {
      ok: true,
      target,
      clip: {
        x: Math.max(0, Math.floor(scrollX + left)),
        y: Math.max(0, Math.floor(scrollY + top)),
        width,
        height,
      },
    };
  });

const endGalaxyScreenshotCapture = (page) =>
  page.evaluate(() => {
    delete document.documentElement.dataset.tascGalaxyScreenshot;
    document.getElementById("tasc-galaxy-screenshot-isolation")?.remove();
    document
      .querySelectorAll("[data-tasc-galaxy-screenshot-ancestor], [data-tasc-galaxy-screenshot-target]")
      .forEach((element) => {
        delete element.dataset.tascGalaxyScreenshotAncestor;
        delete element.dataset.tascGalaxyScreenshotTarget;
      });
  });

const analyzeGalaxyScreenshots = (page, first, second) =>
  page.evaluate(
    async ({ firstDataUrl, secondDataUrl }) => {
      const decode = (source) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.decoding = "async";
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("Galaxy screenshot PNG could not be decoded"));
          image.src = source;
        });
      const [firstImage, secondImage] = await Promise.all([decode(firstDataUrl), decode(secondDataUrl)]);
      const width = 160;
      const height = 160;
      const read = (image) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
        if (!context) throw new Error("2D screenshot analysis context is unavailable");
        context.fillStyle = "#000";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        return context.getImageData(0, 0, width, height).data;
      };
      const firstPixels = read(firstImage);
      const secondPixels = read(secondImage);
      const summarize = (pixels) => {
        let sum = 0;
        let sumSquared = 0;
        let nonBlack = 0;
        let bright = 0;
        let maximum = 0;
        const count = pixels.length / 4;
        for (let index = 0; index < pixels.length; index += 4) {
          const luminance =
            0.2126 * (pixels[index] ?? 0) +
            0.7152 * (pixels[index + 1] ?? 0) +
            0.0722 * (pixels[index + 2] ?? 0);
          sum += luminance;
          sumSquared += luminance * luminance;
          if (luminance > 3) nonBlack += 1;
          if (luminance > 28) bright += 1;
          maximum = Math.max(maximum, luminance);
        }
        const mean = sum / count;
        return {
          width,
          height,
          mean,
          standardDeviation: Math.sqrt(Math.max(0, sumSquared / count - mean * mean)),
          nonBlackRatio: nonBlack / count,
          brightRatio: bright / count,
          maximum,
        };
      };

      let changed = 0;
      let absoluteDifference = 0;
      let squaredDifference = 0;
      const count = firstPixels.length / 4;
      for (let index = 0; index < firstPixels.length; index += 4) {
        const firstLuminance =
          0.2126 * (firstPixels[index] ?? 0) +
          0.7152 * (firstPixels[index + 1] ?? 0) +
          0.0722 * (firstPixels[index + 2] ?? 0);
        const secondLuminance =
          0.2126 * (secondPixels[index] ?? 0) +
          0.7152 * (secondPixels[index + 1] ?? 0) +
          0.0722 * (secondPixels[index + 2] ?? 0);
        const difference = Math.abs(secondLuminance - firstLuminance);
        absoluteDifference += difference;
        squaredDifference += difference * difference;
        if (difference > 2) changed += 1;
      }

      return {
        first: summarize(firstPixels),
        second: summarize(secondPixels),
        difference: {
          changedRatio: changed / count,
          meanAbsoluteLuminance: absoluteDifference / count,
          rootMeanSquareLuminance: Math.sqrt(squaredDifference / count),
        },
      };
    },
    {
      firstDataUrl: `data:image/png;base64,${first.toString("base64")}`,
      secondDataUrl: `data:image/png;base64,${second.toString("base64")}`,
    },
  );

const checkGalaxyPaintedAnimated = async (page, caseResult) => {
  await page
    .waitForFunction(
      () => {
        const record = window.__tascWebglQa?.canvasByRole?.("galaxy");
        if (!record) return false;
        const ready = record.record.lifecycle.some((entry) => entry.dataset.galaxyStatus === "ready");
        const active = record.record.lifecycle.some((entry) => entry.dataset.galaxyActive === "true");
        return ready && active && (record.record.galaxyFrameCount ?? 0) >= 2;
      },
      null,
      { timeout: 8_000 },
    )
    .catch(() => {});
  const capture = await beginGalaxyScreenshotCapture(page);
  if (!capture.ok) {
    addCheck(caseResult, false, "galaxy: canvas is present for screenshot paint/animation sampling", capture);
    return;
  }
  let firstPng;
  let secondPng;
  let firstRecord = capture.target;
  let secondRecord = null;
  try {
    firstPng = await page.screenshot({ type: "png", clip: capture.clip, scale: "css", animations: "allow" });
    await page.waitForTimeout(900);
    secondRecord = await page.evaluate(() => window.__tascWebglQa?.canvasByRole?.("galaxy") ?? null);
    secondPng = await page.screenshot({ type: "png", clip: capture.clip, scale: "css", animations: "allow" });
  } finally {
    await endGalaxyScreenshotCapture(page).catch(() => {});
  }

  if (!firstPng || !secondPng || !firstRecord || !secondRecord) {
    addCheck(caseResult, false, "galaxy: screenshot frames and lifecycle records are captured", {
      firstBytes: firstPng?.length ?? 0,
      secondBytes: secondPng?.length ?? 0,
      firstRecord,
      secondRecord,
    });
    return;
  }

  const analysis = await analyzeGalaxyScreenshots(page, firstPng, secondPng);
  const firstHash = createHash("sha256").update(firstPng).digest("hex");
  const secondHash = createHash("sha256").update(secondPng).digest("hex");
  const ready = secondRecord.record.lifecycle.some((entry) => entry.dataset.galaxyStatus === "ready");
  const active = secondRecord.record.lifecycle.some((entry) => entry.dataset.galaxyActive === "true");
  const hasMeaningfulPixels = (sample) =>
    sample.nonBlackRatio >= 0.004 &&
    sample.mean >= 0.05 &&
    sample.standardDeviation >= 0.7 &&
    sample.maximum >= 10;
  const hasPairHighlightEvidence =
    Math.max(analysis.first.brightRatio, analysis.second.brightRatio) >= 0.0003;
  const painted =
    ready &&
    active &&
    secondRecord.record.width > 0 &&
    secondRecord.record.height > 0 &&
    (firstRecord.record.galaxyFrameCount ?? 0) >= 2 &&
    (secondRecord.record.galaxyFrameCount ?? 0) > (firstRecord.record.galaxyFrameCount ?? -1) &&
    hasMeaningfulPixels(analysis.first) &&
    hasMeaningfulPixels(analysis.second) &&
    hasPairHighlightEvidence;
  const hasMeaningfulFrameDifference =
    firstHash !== secondHash &&
    analysis.difference.changedRatio >= 0.001 &&
    analysis.difference.meanAbsoluteLuminance >= 0.02;
  const animated =
    painted &&
    (secondRecord.record.galaxyFrameCount ?? 0) > (firstRecord.record.galaxyFrameCount ?? -1) &&
    (secondRecord.record.galaxyFramePhase ?? 0) > (firstRecord.record.galaxyFramePhase ?? -1) &&
    hasMeaningfulFrameDifference;
  const details = {
    clip: capture.clip,
    first: {
      bytes: firstPng.length,
      sha256: firstHash,
      record: firstRecord.record,
      pixels: analysis.first,
    },
    second: {
      bytes: secondPng.length,
      sha256: secondHash,
      record: secondRecord.record,
      pixels: analysis.second,
    },
    difference: analysis.difference,
  };
  addCheck(caseResult, painted, "galaxy: two consecutive screenshots contain meaningful painted pixels", details);
  addCheck(caseResult, animated, "galaxy: screenshot pixels and render phase change between frames", details);
};

const scrollToServices = async (page, timeout) => {
  await page.evaluate(() => {
    const servicesLink = document.querySelector('a[href="#services"]');
    if (servicesLink instanceof HTMLAnchorElement) {
      servicesLink.click();
      return;
    }
    document.querySelector(".services-story-section")?.scrollIntoView({ block: "start", inline: "nearest" });
  });
  await page.waitForTimeout(600);
  await page
    .waitForFunction(
      () => {
        const section = document.querySelector(".services-story-section");
        if (!(section instanceof HTMLElement)) return false;
        const rect = section.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight;
      },
      null,
      { timeout },
    )
    .catch(() => {});
};

const installServicesEntryTrace = (page) =>
  page.evaluate(() => {
    const previous = window.__tascServicesEntryTrace;
    if (previous?.frame) cancelAnimationFrame(previous.frame);
    const trace = { frame: 0, samples: [] };
    const sample = () => {
      const root = document.querySelector(".site-shell");
      const video = document.querySelector(".services-story-video video, video.services-story-video");
      if (root instanceof HTMLElement) {
        let bufferedEnd = 0;
        if (video instanceof HTMLVideoElement) {
          for (let index = 0; index < video.buffered.length; index += 1) {
            bufferedEnd = Math.max(bufferedEnd, video.buffered.end(index));
          }
        }
        trace.samples.push({
          at: performance.now(),
          preparing: root.dataset.servicesEntryPreparing ?? null,
          prepared: root.dataset.servicesEntryPrepared === "true",
          pinned: root.dataset.servicesPinned === "true",
          inputLocked: root.dataset.motionInputLocked === "true",
          phase: root.dataset.servicesPhase ?? null,
          startFrameDecoded: root.dataset.servicesStartFrameDecoded === "true",
          firstSegmentWarm: root.dataset.servicesFirstSegmentWarm === "true",
          mediaDecoded: root.dataset.servicesMediaDecoded === "true",
          entryDirection: root.dataset.servicesEntryDirection ?? null,
          reverseEntryFrameDecoded: root.dataset.servicesReverseEntryFrameDecoded === "true",
          reverseEntrySegmentWarm: root.dataset.servicesReverseEntrySegmentWarm === "true",
          abortReason: root.dataset.servicesEntryAbortReason ?? null,
          readyState: video instanceof HTMLVideoElement ? video.readyState : null,
          currentTime: video instanceof HTMLVideoElement ? video.currentTime : null,
          bufferedEnd,
        });
        if (trace.samples.length > 1_200) trace.samples.shift();
      }
      trace.frame = requestAnimationFrame(sample);
    };
    window.__tascServicesEntryTrace = trace;
    sample();
  });

const finishServicesEntryTrace = (page) =>
  page.evaluate(() => {
    const trace = window.__tascServicesEntryTrace;
    if (!trace) return [];
    if (trace.frame) cancelAnimationFrame(trace.frame);
    delete window.__tascServicesEntryTrace;
    return trace.samples;
  });

const checkServicesColdEntry = async (page, caseResult, timeout) => {
  await installServicesEntryTrace(page);
  await scrollToServices(page, timeout);
  const committed = await page
    .waitForFunction(
      () => {
        const root = document.querySelector(".site-shell");
        return (
          root instanceof HTMLElement &&
          root.dataset.servicesEntryPrepared === "true" &&
          root.dataset.servicesPinned === "true" &&
          root.dataset.motionInputLocked === "true" &&
          root.dataset.servicesMediaDecoded === "true"
        );
      },
      null,
      { timeout: Math.min(timeout, servicesDelayMs > 0 ? 20_000 : 8_000) },
    )
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(180);
  const entryState = await page.evaluate(() => {
    const root = document.querySelector(".site-shell");
    const video = document.querySelector(".services-story-video video, video.services-story-video");
    return {
      root: root instanceof HTMLElement ? { ...root.dataset } : null,
      video:
        video instanceof HTMLVideoElement
          ? {
              currentTime: video.currentTime,
              readyState: video.readyState,
              networkState: video.networkState,
              paused: video.paused,
              seeking: video.seeking,
              errorCode: video.error?.code ?? null,
              segmentState: video.dataset.segmentState ?? null,
            }
          : null,
    };
  });
  const samples = await finishServicesEntryTrace(page);
  const preparingLocked = samples.filter(
    (sample) => sample.preparing && (sample.pinned || sample.inputLocked),
  );
  const firstLock = samples.find((sample) => sample.pinned || sample.inputLocked) ?? null;
  const traceDigest = {
    firstPreparing: samples.find((sample) => sample.preparing) ?? null,
    firstStartFrame: samples.find((sample) => sample.startFrameDecoded) ?? null,
    firstWarmSegment: samples.find((sample) => sample.firstSegmentWarm) ?? null,
    lastPreparing: [...samples].reverse().find((sample) => sample.preparing) ?? null,
    last: samples.at(-1) ?? null,
  };
  const firstLockReady = Boolean(
    firstLock &&
      firstLock.startFrameDecoded &&
      (firstLock.firstSegmentWarm || firstLock.bufferedEnd >= 2.94) &&
      (firstLock.readyState ?? 0) >= 2,
  );
  addCheck(
    caseResult,
    preparingLocked.length === 0,
    "services: cold entry preparation never pins or locks input",
    { preparingLocked, sampleCount: samples.length, traceDigest, entryState },
  );
  addCheck(
    caseResult,
    committed && firstLockReady,
    "services: first lock occurs only after decoded frame zero and first-segment readiness",
    { committed, firstLock, sampleCount: samples.length, traceDigest, entryState },
  );
};

const checkServicesColdReverseEntry = async (browser, engineName, forcePacked, caseResult, timeout) => {
  const reverseContext = await browser.newContext({
    viewport: { width: MOBILE_PROFILE.width, height: MOBILE_PROFILE.height },
    deviceScaleFactor: MOBILE_PROFILE.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "America/Chicago",
    serviceWorkers: "block",
    userAgent: userAgentFor(engineName),
  });
  try {
    await installInstrumentation(reverseContext);
    const page = await reverseContext.newPage();
    const delayedUrls = new Set();
    await page.route("**/media/services-*", async (route) => {
      const url = route.request().url();
      if (!delayedUrls.has(url)) {
        delayedUrls.add(url);
        await new Promise((resolve) => setTimeout(resolve, servicesDelayMs));
      }
      await route.continue();
    });
    page.on("console", (message) => {
      if (message.type() === "error" && !ignoredConsoleMessage(message.text())) {
        caseResult.diagnostics.consoleErrors.push(`[reverse] ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => caseResult.diagnostics.pageErrors.push(`[reverse] ${error.message}`));
    page.on("requestfailed", (request) => {
      const entry = { url: request.url(), errorText: request.failure()?.errorText ?? null };
      if (!ignoredRequestFailure(entry)) caseResult.diagnostics.requestFailures.push(entry);
    });

    const reverseUrl = new URL(targetUrl(`${caseResult.id}-reverse`, forcePacked));
    reverseUrl.hash = "work";
    await page.goto(reverseUrl.toString(), { waitUntil: "domcontentloaded", timeout });
    await waitForReady(page, timeout);
    await page
      .waitForFunction(
        () => {
          const section = document.querySelector(".how-work-motion-section");
          if (!(section instanceof HTMLElement)) return false;
          const rect = section.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < innerHeight;
        },
        null,
        { timeout },
      )
      .catch(async () => {
        await page.evaluate(() => document.querySelector(".how-work-motion-section")?.scrollIntoView({ block: "start" }));
      });
    await page.waitForTimeout(180);
    await installServicesEntryTrace(page);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("tasc:how-work-release-backward", { cancelable: true }));
    });
    const committed = await page
      .waitForFunction(
        () => {
          const root = document.querySelector(".site-shell");
          return (
            root instanceof HTMLElement &&
            root.dataset.servicesEntryDirection === "reverse" &&
            root.dataset.servicesEntryPrepared === "true" &&
            root.dataset.servicesPinned === "true" &&
            root.dataset.motionInputLocked === "true" &&
            root.dataset.servicesMediaDecoded === "true"
          );
        },
        null,
        { timeout: Math.min(timeout, 24_000) },
      )
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(180);
    const samples = await finishServicesEntryTrace(page);
    const preparingLocked = samples.filter(
      (sample) => sample.preparing === "reverse" && (sample.pinned || sample.inputLocked),
    );
    const firstLock = samples.find((sample) => sample.pinned || sample.inputLocked) ?? null;
    const reverseEntryTime = 340 / 30;
    const firstLockReady = Boolean(
      firstLock &&
        firstLock.entryDirection === "reverse" &&
        firstLock.reverseEntryFrameDecoded &&
        firstLock.reverseEntrySegmentWarm &&
        (firstLock.readyState ?? 0) >= 2 &&
        Math.abs((firstLock.currentTime ?? -1) - reverseEntryTime) <= 0.16,
    );
    const entryState = await readServicesMediaState(page);
    addCheck(
      caseResult,
      preparingLocked.length === 0,
      "services reverse: cold entry preparation never pins or locks input",
      { preparingLocked, sampleCount: samples.length, firstLock, entryState },
    );
    addCheck(
      caseResult,
      committed && firstLockReady,
      "services reverse: first lock follows decoded frame 340 and warm 340-to-460 segment",
      { committed, firstLock, sampleCount: samples.length, entryState },
    );

    const expectedStops = [
      { stage: "2", frame: 460 },
      { stage: "1", frame: 557 },
    ];
    const reachedStops = [];
    if (committed) {
      for (const expected of expectedStops) {
        await page.waitForTimeout(420);
        await page.evaluate(() => {
          window.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              deltaMode: WheelEvent.DOM_DELTA_PIXEL,
              deltaY: -720,
            }),
          );
        });
        const reached = await page
          .waitForFunction(
            ({ stage, time }) => {
              const root = document.querySelector(".site-shell");
              const video = document.querySelector(".services-story-video video, video.services-story-video");
              return (
                root instanceof HTMLElement &&
                video instanceof HTMLVideoElement &&
                root.dataset.servicesActive === stage &&
                root.dataset.servicesPhase === "waiting" &&
                Math.abs(video.currentTime - time) <= 0.18
              );
            },
            { stage: expected.stage, time: expected.frame / 30 },
            { timeout: Math.min(timeout, 24_000) },
          )
          .then(() => true)
          .catch(() => false);
        const state = await readServicesMediaState(page);
        reachedStops.push({ ...expected, reached, state });
        if (!reached) break;
      }
    }
    addCheck(
      caseResult,
      committed &&
        reachedStops.length === expectedStops.length &&
        reachedStops.every((entry) => entry.reached) &&
        reachedStops.every(
          (entry) =>
            entry.state.root?.servicesMediaFallback !== "true" &&
            !entry.state.root?.servicesTransportFailure,
        ),
      "services reverse: authored stops 460 and 557 replay without fallback or transport failure",
      { expectedStops, reachedStops },
    );
  } catch (error) {
    addCheck(caseResult, false, "services reverse: isolated cold-entry scenario completes", {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
  } finally {
    await reverseContext.close().catch(() => {});
  }
};

const isPaintedSurface = (surface) =>
  Boolean(
    surface &&
      surface.display !== "none" &&
      surface.visibility !== "hidden" &&
      (surface.opacity ?? 0) > 0.05 &&
      (surface.visiblePixels ?? 0) > 0,
  );

const readServicesMediaState = (page) =>
  page.evaluate(() => {
    const describe = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        selector,
        display: style.display,
        visibility: style.visibility,
        opacity: Number.parseFloat(style.opacity),
        visiblePixels:
          Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left)) *
          Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top)),
      };
    };
    const root = document.querySelector(".site-shell");
    const video = document.querySelector(".services-story-video video, video.services-story-video");
    const packedCanvas = document.querySelector(".services-story-video-packed canvas");
    const videoState =
      video instanceof HTMLVideoElement
        ? {
            src: video.currentSrc || video.getAttribute("src") || "",
            readyState: video.readyState,
            currentTime: video.currentTime,
            paused: video.paused,
            segmentState: video.dataset.segmentState ?? null,
            scrubState: video.dataset.scrubState ?? null,
            errorCode: video.error?.code ?? null,
          }
        : null;
    const packedCanvasState =
      packedCanvas instanceof HTMLCanvasElement
        ? {
            composite:
              packedCanvas.closest("[data-packed-alpha-composite]")?.getAttribute(
                "data-packed-alpha-composite",
              ) ?? null,
            frameCount: Number(packedCanvas.dataset.packedAlphaFrameCount ?? 0),
            lifecycle: packedCanvas.dataset.webglLifecycle ?? null,
            status: packedCanvas.dataset.packedAlphaWebgl ?? null,
          }
        : null;
    return {
      root: root instanceof HTMLElement ? { ...root.dataset } : null,
      video: videoState,
      packedCanvas: packedCanvasState,
      surfaces: {
        wrapper: describe(".services-story-video"),
        sourceVideo: describe(".services-story-video video, video.services-story-video"),
        packedCanvas: describe(".services-story-video-packed canvas"),
        entryPoster: describe(".services-story-entry-poster"),
        stopPosters: describe(".services-story-stop-posters"),
        fallbackPoster: describe(".services-story-poster"),
      },
    };
  });

const checkServicesDecodedVideo = async (page, caseResult) => {
  const state = await readServicesMediaState(page);
  const packedTransport = state.root?.servicesVideoFormat === "packed-alpha-h264";
  const packedCanvasPainted =
    isPaintedSurface(state.surfaces.packedCanvas) &&
    state.packedCanvas?.composite === "active" &&
    state.packedCanvas?.frameCount > 0 &&
    /ready|restored/i.test(state.packedCanvas?.lifecycle ?? "") &&
    !/lost|fallback|unavailable/i.test(state.packedCanvas?.status ?? "");
  const videoPainted = packedTransport
    ? packedCanvasPainted
    : isPaintedSurface(state.surfaces.sourceVideo);
  const posterPainted =
    isPaintedSurface(state.surfaces.entryPoster) ||
    isPaintedSurface(state.surfaces.stopPosters) ||
    isPaintedSurface(state.surfaces.fallbackPoster);
  const decoded =
    videoPainted &&
    state.video?.readyState >= 2 &&
    state.video?.errorCode == null &&
    state.root?.servicesStartFrameDecoded === "true" &&
    state.root?.servicesMediaFallback !== "true";
  addCheck(caseResult, decoded && !posterPainted, "services: decoded video is visible instead of poster-only fallback", {
    state,
    packedCanvasPainted,
    packedTransport,
    videoPainted,
    posterPainted,
  });
};

const waitForLifecycleRestored = async (page, target, timeout) =>
  page
    .waitForFunction(
      ({ role }) => {
        const contexts = window.__tascWebglQa?.visibleContextsByRole?.(role) ?? [];
        return contexts.some(
          (context) =>
            context.restoredEvents >= 1 &&
            context.lifecycleValues.some((value) => /ready|restored/i.test(String(value))) &&
            context.attempts != null &&
            context.attempts <= 3,
        );
      },
      { role: target.role },
      { timeout },
    )
    .then(() => true)
    .catch(() => false);

const checkForcedLoss = async (page, caseResult, role, timeout) => {
  const before = await readSnapshot(page, `${role}-before-forced-loss`);
  const beforeFrameCount = Math.max(
    0,
    ...before.contexts
      .filter((context) => context.role === role)
      .map((context) =>
        role === "galaxy"
          ? Number(context.galaxyFrameCount ?? 0)
          : Number(context.packedAlphaFrameCount ?? 0),
      ),
  );
  const force = await page.evaluate((targetRole) => window.__tascWebglQa?.forceLose?.(targetRole), role);
  if (!force?.supported) {
    addUnsupported(caseResult, `${role}: WEBGL_lose_context recovery could not be exercised`, force);
    return;
  }
  const restored = await waitForLifecycleRestored(page, { role }, timeout);
  const repainted = restored
    ? await page
        .waitForFunction(
          ({ targetRole, minimum }) => {
            const contexts = window.__tascWebglQa?.contextsByRole?.(targetRole) ?? [];
            return contexts.some((context) => {
              const count =
                targetRole === "galaxy"
                  ? Number(context.galaxyFrameCount ?? 0)
                  : Number(context.packedAlphaFrameCount ?? 0);
              return context.connected && !context.lost && count > minimum;
            });
          },
          { targetRole: role, minimum: beforeFrameCount },
          { timeout },
        )
        .then(() => true)
        .catch(() => false)
    : false;
  const snapshot = await readSnapshot(page, `${role}-after-forced-loss`);
  addCheck(caseResult, restored, `${role}: WEBGL_lose_context restores and lifecycle reports ready/restored`, {
    force,
    snapshot,
  });
  addCheck(caseResult, repainted, `${role}: restored context paints a newer frame`, {
    beforeFrameCount,
    snapshot,
  });
  addCheck(
    caseResult,
    snapshot.currentConnectedNonLost <= 2 && snapshot.peakConnectedNonLost <= 2,
    `${role}: context budget remains <= 2 after restore`,
    {
      snapshot,
    },
  );
};

const checkArtificialFallback = async (page, caseResult, role, timeout) => {
  const trigger = await page.evaluate(
    ({ targetRole, count }) => window.__tascWebglQa?.triggerArtificialFailures?.(targetRole, count),
    { targetRole: role, count: 3 },
  );
  if (!trigger?.supported) {
    addUnsupported(caseResult, `${role}: three artificial reinit failures require an app-provided test hook`, trigger);
    return;
  }
  const force = await page.evaluate(
    (targetRole) => window.__tascWebglQa?.forceLose?.(targetRole),
    role,
  );
  if (!force?.supported) {
    addUnsupported(caseResult, `${role}: artificial fallback could not force context loss`, {
      trigger,
      force,
    });
    return;
  }
  const ready = await page
    .waitForFunction(
      (targetRole) => {
        const fallback = window.__tascWebglQa?.staticFallbackState?.(targetRole);
        const contexts = window.__tascWebglQa?.contextsByRole?.(targetRole) ?? [];
        const attempts = contexts.map((context) => context.attempts).filter((value) => value != null);
        return (
          fallback?.visible?.length > 0 &&
          contexts.some((context) =>
            context.lifecycleValues.some((value) => /fallback/i.test(String(value))),
          ) &&
          (attempts.length === 0 || attempts.every((value) => value <= 3))
        );
      },
      role,
      { timeout },
    )
    .then(() => true)
    .catch(() => false);
  const fallback = await page.evaluate((targetRole) => window.__tascWebglQa?.staticFallbackState?.(targetRole), role);
  const snapshot = await readSnapshot(page, `${role}-after-artificial-fallback`);
  addCheck(caseResult, ready, `${role}: static fallback appears after three artificial reinit failures`, {
    trigger,
    force,
    fallback,
    snapshot,
  });
  addCheck(
    caseResult,
    snapshot.contexts
      .filter((context) => context.role === role)
      .every((context) => context.lost),
    `${role}: terminal fallback releases every owned WebGL context`,
    { snapshot },
  );
};

const runCase = async (engineName, transportMode = "default") => {
  const forcePacked = transportMode === "forced-packed";
  const caseResult = {
    id: `${engineName}-${MOBILE_PROFILE.name}-${transportMode}`,
    engine: engineName,
    transportMode,
    profile: MOBILE_PROFILE,
    checks: [],
    failures: [],
    unsupported: [],
    diagnostics: {
      consoleErrors: [],
      pageErrors: [],
      requestFailures: [],
    },
  };
  let browser;
  let context;
  try {
    browser = await ENGINES[engineName].launch({ headless: !headed });
    caseResult.browserVersion = browser.version();
    context = await browser.newContext({
      viewport: { width: MOBILE_PROFILE.width, height: MOBILE_PROFILE.height },
      deviceScaleFactor: MOBILE_PROFILE.deviceScaleFactor,
      isMobile: true,
      hasTouch: true,
      colorScheme: "dark",
      locale: "en-US",
      timezoneId: "America/Chicago",
      serviceWorkers: "block",
      userAgent: userAgentFor(engineName),
    });
    await installInstrumentation(context);
    const page = await context.newPage();
    if (servicesDelayMs > 0) {
      const delayedUrls = new Set();
      await page.route("**/media/services-*", async (route) => {
        const url = route.request().url();
        if (!delayedUrls.has(url)) {
          delayedUrls.add(url);
          await new Promise((resolve) => setTimeout(resolve, servicesDelayMs));
        }
        await route.continue();
      });
    }
    page.on("console", (message) => {
      if (message.type() === "error" && !ignoredConsoleMessage(message.text())) {
        caseResult.diagnostics.consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => caseResult.diagnostics.pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const entry = { url: request.url(), errorText: request.failure()?.errorText ?? null };
      if (!ignoredRequestFailure(entry)) caseResult.diagnostics.requestFailures.push(entry);
    });

    await page.goto(targetUrl(caseResult.id, forcePacked), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await waitForReady(page, timeoutMs);

    const initial = await readSnapshot(page, "initial");
    checkContextBudget(caseResult, "initial", initial);
    await checkGalaxyPaintedAnimated(page, caseResult);

    await checkServicesColdEntry(page, caseResult, timeoutMs);
    await page.waitForTimeout(820);
    const services = await readSnapshot(page, "services");
    checkContextBudget(caseResult, "services", services);
    await checkServicesDecodedVideo(page, caseResult);
    if (servicesDelayMs > 0) {
      await checkServicesColdReverseEntry(browser, engineName, forcePacked, caseResult, timeoutMs);
    }

    await checkForcedLoss(page, caseResult, "galaxy", timeoutMs);
    const packedTargets = await page.evaluate(() => window.__tascWebglQa?.visibleContextsByRole?.("packed-alpha") ?? []);
    if (packedTargets.length > 0) {
      await checkForcedLoss(page, caseResult, "packed-alpha", timeoutMs);
      await checkArtificialFallback(page, caseResult, "packed-alpha", timeoutMs);
    } else {
      const servicesTransport = await page
        .locator(".site-shell")
        .getAttribute("data-services-transport")
        .catch(() => null);
      if (!forcePacked && servicesTransport === "native-alpha-webm") {
        addCheck(
          caseResult,
          true,
          "packed-alpha: lifecycle is not applicable to the native-alpha Services branch",
          { phase: "initial+services", servicesTransport },
        );
      } else {
        addUnsupported(caseResult, "packed-alpha: no connected PackedAlpha WebGL context exists in a packed transport case", {
          forcePacked,
          phase: "initial+services",
          servicesTransport,
        });
      }
    }
    await checkArtificialFallback(page, caseResult, "galaxy", timeoutMs);

    addCheck(
      caseResult,
      caseResult.diagnostics.consoleErrors.length === 0 &&
        caseResult.diagnostics.pageErrors.length === 0 &&
        caseResult.diagnostics.requestFailures.length === 0,
      "runtime: no actionable console/page/request errors",
      caseResult.diagnostics,
    );
  } catch (error) {
    addCheck(caseResult, false, "harness: case completes without exception", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
  } finally {
    caseResult.passed = caseResult.failures.length === 0 && caseResult.unsupported.length === 0;
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
  return caseResult;
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  runId,
  baseUrl,
  output: requestedOutput,
  environment: {
    node: process.version,
    operatingSystem: `${os.platform()} ${os.release()}`,
    physicalSafariBoundary:
      "Playwright WebKit on Windows is synthetic coverage and is not physical iOS Safari acceptance.",
  },
  contract: {
    maxConnectedNonLostWebglContexts: 2,
    maxLifecycleAttempts: 3,
    servicesDelayMs,
    profile: MOBILE_PROFILE,
  },
  cases: [],
  summary: null,
};

const writeReport = () => {
  report.summary = {
    caseCount: report.cases.length,
    passedCount: report.cases.filter((entry) => entry.passed).length,
    failedCount: report.cases.filter((entry) => !entry.passed).length,
    failureCount: report.cases.reduce((sum, entry) => sum + entry.failures.length, 0),
    unsupportedCount: report.cases.reduce((sum, entry) => sum + entry.unsupported.length, 0),
  };
  fs.writeFileSync(requestedOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
};

for (const engineName of selectedEngines) {
  const transportModes = engineName === "chromium" ? ["default", "forced-packed"] : ["default"];
  for (const transportMode of transportModes) {
    console.log(`[WEBGL] ${engineName}-${MOBILE_PROFILE.name}-${transportMode}`);
    const result = await runCase(engineName, transportMode);
    report.cases.push(result);
    writeReport();
    console.log(
      JSON.stringify({
        id: result.id,
        passed: result.passed,
        failures: result.failures,
        unsupported: result.unsupported.map((entry) => entry.message),
      }),
    );
  }
}

writeReport();
console.log(JSON.stringify({ output: requestedOutput, ...report.summary }, null, 2));
if (report.summary.failedCount > 0) process.exitCode = 1;
