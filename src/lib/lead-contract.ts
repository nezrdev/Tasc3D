export const LEAD_FORM_TYPES = ["datum_waitlist", "project_brief"] as const;
export const MAX_LEAD_ELAPSED_MS = 24 * 60 * 60 * 1000;
export type LeadFormType = (typeof LEAD_FORM_TYPES)[number];
export type LeadSubmitStatus = "idle" | "submitting" | "success" | "error";
export type LeadSubmitState = {
    status: LeadSubmitStatus;
    message: string;
};
