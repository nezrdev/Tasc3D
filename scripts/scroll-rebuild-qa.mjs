/*
  Scroll rebuild acceptance run.

  Drives the page top to bottom and back with plain wheel input and records how
  much wheel travel it costs. With native scrolling and no anchor tweening the
  wheel total should track the document height closely; anything that still
  eats input shows up as a ratio well above 1.
*/
import { chromium, webkit, devices } from "playwright";

const BASE_URL = process.env.QA_URL ?? "http://localhost:3155";
const WHEEL_STEP = 240;
const MAX_STEPS = 900;

const PROFILES = [
    { name: "chromium-1440x900", engine: chromium, viewport: { width: 1440, height: 900 }, isMobile: false, input: "wheel" },
    { name: "chromium-390x844", engine: chromium, viewport: { width: 390, height: 844 }, isMobile: true, input: "touch" },
    { name: "webkit-iphone-390x844", engine: webkit, viewport: { width: 390, height: 844 }, isMobile: true, device: "iPhone 13", input: "programmatic" },
];

/*
  Mobile WebKit has no wheel and no CDP, so it is driven programmatically: that
  still proves nothing sticks structurally, and the lock is checked separately
  through data-scroll-lock. Mobile Chromium gets real synthesised touch.
*/
const makeStepper = async (page, profile) => {
    if (profile.input === "wheel")
        return (direction) => page.mouse.wheel(0, direction * WHEEL_STEP);
    if (profile.input === "touch") {
        const session = await page.context().newCDPSession(page);
        const x = Math.round(profile.viewport.width / 2);
        const startY = Math.round(profile.viewport.height * 0.62);
        return async (direction) => {
            const endY = startY - direction * WHEEL_STEP;
            const touch = (type, y) => session.send("Input.dispatchTouchEvent", {
                type,
                touchPoints: type === "touchEnd" ? [] : [{ x, y }],
            });
            await touch("touchStart", startY);
            for (let index = 1; index <= 4; index += 1)
                await touch("touchMove", startY + ((endY - startY) * index) / 4);
            await touch("touchEnd", endY);
        };
    }
    return (direction) => page.evaluate((delta) => window.scrollBy(0, delta), direction * WHEEL_STEP);
};

const readState = () => {
    const shell = document.querySelector("main.site-shell");
    const data = shell?.dataset ?? {};
    return {
        scrollY: Math.round(window.scrollY),
        docHeight: Math.round(document.documentElement.scrollHeight),
        viewport: Math.round(window.innerHeight),
        lock: document.documentElement.dataset.scrollLock ?? "",
        servicesPhase: data.servicesPhase ?? "",
        servicesActive: data.servicesActive ?? "",
        howStep: data.howWorkStep ?? "",
        howPinned: data.howWorkPinned ?? "",
        datumPinned: data.datumPinned ?? "",
        dominoPlayback: data.dominoPlayback ?? "",
        dominoProgress: data.dominoProgress ?? "",
        dominoPinned: data.dominoPinned ?? "",
        starfield: data.starfieldMode ?? "",
        galaxyStatus: data.servicesGalaxyStatus ?? "",
    };
};

async function waitForReady(page) {
    await page.waitForSelector("main.site-shell", { timeout: 45000 });
    await page.waitForFunction(() => {
        const shell = document.querySelector("main.site-shell");
        return Boolean(shell && shell.dataset.motionReady === "true");
    }, null, { timeout: 60000 }).catch(() => { });
    await page.waitForTimeout(2500);
}

