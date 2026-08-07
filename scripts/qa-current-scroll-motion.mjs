import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, devices, webkit } from "playwright";

const baseUrl = process.env.QA_URL ?? "http://127.0.0.1:3155";
const outputDir = path.resolve(process.env.QA_OUTPUT ?? "output/playwright/current-scroll-motion");
const requestedEngine = process.argv.find((value) => value.startsWith("--engine="))?.split("=")[1];
const requestedCheck = process.argv.find((value) => value.startsWith("--check="))?.split("=")[1];

const profiles = [
  {
    name: "chromium-desktop-1440x900",
    engine: chromium,
    context: { viewport: { width: 1440, height: 900 } },
    nativeInput: "wheel",
  },
  {
    name: "chromium-mobile-390x844",
    engine: chromium,
    context: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    nativeInput: "touch",
  },
  {
    name: "webkit-mobile-390x844",
    engine: webkit,
    context: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    nativeInput: "programmatic",
  },
].filter((profile) => !requestedEngine || profile.name.startsWith(requestedEngine));

const shellState = () => {
  const shell = document.querySelector("main.site-shell");
  const data = shell?.dataset ?? {};
  return {
    scrollY: Math.round(window.scrollY),
    lock: document.documentElement.dataset.scrollLock ?? "",
    motionInputLocked: data.motionInputLocked ?? "",
    servicesActive: data.servicesActive ?? "",
    servicesEntryDirection: data.servicesEntryDirection ?? "",
    servicesPhase: data.servicesPhase ?? "",
    servicesPinned: data.servicesPinned ?? "",
    servicesSequenceComplete: data.servicesSequenceComplete ?? "",
    datumPinned: data.datumPinned ?? "",
    datumProgress: data.datumProgress ?? "",
    dominoPinned: data.dominoPinned ?? "",
    dominoPlayback: data.dominoPlayback ?? "",
    wheelScrollRate: data.wheelScrollRate ?? "",
  };
};

async function waitForReady(page) {
  await page.waitForSelector("main.site-shell", { timeout: 45_000 });
  await page.waitForFunction(() => document.querySelector("main.site-shell")?.dataset.motionReady === "true", null, { timeout: 60_000 });
  await page.waitForTimeout(500);
}

async function sectionTop(page, selector) {
  return page.evaluate((targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (!(element instanceof HTMLElement))
      throw new Error(`Missing ${targetSelector}`);
    return Math.round(element.getBoundingClientRect().top + window.scrollY);
  }, selector);
}

async function viewportHeight(page) {
  return page.evaluate(() => Math.max(1, window.visualViewport?.height ?? window.innerHeight));
}

async function jumpTo(page, y) {
  await page.evaluate((top) => window.scrollTo({ top: Math.max(0, top), left: 0, behavior: "auto" }), Math.round(y));
  await page.waitForTimeout(450);
}

async function createInput(page, profile) {
  if (profile.nativeInput === "wheel")
    return (delta) => page.mouse.wheel(0, delta);
  if (profile.nativeInput === "touch") {
    const session = await page.context().newCDPSession(page);
    return async (delta) => {
      const viewport = page.viewportSize();
      const x = Math.round((viewport?.width ?? 390) / 2);
      const height = viewport?.height ?? 844;
      const startY = delta > 0 ? Math.round(height * 0.72) : Math.round(height * 0.28);
      const endY = Math.max(40, Math.min(height - 40, startY - delta));
      const point = (type, y) => session.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      });
      await point("touchStart", startY);
      for (let index = 1; index <= 6; index += 1)
        await point("touchMove", startY + ((endY - startY) * index) / 6);
      await point("touchEnd", endY);
    };
  }
  return (delta) => page.evaluate((amount) => window.scrollBy({ top: amount, left: 0, behavior: "auto" }), delta);
}

async function waitForServicesStage(page, stage, timeout = 24_000) {
  await page.waitForFunction((expected) => {
    const data = document.querySelector("main.site-shell")?.dataset;
    return data?.servicesActive === String(expected) && data?.servicesPhase === "waiting";
  }, stage, { timeout });
}

async function driveUntil(page, input, delta, condition, argument = null, timeout = 32_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    await input(delta);
    try {
      await page.waitForFunction(condition, argument, { timeout: Math.min(6000, Math.max(500, deadline - Date.now())) });
      return;
    }
    catch (error) {
      lastError = error;
    }
  }
  const state = await page.evaluate(shellState);
  throw new Error(`${lastError instanceof Error ? lastError.message : "Timed out driving native input to the expected state"}; state=${JSON.stringify(state)}`);
}

