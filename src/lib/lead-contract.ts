export const LEAD_FORM_TYPES = ["datum_waitlist", "project_brief"] as const;
export type LeadFormType = (typeof LEAD_FORM_TYPES)[number];
export type LeadSubmitStatus = "idle" | "submitting" | "success" | "error";
export type LeadSubmitState = {
    status: LeadSubmitStatus;
    message: string;
};
