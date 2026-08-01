import { z } from "zod";
import { LEAD_FORM_TYPES, MAX_LEAD_ELAPSED_MS } from "@/lib/lead-contract";
export { MAX_LEAD_ELAPSED_MS } from "@/lib/lead-contract";
export const leadSubmissionSchema = z
    .object({
    formType: z.enum(LEAD_FORM_TYPES),
    email: z.string().trim().toLowerCase().max(254).email(),
    consent: z.literal(true),
    website: z.string().max(200).default(""),
    elapsedMs: z.number().int().min(0).max(MAX_LEAD_ELAPSED_MS).optional(),
    startedAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
})
    .strict()
    .superRefine((value, context) => {
    if (value.elapsedMs === undefined && value.startedAt === undefined) {
        context.addIssue({
            code: "custom",
            path: ["elapsedMs"],
            message: "Submission timing is required.",
        });
    }
});
export type LeadSubmissionInput = z.infer<typeof leadSubmissionSchema>;
