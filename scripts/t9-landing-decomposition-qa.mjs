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
const maxLines = typeof args["max-lines"] === "string" ? Number(args["max-lines"]) : null;
const landingPath = path.join(root, "src/components/TascLanding.tsx");
const landingSource = readFileSync(landingPath, "utf8");
const landingLines = landingSource.split(/\r?\n/).length;
const sectionContracts = [
  ["HeroSection", "HeroSection.tsx", '<section id="main-content" className="hero-motion"'],
  ["ServicesSection", "ServicesSection.tsx", '<div className="services-story-overlap-shell">'],
  ["DatumSection", "DatumSection.tsx", '<section className="datum-motion-section'],
  ["DominoSection", "DominoSection.tsx", '<section className="domino-cta-section'],
];
const checks = [];
const check = (name, passed, detail = null) => checks.push({ name, passed: Boolean(passed), detail });

for (const [component, file, rootMarkup] of sectionContracts) {
  const source = readFileSync(path.join(root, "src/components/sections", file), "utf8");
  check(
    `${component} is imported and rendered exactly once`,
    landingSource.includes(`import { ${component} }`) &&
      (landingSource.match(new RegExp(`<${component}\\b`, "g")) ?? []).length === 1,
  );
  check(`${component} owns its authored root markup`, source.includes(rootMarkup));
}

check(
  "section markup is no longer rendered inline by TascLanding",
  !landingSource.includes('<section id="main-content" className="hero-motion"') &&
    !landingSource.includes('<div className="services-story-overlap-shell">') &&
    !landingSource.includes('<section className="datum-motion-section glass-editorial-section"') &&
    !landingSource.includes('<section className="domino-cta-section glass-editorial-section"'),
);
check(
  "T7 and T8 runtime ownership remains centralized",
  landingSource.includes('registerMotionInputStory({') &&
    landingSource.includes('window.addEventListener("tasc:motion-runtime-request"') &&
    landingSource.includes('window.addEventListener("tasc:motion-runtime-disable"') &&
    (landingSource.match(/useGSAP\(/g) ?? []).length === 1,
);
check(
  "TascLanding line budget is respected when requested",
  maxLines === null || landingLines <= maxLines,
  { landingLines, maxLines },
);

const browserResults = [];
if (url) {
  for (const [name, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await browserType.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 960, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForSelector(".site-shell", { timeout: 45_000 });
      await page.waitForFunction(() => !document.querySelector(".site-preloader"), null, { timeout: 45_000 });
      const snapshot = await page.evaluate(() => {
        const selectors = [
          ".hero-motion",
          ".figma-clients-section",
          ".services-story-section",
          ".how-work-motion-section",
          ".datum-motion-section",
          ".process-contact-section",
          ".domino-cta-section",
          ".site-footer",
        ];
        const nodes = selectors.map((selector) => document.querySelector(selector));
        return {
          counts: Object.fromEntries(selectors.map((selector) => [selector, document.querySelectorAll(selector).length])),
          order: nodes.every((node, index) => index === 0 || Boolean(
            nodes[index - 1]?.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING,
          )),
          runtimeInitCount: document.querySelector(".site-shell")?.getAttribute("data-motion-runtime-init-count"),
          servicesVideoCount: document.querySelectorAll(".services-story-video").length,
          datumVideoCount: document.querySelectorAll(".datum-motion-video").length,
          dominoVideoCount: document.querySelectorAll(".domino-sequence").length,
        };
      });
      const passed =
        Object.values(snapshot.counts).every((count) => count === 1) &&
        snapshot.order &&
        snapshot.runtimeInitCount === "1" &&
        snapshot.servicesVideoCount === 1 &&
        snapshot.datumVideoCount === 1 &&
        snapshot.dominoVideoCount === 2 &&
        errors.length === 0;
      browserResults.push({ name, passed, errors, snapshot });
    } catch (error) {
      browserResults.push({
        name,
        passed: false,
        errors: [...errors, error instanceof Error ? error.message : String(error)],
        snapshot: null,
      });
    } finally {
      await browser.close();
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  landingLines,
  maxLines,
  checks,
  browsers: browserResults,
  passed: checks.every((entry) => entry.passed) && browserResults.every((entry) => entry.passed),
};
if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
