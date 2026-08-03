import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [landing, visibilityVideo, reversibleStories, motionCss, responsiveCss, processCss] = await Promise.all([
  read("src/components/TascLanding.tsx"),
  read("src/components/VisibilityTriggeredVideo.tsx"),
  read("src/hooks/useReversibleScrollStories.ts"),
  read("src/app/motion-final.css"),
  read("src/app/responsive-flow.css"),
  read("src/app/process-final.css"),
]);

assert.doesNotMatch(visibilityVideo, /setInterval\s*\(/);
assert.doesNotMatch(visibilityVideo, /getBoundingClientRect\s*\(/);
assert.doesNotMatch(visibilityVideo, /addEventListener\(\s*["']scroll["']/);
assert.match(visibilityVideo, /threshold:\s*\[0,\s*0\.25,\s*0\.5,\s*0\.75,\s*1\]/);
assert.match(visibilityVideo, /const playbackHealthChecks = new Set/);
assert.match(visibilityVideo, /requestVideoFrameCallback/);
assert.match(visibilityVideo, /data-first-frame=\{firstFrameState\}/);
assert.match(visibilityVideo, /setActivePoster\(poster\)/);

assert.match(landing, /id:\s*["']datum-reversible["'][\s\S]*?start:\s*["']top top["'][\s\S]*?end:\s*["']bottom top["']/);
const datumTransitionStart = landing.indexOf('id: "datum-content-transition"');
const datumTransitionEnd = landing.indexOf('.addLabel("cards"', datumTransitionStart);
const datumTransitionContract = landing.slice(datumTransitionStart, datumTransitionEnd);
assert.ok(datumTransitionStart >= 0 && datumTransitionEnd > datumTransitionStart, "Datum transition trigger was not found");
assert.match(datumTransitionContract, /\bpin:\s*true/, "Datum must pin the viewport while the cards to waitlist story runs");
assert.match(datumTransitionContract, /\bpinSpacing:\s*true/, "Datum pin must reserve flow spacing");
assert.match(datumTransitionContract, /end:\s*\(\)\s*=>\s*`\+=\$\{getStableDatumPinDistance\(\)\}`/, "Datum pin travel must use the stable viewport distance");
assert.match(datumTransitionContract, /root\.dataset\.datumPinned = String\(self\.isActive\)/, "Datum pin state must be published live, not hardcoded");
assert.match(landing, /start:\s*\(\)\s*=>\s*`top \$\{Math\.round\(getVisualViewportHeight\(\) \* 2\)\}px`/);
assert.doesNotMatch(landing, /reverseThreshold=\{/);
assert.match(motionCss, /\.datum-motion-video\[data-first-frame="decoded"\]/);
assert.match(responsiveCss, /data-datum-playback="fallback"/);

assert.match(reversibleStories, /DOMINO_TRANSPORT_PREFLIGHT_CONTRACT_MS = 1200/);
assert.match(reversibleStories, /DOMINO_TRANSPORT_PREFLIGHT_TIMER_MS = DOMINO_TRANSPORT_PREFLIGHT_CONTRACT_MS - 300/);
assert.match(reversibleStories, /DOMINO_TRANSPORT_UNAVAILABLE_TTL_MS = 15000/);
assert.match(reversibleStories, /readyState < HTMLMediaElement\.HAVE_CURRENT_DATA/);
assert.match(reversibleStories, /waitForTransportFrame\(incomingVideo, preflightToken\)/);
assert.match(reversibleStories, /const preflightStartedArmed = incomingVideo\.dataset\.armed === "true"/);
assert.match(reversibleStories, /if \(!preflightStartedArmed\)[\s\S]*?preflight-unarmed[\s\S]*?return;[\s\S]*?incomingVideo\.networkState === HTMLMediaElement\.NETWORK_NO_SOURCE[\s\S]*?failOpenDominoTransport\(nextDirection, incomingVideo, failureReason\)/);
assert.match(reversibleStories, /markTransportUnavailable\(failedDirection\)/);
assert.match(reversibleStories, /root\.dataset\.dominoMediaFailure = reason;[\s\S]*?releaseAtBoundary\(failedDirection\)/);
assert.match(reversibleStories, /clearTransportUnavailable\(availableDirection\)/);
assert.match(reversibleStories, /Math\.max\(0, Math\.round\(target\)\)/);
assert.match(reversibleStories, /Math\.abs\(window\.scrollY - target\) <= 2/);
assert.match(landing, /id:\s*["']process-domino-tone["']/);
assert.match(processCss, /--process-domino-tone/);

console.log("T6 Datum/Domino contracts verified");