async function readOpacity(page, selector) {
  return page.evaluate((targetSelector) => {
    const element = document.querySelector(targetSelector);
    return element instanceof HTMLElement ? Number(getComputedStyle(element).opacity) : -1;
  }, selector);
}

async function readServicesVideoStop(page) {
  return page.evaluate(() => {
    const video = document.querySelector(".services-story-video video, video.services-story-video");
    return video instanceof HTMLVideoElement ? {
      currentTime: video.currentTime,
      paused: video.paused,
      segmentState: video.dataset.segmentState ?? "",
    } : null;
  });
}

async function createPage(browser, profile, suffix = "") {
  const context = await browser.newContext(profile.context);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error")
      errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto(`${baseUrl}/${suffix}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await waitForReady(page);
  return { context, page, errors };
}

async function checkServices(browser, profile, profileDir) {
  const { context, page, errors } = await createPage(browser, profile);
  const input = await createInput(page, profile);
  const height = await viewportHeight(page);
  let servicesTop = await sectionTop(page, ".services-story-section");
  const backdropSamples = [];
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const handoffY = servicesTop - height + height * 0.86 * progress;
    await jumpTo(page, handoffY);
    backdropSamples.push(await page.evaluate(() => {
      const opacity = (selector) => {
        const element = document.querySelector(selector);
        return element instanceof HTMLElement ? Number(getComputedStyle(element).opacity) : -1;
      };
      return {
        clientsStars: opacity(".first-four-galaxy-stage"),
        servicesStars: opacity(".services-galaxy-stage"),
        flare: opacity(".vision-clients-flare-stage"),
        gradient: opacity(".first-four-gradient-field"),
      };
    }));
  }

  const prewarm = await page.evaluate(() => {
    const video = document.querySelector(".services-story-video video, video.services-story-video");
    return video instanceof HTMLVideoElement ? {
      armed: video.dataset.armed,
      paused: video.paused,
      currentTime: video.currentTime,
      readyState: video.readyState,
    } : null;
  });

  servicesTop = await sectionTop(page, ".services-story-section");
  await jumpTo(page, servicesTop - 8);
  await input(48);
  await waitForServicesStage(page, 1);
  const forwardStages = [1];
  const forwardMediaStops = [await readServicesVideoStop(page)];
  await driveUntil(page, input, Math.round(height * 0.62), (expected) => {
    const data = document.querySelector("main.site-shell")?.dataset;
    return data?.servicesActive === String(expected) && data?.servicesPhase === "waiting";
  }, 2);
  forwardStages.push(2);
  forwardMediaStops.push(await readServicesVideoStop(page));
  await driveUntil(page, input, Math.round(height * 0.62), (expected) => {
    const data = document.querySelector("main.site-shell")?.dataset;
    return data?.servicesActive === String(expected) && data?.servicesPhase === "waiting";
  }, 3);
  forwardStages.push(3);
  forwardMediaStops.push(await readServicesVideoStop(page));
  const finalPanelOpacity = await readOpacity(page, ".services-story-card-3");
  await driveUntil(page, input, Math.round(height * 0.46), () => {
    const data = document.querySelector("main.site-shell")?.dataset;
    return data?.servicesSequenceComplete === "true" ||
      (data?.servicesEntryDirection === "forward" && data?.servicesPhase === "idle" && !data?.servicesActive);
  });
  const forwardCompletion = await page.evaluate(shellState);
  const forwardFinalMedia = await page.evaluate(() => {
    const shell = document.querySelector("main.site-shell");
    const video = document.querySelector(".services-story-video video, video.services-story-video");
    const finalPoster = document.querySelector('.services-story-stop-poster[data-services-stop="3"]');
    return {
      currentTime: video instanceof HTMLVideoElement ? video.currentTime : -1,
      paused: video instanceof HTMLVideoElement ? video.paused : null,
      segmentState: video instanceof HTMLVideoElement ? video.dataset.segmentState ?? "" : "",
      mediaDecoded: shell?.dataset.servicesMediaDecoded ?? "",
      mediaFallback: shell?.dataset.servicesMediaFallback ?? "",
      staticStop: shell?.dataset.servicesStaticStop ?? "",
      posterOpacity: finalPoster instanceof HTMLElement ? Number(getComputedStyle(finalPoster).opacity) : -1,
    };
  });
  await page.screenshot({ path: path.join(profileDir, "services-final-pinned.png"), fullPage: false });

  if (forwardCompletion.servicesPinned === "true")
    await driveUntil(page, input, Math.round(height * 0.5), () => document.querySelector("main.site-shell")?.dataset.servicesPinned !== "true", null, 16_000);
  await driveUntil(page, input, Math.round(height * 0.28), () => {
    const how = document.querySelector(".how-work-motion-inner");
    return how instanceof HTMLElement && Number(getComputedStyle(how).opacity) > 0.02;
  }, null, 20_000);
  await page.waitForTimeout(350);
  const howOpacity = await readOpacity(page, ".how-work-motion-inner");
  await page.screenshot({ path: path.join(profileDir, "services-how-handoff.png"), fullPage: false });

  await driveUntil(page, input, -Math.round(height * 0.45), () => {
    const data = document.querySelector("main.site-shell")?.dataset;
    return data?.servicesEntryDirection === "reverse" && data?.servicesActive === "3";
  }, null, 20_000);
  const reverseStages = [3];
  await driveUntil(page, input, -Math.round(height * 0.62), (expected) => {
    const data = document.querySelector("main.site-shell")?.dataset;
    return data?.servicesActive === String(expected) && data?.servicesPhase === "waiting";
  }, 2);
  reverseStages.push(2);
  await driveUntil(page, input, -Math.round(height * 0.62), (expected) => {
    const data = document.querySelector("main.site-shell")?.dataset;
    return data?.servicesActive === String(expected) && data?.servicesPhase === "waiting";
  }, 1);
  reverseStages.push(1);
  await page.screenshot({ path: path.join(profileDir, "services-reverse-stage-1.png"), fullPage: false });
  await driveUntil(page, input, -Math.round(height * 0.62), () => document.querySelector("main.site-shell")?.dataset.servicesPinned !== "true", null, 20_000);
  const reverseRelease = await page.evaluate(shellState);

  const starFloor = Math.min(...backdropSamples.map((sample) => sample.clientsStars + sample.servicesStars));
  const result = {
    prewarm,
    backdropSamples,
    starFloor,
    forwardStages,
    forwardMediaStops,
    forwardCompletion,
    forwardFinalMedia,
    finalPanelOpacity,
    howOpacity,
    reverseStages,
    reverseRelease,
    errors,
    pass: Boolean(prewarm?.armed === "true" && prewarm.paused && prewarm.currentTime < 0.08) &&
      starFloor >= 0.72 &&
      forwardStages.join(",") === "1,2,3" &&
      forwardMediaStops.every((stop, index) => Boolean(stop?.paused && stop.segmentState === "ready" && Math.abs(stop.currentTime - ([90, 187, 307][index] / 30)) <= 1 / 90)) &&
      finalPanelOpacity > 0.8 &&
      ((forwardCompletion.servicesPinned === "true" && forwardCompletion.servicesSequenceComplete === "true") ||
        (forwardCompletion.servicesPinned !== "true" && forwardCompletion.servicesPhase === "idle" && forwardCompletion.lock === "")) &&
      forwardFinalMedia.mediaFallback === "" &&
      forwardFinalMedia.staticStop === "" &&
      forwardFinalMedia.paused === true &&
      forwardFinalMedia.segmentState === "ready" &&
      (forwardCompletion.servicesPinned === "true"
        ? forwardFinalMedia.mediaDecoded === "true" && Math.abs(forwardFinalMedia.currentTime - (340 / 30)) <= 1 / 90
        : [307 / 30, 340 / 30].some((expected) => Math.abs(forwardFinalMedia.currentTime - expected) <= 1 / 90)) &&
      howOpacity > 0.02 &&
      reverseStages.join(",") === "3,2,1" &&
      reverseRelease.lock === "" &&
      errors.length === 0,
  };
  await context.close();
  return result;
}

async function checkDatumAndProcess(browser, profile, profileDir, includeProcess = true) {
  // Enter through the app's canonical Datum route so earlier pinned stories are
  // released/bypassed. A raw Hero-to-Datum window.scrollTo crosses every prior
  // trigger in one task and manufactures leaveBack events no user gesture emits.
  const { context, page, errors } = await createPage(browser, profile, "#datum");
  const input = await createInput(page, profile);
  const height = await viewportHeight(page);
  const datumTop = await sectionTop(page, ".datum-motion-section");
  await jumpTo(page, datumTop - height * 1.05);
  await jumpTo(page, datumTop - 8);
  await input(32);
  const datumRevealSamples = [];
  for (let index = 0; index < 10; index += 1) {
    await page.waitForTimeout(150);
    datumRevealSamples.push(await page.evaluate(() => Array.from(document.querySelectorAll(".datum-glass-card")).map((element) => Number(getComputedStyle(element).opacity))));
  }
  const datumEarly = datumRevealSamples.find((sample) => sample.some((opacity) => opacity > 0.02 && opacity < 0.98)) ?? datumRevealSamples[0];
  const datumOrder = [0, 1].map((cardIndex) => datumRevealSamples.findIndex((sample) => sample[cardIndex] >= 0.5));
  await page.waitForTimeout(1700);
  const datumSettled = await page.evaluate(() => Array.from(document.querySelectorAll(".datum-glass-card")).map((element) => Number(getComputedStyle(element).opacity)));
  const datumPinDistance = Math.round(Math.min(profile.nativeInput === "touch" || profile.nativeInput === "programmatic" ? 760 : 700, Math.max(profile.nativeInput === "touch" || profile.nativeInput === "programmatic" ? 560 : 500, height * (profile.nativeInput === "touch" || profile.nativeInput === "programmatic" ? 0.86 : 0.74))));
  const datumTransitionSamples = [];
  for (let index = 0; index <= 16; index += 1) {
    const progress = 0.38 + (0.44 * index) / 16;
    await jumpTo(page, datumTop + datumPinDistance * progress);
    await page.waitForTimeout(320);
    datumTransitionSamples.push(await page.evaluate((sampleProgress) => {
      const opacity = (element) => element instanceof HTMLElement ? Number(getComputedStyle(element).opacity) : 0;
      const cardsState = document.querySelector(".datum-motion-state-cards");
      const waitlistState = document.querySelector(".datum-motion-state-waitlist");
      const cards = Array.from(document.querySelectorAll(".datum-motion-heading > *, .datum-glass-card"));
      const waitlist = Array.from(document.querySelectorAll(".datum-waitlist-segment"));
      const cardsPeak = Math.max(0, ...cards.map(opacity)) * opacity(cardsState);
      const waitlistPeak = Math.max(0, ...waitlist.map(opacity)) * opacity(waitlistState);
      return { progress: sampleProgress, cardsPeak, waitlistPeak, visiblePeak: Math.max(cardsPeak, waitlistPeak) };
    }, progress));
  }
  await jumpTo(page, datumTop + datumPinDistance * 0.78);
  await page.waitForTimeout(500);
  const datumWaitlistOpacity = await readOpacity(page, ".datum-motion-state-waitlist");
  // Land inside the cards progress band before testing leave-back. One viewport
  // touch from 0.78 can legitimately cross the entire short pin and prove reset,
  // but it cannot also prove the intermediate reverse state.
  await jumpTo(page, datumTop + datumPinDistance * 0.3);
  await page.waitForTimeout(650);
  const datumCardsBack = await readOpacity(page, ".datum-motion-state-cards");
  // Reset proof needs an unambiguous leave-back, not another momentum-sized
  // gesture whose final Y varies between desktop wheel and mobile touch.
  await jumpTo(page, datumTop - height * 1.05);
  await page.waitForTimeout(450);
  const datumReset = await readOpacity(page, ".datum-motion-state-cards");
  const datumResetState = await page.evaluate(() => {
    const shell = document.querySelector("main.site-shell");
    const section = document.querySelector(".datum-motion-section");
    return {
      scrollY: Math.round(window.scrollY),
      sectionTop: section instanceof HTMLElement ? Math.round(section.getBoundingClientRect().top) : null,
      pinned: shell?.dataset.datumPinned ?? "",
      progress: shell?.dataset.datumProgress ?? "",
    };
  });

  const datumPass = datumRevealSamples.some((sample) => sample.some((opacity) => opacity > 0.02 && opacity < 0.98)) &&
    datumEarly[0] >= datumEarly.at(-1) &&
    datumOrder.every((sampleIndex, index) => sampleIndex >= 0 && (index === 0 || sampleIndex >= datumOrder[index - 1])) &&
    datumSettled.every((opacity) => opacity > 0.95) &&
    Math.min(...datumTransitionSamples.map((sample) => sample.visiblePeak)) > 0.12 &&
    datumTransitionSamples.some((sample) => sample.cardsPeak > 0.08 && sample.waitlistPeak > 0.08) &&
    datumWaitlistOpacity > 0.75 &&
    datumCardsBack > 0.5 &&
    datumReset < 0.1;

  if (!includeProcess) {
    const result = {
      datumEarly,
      datumRevealSamples,
      datumOrder,
      datumSettled,
      datumTransitionSamples,
      datumWaitlistOpacity,
      datumCardsBack,
      datumReset,
      datumResetState,
      errors,
      pass: datumPass && errors.length === 0,
    };
    await context.close();
    return result;
  }

  const processTop = await sectionTop(page, ".process-contact-section");
  await jumpTo(page, processTop - height * 0.9);
  const processBefore = await page.evaluate(() => ({
    scrollY: Math.round(window.scrollY),
    top: Math.round(document.querySelector(".process-contact-section")?.getBoundingClientRect().top ?? -1),
  }));
  await input(Math.round(height * 0.14));
  await page.waitForTimeout(120);
  const processAfter = await page.evaluate(() => ({
    scrollY: Math.round(window.scrollY),
    top: Math.round(document.querySelector(".process-contact-section")?.getBoundingClientRect().top ?? -1),
  }));
  const processSamples = [];
  for (let index = 0; index < 14; index += 1) {
    processSamples.push(await page.evaluate(() => Array.from(document.querySelectorAll(".process-contact-row")).map((element) => Number(getComputedStyle(element).opacity))));
    await page.waitForTimeout(180);
  }
  const firstVisibleSample = (rowIndex) => processSamples.findIndex((sample) => sample[rowIndex] >= 0.5);
  const processOrder = [0, 1, 2, 3, 4].map(firstVisibleSample);
  await jumpTo(page, processTop - height * 0.96);
  await page.waitForTimeout(2400);
  const processReset = await page.evaluate(() => Array.from(document.querySelectorAll(".process-contact-row")).map((element) => Number(getComputedStyle(element).opacity)));
  await page.screenshot({ path: path.join(profileDir, "datum-process.png"), fullPage: false });

  const result = {
    datumEarly,
    datumRevealSamples,
    datumOrder,
    datumSettled,
    datumTransitionSamples,
    datumWaitlistOpacity,
    datumCardsBack,
    datumReset,
    datumResetState,
    processOrder,
    processReset,
    processBefore,
    processAfter,
    errors,
    pass: datumPass &&
      processOrder.every((sampleIndex, index) => sampleIndex >= 0 && (index === 0 || sampleIndex >= processOrder[index - 1])) &&
      processReset.every((opacity) => opacity < 0.1) &&
      errors.length === 0,
  };
  await context.close();
  return result;
}

async function checkDomino(browser, profile, profileDir) {
  const context = await browser.newContext(profile.context);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error")
      errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto(`${baseUrl}/#qa-footer`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.dataset.qaFooterSpacer = "true";
    spacer.style.height = `${Math.max(8000, window.innerHeight * 10)}px`;
    spacer.style.pointerEvents = "none";
    document.body.append(spacer);
    window.scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: "auto" });
  });
  await waitForReady(page);
  await page.evaluate(() => {
    const footer = document.querySelector(".site-footer");
    if (!(footer instanceof HTMLElement))
      throw new Error("Missing .site-footer");
    const footerBottom = footer.getBoundingClientRect().bottom + window.scrollY;
    window.scrollTo({ top: footerBottom, left: 0, behavior: "auto" });
    document.querySelector('[data-qa-footer-spacer="true"]')?.remove();
  });
  await page.waitForTimeout(650);
  const input = await createInput(page, profile);
  const height = await viewportHeight(page);
  const before = await page.evaluate(shellState);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await input(-Math.round(height * 0.62));
    await page.waitForTimeout(360);
    if (await page.evaluate(() => document.querySelector("main.site-shell")?.dataset.dominoPinned === "true"))
      break;
  }
  await page.waitForTimeout(900);
  const afterUp = await page.evaluate(shellState);
  const videoState = await page.evaluate(() => {
    const video = document.querySelector(".domino-sequence-forward");
    return video instanceof HTMLVideoElement ? {
      paused: video.paused,
      currentTime: video.currentTime,
      readyState: video.readyState,
      opacity: Number(getComputedStyle(video).opacity),
      active: video.dataset.dominoActive,
      segmentState: video.dataset.segmentState,
    } : null;
  });
  await page.screenshot({ path: path.join(profileDir, "footer-up-domino.png"), fullPage: false });
  await driveUntil(page, input, -Math.round(height * 0.62), () => document.querySelector("main.site-shell")?.dataset.dominoPinned !== "true", null, 20_000);
  const dominoTop = await sectionTop(page, ".domino-scene");
  await jumpTo(page, dominoTop - 8);
  await input(48);
  await page.waitForFunction(() => document.querySelector("main.site-shell")?.dataset.dominoPlayback === "forward", null, { timeout: 12_000 });
  await page.waitForTimeout(120);
  const forwardEntry = await page.evaluate(() => {
    const shell = document.querySelector("main.site-shell");
    const video = document.querySelector(".domino-sequence-forward");
    return {
      playback: shell?.dataset.dominoPlayback ?? "",
      pinned: shell?.dataset.dominoPinned ?? "",
      lock: document.documentElement.dataset.scrollLock ?? "",
      paused: video instanceof HTMLVideoElement ? video.paused : null,
      currentTime: video instanceof HTMLVideoElement ? video.currentTime : null,
      opacity: video instanceof HTMLVideoElement ? Number(getComputedStyle(video).opacity) : -1,
      active: video instanceof HTMLVideoElement ? video.dataset.dominoActive : "",
      segmentState: video instanceof HTMLVideoElement ? video.dataset.segmentState : "",
    };
  });
  const result = {
    before,
    afterUp,
    videoState,
    forwardEntry,
    errors,
    pass: before.dominoPlayback !== "forward" &&
      afterUp.dominoPlayback !== "forward" &&
      afterUp.dominoPinned === "true" &&
      Boolean(videoState?.paused) &&
      (videoState?.currentTime ?? 1) < 0.08 &&
      (videoState?.opacity ?? 0) > 0.8 &&
      videoState?.active === "true" &&
      videoState?.segmentState === "ready" &&
      ["forward", "complete"].includes(forwardEntry.playback) &&
      forwardEntry.pinned === "true" &&
      forwardEntry.opacity > 0.8 &&
      forwardEntry.active === "true" &&
      ["playing", "ready"].includes(forwardEntry.segmentState) &&
      errors.length === 0,
  };
  await context.close();
  return result;
}

