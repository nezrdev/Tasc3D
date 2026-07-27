import { z } from "zod";
import { LEAD_FORM_TYPES } from "@/lib/lead-contract";
export const leadSubmissionSchema = z
    .object({
    formType: z.enum(LEAD_FORM_TYPES),
    email: z.string().trim().toLowerCase().max(254).email(),
    consent: z.literal(true),
    website: z.string().max(200).default(""),
    startedAt: z.number().int().positive(),
})
    .strict();
export type LeadSubmissionInput = z.infer<typeof leadSubmissionSchema>;
