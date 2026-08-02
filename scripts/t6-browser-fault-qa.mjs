import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium, webkit } from "playwright";

const args = Object.fromEntries(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  }),
);

const baseUrl = String(args.url ?? "http://127.0.0.1:3106/");
const outputRoot = path.resolve(String(args.output ?? "output/playwright/t6-browser-fault"));
const headed = Boolean(args.headed);
const DOMINO_PREFLIGHT_CONTRACT_MS = 1_200;
const TIMER_TOLERANCE_MS = 40;
const PRE_FLIGHT_ASSERTION_LIMIT_MS = DOMINO_PREFLIGHT_CONTRACT_MS + TIMER_TOLERANCE_MS;
const SITE_TIMEOUT_MS = 60_000;
const TRANSITION_TIMEOUT_MS = 45_000;
const allProfiles = [
  {
    id: "chromium-desktop",
    browserType: chromium,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    input: "wheel",
  },
  {
    id: "chromium-mobile",
    browserType: chromium,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    input: "touch",
  },
  {
    id: "webkit-desktop",
    browserType: webkit,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    input: "wheel",
  },
  {
    id: "webkit-mobile",
    browserType: webkit,
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    input: "touch",
  },
];
const selectedProfiles = new Set(String(args.profiles ?? "").split(",").filter(Boolean));
const profiles = selectedProfiles.size
  ? allProfiles.filter((profile) => selectedProfiles.has(profile.id))
  : allProfiles;
if (profiles.length === 0) throw new Error(`No matching profiles: ${[...selectedProfiles].join(", ")}`);

const injectedMediaKind = (url) => {
  if (!/\/media\/domino-cta-(?:forward|reverse)-.*\.(?:mp4|webm)(?:\?|$)/i.test(url)) {
    return null;
  }
  return /domino-cta-reverse/i.test(url) ? "reverse" : "forward";
};

const makeTargetUrl = (id, hash = "process") => {
  const target = new URL(baseUrl);
  target.searchParams.set("__t6_fault_qa", `${Date.now()}-${id}`);
  target.hash = hash;
  return target.toString();
};

const installTimeline = async (context) => {
  await context.addInitScript(() => {
    const store = {
      timeline: [],
      inputEvents: [],
    };
    Object.defineProperty(window, "__t6BrowserFaultQa", {
      value: store,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    const read = (reason) => {
      const root = document.querySelector(".site-shell");
      if (!(root instanceof HTMLElement)) return;
      store.timeline.push({
        t: performance.now(),
        reason,
        y: scrollY,
        dominoPreflight: root.dataset.dominoPreflight ?? null,
        dominoPinned: root.dataset.dominoPinned ?? null,
        dominoPlayback: root.dataset.dominoPlayback ?? null,
        motionInputLocked: root.dataset.motionInputLocked ?? null,
        dominoMediaFailure: root.dataset.dominoMediaFailure ?? null,
      });
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (!(record.target instanceof HTMLElement) || !record.target.matches(".site-shell")) continue;
        if (record.attributeName === "data-domino-preflight") {
          store.timeline.push({
            t: performance.now(),
            reason: "preflight-mutation",
            y: scrollY,
            dominoPreflight: record.target.dataset.dominoPreflight ?? null,
            preflightMutation: record.oldValue == null ? "start" : "end",
            preflightOldValue: record.oldValue,
            dominoPinned: record.target.dataset.dominoPinned ?? null,
            dominoPlayback: record.target.dataset.dominoPlayback ?? null,
            motionInputLocked: record.target.dataset.motionInputLocked ?? null,
            dominoMediaFailure: record.target.dataset.dominoMediaFailure ?? null,
          });
        } else {
          read("root-attribute");
        }
      }
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: [
        "data-domino-preflight",
        "data-domino-pinned",
        "data-domino-playback",
        "data-motion-input-locked",
        "data-domino-media-failure",
      ],
    });
    for (const type of ["wheel", "touchmove"]) {
      addEventListener(
        type,
        (event) => {
          setTimeout(() => {
            store.inputEvents.push({
              t: performance.now(),
              type,
              defaultPrevented: event.defaultPrevented,
              y: scrollY,
            });
          }, 0);
        },
        { capture: true, passive: false },
      );
    }
    addEventListener("scroll", () => read("scroll"), { passive: true });
  });
};

