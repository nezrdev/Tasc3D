import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium, webkit } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).flatMap((value, index, values) => {
  if (!value.startsWith("--")) return [];
  const separator = value.indexOf("=");
  if (separator >= 0) return [[value.slice(2, separator), value.slice(separator + 1)]];
  const next = values[index + 1];
  return [[value.slice(2), next && !next.startsWith("--") ? next : true]];
}));
const url = typeof args.url === "string" ? new URL(args.url).toString() : null;
const output = typeof args.output === "string" ? path.resolve(root, args.output) : null;
const staticOnly = args.static === true;
const layoutSource = readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
const landingSource = readFileSync(path.join(root, "src/components/TascLanding.tsx"), "utf8");
const checks = [];
const check = (name, passed, detail = null) => checks.push({ name, passed: Boolean(passed), detail });

check(
  "bootstrap publishes the ready marker after the complete profile",
  layoutSource.indexOf('root.dataset.tascProfileReady = "true"') > layoutSource.indexOf('root.dataset.tascViewportHeight'),
);
check(
  "React profile state uses lazy bootstrap initializers",
  landingSource.includes("const [initialRuntimeProfile] = useState(readInitialRuntimeProfile)") &&
    landingSource.includes("useState(() => initialRuntimeProfile.mobilePerformance)"),
);
check(
  "connection classification is a one-way latch and measured throughput cannot swap Services",
  landingSource.includes("constrainedConnectionLatchRef") &&
    landingSource.includes("explicitConstrainedConnectionLatchRef") &&
    landingSource.includes("const servicesLightweightMediaMode = mobilePerformanceMode || explicitConstrainedConnection") &&
    landingSource.includes("const servicesTransportProfile = servicesLightweightMediaMode") &&
    !landingSource.includes("measuredConstrainedConnectionRef"),
);
check(
  "mobile profile uses an exact greater-than 80px hysteresis",
  landingSource.includes("widthMoved > MOBILE_PROFILE_HYSTERESIS_PX") &&
    landingSource.includes("MOBILE_PROFILE_HYSTERESIS_PX = 80"),
);
check(
  "main GSAP runtime has one event-gated initializer without profile reversion",
  landingSource.includes("data.motionRuntimeInitCount") === false &&
    landingSource.includes("root.dataset.motionRuntimeInitCount") &&
    landingSource.includes('window.addEventListener("tasc:motion-runtime-request"') &&
    !landingSource.includes("revertOnUpdate"),
);
check(
  "Services keys are transport-only and same-transport swaps call load",
  landingSource.includes("key={servicesTransportKey}") &&
    !landingSource.includes("key={servicesVideoSource}") &&
    landingSource.includes("sameTransportSourceChange") &&
    landingSource.includes("video.load()"),
);

