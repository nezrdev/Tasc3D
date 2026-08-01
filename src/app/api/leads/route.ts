import { leadSubmissionSchema } from "@/server/lead-schema";
import { isLeadsEnabled } from "@/server/db";
import { storeLead } from "@/server/leads";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 8 * 1024;
const MIN_SUBMIT_TIME_MS = 900;
const RESPONSE_HEADERS = {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
};
function json(body: Record<string, unknown>, status: number, extraHeaders?: HeadersInit) {
    return Response.json(body, {
        status,
        headers: { ...RESPONSE_HEADERS, ...extraHeaders },
    });
}
function isAllowedOrigin(request: Request) {
    const origin = request.headers.get("origin");
    if (!origin)
        return false;
    const configuredOrigins = (process.env.LEADS_ALLOWED_ORIGINS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    if (configuredOrigins.length > 0)
        return configuredOrigins.includes(origin);
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const protocol = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
    return Boolean(host && origin === `${protocol}://${host}`);
}
export async function POST(request: Request) {
    if (!isLeadsEnabled())
        return json({ ok: false, error: "Submissions are temporarily unavailable." }, 503);
    if (!isAllowedOrigin(request))
        return json({ ok: false, error: "Request origin is not allowed." }, 403);
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
        return json({ ok: false, error: "Content-Type must be application/json." }, 415);
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        return json({ ok: false, error: "Request body is too large." }, 413);
    }
    let body: unknown;
    try {
        const rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
            return json({ ok: false, error: "Request body is too large." }, 413);
        }
        body = JSON.parse(rawBody);
    }
    catch {
        return json({ ok: false, error: "Invalid JSON payload." }, 400);
    }
    const parsed = leadSubmissionSchema.safeParse(body);
    if (!parsed.success)
        return json({ ok: false, error: "Please check the submitted details." }, 400);
    const filtered = Boolean(parsed.data.website.trim()) ||
        (parsed.data.elapsedMs !== undefined && parsed.data.elapsedMs < MIN_SUBMIT_TIME_MS);
    if (filtered) {
        console.info("[leads] filtered submission", {
            formType: parsed.data.formType,
            elapsedMs: parsed.data.elapsedMs ?? null,
        });
        return json({ ok: true }, 200);
    }
    try {
        const result = await storeLead(parsed.data, request);
        return json({ ok: true, duplicate: !result.created }, result.created ? 201 : 200);
    }
    catch (error) {
        console.error("[leads] submission failed", error instanceof Error ? error.name : "UnknownError");
        return json({ ok: false, error: "We could not save this request right now." }, 503, { "Retry-After": "30" });
    }
}
