/*
  Probe for the two reported visual faults.

  3.1 - the strip above the header on Safari: measure the header box, its glass
        and the safe-area inset the runtime actually reports.
  3.2 - the Datum media covering the Process heading: walk the seam at several
        viewport heights and report any overlap in CSS pixels.
*/
import { chromium, webkit, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE_URL = process.env.QA_URL ?? "http://localhost:3155";
const OUT = "qa-artifacts/visual-bugs";
mkdirSync(OUT, { recursive: true });

const HEIGHTS = [720, 844, 900, 1024];

const headerProbe = () => {
    const header = document.querySelector(".site-header");
    const glass = document.querySelector(".site-header-glass");
    const brand = document.querySelector(".brand-mark") ?? document.querySelector(".site-header-inner > *");
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;left:0;height:env(safe-area-inset-top);width:1px;";
    document.body.appendChild(probe);
    const inset = probe.getBoundingClientRect().height;
    probe.remove();
    const rect = (node) => (node ? (({ top, bottom, height, left, width }) => ({ top, bottom, height, left, width }))(node.getBoundingClientRect()) : null);
    return {
        safeAreaTop: inset,
        headerHeightVar: getComputedStyle(document.documentElement).getPropertyValue("--header-h").trim(),
        header: rect(header),
        glass: rect(glass),
        brand: rect(brand),
        elementAtTopCentre: document.elementFromPoint(Math.round(window.innerWidth / 2), 4)?.className ?? null,
        elementAtTopLeft: document.elementFromPoint(8, 4)?.className ?? null,
    };
};

const seamProbe = () => {
    const media = document.querySelector(".datum-motion-media");
    const process = document.querySelector(".process-contact-section");
    const heading = process?.querySelector("h2, .process-heading, .process-contact-heading") ?? null;
    const box = (node) => (node ? (({ top, bottom, height }) => ({ top: Math.round(top), bottom: Math.round(bottom), height: Math.round(height) }))(node.getBoundingClientRect()) : null);
    const mediaBox = box(media);
    const headingBox = box(heading);
    const overlap = mediaBox && headingBox ? Math.round(Math.min(mediaBox.bottom, headingBox.bottom) - Math.max(mediaBox.top, headingBox.top)) : null;
    const zIndex = (node) => (node ? getComputedStyle(node).zIndex : null);
    return {
        scrollY: Math.round(window.scrollY),
        media: mediaBox,
        heading: headingBox,
        headingText: heading?.textContent?.trim().slice(0, 48) ?? null,
        overlap: overlap !== null && overlap > 0 ? overlap : 0,
        mediaZ: zIndex(media),
        datumSectionZ: zIndex(document.querySelector(".datum-motion-section")),
        datumSpacerZ: zIndex(document.querySelector(".pin-spacer-datum-reversible")),
        processZ: zIndex(process),
        headingVisible: heading
            ? document.elementFromPoint(Math.round(window.innerWidth / 2), Math.min(window.innerHeight - 2, Math.max(2, Math.round((headingBox.top + headingBox.bottom) / 2))))?.closest(".process-contact-section") !== null
            : null,
    };
};

async function ready(page) {
    await page.waitForSelector("main.site-shell", { timeout: 45000 });
    await page.waitForFunction(() => document.querySelector("main.site-shell")?.dataset.motionReady === "true", null, { timeout: 60000 }).catch(() => { });
    await page.waitForTimeout(2500);
}

const report = { header: [], seam: [] };

for (const engine of [webkit, chromium]) {
    const name = engine === webkit ? "webkit" : "chromium";
    const browser = await engine.launch();
    const context = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
    await ready(page);
    report.header.push({ engine: name, ...(await page.evaluate(headerProbe)) });
    await page.screenshot({ path: `${OUT}/${name}-iphone-top.png` });
    await browser.close();
}

for (const height of HEIGHTS) {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 390, height } });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
    await ready(page);
    const target = await page.evaluate(() => {
        const process = document.querySelector(".process-contact-section");
        return process ? Math.round(process.getBoundingClientRect().top + window.scrollY) : null;
    });
    if (target === null) {
        report.seam.push({ height, error: "process section not found" });
        await browser.close();
        continue;
    }
    const samples = [];
    for (const offset of [-height, -height * 0.6, -height * 0.25, 0, height * 0.25]) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "auto" }), Math.max(0, Math.round(target + offset)));
        await page.waitForTimeout(420);
        samples.push(await page.evaluate(seamProbe));
    }
    const worst = samples.reduce((current, sample) => (sample.overlap > (current?.overlap ?? -1) ? sample : current), null);
    report.seam.push({ height, worst, samples: samples.map((sample) => ({ scrollY: sample.scrollY, overlap: sample.overlap, headingVisible: sample.headingVisible })) });
    if (worst && worst.overlap > 0)
        await page.screenshot({ path: `${OUT}/seam-390x${height}.png` });
    await browser.close();
}

console.log(JSON.stringify(report, null, 2));