const browserResults = [];
if (!staticOnly) {
  if (!url) throw new Error("T8 browser QA requires --url=http://127.0.0.1:<port>/ or --static");
  for (const [name, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await browserType.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 960, height: 800 } });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, value: 8 });
      Object.defineProperty(navigator, "deviceMemory", { configurable: true, value: 8 });
      Object.defineProperty(navigator, "connection", {
        configurable: true,
        value: { effectiveType: "4g", saveData: false },
      });
      const nativeObserve = PerformanceObserver.prototype.observe;
      PerformanceObserver.prototype.observe = function observe(options) {
        if (options?.type === "resource" || options?.entryTypes?.includes("resource")) return;
        return nativeObserve.call(this, options);
      };
      const nativeEntriesByType = performance.getEntriesByType.bind(performance);
      Object.defineProperty(performance, "getEntriesByType", {
        configurable: true,
        value: (type) => type === "resource" ? [] : nativeEntriesByType(type),
      });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForFunction(() => {
        const rootNode = document.querySelector("main.site-shell");
        return rootNode?.dataset.motionRuntimeInitCount === "1" &&
          rootNode.dataset.servicesVideoNodeId &&
          document.querySelector(".services-story-video video, video.services-story-video");
      }, null, { timeout: 60_000 });
      const cookieButton = page.getByRole("button", { name: /accept cookies/i });
      if (await cookieButton.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await cookieButton.evaluate((button) => button.click());
      }
      const servicesLink = page.locator(".site-nav a[href=\"#services\"]");
      await servicesLink.click({ timeout: 5_000 });
      await page.waitForFunction(() => {
        const rootNode = document.querySelector("main.site-shell");
        const video = document.querySelector(".services-story-video video, video.services-story-video");
        const rect = document.querySelector(".services-story-section")?.getBoundingClientRect();
        return window.location.hash === "#services" &&
          !rootNode?.dataset.programmaticAnchor &&
          video?.dataset.armed === "true" &&
          Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight);
      }, null, { timeout: 15_000 });
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        window.__tascT8ServicesVideo = document.querySelector(".services-story-video video, video.services-story-video");
      });
      const readState = () => page.evaluate(() => {
        const rootNode = document.querySelector("main.site-shell");
        const video = document.querySelector(".services-story-video video, video.services-story-video");
        return {
          constrained: document.documentElement.dataset.tascConstrainedConnection,
          initCount: Number(rootNode?.dataset.motionRuntimeInitCount ?? 0),
          loadCount: Number(rootNode?.dataset.servicesVideoLoadCount ?? 0),
          mobile: document.documentElement.dataset.tascMobilePerformance,
          measuredConnectionProfile: rootNode?.dataset.measuredConnectionProfile ?? null,
          nestedSpacers: document.querySelectorAll('[class*="pin-spacer"] [class*="pin-spacer"]').length,
          nodeId: video?.dataset.servicesNodeId ?? null,
          sameNode: video === window.__tascT8ServicesVideo,
          sourceProfile: rootNode?.dataset.servicesSourceProfile ?? null,
          spacerCount: document.querySelectorAll('[class*="pin-spacer"]').length,
        };
      });
      const initial = await readState();
      await page.setViewportSize({ width: 880, height: 800 });
      await page.waitForTimeout(350);
      const atEighty = await readState();
      const constrainedFlow = initial.constrained === "true" || initial.sourceProfile === "mobile";
      await page.setViewportSize({ width: 879, height: 800 });
      await page.waitForFunction((expectedLoadCount) => {
        const rootNode = document.querySelector("main.site-shell");
        return document.documentElement.dataset.tascMobilePerformance === "true" &&
          rootNode?.dataset.servicesSourceProfile === "mobile" &&
          Number(rootNode.dataset.servicesVideoLoadCount ?? 0) >= expectedLoadCount;
      }, constrainedFlow ? initial.loadCount : initial.loadCount + 1, { timeout: 5_000 });
      const mobile = await readState();
      await page.setViewportSize({ width: 959, height: 800 });
      await page.waitForTimeout(350);
      const returnAtEighty = await readState();
      await page.setViewportSize({ width: 960, height: 800 });
      await page.waitForFunction(({ constrained, expectedLoadCount }) => {
        const rootNode = document.querySelector("main.site-shell");
        const expectedProfile = constrained ? "mobile" : "desktop";
        return document.documentElement.dataset.tascMobilePerformance === "false" &&
          rootNode?.dataset.servicesSourceProfile === expectedProfile &&
          Number(rootNode.dataset.servicesVideoLoadCount ?? 0) >= expectedLoadCount;
      }, {
        constrained: constrainedFlow,
        expectedLoadCount: constrainedFlow ? mobile.loadCount : initial.loadCount + 2,
      }, { timeout: 5_000 });
      const desktop = await readState();
      const sourceProfilePass = constrainedFlow
        ? initial.sourceProfile === "mobile" &&
          mobile.sourceProfile === "mobile" &&
          desktop.sourceProfile === "mobile" &&
          desktop.loadCount === mobile.loadCount
        : initial.sourceProfile === "desktop" &&
          mobile.sourceProfile === "mobile" &&
          desktop.sourceProfile === "desktop" &&
          mobile.loadCount === initial.loadCount + 1 &&
          desktop.loadCount === mobile.loadCount + 1;
      const passed = initial.mobile === "false" &&
        atEighty.mobile === "false" &&
        mobile.mobile === "true" &&
        returnAtEighty.mobile === "true" &&
        desktop.mobile === "false" &&
        [initial, atEighty, mobile, returnAtEighty, desktop].every((state) => state.initCount === 1 && state.sameNode && state.nestedSpacers === 0) &&
        sourceProfilePass &&
        desktop.spacerCount === initial.spacerCount &&
        errors.length === 0;
      browserResults.push({ name, passed, errors, states: { initial, atEighty, mobile, returnAtEighty, desktop } });
      check(`${name} profile rotation preserves one runtime and one Services node`, passed, browserResults.at(-1));
    } catch (error) {
      browserResults.push({ name, passed: false, errors: [...errors, String(error)] });
      check(`${name} profile rotation preserves one runtime and one Services node`, false, browserResults.at(-1));
    } finally {
      await context.close();
      await browser.close();
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  passed: checks.every((entry) => entry.passed),
  checks,
  browserResults,
};
if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
