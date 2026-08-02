import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, basename, resolve } from "node:path";
import { chromium, webkit } from "playwright";

const readArgument = (name, fallback) => {
    const exactIndex = process.argv.indexOf(`--${name}`);
    if (exactIndex >= 0 && process.argv[exactIndex + 1] && !process.argv[exactIndex + 1].startsWith("--"))
        return process.argv[exactIndex + 1];
    return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
};

const baseUrl = readArgument("url", "http://127.0.0.1:3151/");
const outputArgument = resolve(readArgument("output", "output/playwright/t11-first-visit-smoke"));
const outputIsJson = extname(outputArgument).toLowerCase() === ".json";
const summaryPath = outputIsJson ? outputArgument : resolve(outputArgument, "summary.json");
const artifactsRoot = outputIsJson
    ? resolve(dirname(outputArgument), basename(outputArgument, extname(outputArgument)))
    : outputArgument;
const consentKey = "tasc_cookie_consent_v1";
const timeout = 60_000;

const allConfigurations = [
    { name: "chromium-desktop", browserType: chromium, viewport: { width: 1440, height: 900 }, mobile: false },
    { name: "chromium-mobile", browserType: chromium, viewport: { width: 390, height: 844 }, mobile: true },
    { name: "webkit-desktop", browserType: webkit, viewport: { width: 1440, height: 900 }, mobile: false },
    { name: "webkit-mobile", browserType: webkit, viewport: { width: 390, height: 844 }, mobile: true },
];
const requestedCases = new Set(readArgument("cases", "").split(",").map((value) => value.trim()).filter(Boolean));
const configurations = requestedCases.size
    ? allConfigurations.filter((configuration) => requestedCases.has(configuration.name))
    : allConfigurations;

mkdirSync(dirname(summaryPath), { recursive: true });
mkdirSync(artifactsRoot, { recursive: true });

const results = [];

for (const configuration of configurations) {
    const startedAt = Date.now();
    const errors = [];
    const failures = [];
    const screenshotPath = resolve(artifactsRoot, `${configuration.name}.png`);
    const browser = await configuration.browserType.launch({ headless: true });
    const context = await browser.newContext({
        viewport: configuration.viewport,
        isMobile: configuration.mobile,
        hasTouch: configuration.mobile,
        deviceScaleFactor: configuration.mobile ? 3 : 1,
    });
    const page = await context.newPage();
    let initialConsent = null;
    let storedConsent = null;
    let contactState = null;

    page.on("console", (message) => {
        if (message.type() === "error")
            errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    try {
        await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout });
        initialConsent = await page.evaluate((key) => window.localStorage.getItem(key), consentKey);
        if (initialConsent !== null)
            failures.push("cold context already contained cookie consent");

        await page.locator('.site-shell[data-motion-ready="true"]').waitFor({ state: "attached", timeout });
        const dialog = page.getByRole("dialog", { name: "Cookies keep this experience precise." });
        await dialog.waitFor({ state: "visible", timeout: 10_000 });

        const acceptButton = page.getByRole("button", { name: "Accept cookies", exact: true });
        await acceptButton.waitFor({ state: "visible", timeout: 5_000 });
        await acceptButton.click();
        await dialog.waitFor({ state: "detached", timeout: 5_000 });

        const storedRaw = await page.evaluate((key) => window.localStorage.getItem(key), consentKey);
        try {
            storedConsent = storedRaw ? JSON.parse(storedRaw) : null;
        }
        catch {
            storedConsent = storedRaw;
        }
        const validConsent = storedConsent &&
            typeof storedConsent === "object" &&
            storedConsent.version === 1 &&
            storedConsent.necessary === true &&
            storedConsent.analytics === true &&
            storedConsent.mode === "all" &&
            Number.isFinite(Date.parse(storedConsent.acceptedAt));
        if (!validConsent)
            failures.push("Accept cookies did not persist a valid all-consent record");

        if (configuration.mobile) {
            const navigationButton = page.getByRole("button", { name: "Open navigation", exact: true });
            await navigationButton.waitFor({ state: "visible", timeout: 5_000 });
            await navigationButton.click();
            const mobileContact = page.locator('.mobile-menu-list a[href="#contact"]');
            await mobileContact.waitFor({ state: "visible", timeout: 5_000 });
            await mobileContact.click();
        }
        else {
            const desktopContact = page.locator('.header-actions a[href="#contact"]');
            await desktopContact.waitFor({ state: "visible", timeout: 5_000 });
            await desktopContact.click();
        }

        await page.waitForFunction(() => {
            const root = document.querySelector(".site-shell");
            const target = document.querySelector("#contact");
            const rect = target?.getBoundingClientRect();
            return window.location.hash === "#contact" &&
                !root?.dataset.programmaticAnchor &&
                Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight);
        }, null, { timeout: 15_000 });
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

        contactState = await page.evaluate(() => {
            const target = document.querySelector("#contact");
            const rect = target?.getBoundingClientRect();
            const style = target ? getComputedStyle(target) : null;
            const root = document.querySelector(".site-shell");
            const dominoRect = document.querySelector(".domino-cta-section")?.getBoundingClientRect();
            const processRect = document.querySelector(".process-contact-section")?.getBoundingClientRect();
            return {
                hash: window.location.hash,
                scrollY: Math.round(window.scrollY),
                top: rect ? Math.round(rect.top) : null,
                bottom: rect ? Math.round(rect.bottom) : null,
                visible: Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight),
                rendered: Boolean(style && style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity) > 0),
                pendingAnchor: root?.getAttribute("data-programmatic-anchor"),
                portionTarget: root?.getAttribute("data-portion-target-index"),
                dominoPlayback: root?.getAttribute("data-domino-playback"),
                dominoProgress: root?.getAttribute("data-domino-progress"),
                dominoPinned: root?.getAttribute("data-domino-pinned"),
                dominoTop: dominoRect ? Math.round(dominoRect.top) : null,
                processTop: processRect ? Math.round(processRect.top) : null,
            };
        });

        if (contactState.hash !== "#contact")
            failures.push("Contact us did not update the hash to #contact");
        if (!contactState.visible || !contactState.rendered)
            failures.push("#contact was not visible and rendered after navigation");
        if (contactState.pendingAnchor !== null)
            failures.push("Contact navigation left a programmatic anchor pending");
    }
    catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
    }
    finally {
        await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
        failures.push(...errors);
        results.push({
            name: configuration.name,
            engine: configuration.browserType.name(),
            viewport: configuration.viewport,
            mobile: configuration.mobile,
            passed: failures.length === 0,
            durationMs: Date.now() - startedAt,
            failures,
            browserErrors: errors,
            initialConsent,
            storedConsent,
            contact: contactState,
            screenshot: screenshotPath,
        });
        await context.close();
        await browser.close();
    }
}

const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    passed: results.every((result) => result.passed),
    passedCases: results.filter((result) => result.passed).length,
    totalCases: results.length,
    results,
};

writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (!summary.passed)
    process.exitCode = 1;
