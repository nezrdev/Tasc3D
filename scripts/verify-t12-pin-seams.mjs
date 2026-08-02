import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const landing = readFileSync("src/components/TascLanding.tsx", "utf8");
const stories = readFileSync("src/hooks/useReversibleScrollStories.ts", "utf8");
const refreshUtility = readFileSync("src/lib/scroll-trigger-refresh.ts", "utf8");
const styles = readFileSync("src/app/globals.css", "utf8");

const failures = [];

function readSourceTree(directory) {
    return readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const path = join(directory, entry.name);
            if (entry.isDirectory())
                return readSourceTree(path);
            return /\.(?:ts|tsx|js|jsx)$/.test(entry.name)
                ? [{ path, source: readFileSync(path, "utf8") }]
                : [];
        });
}

function expect(condition, message) {
    if (!condition)
        failures.push(message);
}

function sliceBetween(source, start, end) {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex + start.length);
    expect(startIndex >= 0, `missing start marker: ${start}`);
    expect(endIndex > startIndex, `missing end marker after: ${start}`);
    return startIndex >= 0 && endIndex > startIndex
        ? source.slice(startIndex, endIndex)
        : "";
}

function count(source, pattern) {
    return [...source.matchAll(pattern)].length;
}

const servicesTrigger = sliceBetween(
    landing,
    'id: "services-reversible"',
    "onEnter: (self)",
);
expect(!servicesTrigger.includes("endTrigger"), "services trigger still uses endTrigger");
expect(servicesTrigger.includes("pin: useLegacyServicesFlow"), "services trigger must preserve the legacy visual pin owner");
expect(servicesTrigger.includes("pinSpacing: true"), "services trigger must reserve pin spacing");
expect(servicesTrigger.includes("invalidateOnRefresh: true"), "services trigger must invalidate viewport measurements on refresh");
expect(/end:\s*\(\)\s*=>\s*`\+=\$\{syncServicesPinCompensation\(\)\}`/.test(servicesTrigger), "services trigger must use the compensated fixed-pixel viewport end");
expect(servicesTrigger.includes("onRefreshInit: syncServicesPinCompensation"), "services pin compensation must update before refresh measurement");
expect(/--services-pin-flow-compensation[\s\S]{0,100}?\$\{\-distance\}px/.test(landing), "services pin compensation must negate only the external flow distance");
expect(/\.site-shell\s+\.pin-spacer-services-reversible\s*\{[\s\S]{0,160}?margin-bottom:\s*var\(--services-pin-flow-compensation,\s*0px\)\s*!important/.test(styles), "services pin spacer must apply the flow compensation without overriding height or padding");
expect(servicesTrigger.includes("refreshPriority: 30"), "services trigger priority must be 30");

expect(/id:\s*"hero-motion"[\s\S]{0,1200}?refreshPriority:\s*40/.test(landing), "hero priority must be 40");
expect(/id:\s*"how-work-entrance"[\s\S]{0,1200}?refreshPriority:\s*25/.test(stories), "How entrance priority must be 25");
expect(/id:\s*"how-work-reversible"[\s\S]{0,1200}?refreshPriority:\s*20/.test(stories), "How reversible priority must be 20");
expect(/id:\s*"datum-reversible"[\s\S]{0,1200}?refreshPriority:\s*10/.test(landing), "Datum priority must be 10");
expect(/id:\s*"domino-reversible"[\s\S]{0,1200}?refreshPriority:\s*5/.test(stories), "Domino priority must be 5");

const applicationSources = `${landing}\n${stories}`;
expect(!/ScrollTrigger\.(?:refresh|sort)\s*\(/.test(applicationSources), "direct ScrollTrigger refresh/sort remains outside the scheduler");
const sourceFiles = readSourceTree("src");
const directRefreshOwners = sourceFiles.filter(({ source }) => /ScrollTrigger\.(?:refresh|sort)\s*\(/.test(source));
expect(directRefreshOwners.length === 1 && directRefreshOwners[0]?.path.endsWith(join("src", "lib", "scroll-trigger-refresh.ts")), "the refresh scheduler must be the only direct ScrollTrigger refresh/sort owner in src");
const negativePriorities = sourceFiles.flatMap(({ path, source }) => [...source.matchAll(/refreshPriority:\s*(-\d+)/g)].map((match) => `${path}:${match[1]}`));
expect(negativePriorities.length === 0, `negative refresh priorities remain: ${negativePriorities.join(", ")}`);
expect(count(refreshUtility, /ScrollTrigger\.refresh\s*\(/g) === 1, "refresh utility must own the single direct refresh call");
expect(count(refreshUtility, /ScrollTrigger\.sort\s*\(/g) === 1, "refresh utility must own the single direct sort call");
expect(/DEFAULT_REFRESH_DELAY_MS\s*=\s*300/.test(refreshUtility), "refresh scheduler default must be 300ms");
expect(refreshUtility.includes("window.clearTimeout(refreshTimer)"), "refresh scheduler must debounce pending timers");
expect(refreshUtility.includes("window.cancelAnimationFrame(refreshFrame)"), "refresh scheduler must replace a pending frame");

const anchorHandler = sliceBetween(
    landing,
    "const handleAnchorNavigate = useCallback",
    "useLayoutEffect(() =>",
);
const anchorPositioner = sliceBetween(
    anchorHandler,
    "const scrollToPosition =",
    'if (href === "#top")',
);
expect(!/ScrollTrigger\.(?:refresh|sort)\s*\(/.test(anchorHandler), "anchor navigation must not refresh or sort triggers");
expect(!/setTimeout\s*\(/.test(anchorPositioner), "anchor positioner must not use delayed retries");
expect(count(anchorPositioner, /requestAnimationFrame\s*\(/g) === 1, "anchor positioner must use exactly one requestAnimationFrame");
expect(count(anchorPositioner, /applyPosition\s*\(/g) === 1, "anchor positioner must invoke applyPosition exactly once");
expect(anchorPositioner.includes("Math.round(nextTop)"), "anchor position must be rounded before application");

if (failures.length) {
    console.error("T12 pin/refresh contracts failed:");
    for (const failure of failures)
        console.error(`- ${failure}`);
    process.exit(1);
}

console.log("T12 pin seams, refresh ownership, priorities, and anchor contracts verified");
