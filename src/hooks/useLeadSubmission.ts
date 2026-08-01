"use client";
import { useCallback, useRef, useState, type FormEvent } from "react";
import {
    MAX_LEAD_ELAPSED_MS,
    type LeadFormType,
    type LeadSubmitState,
} from "@/lib/lead-contract";
const IDLE_STATE: LeadSubmitState = { status: "idle", message: "" };
const REQUEST_TIMEOUT_MS = 10000;
export function useLeadSubmission(formType: LeadFormType) {
    const [state, setState] = useState<LeadSubmitState>(IDLE_STATE);
    const firstInteractionAt = useRef<number | null>(null);
    const captureFirstInteraction = useCallback(() => {
        if (firstInteractionAt.current === null)
            firstInteractionAt.current = performance.now();
    }, []);
    const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity())
            return false;
        const data = new FormData(form);
        const rawElapsedMs = firstInteractionAt.current === null
            ? 0
            : performance.now() - firstInteractionAt.current;
        const elapsedMs = Number.isFinite(rawElapsedMs)
            ? Math.min(MAX_LEAD_ELAPSED_MS, Math.max(0, Math.round(rawElapsedMs)))
            : 0;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        setState({ status: "submitting", message: "Sending..." });
        try {
            const response = await fetch("/api/leads", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    formType,
                    email: String(data.get("email") || ""),
                    consent: data.get("privacy") === "on",
                    website: String(data.get("website") || ""),
                    elapsedMs,
                }),
                signal: controller.signal,
            });
            const payload = (await response.json().catch(() => null)) as {
                ok?: boolean;
                error?: string;
            } | null;
            if (!response.ok || !payload?.ok) {
                const message = response.status === 429
                    ? "Too many attempts. Please wait a moment and try again."
                    : payload?.error || "We could not send this right now. Please try again.";
                setState({ status: "error", message });
                return false;
            }
            form.reset();
            firstInteractionAt.current = null;
            setState({
                status: "success",
                message: formType === "datum_waitlist" ? "You're on the waitlist. Thank you." : "Thank you — your enquiry has been received.",
            });
            return true;
        }
        catch {
            setState({ status: "error", message: "We could not send this right now. Please try again." });
            return false;
        }
        finally {
            window.clearTimeout(timeout);
        }
    }, [formType]);
    return { state, submit, captureFirstInteraction };
}
