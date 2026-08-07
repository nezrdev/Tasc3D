import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium, webkit } from "playwright";

const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.replace(/^--/, "").split("=");
  return [key, rest.join("=") || true];
}));
const baseUrl = String(args.url ?? "http://127.0.0.1:3144/");
const outputRoot = path.resolve(String(args.output ?? "output/playwright/t14-motion-story"));
const cookieValue = JSON.stringify({
  acceptedAt: "2026-08-07T00:00:00.000Z",
  analytics: true,
  mode: "all",
  necessary: true,
  version: 1,
});

const profiles = [
  { engine: "chromium", fullMotion: true, name: "chromium-desktop", type: chromium, viewport: { width: 1440, height: 900 } },
  { engine: "chromium", fullMotion: true, hasTouch: true, isMobile: true, name: "chromium-android", type: chromium, viewport: { width: 412, height: 915 } },
  { engine: "webkit", fullMotion: false, hasTouch: true, isMobile: true, name: "webkit-mobile", type: webkit, viewport: { width: 390, height: 844 } },
].filter((profile) => !args.profile || profile.name === args.profile);

mkdirSync(outputRoot, { recursive: true });

async function dispatchGesture(page, direction, touch) {
  await page.evaluate(({ direction: sign, touch: useTouch }) => {
    if (!useTouch || typeof Touch !== "function") {
      for (let index = 0; index < 3; index += 1) {
        window.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
          deltaY: sign * 1400,
        }));
      }
      return;
    }
    const target = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) ?? document.body;
    const x = Math.round(window.innerWidth / 2);
    const startY = sign > 0 ? Math.round(window.innerHeight * 0.78) : Math.round(window.innerHeight * 0.22);
    const endY = sign > 0 ? Math.round(window.innerHeight * 0.18) : Math.round(window.innerHeight * 0.82);
    const makeTouch = (y) => new Touch({
      clientX: x,
      clientY: y,
      identifier: 14,
      pageX: x,
      pageY: y + window.scrollY,
      radiusX: 10,
      radiusY: 10,
      screenX: x,
      screenY: y,
      target,
    });
    const start = makeTouch(startY);
    target.dispatchEvent(new TouchEvent("touchstart", {
      bubbles: true,
      cancelable: true,
      changedTouches: [start],
      targetTouches: [start],
      touches: [start],
    }));
    const end = makeTouch(endY);
    target.dispatchEvent(new TouchEvent("touchmove", {
      bubbles: true,
      cancelable: true,
      changedTouches: [end],
      targetTouches: [end],
      touches: [end],
    }));
    target.dispatchEvent(new TouchEvent("touchend", {
      bubbles: true,
      cancelable: true,
      changedTouches: [end],
      targetTouches: [],
      touches: [],
    }));
  }, { direction, touch });
}

async function measureDocumentScrollRate(page, touch) {
  await page.evaluate((useTouch) => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (!useTouch) {
      window.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true, cancelable: true, deltaMode: WheelEvent.DOM_DELTA_PIXEL, deltaY: 200,
      }));
      return;
    }
    const target = document.elementFromPoint(innerWidth / 2, Math.min(600, innerHeight * 0.75)) ?? document.body;
    const x = Math.round(innerWidth / 2);
    const startY = Math.round(Math.min(600, innerHeight * 0.75));
    const makeTouch = (y) => new Touch({
      clientX: x, clientY: y, identifier: 91, pageX: x, pageY: y, screenX: x, screenY: y, target,
    });
    const start = makeTouch(startY);
    target.dispatchEvent(new TouchEvent("touchstart", {
      bubbles: true, cancelable: true, changedTouches: [start], targetTouches: [start], touches: [start],
    }));
    const end = makeTouch(startY - 200);
    target.dispatchEvent(new TouchEvent("touchmove", {
      bubbles: true, cancelable: true, changedTouches: [end], targetTouches: [end], touches: [end],
    }));
    target.dispatchEvent(new TouchEvent("touchend", {
      bubbles: true, cancelable: true, changedTouches: [end], targetTouches: [], touches: [],
    }));
  }, touch);
  await page.waitForTimeout(1_350);
  return page.evaluate(() => Math.round(window.scrollY));
}