const installWebKitMediaFault = async (context, blockedKinds) => {
  await context.addInitScript(({ blocked }) => {
    const blockedSet = new Set(blocked);
    const injections = [];
    Object.defineProperty(window, "__t6MediaFaultInjections", {
      value: injections,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    const kindFor = (value) => {
      const source = String(value ?? "");
      if (!/domino-cta-(?:forward|reverse)-/i.test(source)) return null;
      return /domino-cta-reverse/i.test(source) ? "reverse" : "forward";
    };
    const inject = (element, value) => {
      const kind = kindFor(value);
      if (!kind || !blockedSet.has(kind)) return value;
      injections.push({ kind, originalUrl: String(value), at: performance.now() });
      element.setAttribute("data-t6-fault-injected", kind);
      return "data:video/mp4;base64,AAAA";
    };
    const nativeSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function setAttribute(name, value) {
      const nextValue = this.tagName === "SOURCE" && name.toLowerCase() === "src"
        ? inject(this, value)
        : value;
      return nativeSetAttribute.call(this, name, nextValue);
    };
    const sourceDescriptor = Object.getOwnPropertyDescriptor(HTMLSourceElement.prototype, "src");
    if (sourceDescriptor?.get && sourceDescriptor.set) {
      Object.defineProperty(HTMLSourceElement.prototype, "src", {
        configurable: sourceDescriptor.configurable,
        enumerable: sourceDescriptor.enumerable,
        get: sourceDescriptor.get,
        set(value) {
          sourceDescriptor.set.call(this, inject(this, value));
        },
      });
    }
    const inspect = (root) => {
      if (!(root instanceof Element)) return;
      const sources = root.matches("source") ? [root] : [...root.querySelectorAll("source")];
      for (const source of sources) {
        const value = source.getAttribute("src");
        const kind = kindFor(value);
        if (!kind || !blockedSet.has(kind)) continue;
        nativeSetAttribute.call(source, "src", inject(source, value));
        source.closest("video")?.load();
      }
    };
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") inspect(record.target);
        for (const node of record.addedNodes) inspect(node);
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
  }, { blocked: [...blockedKinds] });
};

const readState = (page) =>
  page.evaluate(() => {
    const root = document.querySelector(".site-shell");
    const domino = document.querySelector(".domino-cta-section");
    const processSection = document.querySelector(".process-contact-section");
    const describe = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const visibleHeight = Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        visibility: visibleHeight / Math.max(1, Math.min(rect.height, innerHeight)),
      };
    };
    return {
      t: performance.now(),
      y: scrollY,
      maxY: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      viewport: { width: innerWidth, height: innerHeight },
      root: root instanceof HTMLElement ? { ...root.dataset } : null,
      domino: describe(domino),
      process: describe(processSection),
      overflow: {
        html: getComputedStyle(document.documentElement).overflowY,
        body: getComputedStyle(document.body).overflowY,
      },
      videos: [...document.querySelectorAll("video.domino-sequence")].map((video) => ({
        direction: video.dataset.dominoDirection ?? null,
        armed: video.dataset.armed ?? null,
        active: video.dataset.dominoActive ?? null,
        segmentState: video.dataset.segmentState ?? null,
        readyState: video.readyState,
        networkState: video.networkState,
        errorCode: video.error?.code ?? null,
        currentTime: video.currentTime,
        duration: video.duration,
        paused: video.paused,
        src: video.currentSrc || video.getAttribute("src") || "",
      })),
    };
  });

const readTimeline = (page) =>
  page.evaluate(() => ({
    timeline: window.__t6BrowserFaultQa?.timeline ?? [],
    inputEvents: window.__t6BrowserFaultQa?.inputEvents ?? [],
  }));

