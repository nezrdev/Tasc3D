"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { LeadFormType, LeadSubmitState } from "@/lib/lead-contract";
const IDLE_STATE: LeadSubmitState = { status: "idle", message: "" };
const REQUEST_TIMEOUT_MS = 10000;
export function useLeadSubmission(formType: LeadFormType) {
    const [state, setState] = useState<LeadSubmitState>(IDLE_STATE);
    const startedAt = useRef(0);
    useEffect(() => {
        startedAt.current = Date.now();
    }, []);
    const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity())
            return false;
        const data = new FormData(form);
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
                    startedAt: startedAt.current,
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
            startedAt.current = Date.now();
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
    return { state, submit };
}
