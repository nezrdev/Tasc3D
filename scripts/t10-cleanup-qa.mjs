import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const checks = [];
const check = (name, passed, detail = null) => checks.push({ name, passed: Boolean(passed), detail });
const sumFiles = (directory) => readdirSync(directory, { withFileTypes: true }).reduce(
  (total, entry) => total + (entry.isDirectory()
    ? sumFiles(path.join(directory, entry.name))
    : statSync(path.join(directory, entry.name)).size),
  0,
);

const archivedMedia = new Map([
  ["hero-earth-alpha-640-60fps-20260716.webm", "fd907ebf48855b33bafcdd02b2a75852bf61052683cabbe7ab39d13f46b5606f"],
  ["hero-earth-safari-packed-640-60fps-20260716.mp4", "153e13d0efbcb493f3779e3872c3540e7c2e14b8c69ae510f4bc86c2cc4fcd80"],
  ["services-keyframes-packed-1280-final-20260718.mp4", "ef1f4a3b08ee73d180e05dceeeb3be3d846318a47f7ebdeaabc6a138fd3f4837"],
  ["services-keyframes-packed-1280-t1-20260731.mp4", "63673ab37046ad6e825a6009d369832267af1c0e3851bd9140a21487469e311e"],
  ["services-keyframes-packed-960-lean-20260721.mp4", "006ad6b58428eee1e594f105a47cbe9801b572000cc4683818360a4afd3829c4"],
  ["services-keyframes-mobile-lean-20260721.webm", "5f0015a30ad55a00b96d74f3bdd6702fdd4a2767e363665d3179a443f5784459"],
]);
const archiveManifestPath = "docs/media-archive-2026-07-31.md";
const archiveManifest = existsSync(path.join(root, archiveManifestPath)) ? read(archiveManifestPath) : "";
for (const [fileName, expectedHash] of archivedMedia) {
  const archivedPath = path.join(root, "work/media-archive", fileName);
  const actualHash = existsSync(archivedPath)
    ? createHash("sha256").update(readFileSync(archivedPath)).digest("hex")
    : null;
  check(
    `${fileName} is outside public and recorded losslessly`,
    !existsSync(path.join(root, "public/media", fileName)) &&
      actualHash === expectedHash &&
      archiveManifest.includes(fileName) &&
      archiveManifest.includes(expectedHash),
    { expectedHash, actualHash },
  );
}

const publicBytes = sumFiles(path.join(root, "public"));
check("public delivery footprint is at most 61 MiB", publicBytes <= 61 * 1024 * 1024, { publicBytes });

const fontRoot = path.join(root, "src/app/fonts");
const fontFiles = readdirSync(fontRoot, { recursive: true })
  .filter((entry) => typeof entry === "string" && entry.endsWith(".woff2"));
const fontBytes = fontFiles.reduce((total, relativePath) => total + statSync(path.join(fontRoot, relativePath)).size, 0);
const layoutSource = read("src/app/layout.tsx");
check("local fonts use three authored weights per family", fontFiles.length === 6 &&
  ["300", "400", "700"].every((weight) => layoutSource.includes(`weight: "${weight}"`)) &&
  !layoutSource.includes('weight: "500"') &&
  !layoutSource.includes('weight: "600"'), { fontFiles, fontBytes });
check("local font payload is at most 80 KiB", fontBytes <= 80 * 1024, { fontBytes });
check("one local font family is explicitly preloaded", /preload:\s*true/.test(layoutSource));

const processSource = read("src/components/sections/ProcessSection.tsx");
check("Google Maps is represented by a local preview and external link", /src=[{\"](?:[^}\"]*\/)?[^}\"]*map[^}\"]*\.(?:webp|avif|png|jpg)/i.test(processSource) &&
  processSource.includes("google.com/maps") &&
  !/loading=["']eager["']/.test(processSource) &&
  processSource.includes("unoptimized"));

const sitemapSource = read("src/app/sitemap.ts");
check("sitemap uses a stable content-modified date", sitemapSource.includes('SITE_CONTENT_LAST_MODIFIED = "2026-08-02"') &&
  !/SITE_BUILD_TIME|lastModified:\s*new Date\(/.test(sitemapSource));

const landingSource = read("src/components/TascLanding.tsx");
const orchestratorSource = read("src/hooks/useMediaOrchestrator.ts");
check("discarded Services completion state is removed", !landingSource.includes("servicesCompleteStoryPrepared") &&
  !orchestratorSource.includes("servicesCompleteStoryPrepared"));
check("duplicate lower-media warm state is removed", !landingSource.includes("servicesPriorityWarmSettled") &&
  !landingSource.includes("lowerMediaWarmReady") &&
  !landingSource.includes("data-lower-media-ready"));
check("constant reversible-flow gates are removed", !landingSource.includes("useReversibleHowFlow") &&
  !landingSource.includes("useReversibleDominoFlow"));

const nextConfigSource = read("next.config.ts");
check("Next config optimizes lucide imports", nextConfigSource.includes("optimizePackageImports") &&
  nextConfigSource.includes("lucide-react"));
check("production console removal preserves warning channels", nextConfigSource.includes("removeConsole") &&
  /exclude:\s*\[[^\]]*["']error["'][^\]]*["']warn["']/s.test(nextConfigSource));

const heroSource = read("src/components/sections/HeroSection.tsx");
check("Vision logo intrinsic dimensions match the delivered asset", heroSource.includes("width={1600}") &&
  heroSource.includes("height={1008}"));

const report = {
  generatedAt: new Date().toISOString(),
  passed: checks.every((entry) => entry.passed),
  checks,
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