const waitForBoot = async (page) => {
  await page.locator(".site-shell").waitFor({ state: "attached", timeout: SITE_TIMEOUT_MS });
  await page.locator(".site-preloader").waitFor({ state: "detached", timeout: SITE_TIMEOUT_MS });
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
  await page.waitForTimeout(450);
};

const waitForProcess = async (page) => {
  await page.waitForFunction(
    () => {
      const root = document.querySelector(".site-shell");
      const processSection = document.querySelector(".process-contact-section");
      if (!(root instanceof HTMLElement) || !(processSection instanceof HTMLElement)) return false;
      const rect = processSection.getBoundingClientRect();
      return !root.dataset.programmaticAnchor && rect.bottom > 0 && rect.top < innerHeight;
    },
    null,
    { timeout: SITE_TIMEOUT_MS },
  );
  await page.waitForTimeout(450);
};

const dispatchSyntheticTouchSwipe = async (page, direction, magnitude) =>
  page.evaluate(
    async ({ sign, distance }) => {
      const centerX = Math.round(innerWidth * 0.5);
      const startY = sign > 0 ? Math.round(innerHeight * 0.76) : Math.round(innerHeight * 0.24);
      const endY = startY - sign * Math.min(Math.round(innerHeight * 0.5), distance);
      const target = document.elementFromPoint(centerX, startY) ?? document.body;
      const makeTouch = (y) => {
        try {
          return new Touch({
            identifier: 91,
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
            identifier: 91,
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
        adapter: "synthetic-touch-with-native-scroll-semantics",
        canceledMoves: events.filter((event) => event.defaultPrevented).length,
      };
    },
    { sign: direction, distance: magnitude },
  );

const dispatchChromiumTouchSwipe = async (page, cdp, direction, magnitude) => {
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const x = Math.round(viewport.width * 0.5);
  const startY = direction > 0 ? Math.round(viewport.height * 0.76) : Math.round(viewport.height * 0.24);
  const endY = startY - direction * Math.min(Math.round(viewport.height * 0.5), magnitude);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: startY, radiusX: 8, radiusY: 8, force: 0.8, id: 91 }],
  });
  for (let index = 1; index <= 7; index += 1) {
    const y = Math.round(startY + ((endY - startY) * index) / 7);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 0.8, id: 91 }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  return { adapter: "cdp-native-touch", canceledMoves: null };
};

const sendInput = async (page, profile, cdp, direction, scale = 0.42) => {
  const magnitude = Math.round(profile.viewport.height * scale);
  if (profile.input === "wheel") {
    await page.mouse.move(profile.viewport.width / 2, profile.viewport.height / 2);
    await page.mouse.wheel(0, direction * magnitude);
    return { adapter: "playwright-wheel", canceledMoves: null };
  }
  if (cdp) return dispatchChromiumTouchSwipe(page, cdp, direction, magnitude);
  return dispatchSyntheticTouchSwipe(page, direction, magnitude);
};

const timelineCycle = (entries, direction, afterIndex) => {
  const value = direction > 0 ? "forward" : "reverse";
  const slice = entries.slice(afterIndex);
  const startOffset = slice.findIndex(
    (entry) => entry.dominoPreflight === value || entry.preflightMutation === "start",
  );
  if (startOffset < 0) return null;
  const startIndex = afterIndex + startOffset;
  const endOffset = entries.slice(startIndex + 1).findIndex(
    (entry) =>
      entry.preflightOldValue === value ||
      (entry.preflightMutation !== "start" && entry.dominoPreflight !== value),
  );
  const endIndex = endOffset < 0 ? -1 : startIndex + 1 + endOffset;
  const start = entries[startIndex];
  const end = endIndex < 0 ? null : entries[endIndex];
  return {
    direction: value,
    startIndex,
    endIndex,
    start,
    end,
    durationMs: end ? end.t - start.t : null,
  };
};

