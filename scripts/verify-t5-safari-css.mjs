import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadPlaywright() {
  const candidates = [
    "playwright",
    process.env.PLAYWRIGHT_NODE_MODULE,
    "C:/Users/mziv1/AppData/Roaming/npm/node_modules/playwright",
    "C:/Users/mziv1/AppData/Local/npm-cache/node_modules/playwright",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      continue;
    }
  }

  throw new Error("Playwright could not be loaded. Install dependencies before running this harness.");
}

function parseArguments(argv) {
  const parsed = {};
  const booleanOptions = new Set(["help", "headed"]);
  const valueOptions = new Set(["url", "output", "timeout"]);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);

    const equalsIndex = token.indexOf("=");
    if (equalsIndex !== -1) {
      const key = token.slice(2, equalsIndex);
      const value = token.slice(equalsIndex + 1);
      if (!valueOptions.has(key)) throw new Error(`Unknown or valueless option: --${key}`);
      if (!value) throw new Error(`--${key} requires a value.`);
      parsed[key] = value;
      continue;
    }

    const key = token.slice(2);
    if (booleanOptions.has(key)) {
      parsed[key] = true;
      continue;
    }
    if (!valueOptions.has(key)) throw new Error(`Unknown option: --${key}`);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else {
      throw new Error(`--${key} requires a value.`);
    }
  }

  return parsed;
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function normalizeUrl(value) {
  const url = new URL(value);
  if (!url.pathname) url.pathname = "/";
  return url.toString();
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function addCheck(report, id, ok, details) {
  const check = { id, ok: Boolean(ok), details };
  report.checks.push(check);
  if (!check.ok) report.failures.push(id);
  return check.ok;
}

function isIgnoredNetworkUrl(url) {
  return /(?:google\.com\/maps|googleapis\.com\/maps|gstatic\.com\/maps)/i.test(url);
}

function isIgnoredRequestFailure(failure) {
  return /ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled/i.test(failure.errorText) || isIgnoredNetworkUrl(failure.url);
}

function isIgnoredConsoleError(entry) {
  return isIgnoredNetworkUrl(entry.text);
}

function userAgentFor(engine, mobile) {
  if (engine === "webkit" && mobile) {
    return "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
  }
  if (engine === "webkit") {
    return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
  }
  if (mobile) {
    return "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
  }
  return undefined;
}

async function readBootState(page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".site-shell");
    const preloader = document.querySelector(".site-preloader");
    return {
      readyState: document.readyState,
      jsRuntime: shell?.getAttribute("data-js-runtime"),
      heroSurfaceReady: shell?.getAttribute("data-hero-surface-ready"),
      webkitCompatibility: shell?.getAttribute("data-webkit-compatibility"),
      htmlWebkit: document.documentElement.dataset.tascWebkit ?? null,
      htmlPreloaderDeadline: document.documentElement.dataset.tascPreloaderDeadline ?? null,
      htmlBootFailOpen: document.documentElement.dataset.tascBootFailOpen ?? null,
      shellClass: shell?.className ?? null,
      heroStarfield: shell?.getAttribute("data-hero-starfield") ?? null,
      motionReady: shell?.getAttribute("data-motion-ready") ?? null,
      preloaderComplete:
        document.documentElement.classList.contains("site-preloader-complete") ||
        Boolean(shell?.classList.contains("site-preloader-complete")),
      preloaderDisplay: preloader ? getComputedStyle(preloader).display : null,
      preloaderAriaHidden: preloader?.getAttribute("aria-hidden") ?? null,
      fontsStatus: document.fonts?.status ?? null,
    };
  });
}

