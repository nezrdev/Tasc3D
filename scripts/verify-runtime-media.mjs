import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const runtimeMediaPath = join(projectRoot, "src", "data", "runtime-media.ts");
const publicDirectory = join(projectRoot, "public");
const DURATION_TOLERANCE_SECONDS = 0.02;
const RATE_TOLERANCE = 0.001;
function loadRuntimeMedia() {
    const source = readFileSync(runtimeMediaPath, "utf8");
    const transpiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: runtimeMediaPath,
    }).outputText;
    const commonJsModule = { exports: {} };
    const evaluate = new Function("exports", "module", transpiled);
    evaluate(commonJsModule.exports, commonJsModule);
    if (!commonJsModule.exports.RUNTIME_MEDIA) {
        throw new Error(`RUNTIME_MEDIA was not exported by ${runtimeMediaPath}`);
    }
    return commonJsModule.exports.RUNTIME_MEDIA;
}
function publicUrlToFile(url) {
    if (typeof url !== "string" || !url.startsWith("/")) {
        throw new Error(`Expected a root-relative public URL, received: ${String(url)}`);
    }
    return join(publicDirectory, ...url.slice(1).split("/"));
}
function parseRate(value) {
    const [numerator, denominator = "1"] = String(value).split("/").map(Number);
    return denominator === 0 ? Number.NaN : numerator / denominator;
}
function runFfprobe(filePath, args) {
    const result = spawnSync("ffprobe", [...args, filePath], {
        cwd: projectRoot,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
    });
    if (result.error?.code === "ENOENT") {
        throw new Error("ffprobe was not found. Install FFmpeg and make ffprobe available on PATH.");
    }
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(result.stderr.trim() || `ffprobe exited with code ${result.status}`);
    }
    try {
        return JSON.parse(result.stdout);
    }
    catch (error) {
        throw new Error(`ffprobe returned invalid JSON: ${error.message}`);
    }
}
function probeSummary(filePath) {
    const json = runFfprobe(filePath, [
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        "stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,r_frame_rate,nb_frames,nb_read_frames,has_b_frames:stream_tags=alpha_mode",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
    ]);
    const streams = json.streams ?? [];
    const stream = streams.find((candidate) => candidate.codec_type === "video");
    if (!stream) {
        throw new Error("no video stream was found");
    }
    return {
        codec: stream.codec_name,
        width: Number(stream.width),
        height: Number(stream.height),
        fps: parseRate(stream.avg_frame_rate || stream.r_frame_rate),
        frameCount: Number(stream.nb_read_frames || stream.nb_frames),
        hasBFrames: Number(stream.has_b_frames || 0),
        alphaMode: stream.tags?.alpha_mode ?? stream.tags?.ALPHA_MODE,
        duration: Number(json.format?.duration),
        audioStreamCount: streams.filter((candidate) => candidate.codec_type === "audio").length,
    };
}
function probeFrames(filePath) {
    const json = runFfprobe(filePath, [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_frames",
        "-show_entries",
        "frame=key_frame,pict_type",
        "-of",
        "json",
    ]);
    const frames = json.frames ?? [];
    const keyframeIndexes = [];
    const pictureTypes = { I: 0, P: 0, B: 0, other: 0 };
    frames.forEach((frame, index) => {
        if (Number(frame.key_frame) === 1)
            keyframeIndexes.push(index);
        if (Object.hasOwn(pictureTypes, frame.pict_type)) {
            pictureTypes[frame.pict_type] += 1;
        }
        else {
            pictureTypes.other += 1;
        }
    });
    const gaps = keyframeIndexes.slice(1).map((index, position) => index - keyframeIndexes[position]);
    if (keyframeIndexes.length > 0) {
        gaps.push(frames.length - keyframeIndexes.at(-1));
    }
    return {
        decodedFrameCount: frames.length,
        keyframeCount: keyframeIndexes.length,
        firstKeyframeIndex: keyframeIndexes[0],
        maxKeyframeInterval: gaps.length > 0 ? Math.max(...gaps) : Number.POSITIVE_INFINITY,
        pictureTypes,
    };
}
function collectVideoUrls(value, urls = new Set()) {
    if (typeof value === "string" && /\.(?:mp4|webm)$/i.test(value)) {
        urls.add(value);
    }
    else if (Array.isArray(value)) {
        value.forEach((entry) => collectVideoUrls(entry, urls));
    }
    else if (value && typeof value === "object") {
        Object.values(value).forEach((entry) => collectVideoUrls(entry, urls));
    }
    return urls;
}
function createManifest(media) {
    const serviceDuration = media.services.frameCount / media.services.fps;
    const datumDuration = media.datum.frameCount / media.datum.fps;
    const dominoDuration = media.domino.frameCount / media.domino.fps;
    return [
        {
            label: "Hero native alpha desktop",
            url: media.hero.nativeAlpha.desktop,
            codec: "vp9",
            width: media.hero.nativeAlpha.desktopOutput.width,
            height: media.hero.nativeAlpha.desktopOutput.height,
            fps: media.hero.fps.desktop,
            frameCount: media.hero.frameCount.desktop,
            duration: media.hero.duration,
            alphaMode: "1",
        },
        {
            label: "Hero native alpha mobile",
            url: media.hero.nativeAlpha.mobile,
            codec: "vp9",
            width: media.hero.nativeAlpha.mobileOutput.width,
            height: media.hero.nativeAlpha.mobileOutput.height,
            fps: media.hero.fps.mobile,
            frameCount: media.hero.frameCount.mobile,
            duration: media.hero.duration,
            alphaMode: "1",
        },
        {
            label: "Hero WebKit packed desktop",
            url: media.hero.webkitPacked.desktop,
            codec: "h264",
            width: media.hero.webkitPacked.desktopOutput.width * 2,
            height: media.hero.webkitPacked.desktopOutput.height,
            fps: media.hero.fps.desktop,
            frameCount: media.hero.frameCount.desktop,
            duration: media.hero.duration,
        },
        {
            label: "Hero WebKit packed mobile",
            url: media.hero.webkitPacked.mobile,
            codec: "h264",
            width: media.hero.webkitPacked.mobileOutput.width * 2,
            height: media.hero.webkitPacked.mobileOutput.height,
            fps: media.hero.fps.mobile,
            frameCount: media.hero.frameCount.mobile,
            duration: media.hero.duration,
        },
        {
            label: "Services native alpha desktop",
            url: media.services.nativeAlpha.desktop,
            codec: "vp9",
            width: media.services.webkitPacked.desktopOutput.width,
            height: media.services.webkitPacked.desktopOutput.height,
            fps: media.services.fps,
            frameCount: media.services.frameCount,
            duration: serviceDuration,
            alphaMode: "1",
            hasBFrames: 0,
            maxKeyframeInterval: 15,
        },
        {
            label: "Services native alpha mobile",
            url: media.services.nativeAlpha.mobile,
            codec: "vp9",
            width: media.services.webkitPacked.mobileOutput.width,
            height: media.services.webkitPacked.mobileOutput.height,
            fps: media.services.fps,
            frameCount: media.services.frameCount,
            duration: serviceDuration,
            alphaMode: "1",
            hasBFrames: 0,
            maxKeyframeInterval: 15,
        },
        {
            label: "Services WebKit packed desktop",
            url: media.services.webkitPacked.desktop,
            codec: "h264",
            width: media.services.webkitPacked.desktopOutput.width * 2,
            height: media.services.webkitPacked.desktopOutput.height,
            fps: media.services.fps,
            frameCount: media.services.frameCount,
            duration: serviceDuration,
            hasBFrames: 0,
            keyframeCount: Math.ceil(media.services.frameCount / 6),
            maxKeyframeInterval: 6,
        },
        {
            label: "Services WebKit packed mobile",
            url: media.services.webkitPacked.mobile,
            codec: "h264",
            width: media.services.webkitPacked.mobileOutput.width * 2,
            height: media.services.webkitPacked.mobileOutput.height,
            fps: media.services.fps,
            frameCount: media.services.frameCount,
            duration: serviceDuration,
            hasBFrames: 0,
            keyframeCount: Math.ceil(media.services.frameCount / 6),
            maxKeyframeInterval: 6,
        },
        ...[
            ["Datum WebKit/default playback desktop", media.datum.desktop, "h264", 1280, 720],
            ["Datum WebKit/default playback mobile", media.datum.mobile, "h264", 960, 540],
            ["Datum Chromium playback desktop", media.datum.chromium.desktop, "vp9", 1280, 720],
            ["Datum Chromium playback mobile", media.datum.chromium.mobile, "vp9", 960, 540],
        ].map(([label, url, codec, width, height]) => ({
            label,
            url,
            codec,
            width,
            height,
            fps: media.datum.fps,
            frameCount: media.datum.frameCount,
            duration: datumDuration,
            hasBFrames: 0,
            maxKeyframeInterval: 15,
        })),
        ...[
            ["Domino WebKit/default forward desktop", media.domino.forward.desktop, "h264", 1120, 630],
            ["Domino WebKit/default forward mobile", media.domino.forward.mobile, "h264", 960, 540],
            ["Domino WebKit/default reverse desktop", media.domino.reverse.desktop, "h264", 1120, 630],
            ["Domino WebKit/default reverse mobile", media.domino.reverse.mobile, "h264", 960, 540],
            ["Domino Chromium forward desktop", media.domino.forward.chromium.desktop, "vp9", 1120, 630],
            ["Domino Chromium forward mobile", media.domino.forward.chromium.mobile, "vp9", 960, 540],
            ["Domino Chromium reverse desktop", media.domino.reverse.chromium.desktop, "vp9", 1120, 630],
            ["Domino Chromium reverse mobile", media.domino.reverse.chromium.mobile, "vp9", 960, 540],
        ].map(([label, url, codec, width, height]) => ({
            label,
            url,
            codec,
            width,
            height,
            fps: media.domino.fps,
            frameCount: media.domino.frameCount,
            duration: dominoDuration,
            hasBFrames: 0,
            maxKeyframeInterval: 15,
        })),
    ];
}
function verifyAsset(asset) {
    const filePath = publicUrlToFile(asset.url);
    const failures = [];
    if (!existsSync(filePath)) {
        return { ...asset, failures: [`file does not exist: ${filePath}`] };
    }
    let summary;
    try {
        summary = probeSummary(filePath);
    }
    catch (error) {
        return { ...asset, failures: [error.message] };
    }
    const equal = (name, actual, expected) => {
        if (actual !== expected)
            failures.push(`${name}: expected ${expected}, received ${actual}`);
    };
    equal("codec", summary.codec, asset.codec);
    equal("width", summary.width, asset.width);
    equal("height", summary.height, asset.height);
    equal("frame count", summary.frameCount, asset.frameCount);
    if (Math.abs(summary.fps - asset.fps) > RATE_TOLERANCE) {
        failures.push(`fps: expected ${asset.fps}, received ${summary.fps}`);
    }
    if (Math.abs(summary.duration - asset.duration) > DURATION_TOLERANCE_SECONDS) {
        failures.push(`duration: expected ${asset.duration.toFixed(6)}s +/- ${DURATION_TOLERANCE_SECONDS}s, received ${summary.duration.toFixed(6)}s`);
    }
    if (asset.alphaMode !== undefined)
        equal("alpha_mode tag", summary.alphaMode, asset.alphaMode);
    if (asset.hasBFrames !== undefined)
        equal("has_b_frames", summary.hasBFrames, asset.hasBFrames);
    equal("audio stream count", summary.audioStreamCount, 0);
    let frameDetails;
    if (asset.keyframeCount !== undefined || asset.maxKeyframeInterval !== undefined || asset.allIntra) {
        try {
            frameDetails = probeFrames(filePath);
            equal("decoded frame count", frameDetails.decodedFrameCount, asset.frameCount);
            equal("first keyframe index", frameDetails.firstKeyframeIndex, 0);
            if (asset.keyframeCount !== undefined) {
                equal("keyframe count", frameDetails.keyframeCount, asset.keyframeCount);
            }
            if (asset.maxKeyframeInterval !== undefined &&
                frameDetails.maxKeyframeInterval > asset.maxKeyframeInterval) {
                failures.push(`max keyframe interval: expected <= ${asset.maxKeyframeInterval}, received ${frameDetails.maxKeyframeInterval}`);
            }
            if (asset.allIntra) {
                equal("keyframe count", frameDetails.keyframeCount, asset.frameCount);
                equal("I-frame count", frameDetails.pictureTypes.I, asset.frameCount);
                equal("P-frame count", frameDetails.pictureTypes.P, 0);
                equal("B-frame count", frameDetails.pictureTypes.B, 0);
                equal("other picture types", frameDetails.pictureTypes.other, 0);
                equal("max keyframe interval", frameDetails.maxKeyframeInterval, 1);
            }
            else {
                equal("B-frame count", frameDetails.pictureTypes.B, 0);
            }
        }
        catch (error) {
            failures.push(error.message);
        }
    }
    return { ...asset, failures, summary, frameDetails };
}
function verifyStaticCompanions(media) {
    const urls = [
        media.hero.poster,
        media.services.poster,
        ...media.services.stopPosters,
        media.datum.poster,
    ];
    return urls.filter((url) => !existsSync(publicUrlToFile(url)));
}
function main() {
    let media;
    try {
        media = loadRuntimeMedia();
    }
    catch (error) {
        console.error(`[FAIL] Could not load runtime media contract: ${error.message}`);
        process.exitCode = 1;
        return;
    }
    const manifest = createManifest(media);
    const manifestUrls = new Set(manifest.map((asset) => asset.url));
    const runtimeUrls = collectVideoUrls(media);
    const unverifiedUrls = [...runtimeUrls].filter((url) => !manifestUrls.has(url));
    const staleManifestUrls = [...manifestUrls].filter((url) => !runtimeUrls.has(url));
    console.log("TASC runtime media verification (ffprobe)");
    console.log(`Contract: ${runtimeMediaPath}`);
    console.log("");
    const results = manifest.map(verifyAsset);
    for (const result of results) {
        if (result.failures.length > 0) {
            console.log(`[FAIL] ${result.label} (${result.url})`);
            result.failures.forEach((failure) => console.log(`       - ${failure}`));
            continue;
        }
        const frameSuffix = result.frameDetails
            ? `, ${result.frameDetails.keyframeCount} keyframes, max GOP ${result.frameDetails.maxKeyframeInterval}`
            : "";
        console.log(`[PASS] ${result.label}: ${result.summary.width}x${result.summary.height}, ${result.summary.fps}fps, ${result.summary.frameCount}f, ${result.summary.duration.toFixed(3)}s${frameSuffix}`);
    }
    const missingStaticCompanions = verifyStaticCompanions(media);
    if (missingStaticCompanions.length === 0) {
        console.log("[PASS] Runtime posters and Services stop posters exist.");
    }
    else {
        console.log("[FAIL] Missing runtime poster files:");
        missingStaticCompanions.forEach((url) => console.log(`       - ${url}`));
    }
    if (unverifiedUrls.length > 0) {
        console.log("[FAIL] runtime-media.ts contains video paths absent from the verifier manifest:");
        unverifiedUrls.forEach((url) => console.log(`       - ${url}`));
    }
    if (staleManifestUrls.length > 0) {
        console.log("[FAIL] Verifier manifest contains paths absent from runtime-media.ts:");
        staleManifestUrls.forEach((url) => console.log(`       - ${url}`));
    }
    const failedAssets = results.filter((result) => result.failures.length > 0).length;
    const contractFailures = missingStaticCompanions.length + unverifiedUrls.length + staleManifestUrls.length;
    console.log("");
    if (failedAssets === 0 && contractFailures === 0) {
        console.log(`[PASS] ${results.length}/${results.length} runtime videos match the replacement contract.`);
        return;
    }
    console.error(`[FAIL] Runtime media verification failed: ${failedAssets} video asset(s), ${contractFailures} contract/static issue(s).`);
    process.exitCode = 1;
}
main();
