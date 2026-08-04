/*
  3.4 / 3.6 probe.

  Walks the page on a 4x-throttled CPU and records, per sample: how many <video>
  elements hold decoded data, how many are actually playing, and the long tasks
  the main thread served. The Process block is sampled densely because that is
  where the jank was reported.
*/
import { chromium } from "playwright";

const BASE_URL = process.env.QA_URL ?? "http://localhost:3155";

const sample = () => {
    const videos = Array.from(document.querySelectorAll("video"));
    return {
        scrollY: Math.round(window.scrollY),
        videos: videos.length,
        withData: videos.filter((video) => video.readyState >= 2).length,
        playing: videos.filter((video) => !video.paused && video.readyState >= 2).length,
        withSource: videos.filter((video) => Boolean(video.currentSrc)).length,
        loaded: videos
            .filter((video) => video.readyState >= 2)
            .map((video) => (video.currentSrc || "").split("/").pop())
            .filter(Boolean),
    };
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await page.goto(BASE_URL, { waitUntil: "load", timeout: 120000 });
await page.waitForSelector("main.site-shell", { timeout: 60000 });
await page.waitForTimeout(4000);

await page.evaluate(() => {
    window.__tascLongTasks = [];
    new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
            window.__tascLongTasks.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration), scrollY: Math.round(window.scrollY) });
    }).observe({ entryTypes: ["longtask"] });
});

const doc = await page.evaluate(() => document.documentElement.scrollHeight);
const processTop = await page.evaluate(() => {
    const node = document.querySelector(".process-contact-section");
    return node ? Math.round(node.getBoundingClientRect().top + window.scrollY) : null;
});

const samples = [];
let peak = { withData: 0, playing: 0 };
for (let y = 0; y < doc; y += 420) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "auto" }), y);
    await page.waitForTimeout(220);
    const entry = await page.evaluate(sample);
    samples.push(entry);
    if (entry.withData > peak.withData)
        peak = { ...entry };
}

const longTasks = await page.evaluate(() => window.__tascLongTasks ?? []);
const inProcess = processTop === null
    ? []
    : longTasks.filter((task) => task.scrollY >= processTop - 844 && task.scrollY <= processTop + 2600);

console.log(JSON.stringify({
    documentHeight: doc,
    processTop,
    peakDecodedVideos: peak,
    maxSimultaneousPlaying: Math.max(...samples.map((entry) => entry.playing)),
    totalVideoElements: samples[0]?.videos ?? 0,
    longTasks: {
        total: longTasks.length,
        totalMs: longTasks.reduce((sum, task) => sum + task.duration, 0),
        worstMs: longTasks.reduce((worst, task) => Math.max(worst, task.duration), 0),
        inProcessBlock: inProcess.length,
        inProcessMs: inProcess.reduce((sum, task) => sum + task.duration, 0),
        worstInProcessMs: inProcess.reduce((worst, task) => Math.max(worst, task.duration), 0),
    },
}, null, 2));

await browser.close();