async function waitForReady(page, timeout) {
  await page.waitForSelector(".site-shell", { state: "attached", timeout });
  try {
    await page.waitForFunction(
      () => {
        const shell = document.querySelector(".site-shell");
        const preloader = document.querySelector(".site-preloader");
        const preloaderHidden = !preloader || getComputedStyle(preloader).display === "none" || preloader.getAttribute("aria-hidden") === "true";
        return (
          shell?.getAttribute("data-js-runtime") === "true" &&
          shell?.getAttribute("data-hero-surface-ready") === "true" &&
          (document.documentElement.classList.contains("site-preloader-complete") || shell?.classList.contains("site-preloader-complete")) &&
          preloaderHidden
        );
      },
      { timeout },
    );
  } catch (error) {
    const state = await readBootState(page).catch(() => null);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Boot did not settle: ${message}; state=${JSON.stringify(state)}`);
  }
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(400);
  return readBootState(page);
}

async function scrollToSelector(page, selector, timeout) {
  await page.waitForSelector(selector, { state: "attached", timeout });
  const target = await page.evaluate((targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (!element) throw new Error(`Missing scroll target: ${targetSelector}`);
    const rect = element.getBoundingClientRect();
    const top = Math.max(0, Math.round(rect.top + window.scrollY));
    window.scrollTo({ top, left: 0, behavior: "instant" });
    return { selector: targetSelector, top, height: Math.round(rect.height) };
  }, selector);
  await page.waitForTimeout(700);
  return target;
}

async function captureViewport(page, outputDirectory, name) {
  const filePath = path.join(outputDirectory, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false, animations: "allow" });
  return filePath;
}

async function readOverflow(page, phase) {
  return page.evaluate((phaseName) => {
    const root = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
    return {
      phase: phaseName,
      scrollY: Math.round(window.scrollY),
      viewportWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
      bodyScrollWidth: body?.scrollWidth ?? null,
      scrollWidth,
      overflowPx: Math.max(0, scrollWidth - root.clientWidth),
    };
  }, phase);
}

async function readRootContract(page) {
  return page.evaluate(async () => {
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const shell = document.querySelector(".site-shell");
    const shellStyle = shell ? getComputedStyle(shell) : null;
    const overscrollSupported = CSS.supports("overscroll-behavior-y", "contain");
    const stylesheetTexts = await Promise.all(
      Array.from(document.styleSheets).map(async (stylesheet) => {
        if (!stylesheet.href) return stylesheet.ownerNode?.textContent ?? "";
        try {
          const response = await fetch(stylesheet.href, { credentials: "same-origin" });
          return response.ok ? response.text() : "";
        } catch {
          return "";
        }
      }),
    );
    const loadedCss = stylesheetTexts.join("\n");
    const overscrollHtmlBodyRuleLoaded =
      /(?:html\s*,\s*body|body\s*,\s*html)\s*\{[^}]*overscroll-behavior-y\s*:\s*contain/i.test(loadedCss);
    return {
      bodyOverflowX: bodyStyle.overflowX,
      shellOverflowX: shellStyle?.overflowX ?? null,
      htmlOverscrollY: (rootStyle.overscrollBehaviorY ?? rootStyle.getPropertyValue("overscroll-behavior-y")) || null,
      bodyOverscrollY: (bodyStyle.overscrollBehaviorY ?? bodyStyle.getPropertyValue("overscroll-behavior-y")) || null,
      overscrollSupported,
      overscrollHtmlBodyRuleLoaded,
      htmlWebkit: document.documentElement.dataset.tascWebkit ?? null,
      shellWebkitCompatibility: shell?.getAttribute("data-webkit-compatibility") ?? null,
    };
  });
}

async function readGlassContract(page) {
  return page.evaluate(() => {
    const read = (selector, borderSide = "top") => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      const borderWidth = borderSide === "bottom" ? style.borderBottomWidth : style.borderTopWidth;
      return {
        selector,
        display: style.display,
        backdropFilter: style.backdropFilter || "none",
        webkitBackdropFilter: style.webkitBackdropFilter || "none",
        borderWidth,
        borderStyle: borderSide === "bottom" ? style.borderBottomStyle : style.borderTopStyle,
        borderColor: borderSide === "bottom" ? style.borderBottomColor : style.borderTopColor,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
      };
    };

    return {
      header: read(".site-header-glass", "bottom"),
      glassCta: read(".header-action-glass-surface"),
      lightCta: read(".header-action-cta-light"),
    };
  });
}

async function readContentVisibility(page) {
  return page.evaluate(() => {
    const read = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        selector,
        contentVisibility: style.contentVisibility,
        containIntrinsicSize: style.containIntrinsicSize,
        width: rect.width,
        height: rect.height,
        documentTop: rect.top + window.scrollY,
      };
    };
    return {
      process: read(".process-contact-section"),
      footer: read(".site-footer"),
    };
  });
}

async function readStableGeometry(page, selector, waitMs = 300) {
  const read = () =>
    page.evaluate((targetSelector) => {
      const element = document.querySelector(targetSelector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        documentTop: rect.top + window.scrollY,
      };
    }, selector);

  const first = await read();
  await page.waitForTimeout(waitMs);
  const second = await read();
  const deltas = first && second
    ? {
        width: Math.abs(second.width - first.width),
        height: Math.abs(second.height - first.height),
        documentTop: Math.abs(second.documentTop - first.documentTop),
      }
    : null;
  const nonzero = Boolean(first && second && first.width > 0 && first.height > 0 && second.width > 0 && second.height > 0);
  const stable = Boolean(deltas && deltas.width <= 2 && deltas.height <= 2 && deltas.documentTop <= 2);
  return { selector, first, second, deltas, nonzero, stable };
}

async function readFlare(page) {
  return page.evaluate(() => {
    const parent = document.querySelector(".vision-clients-flare-stage");
    const child = document.querySelector(".clients-scroll-element-wrap");
    const image = document.querySelector(".clients-scroll-element");
    const picture = document.querySelector(".clients-scroll-element-picture");
    const parentStyle = parent ? getComputedStyle(parent) : null;
    const childStyle = child ? getComputedStyle(child) : null;
    return {
      counts: {
        parent: document.querySelectorAll(".vision-clients-flare-stage").length,
        child: document.querySelectorAll(".clients-scroll-element-wrap").length,
        picture: document.querySelectorAll(".clients-scroll-element-picture").length,
        image: document.querySelectorAll(".clients-scroll-element").length,
      },
      parent: parent
        ? {
            top: parentStyle?.top ?? null,
            inlineTransform: parent.style.transform,
            computedTransform: parentStyle?.transform ?? null,
            rectTop: parent.getBoundingClientRect().top,
          }
        : null,
      child: child
        ? {
            inlineTransform: child.style.transform,
            computedTransform: childStyle?.transform ?? null,
            willChange: childStyle?.willChange ?? null,
          }
        : null,
      image: image instanceof HTMLImageElement
        ? {
            src: image.getAttribute("src"),
            currentSrc: image.currentSrc,
            complete: image.complete,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
          }
        : null,
      picturePresent: Boolean(picture),
    };
  });
}

async function sampleActiveFlare(page) {
  const first = await readFlare(page);
  await page.evaluate(() => {
    window.scrollTo({ top: window.scrollY + Math.round(window.innerHeight * 0.28), left: 0, behavior: "instant" });
  });
  await page.waitForTimeout(400);
  const second = await readFlare(page);
  return {
    first,
    second,
    childTransformChanged: Boolean(
      first.child &&
        second.child &&
        first.child.computedTransform !== second.child.computedTransform,
    ),
  };
}

async function readClientsEntranceState(page) {
  return page.evaluate(() => {
    const section = document.querySelector(".figma-clients-section");
    const inner = section?.querySelector(".figma-clients-inner");
    const cards = Array.from(section?.querySelectorAll(".figma-client-card") ?? []);
    const viewportHeight = window.innerHeight;
    const innerTop = inner ? inner.getBoundingClientRect().top + window.scrollY : null;
    const triggerStart = innerTop === null ? null : innerTop - viewportHeight * 0.96;
    const triggerEnd = innerTop === null ? null : innerTop + viewportHeight * 0.1;
    const triggerProgress =
      triggerStart === null || triggerEnd === null || triggerEnd === triggerStart
        ? null
        : (window.scrollY - triggerStart) / (triggerEnd - triggerStart);
    const backdropSupported =
      CSS.supports("backdrop-filter", "blur(1px)") ||
      CSS.supports("-webkit-backdrop-filter", "blur(1px)");
    const cardStyles = cards.map((card) => {
      const style = getComputedStyle(card);
      const backdropFilter = style.backdropFilter || "none";
      const webkitBackdropFilter = style.webkitBackdropFilter || "none";
      return {
        backdropFilter,
        webkitBackdropFilter,
        effectiveBackdropFilter:
          backdropFilter && backdropFilter !== "none"
            ? backdropFilter
            : webkitBackdropFilter || "none",
      };
    });
    return {
      scrollY: window.scrollY,
      viewportHeight,
      innerTop,
      triggerStart,
      triggerEnd,
      triggerProgress,
      movingAttribute: section?.getAttribute("data-client-cards-moving") ?? null,
      cardCount: cards.length,
      backdropSupported,
      cardStyles,
      allBackdropsNone: cardStyles.every((card) => card.effectiveBackdropFilter === "none"),
      allBackdropsRestored: cardStyles.every((card) => card.effectiveBackdropFilter !== "none"),
    };
  });
}

async function sampleClientsEntranceSettle(page) {
  const navigation = await page.evaluate(() => {
    const section = document.querySelector(".figma-clients-section");
    const inner = section?.querySelector(".figma-clients-inner");
    if (!section || !inner) throw new Error("Missing Clients entrance targets.");
    const recorderKey = "__tascQaClientsCardsMovingRecorder";
    const existingRecorder = window[recorderKey];
    existingRecorder?.observer?.disconnect();
    const cards = Array.from(section.querySelectorAll(".figma-client-card"));
    const startedAt = performance.now();
    const transitions = [];
    const readCardStyles = () => {
      const cardStyles = cards.map((card) => {
        const style = getComputedStyle(card);
        const backdropFilter = style.backdropFilter || "none";
        const webkitBackdropFilter = style.webkitBackdropFilter || "none";
        return {
          backdropFilter,
          webkitBackdropFilter,
          effectiveBackdropFilter:
            backdropFilter && backdropFilter !== "none"
              ? backdropFilter
              : webkitBackdropFilter || "none",
        };
      });
      return {
        cardCount: cards.length,
        cardStyles,
        allBackdropsNone: cardStyles.every((card) => card.effectiveBackdropFilter === "none"),
      };
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName !== "data-client-cards-moving") continue;
        transitions.push({
          elapsedMs: performance.now() - startedAt,
          oldValue: record.oldValue,
          newValue: section.getAttribute("data-client-cards-moving"),
          ...readCardStyles(),
        });
      }
    });
    const recorder = {
      observer,
      startedAt,
      initialAttribute: section.getAttribute("data-client-cards-moving"),
      initialStyles: readCardStyles(),
      transitions,
    };
    window[recorderKey] = recorder;
    observer.observe(section, {
      attributes: true,
      attributeFilter: ["data-client-cards-moving"],
      attributeOldValue: true,
    });
    const innerTop = inner.getBoundingClientRect().top + window.scrollY;
    const triggerStart = innerTop - window.innerHeight * 0.96;
    const triggerEnd = innerTop + window.innerHeight * 0.1;
    const target = triggerStart + (triggerEnd - triggerStart) * 0.5;
    window.scrollTo({ top: Math.max(0, target), left: 0, behavior: "instant" });
    return { triggerStart, triggerEnd, target };
  });
  const settleWaitMs = 750;
  await page.waitForTimeout(settleWaitMs);
  const settled = await readClientsEntranceState(page);
  const transitionRecorder = await page.evaluate(() => {
    const recorderKey = "__tascQaClientsCardsMovingRecorder";
    const recorder = window[recorderKey];
    if (!recorder) return null;
    recorder.observer.disconnect();
    delete window[recorderKey];
    return {
      initialAttribute: recorder.initialAttribute,
      initialStyles: recorder.initialStyles,
      elapsedMs: performance.now() - recorder.startedAt,
      transitions: recorder.transitions,
    };
  });
  const engagedTransition = transitionRecorder?.transitions.find(
    (transition) =>
      transition.newValue === "true" &&
      transition.cardCount > 0 &&
      transition.allBackdropsNone,
  ) ?? null;
  return { navigation, settleWaitMs, transitionRecorder, engagedTransition, settled };
}

async function readHowGlow(page) {
  return page.evaluate(() => {
    const element = document.querySelector(".how-work-motion-glow");
    if (!element) return null;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const filter = style.filter || "none";
    const match = filter.match(/blur\(\s*([\d.]+)px\s*\)/i);
    const width = Number.parseFloat(style.width);
    return {
      width,
      offsetWidth: element.offsetWidth,
      transformedRectWidth: rect.width,
      viewportWidth: window.innerWidth,
      widthInVw: (width / window.innerWidth) * 100,
      transformedRectWidthInVw: (rect.width / window.innerWidth) * 100,
      filter,
      blurPx: match ? Number(match[1]) : 0,
      left: style.left,
      transform: style.transform,
    };
  });
}

async function readMobileCards(page) {
  return page.evaluate(() => {
    const selectors = [
      ".figma-client-card",
      ".datum-glass-card",
      ".domino-form-stage .domino-impulse-row",
      ".news-float-card",
      ".services-board",
    ];
    return selectors.map((selector) => {
      const elements = Array.from(document.querySelectorAll(selector));
      const samples = elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          backdropFilter: style.backdropFilter || "none",
          webkitBackdropFilter: style.webkitBackdropFilter || "none",
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
        };
      });
      return {
        selector,
        count: elements.length,
        samples,
        allBackdropNone: samples.every(
          (sample) =>
            (!sample.backdropFilter || sample.backdropFilter === "none") &&
            (!sample.webkitBackdropFilter || sample.webkitBackdropFilter === "none"),
        ),
      };
    });
  });
}

function backdropIsNone(sample) {
  return Boolean(
    sample &&
      (!sample.backdropFilter || sample.backdropFilter === "none") &&
      (!sample.webkitBackdropFilter || sample.webkitBackdropFilter === "none"),
  );
}

function backdropHasBlur(sample) {
  if (!sample) return false;
  return /blur\(/i.test(`${sample.backdropFilter} ${sample.webkitBackdropFilter}`);
}

function borderIsOnePixel(sample) {
  return Boolean(sample && Math.abs(Number.parseFloat(sample.borderWidth) - 1) <= 0.01);
}

function hasStaticFill(sample) {
  if (!sample) return false;
  if (sample.backgroundImage && sample.backgroundImage !== "none") return true;
  const alphaMatch = sample.backgroundColor?.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
  if (alphaMatch) return Number(alphaMatch[1]) > 0;
  return Boolean(sample.backgroundColor && sample.backgroundColor !== "transparent" && sample.backgroundColor !== "rgba(0, 0, 0, 0)");
}

function transformIsActive(value) {
  if (!value || value === "none") return false;
  return !/^(?:matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)|matrix3d\(1,\s*0,\s*0,\s*0,\s*0,\s*1,\s*0,\s*0,\s*0,\s*0,\s*1,\s*0,\s*0,\s*0,\s*0,\s*1\))$/.test(value);
}

async function runCase(playwright, profile, settings) {
  const browserType = playwright[profile.engine];
  if (!browserType) throw new Error(`Unsupported Playwright engine: ${profile.engine}`);

  const outputDirectory = path.join(settings.outputRoot, profile.id);
  fs.mkdirSync(outputDirectory, { recursive: true });

  const report = {
    schemaVersion: 1,
    id: profile.id,
    startedAt: new Date().toISOString(),
    config: {
      engine: profile.engine,
      viewport: profile.viewport,
      mobile: profile.mobile,
      url: settings.url,
      timeoutMs: settings.timeout,
      headed: settings.headed,
    },
    browserVersion: null,
    checks: [],
    failures: [],
    screenshots: {},
    measurements: {},
    diagnostics: {
      consoleErrors: [],
      pageErrors: [],
      requestFailures: [],
      badResponses: [],
    },
  };

  let browser;
  let context;

  try {
    browser = await browserType.launch({ headless: !settings.headed });
    report.browserVersion = browser.version();
    context = await browser.newContext({
      viewport: profile.viewport,
      deviceScaleFactor: 1,
      isMobile: profile.mobile,
      hasTouch: profile.mobile,
      locale: "en-US",
      timezoneId: "America/Chicago",
      colorScheme: "dark",
      reducedMotion: "no-preference",
      serviceWorkers: "block",
      userAgent: userAgentFor(profile.engine, profile.mobile),
    });

    const page = await context.newPage();
    page.setDefaultTimeout(settings.timeout);
    page.setDefaultNavigationTimeout(settings.timeout);

    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const entry = { text: message.text(), location: message.location() };
      if (!isIgnoredConsoleError(entry)) report.diagnostics.consoleErrors.push(entry);
    });
    page.on("pageerror", (error) => {
      report.diagnostics.pageErrors.push({ name: error.name, message: error.message, stack: error.stack ?? null });
    });
    page.on("requestfailed", (request) => {
      const entry = {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        errorText: request.failure()?.errorText ?? "unknown",
      };
      if (!isIgnoredRequestFailure(entry)) report.diagnostics.requestFailures.push(entry);
    });
    page.on("response", (response) => {
      if (response.status() < 400 || isIgnoredNetworkUrl(response.url())) return;
      report.diagnostics.badResponses.push({ url: response.url(), status: response.status(), statusText: response.statusText() });
    });

    await page.addInitScript(() => {
      localStorage.setItem("tasc_cookie_consent_v1", "qa");
    });

    const caseUrl = new URL(settings.url);
    caseUrl.searchParams.set("__tasc_t5_css_qa", `${profile.id}-${Date.now()}`);
    const response = await page.goto(caseUrl.toString(), { waitUntil: "domcontentloaded", timeout: settings.timeout });
    addCheck(report, "navigation-status", Boolean(response && response.status() < 400), {
      status: response?.status() ?? null,
      url: page.url(),
    });

    const boot = await waitForReady(page, settings.timeout);
    report.measurements.boot = boot;
    addCheck(
      report,
      "boot-settled",
      boot.readyState !== "loading" &&
        boot.jsRuntime === "true" &&
        boot.heroSurfaceReady === "true" &&
        boot.preloaderComplete &&
        boot.fontsStatus === "loaded",
      boot,
    );
    addCheck(
      report,
      "engine-detection",
      profile.engine === "webkit"
        ? boot.htmlWebkit === "true" && boot.webkitCompatibility === "true"
        : boot.htmlWebkit !== "true" && boot.webkitCompatibility !== "true",
      boot,
    );

    report.measurements.rootContract = await readRootContract(page);
    const root = report.measurements.rootContract;
    addCheck(report, "body-overflow-x-not-hidden", root.bodyOverflowX !== "hidden", root);
    addCheck(report, "site-shell-clips-x", root.shellOverflowX === "clip", root);
    addCheck(
      report,
      "overscroll-y-contained",
      root.overscrollSupported
        ? root.htmlOverscrollY === "contain" && root.bodyOverscrollY === "contain"
        : root.overscrollHtmlBodyRuleLoaded,
      root,
    );

    report.measurements.glass = await readGlassContract(page);
    const glass = report.measurements.glass;
    const glassElementsPresent = Boolean(glass.header && glass.glassCta && glass.lightCta);
    addCheck(report, "header-and-cta-present", glassElementsPresent, glass);
    if (profile.engine === "webkit") {
      addCheck(
        report,
        "webkit-header-cta-backdrop-none",
        glassElementsPresent && backdropIsNone(glass.header) && backdropIsNone(glass.glassCta) && backdropIsNone(glass.lightCta),
        glass,
      );
      addCheck(
        report,
        "webkit-header-cta-border-1px",
        glassElementsPresent && borderIsOnePixel(glass.header) && borderIsOnePixel(glass.glassCta) && borderIsOnePixel(glass.lightCta),
        glass,
      );
      addCheck(
        report,
        "webkit-header-cta-static-fill",
        glassElementsPresent && hasStaticFill(glass.header) && hasStaticFill(glass.glassCta) && hasStaticFill(glass.lightCta),
        glass,
      );
    } else {
      addCheck(
        report,
        "chromium-current-glass-present",
        glassElementsPresent &&
          backdropHasBlur(glass.header) &&
          (backdropHasBlur(glass.glassCta) || backdropHasBlur(glass.lightCta)),
        glass,
      );
    }

    report.measurements.contentVisibilityInitial = await readContentVisibility(page);
    const visibility = report.measurements.contentVisibilityInitial;
    addCheck(
      report,
      "process-footer-content-visibility-auto",
      visibility.process?.contentVisibility === "auto" && visibility.footer?.contentVisibility === "auto",
      visibility,
    );
    addCheck(
      report,
      "process-footer-intrinsic-size-present",
      Boolean(
        visibility.process?.containIntrinsicSize &&
          visibility.process.containIntrinsicSize !== "none" &&
          visibility.footer?.containIntrinsicSize &&
          visibility.footer.containIntrinsicSize !== "none",
      ),
      visibility,
    );

    report.measurements.overflow = [];
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    await page.waitForTimeout(350);
    report.measurements.overflow.push(await readOverflow(page, "top"));
    report.screenshots.top = await captureViewport(page, outputDirectory, "top");

    if (!profile.mobile) {
      report.measurements.clientsEntranceSettle = await sampleClientsEntranceSettle(page);
      const clientsSettle = report.measurements.clientsEntranceSettle;
      const initialCardStyles = clientsSettle.transitionRecorder?.initialStyles?.cardStyles ?? [];
      const settledCardStyles = clientsSettle.settled.cardStyles ?? [];
      const restoredToInitialBackdrop =
        initialCardStyles.length > 0 &&
        initialCardStyles.length === settledCardStyles.length &&
        initialCardStyles.every(
          (card, index) =>
            card.effectiveBackdropFilter === settledCardStyles[index]?.effectiveBackdropFilter,
        );
      addCheck(
        report,
        "clients-desktop-baseline-backdrop-contract",
        profile.engine === "webkit"
          ? clientsSettle.transitionRecorder?.initialStyles?.allBackdropsNone === true
          : !clientsSettle.settled.backdropSupported ||
            clientsSettle.transitionRecorder?.initialStyles?.allBackdropsNone === false,
        clientsSettle,
      );
      addCheck(
        report,
        "clients-mid-entrance-scrub-engaged",
        (clientsSettle.transitionRecorder?.initialAttribute === null ||
          clientsSettle.transitionRecorder?.initialAttribute === "false") &&
          (clientsSettle.engagedTransition?.oldValue === null ||
            clientsSettle.engagedTransition?.oldValue === "false") &&
          clientsSettle.engagedTransition?.newValue === "true" &&
          clientsSettle.engagedTransition.cardCount > 0 &&
          clientsSettle.engagedTransition.allBackdropsNone &&
          clientsSettle.settled.triggerProgress >= 0.4 &&
          clientsSettle.settled.triggerProgress <= 0.6,
        clientsSettle,
      );
      addCheck(
        report,
        "clients-moving-attribute-clears-after-settle",
        clientsSettle.settled.movingAttribute === null ||
          clientsSettle.settled.movingAttribute === "false",
        clientsSettle,
      );
      addCheck(
        report,
        "clients-desktop-backdrop-restored-after-settle",
        restoredToInitialBackdrop,
        clientsSettle,
      );
    }

    report.measurements.scrollTargets = {};
    report.measurements.scrollTargets.clients = await scrollToSelector(page, ".figma-clients-section", settings.timeout);
    const flareSample = await sampleActiveFlare(page);
    report.measurements.flare = flareSample;
    report.measurements.overflow.push(await readOverflow(page, "clients"));
    report.screenshots.clients = await captureViewport(page, outputDirectory, "clients");

    const counts = flareSample.second.counts;
    addCheck(
      report,
      "clients-single-flare",
      counts.parent === 1 && counts.child === 1 && counts.picture === 1 && counts.image === 1,
      counts,
    );
    const expectedImage = profile.mobile
      ? "clients-flare-white-diagonal-2304x1296-20260801.webp"
      : "clients-flare-white-diagonal-4096x2304-20260801.webp";
    addCheck(
      report,
      "clients-responsive-webp-selected",
      Boolean(
        flareSample.second.image?.complete &&
          flareSample.second.image.naturalWidth > 0 &&
          flareSample.second.image.currentSrc.endsWith(expectedImage),
      ),
      { expectedImage, image: flareSample.second.image },
    );
    addCheck(
      report,
      "clients-parent-top-and-translate3d",
      flareSample.second.parent?.top === "0px" &&
        /^translate3d\(0(?:px)?,\s*-?[\d.]+px,\s*0(?:px)?\)$/i.test(flareSample.second.parent.inlineTransform),
      flareSample.second.parent,
    );
    addCheck(
      report,
      "clients-child-transform-active",
      transformIsActive(flareSample.second.child?.computedTransform) &&
        transformIsActive(flareSample.second.child?.inlineTransform),
      {
        changed: flareSample.childTransformChanged,
        first: flareSample.first.child,
        second: flareSample.second.child,
      },
    );

    report.measurements.scrollTargets.how = await scrollToSelector(page, ".how-work-motion-section", settings.timeout);
    report.measurements.howGlow = await readHowGlow(page);
    report.measurements.overflow.push(await readOverflow(page, "how"));
    report.screenshots.how = await captureViewport(page, outputDirectory, "how");
    const glow = report.measurements.howGlow;
    addCheck(report, "how-glow-width-capped", Boolean(glow && glow.width <= glow.viewportWidth * 1.3 + 1), glow);
    addCheck(report, "how-glow-blur-capped", Boolean(glow && glow.blurPx <= 24), glow);
    if (profile.engine === "webkit") {
      addCheck(report, "webkit-how-glow-filter-free", glow?.filter === "none", glow);
    }

    report.measurements.scrollTargets.datum = await scrollToSelector(page, ".datum-motion-section", settings.timeout);
    report.measurements.overflow.push(await readOverflow(page, "datum"));
    report.screenshots.datum = await captureViewport(page, outputDirectory, "datum");

    if (profile.mobile) {
      report.measurements.mobileCards = await readMobileCards(page);
      const primary = report.measurements.mobileCards.slice(0, 3);
      const rendered = report.measurements.mobileCards.filter((entry) => entry.count > 0);
      addCheck(
        report,
        "mobile-primary-card-families-present",
        primary.every((entry) => entry.count > 0),
        primary,
      );
      addCheck(
        report,
        "mobile-card-backdrop-none",
        rendered.length >= 3 && rendered.every((entry) => entry.allBackdropNone),
        report.measurements.mobileCards,
      );
    }

    report.measurements.scrollTargets.process = await scrollToSelector(page, ".process-contact-section", settings.timeout);
    report.measurements.processGeometry = await readStableGeometry(page, ".process-contact-section");
    report.measurements.overflow.push(await readOverflow(page, "process"));
    report.screenshots.process = await captureViewport(page, outputDirectory, "process");
    report.measurements.screenshotArtifacts = Object.entries(report.screenshots).map(([name, filePath]) => ({
      name,
      filePath,
      exists: fs.existsSync(filePath),
      bytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
    }));
    addCheck(
      report,
      "five-screenshots-written",
      report.measurements.screenshotArtifacts.length === 5 &&
        report.measurements.screenshotArtifacts.every((artifact) => artifact.exists && artifact.bytes > 0),
      report.measurements.screenshotArtifacts,
    );
    addCheck(
      report,
      "process-geometry-stable-nonzero",
      report.measurements.processGeometry.nonzero && report.measurements.processGeometry.stable,
      report.measurements.processGeometry,
    );

    report.measurements.scrollTargets.footer = await scrollToSelector(page, ".site-footer", settings.timeout);
    report.measurements.footerGeometry = await readStableGeometry(page, ".site-footer");
    report.measurements.overflow.push(await readOverflow(page, "footer"));
    addCheck(
      report,
      "footer-geometry-stable-nonzero",
      report.measurements.footerGeometry.nonzero && report.measurements.footerGeometry.stable,
      report.measurements.footerGeometry,
    );

    const worstOverflow = report.measurements.overflow.reduce(
      (worst, sample) => (sample.overflowPx > worst.overflowPx ? sample : worst),
      report.measurements.overflow[0],
    );
    addCheck(report, "no-horizontal-overflow", worstOverflow.overflowPx <= 1, {
      worst: worstOverflow,
      samples: report.measurements.overflow,
    });

    await page.waitForTimeout(300);
    addCheck(
      report,
      "runtime-clean",
      report.diagnostics.consoleErrors.length === 0 &&
        report.diagnostics.pageErrors.length === 0 &&
        report.diagnostics.requestFailures.length === 0 &&
        report.diagnostics.badResponses.length === 0,
      report.diagnostics,
    );
  } catch (error) {
    report.failures.push("harness-exception");
    report.exception = {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    };
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }

  report.completedAt = new Date().toISOString();
  report.passed = report.failures.length === 0;
  writeJson(path.join(outputDirectory, "results.json"), report);
  return report;
}

const args = parseArguments(process.argv.slice(2));

if (args.help) {
  process.stdout.write(
    [
      "Usage: node scripts/verify-t5-safari-css.mjs [options]",
      "",
      "Options:",
      "  --url <url>         Site URL (default: http://127.0.0.1:3213/)",
      "  --output <path>     Artifact directory (default: work/t5-safari-css-<timestamp>)",
      "  --timeout <ms>      Per-operation timeout (default: 45000)",
      "  --headed            Show browser windows",
      "  --help              Show this help",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const settings = {
  url: normalizeUrl(typeof args.url === "string" ? args.url : "http://127.0.0.1:3213/"),
  outputRoot: path.resolve(projectRoot, typeof args.output === "string" ? args.output : `work/t5-safari-css-${timestamp}`),
  timeout: parsePositiveInteger(args.timeout, 45000, "--timeout"),
  headed: args.headed === true,
};

const profiles = [
  { id: "chromium-desktop-1440x900", engine: "chromium", viewport: { width: 1440, height: 900 }, mobile: false },
  { id: "chromium-mobile-390x844", engine: "chromium", viewport: { width: 390, height: 844 }, mobile: true },
  { id: "webkit-desktop-1440x900", engine: "webkit", viewport: { width: 1440, height: 900 }, mobile: false },
  { id: "webkit-mobile-390x844", engine: "webkit", viewport: { width: 390, height: 844 }, mobile: true },
];

fs.mkdirSync(settings.outputRoot, { recursive: true });
const playwright = loadPlaywright();
const reports = [];

for (const profile of profiles) {
  process.stdout.write(`[t5-safari-css] running ${profile.id}\n`);
  const report = await runCase(playwright, profile, settings);
  reports.push(report);
  process.stdout.write(`[t5-safari-css] ${profile.id}: ${report.passed ? "PASS" : `FAIL (${report.failures.join(", ")})`}\n`);
}

const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  url: settings.url,
  outputRoot: settings.outputRoot,
  syntheticWebkitNotice: "Playwright WebKit is a browser-engine gate and does not replace physical Safari acceptance on macOS or iOS.",
  passed: reports.every((report) => report.passed),
  totals: {
    cases: reports.length,
    passed: reports.filter((report) => report.passed).length,
    failed: reports.filter((report) => !report.passed).length,
    checks: reports.reduce((sum, report) => sum + report.checks.length, 0),
    failedChecks: reports.reduce((sum, report) => sum + report.failures.length, 0),
  },
  cases: reports.map((report) => ({
    id: report.id,
    passed: report.passed,
    failures: report.failures,
    results: path.join(settings.outputRoot, report.id, "results.json"),
    screenshots: report.screenshots,
  })),
};

const summaryPath = path.join(settings.outputRoot, "summary.json");
writeJson(summaryPath, summary);
process.stdout.write(`[t5-safari-css] summary: ${summaryPath}\n`);
process.stdout.write(`[t5-safari-css] overall: ${summary.passed ? "PASS" : "FAIL"}\n`);
process.exitCode = summary.passed ? 0 : 1;
