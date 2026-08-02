import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";

const baseUrl = process.argv.find((value) => value.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:3112/";
const outputRoot = resolve(process.argv.find((value) => value.startsWith("--output="))?.slice(9) ?? "output/playwright/t12-browser-seam");

const configurations = [
    { name: "chromium-desktop", browserType: chromium, viewport: { width: 1440, height: 900 } },
    { name: "webkit-mobile", browserType: webkit, viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 3, hasTouch: true },
];

const anchors = [
    ["#clients", ".figma-clients-section"],
    ["#services", ".services-story-section"],
    ["#work", ".how-work-motion-section"],
    ["#datum", ".datum-motion-section"],
    ["#process", ".process-contact-section"],
    ["#brief", ".domino-cta-section"],
    ["#contact", "#contact"],
    ["#top", ".hero-motion"],
];

mkdirSync(outputRoot, { recursive: true });

const results = [];

for (const configuration of configurations) {
    const browser = await configuration.browserType.launch({ headless: true });
    const context = await browser.newContext({
        viewport: configuration.viewport,
        isMobile: configuration.isMobile,
        deviceScaleFactor: configuration.deviceScaleFactor,
        hasTouch: configuration.hasTouch,
    });
    const page = await context.newPage();
    const failures = [];
    const browserErrors = [];
    const anchorResults = [];
    const caseOutput = resolve(outputRoot, configuration.name);
    mkdirSync(caseOutput, { recursive: true });
    page.on("console", (message) => {
        if (message.type() === "error")
            browserErrors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));

    try {
        await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForFunction(() => document.querySelector(".site-shell")?.dataset.motionReady === "true", null, { timeout: 60_000 });
        await page.waitForTimeout(600);
        await page.getByRole("button", { name: /accept cookies/i }).click({ timeout: 5_000 });
        await page.waitForSelector(".cookie-consent", { state: "detached", timeout: 2_000 });

        const geometry = await page.evaluate(() => {
            const spacer = document.querySelector(".pin-spacer-services-reversible");
            const services = document.querySelector(".services-story-section");
            const how = document.querySelector(".how-work-motion-section");
            const style = spacer ? getComputedStyle(spacer) : null;
            const servicesRect = services?.getBoundingClientRect();
            const howRect = how?.getBoundingClientRect();
            return {
                viewportHeight: window.innerHeight,
                maxY: document.documentElement.scrollHeight - window.innerHeight,
                horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
                spacerHeight: style ? Number.parseFloat(style.height) : null,
                spacerPaddingBottom: style ? Number.parseFloat(style.paddingBottom) : null,
                spacerMarginBottom: style ? Number.parseFloat(style.marginBottom) : null,
                servicesDocumentTop: servicesRect ? servicesRect.top + window.scrollY : null,
                howDocumentTop: howRect ? howRect.top + window.scrollY : null,
            };
        });

        const netSpacerHeight = geometry.spacerHeight === null || geometry.spacerMarginBottom === null
            ? null
            : geometry.spacerHeight + geometry.spacerMarginBottom;
        if (geometry.horizontalOverflow > 1)
            failures.push(`initial horizontal overflow is ${geometry.horizontalOverflow}px`);
        if (geometry.spacerPaddingBottom === null || Math.abs(geometry.spacerPaddingBottom - geometry.viewportHeight) > 2)
            failures.push("Services pin duration does not equal one viewport");
        if (netSpacerHeight === null || Math.abs(netSpacerHeight - geometry.viewportHeight) > 2)
            failures.push("Services compensated spacer does not reserve exactly one viewport in document flow");
        if (geometry.servicesDocumentTop === null || geometry.howDocumentTop === null || Math.abs(geometry.howDocumentTop - geometry.servicesDocumentTop - geometry.viewportHeight) > 2)
            failures.push("Services and How document positions do not form a continuous one-viewport seam");

        for (const [href, selector] of anchors) {
            const clicked = await page.evaluate((targetHref) => {
                const link = document.querySelector(`.site-header a[href="${targetHref}"]`);
                if (!(link instanceof HTMLAnchorElement))
                    return false;
                link.click();
                return true;
            }, href);
            if (!clicked) {
                failures.push(`${href} link is missing`);
                continue;
            }
            await page.waitForFunction(({ targetHref, targetSelector }) => {
                const root = document.querySelector(".site-shell");
                const target = document.querySelector(targetSelector);
                const rect = target?.getBoundingClientRect();
                const reachedTarget = targetHref === "#top"
                    ? window.scrollY <= 2
                    : Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight);
                return window.location.hash === targetHref && !root?.dataset.programmaticAnchor && reachedTarget;
            }, { targetHref: href, targetSelector: selector }, { timeout: 5_000 }).catch(() => undefined);
            const state = await page.evaluate(({ targetHref, targetSelector }) => {
                const target = document.querySelector(targetSelector);
                const rect = target?.getBoundingClientRect();
                const root = document.querySelector(".site-shell");
                return {
                    href: window.location.hash,
                    y: Math.round(window.scrollY),
                    maxY: document.documentElement.scrollHeight - window.innerHeight,
                    targetTop: rect ? Math.round(rect.top) : null,
                    targetBottom: rect ? Math.round(rect.bottom) : null,
                    targetVisible: Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight),
                    pendingAnchor: root?.dataset.programmaticAnchor ?? null,
                    horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
                    requested: targetHref,
                };
            }, { targetHref: href, targetSelector: selector });
            anchorResults.push(state);
            if (state.href !== href)
                failures.push(`${href} did not update the URL hash on first click`);
            if (state.pendingAnchor !== null)
                failures.push(`${href} left programmatic anchor settling active`);
            if (state.horizontalOverflow > 1)
                failures.push(`${href} produced ${state.horizontalOverflow}px horizontal overflow`);
            if (href === "#top" ? state.y > 2 : !state.targetVisible)
                failures.push(`${href} did not reach its target on first click`);
            if (href === "#services") {
                await page.waitForFunction(() => {
                    const content = document.querySelector(".services-story-card-1");
                    const heading = content?.querySelector("h2");
                    if (!(content instanceof HTMLElement) || !(heading instanceof HTMLElement))
                        return false;
                    const style = getComputedStyle(content);
                    const headingStyle = getComputedStyle(heading);
                    return style.visibility === "visible" && Number.parseFloat(style.opacity) > 0.95 && Number.parseFloat(headingStyle.opacity) > 0.95;
                }, null, { timeout: 1_000 });
                await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                await page.screenshot({ path: resolve(caseOutput, "services-seam.png"), fullPage: false });
            }
            if (href === "#work") {
                await page.waitForFunction(() => {
                    const content = document.querySelector(".how-work-motion-inner");
                    if (!(content instanceof HTMLElement))
                        return false;
                    const style = getComputedStyle(content);
                    return style.visibility === "visible" && Number.parseFloat(style.opacity) > 0.95;
                }, null, { timeout: 2_500 });
                await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                await page.screenshot({ path: resolve(caseOutput, "how-seam.png"), fullPage: false });
            }
        }

        const servicesAnchor = anchorResults.find((entry) => entry.requested === "#services");
        const howAnchor = anchorResults.find((entry) => entry.requested === "#work");
        if (!servicesAnchor || servicesAnchor.targetTop === null || Math.abs(servicesAnchor.targetTop) > 2)
            failures.push("Services anchor is not aligned to the top seam");
        if (!howAnchor || howAnchor.targetTop === null || Math.abs(howAnchor.targetTop) > 2)
            failures.push("How anchor is not aligned to the top seam");

        const clickAnchor = (href) => page.evaluate((targetHref) => {
            const link = document.querySelector(`.site-header a[href="${targetHref}"]`);
            if (!(link instanceof HTMLAnchorElement))
                return false;
            link.click();
            return true;
        }, href);
        await clickAnchor("#services");
        await page.waitForTimeout(60);
        await clickAnchor("#work");
        await page.waitForTimeout(60);
        await clickAnchor("#services");
        const rapidReturnVisible = await page.waitForFunction(() => {
            const root = document.querySelector(".site-shell");
            const section = document.querySelector(".services-story-section");
            const heading = document.querySelector(".services-story-card-1 h2");
            const rect = section?.getBoundingClientRect();
            if (!(heading instanceof HTMLElement))
                return false;
            return window.location.hash === "#services" &&
                !root?.dataset.programmaticAnchor &&
                Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight) &&
                Number.parseFloat(getComputedStyle(heading).opacity) > 0.95;
        }, null, { timeout: 2_000 }).then(() => true).catch(() => false);
        if (!rapidReturnVisible)
            failures.push("rapid Services → How → Services navigation left a blank or unsettled Services state");
        await page.screenshot({ path: resolve(caseOutput, "services-rapid-return.png"), fullPage: false });

        failures.push(...browserErrors);

        results.push({
            name: configuration.name,
            passed: failures.length === 0,
            failures,
            geometry,
            anchors: anchorResults,
            screenshots: [
                resolve(caseOutput, "services-seam.png"),
                resolve(caseOutput, "how-seam.png"),
                resolve(caseOutput, "services-rapid-return.png"),
            ],
        });
    }
    catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
        results.push({ name: configuration.name, passed: false, failures, anchors: anchorResults });
    }
    finally {
        await context.close();
        await browser.close();
    }
}

const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    passed: results.every((result) => result.passed),
    results,
};

writeFileSync(resolve(outputRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (!summary.passed)
    process.exit(1);