async function sweep(page, direction, step) {
    const seen = new Map();
    const locks = new Set();
    let wheelTotal = 0;
    let lockedTotal = 0;
    let steps = 0;
    let stalled = 0;
    let previousY = await page.evaluate(() => Math.round(window.scrollY));
    let maxDomino = 0;
    while (steps < MAX_STEPS) {
        await step(direction);
        wheelTotal += WHEEL_STEP;
        steps += 1;
        await page.waitForTimeout(60);
        const state = await page.evaluate(readState);
        if (state.lock) {
            locks.add(state.lock);
            lockedTotal += WHEEL_STEP;
        }
        maxDomino = Math.max(maxDomino, Number(state.dominoProgress || 0));
        const marker = [
            state.servicesActive && `services:${state.servicesActive}`,
            state.howPinned && `how:${state.howStep}`,
            state.datumPinned === "true" && "datum",
            state.dominoPinned === "true" && `domino:${state.dominoPlayback}`,
        ].filter(Boolean).join("|");
        if (marker && !seen.has(marker))
            seen.set(marker, state.scrollY);
        if (Math.abs(state.scrollY - previousY) < 2) {
            stalled += 1;
            // Six quiet steps in a row while unlocked means the page refuses to
            // move for a reason other than a playing segment.
            if (stalled >= 6 && !state.lock) {
                if (direction > 0 && state.scrollY >= state.docHeight - state.viewport - 4)
                    break;
                if (direction < 0 && state.scrollY <= 2)
                    break;
                if (stalled >= 40)
                    return { stuckAt: state.scrollY, wheelTotal, lockedTotal, steps, markers: [...seen], locks: [...locks], maxDomino, state };
            }
            if (stalled >= 120)
                return { stuckAt: state.scrollY, wheelTotal, lockedTotal, steps, markers: [...seen], locks: [...locks], maxDomino, state };
        }
        else {
            stalled = 0;
        }
        previousY = state.scrollY;
    }
    const state = await page.evaluate(readState);
    return { stuckAt: null, wheelTotal, lockedTotal, steps, markers: [...seen], locks: [...locks], maxDomino, state };
}

const results = [];
for (const profile of PROFILES) {
    const browser = await profile.engine.launch();
    const contextOptions = profile.device
        ? { ...devices[profile.device], viewport: profile.viewport }
        : { viewport: profile.viewport, hasTouch: profile.isMobile, isMobile: profile.isMobile };
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
        if (message.type() === "error")
            consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
    await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
    await waitForReady(page);
    const start = await page.evaluate(readState);
    const step = await makeStepper(page, profile);
    const down = await sweep(page, 1, step);
    await page.waitForTimeout(1200);
    const up = await sweep(page, -1, step);
    results.push({
        profile: profile.name,
        docHeight: start.docHeight,
        viewport: start.viewport,
        starfield: start.starfield,
        down: {
            wheelTotal: down.wheelTotal,
            lockedTotal: down.lockedTotal,
            reached: down.state.scrollY,
            stuckAt: down.stuckAt,
            // Input spent while a segment was deliberately holding the reader is
            // not "eaten" - it is the story. The unlocked ratio is the number
            // that says whether anything is still stealing the gesture.
            ratio: Number((down.wheelTotal / Math.max(1, start.docHeight - start.viewport)).toFixed(2)),
            unlockedRatio: Number(((down.wheelTotal - down.lockedTotal) / Math.max(1, start.docHeight - start.viewport)).toFixed(2)),
            markers: down.markers,
            locks: down.locks,
            maxDominoProgress: down.maxDomino,
        },
        up: {
            wheelTotal: up.wheelTotal,
            lockedTotal: up.lockedTotal,
            reached: up.state.scrollY,
            stuckAt: up.stuckAt,
            unlockedRatio: Number(((up.wheelTotal - up.lockedTotal) / Math.max(1, start.docHeight - start.viewport)).toFixed(2)),
            markers: up.markers,
            locks: up.locks,
        },
        consoleErrors: consoleErrors.slice(0, 8),
    });
    await browser.close();
}

console.log(JSON.stringify(results, null, 2));
const failures = results.filter((entry) => entry.down.stuckAt !== null || entry.up.stuckAt !== null || entry.up.reached > 8);
if (failures.length) {
    console.error(`\nFAIL: ${failures.map((entry) => entry.profile).join(", ")}`);
    process.exitCode = 1;
}
else {
    console.log("\nPASS: every profile reached the bottom and came back to the top.");
}