const waitForPreflightCycle = async (page, profile, cdp, direction) => {
  const beforeTrace = await readTimeline(page);
  const afterIndex = beforeTrace.timeline.length;
  const samples = [];
  const inputs = [];
  const startedAt = Date.now();
  let cycle = null;
  for (let attempt = 0; attempt < 8 && !cycle; attempt += 1) {
    inputs.push(await sendInput(page, profile, cdp, direction, attempt < 3 ? 0.3 : 0.48));
    const settleUntil = Date.now() + 380;
    while (Date.now() < settleUntil && !cycle) {
      samples.push(await readState(page));
      const trace = await readTimeline(page);
      cycle = timelineCycle(trace.timeline, direction, afterIndex);
      await page.waitForTimeout(24);
    }
  }
  const settleStartedAt = Date.now();
  while (cycle && !cycle.end && Date.now() - settleStartedAt < 1_800) {
    samples.push(await readState(page));
    const trace = await readTimeline(page);
    cycle = timelineCycle(trace.timeline, direction, afterIndex);
    await page.waitForTimeout(24);
  }
  const trace = await readTimeline(page);
  cycle = timelineCycle(trace.timeline, direction, afterIndex);
  return {
    cycle,
    traceStartIndex: afterIndex,
    inputs,
    samples,
    elapsedMs: Date.now() - startedAt,
    trace,
  };
};

const movePastFailedBoundary = async (page, profile, cdp, direction) => {
  const before = await readState(page);
  const samples = [before];
  const inputs = [];
  for (let index = 0; index < 10; index += 1) {
    inputs.push(await sendInput(page, profile, cdp, direction, 0.52));
    await page.waitForTimeout(profile.input === "touch" ? 120 : 160);
    const state = await readState(page);
    samples.push(state);
    const moved = direction > 0 ? state.y - before.y : before.y - state.y;
    const passed = direction > 0 ? state.domino?.bottom < 0 : state.domino?.top > state.viewport.height;
    if (moved >= state.viewport.height * 0.55 && passed) break;
  }
  await page.waitForTimeout(1_650);
  const after = await readState(page);
  samples.push(after);
  return { before, after, samples, inputs };
};

const enterHappyForward = async (page, profile, cdp, beforeCompletion) => {
  const setupSamples = [];
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const state = await readState(page);
    setupSamples.push(state);
    if (state.root?.dominoPlayback === "forward") break;
    if (state.root?.dominoPlayback === "complete") break;
    const scale = attempt < 3 ? 0.3 : attempt < 9 ? 0.52 : 0.68;
    await sendInput(page, profile, cdp, 1, scale);
    await page.waitForTimeout(profile.input === "touch" ? 220 : 180);
  }
  await page.waitForFunction(
    () => ["forward", "complete"].includes(
      document.querySelector(".site-shell")?.getAttribute("data-domino-playback") ?? "",
    ),
    null,
    { timeout: 16_000 },
  );
  const started = await readState(page);
  if (started.root?.dominoPlayback === "complete") return { setupSamples, started, completed: started };
  if (beforeCompletion) await beforeCompletion(started);
  await page.waitForFunction(
    () => document.querySelector(".site-shell")?.getAttribute("data-domino-playback") === "complete",
    null,
    { timeout: TRANSITION_TIMEOUT_MS },
  );
  await page.waitForTimeout(650);
  return { setupSamples, started, completed: await readState(page) };
};