await mkdir(outputDir, { recursive: true });
const report = { generatedAt: new Date().toISOString(), baseUrl, profiles: [] };

for (const profile of profiles) {
  const profileDir = path.join(outputDir, profile.name);
  await mkdir(profileDir, { recursive: true });
  const entry = { name: profile.name };
  try {
    let browser;
    if (!requestedCheck || requestedCheck === "services") {
      process.stdout.write(`Running ${profile.name}: Services...\n`);
      browser = await profile.engine.launch();
      try {
        entry.services = await checkServices(browser, profile, profileDir);
      }
      finally {
        await browser.close();
      }
    }

    if (!requestedCheck || requestedCheck === "datum" || requestedCheck === "datum-only") {
      process.stdout.write(`Running ${profile.name}: Datum/Process...\n`);
      browser = await profile.engine.launch();
      try {
        entry.datumProcess = await checkDatumAndProcess(browser, profile, profileDir, requestedCheck !== "datum-only");
      }
      finally {
        await browser.close();
      }
    }

    if (!requestedCheck || requestedCheck === "domino") {
      process.stdout.write(`Running ${profile.name}: footer/Domino...\n`);
      browser = await profile.engine.launch();
      try {
        entry.domino = await checkDomino(browser, profile, profileDir);
      }
      finally {
        await browser.close();
      }
    }
  }
  catch (error) {
    entry.error = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
  }
  const enabledResults = [entry.services, entry.datumProcess, entry.domino].filter(Boolean);
  entry.pass = !entry.error && enabledResults.length > 0 && enabledResults.every((result) => result.pass === true);
  report.profiles.push(entry);
  process.stdout.write(`${profile.name}: ${entry.pass ? "PASS" : "FAIL"}\n`);
}

report.pass = report.profiles.length > 0 && report.profiles.every((profile) => profile.pass);
await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.pass)
  process.exitCode = 1;
