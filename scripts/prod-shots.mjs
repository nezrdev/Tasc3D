/*
  Production evidence shots: the header on an iPhone profile (bug 3.1) and the
  Datum -> Process seam (bug 3.2).
*/
import { webkit, chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.QA_URL ?? "https://tascagency.com/";
const OUT = "qa-artifacts/prod-2026-08-04";
mkdirSync(OUT, { recursive: true });

const ready = async (page) => {
    await page.waitForSelector("main.site-shell", { timeout: 60000 });
    await page.waitForFunction(() => document.querySelector("main.site-shell")?.dataset.motionReady === "true", null, { timeout: 60000 }).catch(() => { });
    await page.waitForTimeout(3500);
};

const out = {};

const wk = await webkit.launch();
const wkPage = await (await wk.newContext({ ...devices["iPhone 13"] })).newPage();
await wkPage.goto(URL, { waitUntil: "load", timeout: 90000 });
await ready(wkPage);
out.header = await wkPage.evaluate(() => {
    const box = (selector) => {
        const node = document.querySelector(selector);
        if (!node)
            return null;
        const { top, bottom, height } = node.getBoundingClientRect();
        return { top: Math.round(top), bottom: Math.round(bottom), height: Math.round(height) };
    };
    return {
        overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
        wheelScrollRate: document.querySelector("main.site-shell")?.dataset.wheelScrollRate ?? null,
        header: box(".site-header"),
        glass: box(".site-header-glass"),
        brand: box(".brand-mark"),
        topLeftPaintedBy: document.elementFromPoint(8, 3)?.className ?? null,
    };
});
await wkPage.screenshot({ path: `${OUT}/webkit-iphone-header.png` });
await wk.close();

const cr = await chromium.launch();
const crPage = await (await cr.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await crPage.goto(URL, { waitUntil: "load", timeout: 90000 });
await ready(crPage);
const seamTop = await crPage.evaluate(() => {
    const process = document.querySelector(".process-contact-section");
    return process ? Math.round(process.getBoundingClientRect().top + window.scrollY) : null;
});
await crPage.evaluate((y) => window.scrollTo({ top: y, behavior: "auto" }), Math.max(0, seamTop - 120));
await crPage.waitForTimeout(900);
out.seam = await crPage.evaluate(() => {
    const media = document.querySelector(".datum-motion-media");
    const heading = document.querySelector(".process-contact-section h2");
    const box = (node) => (node ? (({ top, bottom }) => ({ top: Math.round(top), bottom: Math.round(bottom) }))(node.getBoundingClientRect()) : null);
    const m = box(media);
    const h = box(heading);
    return {
        heading: heading?.textContent?.trim().slice(0, 48) ?? null,
        media: m,
        headingBox: h,
        overlap: m && h ? Math.max(0, Math.round(Math.min(m.bottom, h.bottom) - Math.max(m.top, h.top))) : null,
        headingPaintedOnTop: h ? document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round((h.top + h.bottom) / 2))?.closest(".process-contact-section") !== null : null,
    };
});
await crPage.screenshot({ path: `${OUT}/chromium-390-datum-process-seam.png` });
await cr.close();

console.log(JSON.stringify(out, null, 2));
