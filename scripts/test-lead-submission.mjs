import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, "..");
const nativeRequire = createRequire(import.meta.url);
const tests = [];

function test(name, run) {
    tests.push({ name, run });
}

function resolveSourceModule(fromFile, specifier) {
    const basePath = specifier.startsWith("@/")
        ? path.join(projectRoot, "src", specifier.slice(2))
        : path.resolve(path.dirname(fromFile), specifier);
    const candidates = [
        basePath,
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.js`,
        path.join(basePath, "index.ts"),
        path.join(basePath, "index.tsx"),
        path.join(basePath, "index.js"),
    ];
    const resolved = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!resolved)
        throw new Error(`Cannot resolve ${specifier} from ${fromFile}`);
    return resolved;
}

function loadTypeScriptModule(filePath, mocks = {}, cache = new Map()) {
    const absolutePath = path.resolve(filePath);
    const cached = cache.get(absolutePath);
    if (cached)
        return cached.exports;
    const loadedModule = { exports: {} };
    cache.set(absolutePath, loadedModule);
    const source = fs.readFileSync(absolutePath, "utf8");
    const result = ts.transpileModule(source, {
        fileName: absolutePath,
        reportDiagnostics: true,
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true,
        },
    });
    const errors = (result.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length > 0) {
        throw new Error(errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n"));
    }
    const localRequire = (specifier) => {
        if (Object.prototype.hasOwnProperty.call(mocks, specifier))
            return mocks[specifier];
        if (specifier.startsWith("@/") || specifier.startsWith(".")) {
            return loadTypeScriptModule(resolveSourceModule(absolutePath, specifier), mocks, cache);
        }
        return nativeRequire(specifier);
    };
    const evaluate = new Function("require", "module", "exports", "__filename", "__dirname", result.outputText);
    evaluate(localRequire, loadedModule, loadedModule.exports, absolutePath, path.dirname(absolutePath));
    return loadedModule.exports;
}

function replaceGlobals(replacements) {
    const originals = new Map();
    for (const [key, value] of Object.entries(replacements)) {
        originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, {
            configurable: true,
            writable: true,
            value,
        });
    }
    return () => {
        for (const [key, descriptor] of originals) {
            if (descriptor)
                Object.defineProperty(globalThis, key, descriptor);
            else
                delete globalThis[key];
        }
    };
}

async function buildClientPayload(formType, {
    email = "lead@example.com",
    consent = true,
    website = "",
    elapsedMs = 3000,
    wallClockSkewMs = 0,
} = {}) {
    let monotonicNow = 1000;
    let capturedPayload = null;
    let resetCount = 0;
    const originalDateNow = Date.now;
    const reactMock = {
        useCallback: (callback) => callback,
        useEffect: (effect) => effect(),
        useRef: (value) => ({ current: value }),
        useState: (value) => [typeof value === "function" ? value() : value, () => undefined],
    };
    class FakeFormData {
        constructor(form) {
            this.values = form.values;
        }
        get(name) {
            return this.values.has(name) ? this.values.get(name) : null;
        }
    }
    const restoreGlobals = replaceGlobals({
        performance: { now: () => monotonicNow },
        window: {
            setTimeout: () => 1,
            clearTimeout: () => undefined,
        },
        FormData: FakeFormData,
        fetch: async (url, init) => {
            assert.equal(url, "/api/leads");
            assert.equal(init.method, "POST");
            capturedPayload = JSON.parse(init.body);
            return Response.json({ ok: true }, { status: 201 });
        },
    });
    Date.now = () => 1_700_000_000_000 + wallClockSkewMs;
    try {
        const hookModule = loadTypeScriptModule(
            path.join(projectRoot, "src", "hooks", "useLeadSubmission.ts"),
            { react: reactMock },
        );
        const invokeLeadSubmission = hookModule.useLeadSubmission;
        const lead = invokeLeadSubmission(formType);
        lead.captureFirstInteraction();
        monotonicNow += elapsedMs;
        const values = new Map([
            ["email", email],
            ["privacy", consent ? "on" : null],
            ["website", website],
        ]);
        const form = {
            values,
            reportValidity: () => true,
            reset: () => {
                resetCount += 1;
            },
        };
        const saved = await lead.submit({
            preventDefault: () => undefined,
            currentTarget: form,
        });
        assert.equal(saved, true);
        assert.equal(resetCount, 1);
        assert.ok(capturedPayload);
        return capturedPayload;
    }
    finally {
        Date.now = originalDateNow;
        restoreGlobals();
    }
}

async function callLeadRoute(payload, { created = true } = {}) {
    const stored = [];
    const logs = [];
    const route = loadTypeScriptModule(
        path.join(projectRoot, "src", "app", "api", "leads", "route.ts"),
        {
            "@/server/db": {
                isLeadsEnabled: () => true,
                getDatabase: () => {
                    throw new Error("The T13 harness must never open a database connection.");
                },
            },
            "@/server/leads": {
                storeLead: async (input, request) => {
                    stored.push({ input, request });
                    return { created };
                },
            },
        },
    );
    const request = new Request("https://tascagency.com/api/leads", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            origin: "https://tascagency.com",
            "x-forwarded-host": "tascagency.com",
            "x-forwarded-proto": "https",
        },
        body: JSON.stringify(payload),
    });
    const originalInfo = console.info;
    console.info = (...args) => logs.push(args);
    try {
        const response = await route.POST(request);
        return {
            body: await response.json(),
            logs,
            response,
            stored,
        };
    }
    finally {
        console.info = originalInfo;
    }
}

function validPayload(overrides = {}) {
    return {
        formType: "project_brief",
        email: "lead@example.com",
        consent: true,
        website: "",
        elapsedMs: 3000,
        ...overrides,
    };
}

test("a client wall clock five minutes ahead still reaches the handler and store", async () => {
    const payload = await buildClientPayload("project_brief", { wallClockSkewMs: 5 * 60 * 1000 });
    assert.equal(payload.elapsedMs, 3000);
    assert.equal(Number.isInteger(payload.elapsedMs), true);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "startedAt"), false);
    const result = await callLeadRoute(payload);
    assert.equal(result.response.status, 201);
    assert.equal(result.stored.length, 1);
    assert.equal(result.stored[0].input.elapsedMs, 3000);
});

test("elapsedMs 200 is filtered and logged without PII", async () => {
    const privateEmail = "private-person@example.com";
    const result = await callLeadRoute(validPayload({ email: privateEmail, elapsedMs: 200 }));
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body, { ok: true });
    assert.equal(result.stored.length, 0);
    const serializedLogs = JSON.stringify(result.logs);
    assert.match(serializedLogs, /"formType":"project_brief"/);
    assert.match(serializedLogs, /"elapsedMs":200/);
    assert.doesNotMatch(serializedLogs, new RegExp(privateEmail));
});

test("elapsedMs 3000 reaches the store", async () => {
    const result = await callLeadRoute(validPayload({ elapsedMs: 3000 }));
    assert.equal(result.response.status, 201);
    assert.equal(result.stored.length, 1);
    assert.equal(result.stored[0].input.email, "lead@example.com");
});

test("the honeypot is filtered and its submitted values are never logged", async () => {
    const privateEmail = "honeypot-person@example.com";
    const honeypotValue = "https://private-honeypot.example";
    const result = await callLeadRoute(validPayload({
        email: privateEmail,
        website: honeypotValue,
    }));
    assert.equal(result.response.status, 200);
    assert.equal(result.stored.length, 0);
    const serializedLogs = JSON.stringify(result.logs);
    assert.match(serializedLogs, /"formType":"project_brief"/);
    assert.match(serializedLogs, /"elapsedMs":3000/);
    assert.doesNotMatch(serializedLogs, new RegExp(privateEmail));
    assert.doesNotMatch(serializedLogs, new RegExp(honeypotValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("schema timing and honeypot boundaries are enforced", () => {
    const { leadSubmissionSchema, MAX_LEAD_ELAPSED_MS } = loadTypeScriptModule(
        path.join(projectRoot, "src", "server", "lead-schema.ts"),
    );
    assert.equal(leadSubmissionSchema.safeParse(validPayload({ elapsedMs: 0 })).success, true);
    assert.equal(leadSubmissionSchema.safeParse(validPayload({ elapsedMs: MAX_LEAD_ELAPSED_MS })).success, true);
    assert.equal(leadSubmissionSchema.safeParse(validPayload({ elapsedMs: -1 })).success, false);
    assert.equal(leadSubmissionSchema.safeParse(validPayload({ elapsedMs: MAX_LEAD_ELAPSED_MS + 1 })).success, false);
    assert.equal(leadSubmissionSchema.safeParse(validPayload({ elapsedMs: 1000.5 })).success, false);
    assert.equal(leadSubmissionSchema.safeParse(validPayload({ formType: "unknown" })).success, false);
    assert.equal(leadSubmissionSchema.safeParse(validPayload({ email: "not-an-email" })).success, false);
    assert.equal(leadSubmissionSchema.safeParse(validPayload({ consent: false })).success, false);
    const missingTiming = validPayload();
    delete missingTiming.elapsedMs;
    assert.equal(leadSubmissionSchema.safeParse(missingTiming).success, false);
    assert.equal(leadSubmissionSchema.safeParse(validPayload({ website: "x".repeat(200) })).success, true);
    assert.equal(leadSubmissionSchema.safeParse(validPayload({ website: "x".repeat(201) })).success, false);
    assert.equal(leadSubmissionSchema.safeParse(validPayload({ unexpected: true })).success, false);
    const legacyBoundary = validPayload({ startedAt: Number.MAX_SAFE_INTEGER });
    delete legacyBoundary.elapsedMs;
    assert.equal(leadSubmissionSchema.safeParse(legacyBoundary).success, true);
    assert.equal(leadSubmissionSchema.safeParse({ ...legacyBoundary, startedAt: 0 }).success, false);
});

test("the client clamps long-lived forms to the server timing boundary", async () => {
    const maxElapsedMs = 24 * 60 * 60 * 1000;
    const payload = await buildClientPayload("project_brief", { elapsedMs: maxElapsedMs + 60_000 });
    assert.equal(payload.elapsedMs, maxElapsedMs);
    assert.equal(Number.isInteger(payload.elapsedMs), true);
    const result = await callLeadRoute(payload);
    assert.equal(result.response.status, 201);
    assert.equal(result.stored.length, 1);
});

test("legacy startedAt remains accepted without cross-clock subtraction", async () => {
    const payload = validPayload({ startedAt: 9_000_000_000_000 });
    delete payload.elapsedMs;
    const result = await callLeadRoute(payload);
    assert.equal(result.response.status, 201);
    assert.equal(result.stored.length, 1);
    assert.equal(result.stored[0].input.elapsedMs, undefined);
    assert.equal(result.stored[0].input.startedAt, 9_000_000_000_000);
});

test("both forms emit elapsedMs payloads and wire first-field-focus capture", async () => {
    const datumPayload = await buildClientPayload("datum_waitlist");
    const dominoPayload = await buildClientPayload("project_brief");
    assert.equal(datumPayload.formType, "datum_waitlist");
    assert.equal(dominoPayload.formType, "project_brief");
    assert.equal(datumPayload.elapsedMs, 3000);
    assert.equal(dominoPayload.elapsedMs, 3000);
    const sectionSources = {
        datum: fs.readFileSync(path.join(projectRoot, "src", "components", "sections", "DatumSection.tsx"), "utf8"),
        domino: fs.readFileSync(path.join(projectRoot, "src", "components", "sections", "DominoSection.tsx"), "utf8"),
    };
    for (const [section, formClass, leadName] of [
        ["datum", "datum-waitlist-form", "datumLead"],
        ["domino", "domino-impulse-form", "dominoLead"],
    ]) {
        const sectionSource = sectionSources[section];
        const start = sectionSource.indexOf(`<form className="${formClass}"`);
        const end = sectionSource.indexOf("</form>", start);
        assert.notEqual(start, -1, `${formClass} is missing`);
        assert.notEqual(end, -1, `${formClass} closing tag is missing`);
        const formSource = sectionSource.slice(start, end);
        assert.doesNotMatch(formSource, /onPointerDownCapture|onFocusCapture|onKeyDownCapture|onInputCapture/);
        assert.match(formSource, new RegExp(`name="email"[^>]*onFocus=\\{${leadName}\\.captureFirstInteraction\\}`));
        assert.match(formSource, new RegExp(`name="privacy"[^>]*onFocus=\\{${leadName}\\.captureFirstInteraction\\}`));
    }
    const dominoInput = sectionSources.domino.match(/<input id="domino-email"[^>]*\/>/)?.[0] || "";
    assert.ok(dominoInput, "Domino email input is missing");
    assert.doesNotMatch(dominoInput, /\bvalue=/);
    assert.doesNotMatch(dominoInput, /\bonInput=/);
    assert.doesNotMatch(dominoInput, /\bonChange=/);
    const globalCss = fs.readFileSync(path.join(projectRoot, "src", "app", "globals.css"), "utf8");
    assert.match(globalCss, /\.domino-impulse-row:has\(input:valid:not\(:placeholder-shown\)\) button/);
});

let failures = 0;
for (const [index, entry] of tests.entries()) {
    try {
        await entry.run();
        console.log(`ok ${index + 1} - ${entry.name}`);
    }
    catch (error) {
        failures += 1;
        console.error(`not ok ${index + 1} - ${entry.name}`);
        console.error(error);
    }
}
console.log(`${tests.length - failures}/${tests.length} lead submission tests passed`);
if (failures > 0)
    process.exitCode = 1;