const evaluateFaultGate = (direction, preflight, passThrough) => {
  const rootSamples = preflight.samples.concat(passThrough.samples);
  const lockedSamples = rootSamples.filter(
    (sample) =>
      sample.root?.motionInputLocked === "true" ||
      ["forward", "reverse"].includes(sample.root?.dominoPlayback ?? ""),
  );
  const blackLockedSamples = lockedSamples.filter((sample) => {
    const active = sample.videos.find((video) => video.active === "true");
    return !active || active.readyState < 2;
  });
  const relevantInputs = preflight.trace.inputEvents.filter((entry) => {
    if (!preflight.cycle?.start) return false;
    const end = preflight.cycle.end?.t ?? preflight.cycle.start.t + PRE_FLIGHT_ASSERTION_LIMIT_MS;
    return entry.t >= preflight.cycle.start.t - 24 && entry.t <= end + 24;
  });
  const movement = direction > 0
    ? passThrough.after.y - passThrough.before.y
    : passThrough.before.y - passThrough.after.y;
  const failures = [];
  if (!preflight.cycle) failures.push("preflight was not observed");
  if (preflight.cycle && !preflight.cycle.end) failures.push("preflight did not settle");
  if (
    preflight.cycle?.durationMs != null &&
    (preflight.cycle.durationMs < 0 || preflight.cycle.durationMs > PRE_FLIGHT_ASSERTION_LIMIT_MS)
  ) {
    failures.push(
      `preflight exceeded ${DOMINO_PREFLIGHT_CONTRACT_MS}ms + ${TIMER_TOLERANCE_MS}ms timer tolerance`,
    );
  }
  if (lockedSamples.length > 0) failures.push("failed media captured the motion input lock");
  if (movement < passThrough.after.viewport.height * 0.55) failures.push("document did not move past the failed boundary");
  if (passThrough.after.root?.dominoPinned === "true") failures.push("data-domino-pinned remained stuck");
  if (passThrough.after.root?.motionInputLocked === "true") failures.push("data-motion-input-locked remained stuck");
  if (passThrough.after.root?.dominoPreflight) failures.push("data-domino-preflight remained stuck");
  if (passThrough.after.overflow.html === "hidden" || passThrough.after.overflow.body === "hidden") {
    failures.push("document overflow remained locked");
  }
  if (blackLockedSamples.length > 0) failures.push("a black undecoded Domino viewport was input-locked");
  return {
    passed: failures.length === 0,
    failures,
    movement,
    relevantInputs,
    lockedSamples,
    blackLockedSamples,
    finalState: passThrough.after,
  };
};

const openScenario = async (profile, blockedKinds, id) => {
  const browser = await profile.browserType.launch({ headless: !headed });
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    colorScheme: "dark",
    reducedMotion: "no-preference",
    locale: "en-US",
    serviceWorkers: "block",
  });
  await installTimeline(context);
  if (profile.browserType === webkit) await installWebKitMediaFault(context, blockedKinds);
  const aborted = [];
  const routedMedia = [];
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    const kind = injectedMediaKind(requestUrl);
    if (/\/media\/domino-cta-/i.test(requestUrl)) routedMedia.push({ kind, url: requestUrl });
    if (kind && blockedKinds.has(kind)) {
      aborted.push({ kind, url: requestUrl, at: Date.now() });
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  const cdp = profile.browserType === chromium && profile.input === "touch"
    ? await context.newCDPSession(page)
    : null;
  const diagnostics = { consoleErrors: [], pageErrors: [], mediaRequests: [], routedMedia };
  page.on("request", (request) => {
    if (/\/media\/domino-cta-/i.test(request.url())) diagnostics.mediaRequests.push(request.url());
  });
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  await page.goto(makeTargetUrl(id), {
    waitUntil: "domcontentloaded",
    timeout: SITE_TIMEOUT_MS,
  });
  await waitForBoot(page);
  await waitForProcess(page);
  return {
    browser,
    context,
    page,
    cdp,
    aborted,
    diagnostics,
    webkitSourceFault: profile.browserType === webkit,
  };
};

const syncWebKitFaults = async (scenario) => {
  if (!scenario.webkitSourceFault) return;
  const injections = await scenario.page.evaluate(() => window.__t6MediaFaultInjections ?? []);
  for (const injection of injections) {
    if (scenario.aborted.some((entry) => entry.kind === injection.kind && entry.url === injection.originalUrl)) {
      continue;
    }
    scenario.aborted.push({
      kind: injection.kind,
      url: injection.originalUrl,
      at: injection.at,
      mode: "webkit-source-interception",
    });
  }
};