const stateMatches = (state, target) => {
  if (target.kind === "services")
    return state.servicesPhase === "waiting" && state.servicesActive === String(target.stage);
  if (target.kind === "story")
    return state.owner === target.owner && state.storyState === "waiting" && state.storyStage === String(target.stage);
  if (target.kind === "released")
    return state.owner !== target.owner && state.storyState !== "releasing";
  if (target.kind === "domino-form")
    return state.owner === "domino" && state.dominoScene === "form" && state.dominoPlayback === "complete";
  if (target.kind === "domino-reversed")
    return state.owner !== "domino" && state.dominoPlayback === "start";
  return false;
};

async function readState(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".site-shell");
    return {
      decoderCount: Number(root?.dataset.activeDecoderCount ?? 0),
      dominoPlayback: root?.dataset.dominoPlayback ?? null,
      dominoScene: root?.dataset.dominoSceneState ?? null,
      owner: root?.dataset.motionStoryOwner ?? null,
      storyError: root?.dataset.motionStoryError ?? null,
      servicesActive: root?.dataset.servicesActive ?? null,
      servicesPhase: root?.dataset.servicesPhase ?? null,
      storyStage: root?.dataset.motionStoryStage ?? null,
      storyState: root?.dataset.motionStoryState ?? null,
      watchdogRelease: root?.dataset.motionInputWatchdogRelease ?? null,
      y: Math.round(window.scrollY),
    };
  });
}

async function waitTarget(page, target, timeout = 30_000) {
  const started = Date.now();
  const samples = [];
  while (Date.now() - started < timeout) {
    const state = await readState(page);
    samples.push(state);
    if (stateMatches(state, target))
      return samples;
    await page.waitForTimeout(45);
  }
  throw new Error(`timed out waiting for ${JSON.stringify(target)}; last=${JSON.stringify(samples.at(-1))}`);
}

async function gestureTo(page, direction, touch, target, timeout) {
  const before = await readState(page);
  await dispatchGesture(page, direction, touch);
  const samples = [before, ...(await waitTarget(page, target, timeout))];
  await page.waitForTimeout(230);
  return {
    after: await readState(page),
    samples,
    spread: Math.max(...samples.map((sample) => sample.y)) - Math.min(...samples.map((sample) => sample.y)),
  };
}

async function navigate(page, hash, selector) {
  const clicked = await page.evaluate((href) => {
    const link = document.querySelector(`.site-header a[href="${href}"]`);
    if (!(link instanceof HTMLAnchorElement))
      return false;
    link.click();
    return true;
  }, hash);
  if (!clicked)
    throw new Error(`missing header link ${hash}`);
  await page.waitForFunction(({ hash: expectedHash, selector: targetSelector }) => {
    const root = document.querySelector(".site-shell");
    const rect = document.querySelector(targetSelector)?.getBoundingClientRect();
    return location.hash === expectedHash &&
      !root?.dataset.programmaticAnchor &&
      Boolean(rect && rect.bottom > 0 && rect.top < innerHeight);
  }, { hash, selector }, { timeout: 15_000 });
}

async function inspectHeader(page) {
  return page.evaluate(() => {
    const header = document.querySelector(".site-header")?.getBoundingClientRect();
    const logo = document.querySelector(".brand-logo")?.getBoundingClientRect();
    const toggle = document.querySelector(".mobile-menu-toggle")?.getBoundingClientRect();
    const inside = (rect) => Boolean(rect && rect.top >= -1 && rect.left >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1);
    return {
      header: header ? { bottom: header.bottom, left: header.left, right: header.right, top: header.top } : null,
      headerInside: inside(header),
      logoInside: inside(logo),
      toggleDisplay: toggle ? getComputedStyle(document.querySelector(".mobile-menu-toggle")).display : null,
      toggleInside: inside(toggle),
    };
  });
}

const cases = [];

