import "server-only";
import { getDatabase } from "@/server/db";
import type { LeadSubmissionInput } from "@/server/lead-schema";
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
function getAttribution(request: Request) {
    const referrer = request.headers.get("referer");
    if (!referrer)
        return { sourcePath: null, utm: {} };
    try {
        const url = new URL(referrer);
        const utm = Object.fromEntries(ATTRIBUTION_KEYS.flatMap((key) => {
            const value = url.searchParams.get(key)?.trim().slice(0, 160);
            return value ? [[key, value]] : [];
        }));
        return {
            sourcePath: `${url.pathname}${url.hash}`.slice(0, 512),
            utm,
        };
    }
    catch {
        return { sourcePath: null, utm: {} };
    }
}
export async function storeLead(input: LeadSubmissionInput, request: Request) {
    const sql = getDatabase();
    const { sourcePath, utm } = getAttribution(request);
    const consentVersion = process.env.LEADS_CONSENT_VERSION || "2026-07-10-v1";
    const dedupeBucket = Math.floor(Date.now() / DEDUPE_WINDOW_MS);
    const result = await sql `
    insert into leads.lead_submissions (
      form_type,
      email,
      consent_version,
      source_path,
      utm,
      dedupe_bucket
    ) values (
      ${input.formType},
      ${input.email},
      ${consentVersion},
      ${sourcePath},
      ${JSON.stringify(utm)}::jsonb,
      ${dedupeBucket}
    )
    on conflict (form_type, email, dedupe_bucket) do nothing
  `;
    return { created: result.count === 1 };
}