const runForwardFailure = async (profile, directory) => {
  const scenario = await openScenario(profile, new Set(["forward", "reverse"]), `${profile.id}-forward`);
  try {
    const preflight = await waitForPreflightCycle(scenario.page, profile, scenario.cdp, 1);
    const passThrough = await movePastFailedBoundary(scenario.page, profile, scenario.cdp, 1);
    await syncWebKitFaults(scenario);
    const gate = evaluateFaultGate(1, preflight, passThrough);
    const screenshot = path.join(directory, "forward-failure-final.png");
    await scenario.page.screenshot({ path: screenshot, animations: "allow" });
    if (!scenario.aborted.some((entry) => entry.kind === "forward")) {
      gate.passed = false;
      gate.failures.push("forward media request was not aborted");
    }
    return {
      id: `${profile.id}-forward-failure`,
      passed: gate.passed,
      blockedKinds: ["forward", "reverse"],
      aborted: scenario.aborted,
      diagnostics: scenario.diagnostics,
      preflight,
      passThrough,
      gate,
      screenshot,
    };
  } finally {
    await scenario.context.close().catch(() => {});
    await scenario.browser.close().catch(() => {});
  }
};

const runReverseFailure = async (profile, directory) => {
  const scenario = await openScenario(profile, new Set(["reverse"]), `${profile.id}-reverse`);
  try {
    const forward = await enterHappyForward(scenario.page, profile, scenario.cdp);
    const preflight = await waitForPreflightCycle(scenario.page, profile, scenario.cdp, -1);
    const passThrough = await movePastFailedBoundary(scenario.page, profile, scenario.cdp, -1);
    await syncWebKitFaults(scenario);
    const gate = evaluateFaultGate(-1, preflight, passThrough);
    const screenshot = path.join(directory, "reverse-failure-final.png");
    await scenario.page.screenshot({ path: screenshot, animations: "allow" });
    if (!scenario.aborted.some((entry) => entry.kind === "reverse")) {
      gate.passed = false;
      gate.failures.push("reverse media request was not aborted");
    }
    return {
      id: `${profile.id}-reverse-failure`,
      passed: gate.passed,
      blockedKinds: ["reverse"],
      aborted: scenario.aborted,
      diagnostics: scenario.diagnostics,
      happyForward: forward,
      preflight,
      passThrough,
      gate,
      screenshot,
    };
  } finally {
    await scenario.context.close().catch(() => {});
    await scenario.browser.close().catch(() => {});
  }
};

fs.mkdirSync(outputRoot, { recursive: true });
const results = [];
for (const profile of profiles) {
  const directory = path.join(outputRoot, profile.id);
  fs.mkdirSync(directory, { recursive: true });
  for (const runner of [runForwardFailure, runReverseFailure]) {
    const label = runner === runForwardFailure ? "forward" : "reverse";
    process.stdout.write(`[t6-fault] ${profile.id} ${label} ... `);
    try {
      const result = await runner(profile, directory);
      results.push(result);
      fs.writeFileSync(path.join(directory, `${label}-result.json`), JSON.stringify(result, null, 2));
      console.log(result.passed ? "PASS" : `FAIL: ${result.gate.failures.join("; ")}`);
    } catch (error) {
      const result = {
        id: `${profile.id}-${label}-failure`,
        passed: false,
        fatal: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
      };
      results.push(result);
      fs.writeFileSync(path.join(directory, `${label}-result.json`), JSON.stringify(result, null, 2));
      console.log(`FAIL: ${result.fatal.message ?? result.fatal}`);
    }
  }
}

const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  baseUrl,
  preflightContractMs: DOMINO_PREFLIGHT_CONTRACT_MS,
  timerToleranceMs: TIMER_TOLERANCE_MS,
  preflightAssertionLimitMs: PRE_FLIGHT_ASSERTION_LIMIT_MS,
  passed: results.every((result) => result.passed),
  totals: {
    scenarios: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
  },
  results: results.map((result) => ({
    id: result.id,
    passed: result.passed,
    failures: result.gate?.failures ?? [result.fatal?.message ?? String(result.fatal)],
    preflightMs: result.preflight?.cycle?.durationMs ?? null,
    movement: result.gate?.movement ?? null,
    abortedKinds: [...new Set((result.aborted ?? []).map((entry) => entry.kind))],
    screenshot: result.screenshot ?? null,
  })),
};
const summaryFile = path.join(outputRoot, "summary.json");
fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, results: summary.results, summaryFile }, null, 2));
if (!summary.passed) process.exitCode = 1;