for (const profile of profiles) {
  const browser = await profile.type.launch({ headless: true });
  const context = await browser.newContext({
    hasTouch: profile.hasTouch,
    isMobile: profile.isMobile,
    locale: "en-US",
    viewport: profile.viewport,
  });
  await context.addInitScript(({ cookieValue: value }) => {
    localStorage.setItem("tasc_cookie_consent_v1", value);
  }, { cookieValue });
  const page = await context.newPage();
  const checks = [];
  const errors = [];
  const transitions = [];
  const screenshots = [];
  const gestureUsesTouch = profile.hasTouch && profile.engine !== "webkit";
  const check = (name, passed, detail = null) => checks.push({ detail, name, passed: Boolean(passed) });
  page.on("console", (message) => {
    if (message.type() === "error")
      errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  try {
    const target = new URL(baseUrl);
    target.searchParams.set("t14qa", `${profile.name}-${Date.now()}`);
    const response = await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    check("HTTP page response", Boolean(response && response.status() < 400), response?.status());
    await page.waitForSelector(".site-preloader", { state: "attached", timeout: 2_000 });
    await page.waitForSelector(".site-preloader", { state: "hidden", timeout: 8_000 });
    // The deadline is relative to browser navigation, not host process startup,
    // response latency, or React's later removal of an already inert node.
    const curtainMs = await page.evaluate(() => Math.round(performance.now()));
    check("curtain opens no earlier than 3.5s", curtainMs >= 3400, curtainMs);
    check("curtain fail-opens by hard deadline", curtainMs <= 5200, curtainMs);
    await page.waitForFunction(() => document.querySelector(".site-shell")?.dataset.motionReady === "true", null, { timeout: 20_000 });
    await page.evaluate(() => {
      window.__t14DecoderSamples = [];
      window.__t14DecoderTimer = window.setInterval(() => {
        const root = document.querySelector(".site-shell");
        window.__t14DecoderSamples.push(Number(root?.dataset.activeDecoderCount ?? 0));
      }, 40);
    });

    const scrollDistance = await measureDocumentScrollRate(page, gestureUsesTouch);
    check("normal document gesture moves at approximately 70%", scrollDistance >= 124 && scrollDistance <= 156, scrollDistance);
    await navigate(page, "#top", ".hero-motion");

    const headerPortrait = await inspectHeader(page);
    check("header visible in portrait", headerPortrait.headerInside && headerPortrait.logoInside && (!profile.isMobile || headerPortrait.toggleInside), headerPortrait);
    if (profile.isMobile) {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(150);
      const headerLandscape = await inspectHeader(page);
      check("header visible in landscape", headerLandscape.headerInside && headerLandscape.logoInside && headerLandscape.toggleInside, headerLandscape);
      await page.setViewportSize(profile.viewport);
      await page.waitForTimeout(150);
    }

    const runtime = await page.evaluate(() => ({
      canvases: document.querySelectorAll(".galaxy-canvas-element").length,
      maxDecoders: Number(document.querySelector(".site-shell")?.dataset.maxActiveDecoders ?? 0),
      mobilePerformance: document.querySelector(".site-shell")?.dataset.mobilePerformance,
      starfieldMode: document.querySelector(".site-shell")?.dataset.starfieldMode,
    }));
    check("decoder limit contract", runtime.maxDecoders === (profile.isMobile ? 1 : 2), runtime);
    check("Galaxy context budget", profile.isMobile ? runtime.canvases === 0 : runtime.canvases <= 1, runtime);

    if (profile.fullMotion) {
      await navigate(page, "#work", ".how-work-motion-section");
      await waitTarget(page, { kind: "story", owner: "how", stage: 1 }, 12_000);
      await page.waitForTimeout(2_200);
      const directWorkGhosts = await page.evaluate(() => [...document.querySelectorAll(".services-story-panel")]
        .filter((panel) => {
          const style = getComputedStyle(panel);
          return style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0.05;
        }).length);
      check("direct header navigation to How hides Services copy", directWorkGhosts === 0, directWorkGhosts);
      await navigate(page, "#top", ".hero-motion");
    }

    await navigate(page, "#clients", ".figma-clients-section");
    await page.waitForTimeout(450);
    const starState = await page.evaluate(() => {
      const stage = document.querySelector(".first-four-galaxy-stage");
      const fallback = document.querySelector(".first-four-galaxy-stage .static-starfield-fallback");
      const fallbackStyle = fallback ? getComputedStyle(fallback) : null;
      return {
        fallbackVisible: Boolean(fallbackStyle && fallbackStyle.visibility !== "hidden" && Number.parseFloat(fallbackStyle.opacity || "1") > 0.05),
        stageOpacity: stage ? Number.parseFloat(getComputedStyle(stage).opacity || "1") : 0,
      };
    });
    check("Clients shared star stage remains visible", starState.stageOpacity > 0.05 && (!profile.isMobile || starState.fallbackVisible), starState);
    const clientShot = path.resolve(outputRoot, `${profile.name}-clients.png`);
    await page.screenshot({ path: clientShot });
    screenshots.push(clientShot);

    if (profile.fullMotion) {
      await navigate(page, "#services", ".services-story-section");
      await waitTarget(page, { kind: "services", stage: 1 }, 25_000);
      await page.waitForTimeout(240);
      const service2 = await gestureTo(page, 1, gestureUsesTouch, { kind: "services", stage: 2 }, 25_000);
      transitions.push({ name: "services-1-2", spread: service2.spread });
      check("one strong gesture advances Services by one stage", service2.after.servicesActive === "2", service2.after);
      check("Services scrollY fixed during transition", service2.spread <= 3, service2.spread);
      const service3 = await gestureTo(page, 1, gestureUsesTouch, { kind: "services", stage: 3 }, 25_000);
      transitions.push({ name: "services-2-3", spread: service3.spread });
      check("second Services gesture reaches stage 3 only", service3.after.servicesActive === "3", service3.after);
      const serviceReverse = await gestureTo(page, -1, gestureUsesTouch, { kind: "services", stage: 2 }, 25_000);
      check("Services reverse is symmetric", serviceReverse.after.servicesActive === "2", serviceReverse.after);
      await gestureTo(page, 1, gestureUsesTouch, { kind: "services", stage: 3 }, 25_000);
      await gestureTo(page, 1, gestureUsesTouch, { kind: "released", owner: "services" }, 25_000);

      await navigate(page, "#work", ".how-work-motion-section");
      await waitTarget(page, { kind: "story", owner: "how", stage: 1 }, 12_000);
      const servicesGhosts = await page.evaluate(() => [...document.querySelectorAll(".services-story-panel")]
        .filter((panel) => {
          const style = getComputedStyle(panel);
          return style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0.05;
        }).length);
      check("How enters without ghosted Services copy", servicesGhosts === 0, servicesGhosts);
      const howShot = path.resolve(outputRoot, `${profile.name}-how-stage-1.png`);
      await page.screenshot({ path: howShot });
      screenshots.push(howShot);
      const how2 = await gestureTo(page, 1, gestureUsesTouch, { kind: "story", owner: "how", stage: 2 }, 12_000);
      check("one strong gesture advances How by one stage", how2.after.storyStage === "2", how2.after);
      check("How scrollY fixed during transition", how2.spread <= 3, how2.spread);
      await gestureTo(page, 1, gestureUsesTouch, { kind: "story", owner: "how", stage: 3 }, 12_000);
      const howReverse = await gestureTo(page, -1, gestureUsesTouch, { kind: "story", owner: "how", stage: 2 }, 12_000);
      check("How reverse is symmetric", howReverse.after.storyStage === "2", howReverse.after);
      if (!profile.hasTouch) {
        await gestureTo(page, 1, false, { kind: "story", owner: "how", stage: 3 }, 12_000);
        await page.evaluate(() => {
          const fire = () => window.dispatchEvent(new WheelEvent("wheel", {
            bubbles: true, cancelable: true, deltaMode: WheelEvent.DOM_DELTA_PIXEL, deltaY: 1400,
          }));
          fire();
          window.setTimeout(fire, 60);
        });
        const momentumSamples = [];
        for (let index = 0; index < 18; index += 1) {
          momentumSamples.push(await readState(page));
          await page.waitForTimeout(25);
        }
        check(
          "same wheel burst cannot release How and enter Datum",
          momentumSamples.every((sample) => sample.owner !== "datum"),
          momentumSamples,
        );
      }

      await navigate(page, "#datum", ".datum-motion-section");
      await waitTarget(page, { kind: "story", owner: "datum", stage: 1 }, 15_000);
      const datumWaitlist = await gestureTo(page, 1, gestureUsesTouch, { kind: "story", owner: "datum", stage: 2 }, 15_000);
      check("Datum cards become waitlist on one new gesture", datumWaitlist.after.storyStage === "2", datumWaitlist.after);
      check("Datum scrollY fixed during transition", datumWaitlist.spread <= 3, datumWaitlist.spread);
      await gestureTo(page, 1, gestureUsesTouch, { kind: "released", owner: "datum" }, 12_000);
      await gestureTo(page, -1, gestureUsesTouch, { kind: "story", owner: "datum", stage: 2 }, 12_000);
      await gestureTo(page, -1, gestureUsesTouch, { kind: "story", owner: "datum", stage: 1 }, 15_000);
      const datumReleaseBack = await gestureTo(page, -1, gestureUsesTouch, { kind: "released", owner: "datum" }, 12_000);
      check("Datum reverse restores cards then releases", datumReleaseBack.after.owner !== "datum", datumReleaseBack.after);
    }

    await navigate(page, "#process", ".process-contact-section");
    const processGeometry = await page.evaluate(() => [...document.querySelectorAll(".process-contact-row")].map((row) => {
      const number = row.querySelector(".process-contact-row-title > span")?.getBoundingClientRect();
      const title = row.querySelector(".process-contact-row-title > h3")?.getBoundingClientRect();
      const body = row.querySelector(":scope > p")?.getBoundingClientRect();
      return {
        bodyBelowTitle: Boolean(body && title && body.top >= title.bottom - 1),
        numberBodyOverlap: Boolean(number && body && number.bottom > body.top && number.right > body.left),
      };
    }));
    check("Process mobile rows do not overlap", !profile.isMobile || processGeometry.every((row) => row.bodyBelowTitle && !row.numberBodyOverlap), processGeometry);
    const processShot = path.resolve(outputRoot, `${profile.name}-process.png`);
    await page.screenshot({ path: processShot });
    screenshots.push(processShot);

    await navigate(page, "#brief", ".domino-cta-section");
    const firstForward = await waitTarget(page, { kind: "domino-form" }, 20_000);
    const firstForwardSpread = Math.max(...firstForward.map((sample) => sample.y)) - Math.min(...firstForward.map((sample) => sample.y));
    const formVisible = await page.evaluate(() => {
      const form = document.querySelector(".domino-form-stage");
      const rect = form?.getBoundingClientRect();
      const style = form ? getComputedStyle(form) : null;
      return Boolean(form && rect && rect.top <= 3 && rect.bottom >= innerHeight - 3 && style && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0.05);
    });
    const dominoTextGeometry = await page.evaluate(() => {
      const title = document.querySelector(".domino-video-title")?.getBoundingClientRect();
      const body = document.querySelector(".domino-body-primary")?.getBoundingClientRect();
      return {
        bodyTop: body?.top ?? null,
        gap: title && body ? body.top - title.bottom : null,
        titleBottom: title?.bottom ?? null,
      };
    });
    check("Domino forward shows working form in pinned scene", formVisible, await readState(page));
    check("Domino title does not overlap form copy", Number(dominoTextGeometry.gap) >= 12, dominoTextGeometry);
    check("Domino forward keeps scrollY fixed", firstForwardSpread <= 3, firstForwardSpread);
    const dominoShot = path.resolve(outputRoot, `${profile.name}-domino-form.png`);
    await page.screenshot({ path: dominoShot });
    screenshots.push(dominoShot);

    const reverse1 = await gestureTo(page, -1, gestureUsesTouch, { kind: "domino-reversed" }, 20_000);
    check("Domino reverse replays and releases toward Process", reverse1.after.owner !== "domino", reverse1.after);
    if (profile.fullMotion) {
      const forward2 = await gestureTo(page, 1, gestureUsesTouch, { kind: "domino-form" }, 20_000);
      check("Domino forward replay shows form again", forward2.after.dominoScene === "form", forward2.after);
      await gestureTo(page, 1, gestureUsesTouch, { kind: "released", owner: "domino" }, 12_000);
      const reverse2 = await gestureTo(page, -1, gestureUsesTouch, { kind: "domino-reversed" }, 20_000);
      check("Domino completes a second reverse replay", reverse2.after.owner !== "domino", reverse2.after);
    }

    const finalRuntime = await page.evaluate(() => {
      window.clearInterval(window.__t14DecoderTimer);
      const root = document.querySelector(".site-shell");
      const videos = [...document.querySelectorAll("video")];
      return {
        decoderSamples: window.__t14DecoderSamples,
        mediaErrors: videos.filter((video) => video.error).map((video) => ({ code: video.error.code, src: video.currentSrc })),
        owner: root?.dataset.motionStoryOwner ?? null,
        state: root?.dataset.motionStoryState ?? null,
      };
    });
    const maxDecoderCount = Math.max(0, ...finalRuntime.decoderSamples);
    check("active decoder ceiling", maxDecoderCount <= (profile.isMobile ? 1 : 2), maxDecoderCount);
    check("no media element errors", finalRuntime.mediaErrors.length === 0, finalRuntime.mediaErrors);
    check("no console/page errors", errors.length === 0, errors);
  }
  catch (error) {
    checks.push({ detail: error instanceof Error ? error.stack : String(error), name: "case completed", passed: false });
  }
  finally {
    cases.push({
      checks,
      errors,
      name: profile.name,
      passed: checks.every((entry) => entry.passed),
      screenshots,
      transitions,
    });
    await context.close();
    await browser.close();
  }
}

const report = {
  baseUrl,
  cases,
  generatedAt: new Date().toISOString(),
  passed: cases.every((entry) => entry.passed),
};
const reportPath = path.resolve(outputRoot, "report.json");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.passed)
  process.exit(1);
