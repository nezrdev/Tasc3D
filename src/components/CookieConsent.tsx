"use client";
import { useState, useSyncExternalStore } from "react";
import { Check, Cookie, Settings2, ShieldCheck, X } from "lucide-react";
const COOKIE_CONSENT_KEY = "tasc_cookie_consent_v1";
const COOKIE_CONSENT_EVENT = "tasc-cookie-consent";
type CookieConsentChoice = {
    version: 1;
    necessary: true;
    analytics: boolean;
    mode: "all" | "necessary" | "custom";
    acceptedAt: string;
};
const subscribeCookieConsent = (onStoreChange: () => void) => {
    window.addEventListener("storage", onStoreChange);
    window.addEventListener(COOKIE_CONSENT_EVENT, onStoreChange);
    return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener(COOKIE_CONSENT_EVENT, onStoreChange);
    };
};
const getCookieConsentSnapshot = () => {
    try {
        return window.localStorage.getItem(COOKIE_CONSENT_KEY) ?? "";
    }
    catch {
        return "";
    }
};
const getCookieConsentServerSnapshot = () => "";
export default function CookieConsent() {
    const storedChoice = useSyncExternalStore(subscribeCookieConsent, getCookieConsentSnapshot, getCookieConsentServerSnapshot);
    const [dismissed, setDismissed] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
    const saveChoice = (choice: Omit<CookieConsentChoice, "version" | "necessary" | "acceptedAt">) => {
        const payload: CookieConsentChoice = {
            version: 1,
            necessary: true,
            analytics: choice.analytics,
            mode: choice.mode,
            acceptedAt: new Date().toISOString(),
        };
        try {
            window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(payload));
            window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: payload }));
        }
        catch {
        }
        setDismissed(true);
    };
    if (storedChoice || dismissed) {
        return null;
    }
    return (<aside className={`cookie-consent ${settingsOpen ? "is-settings-open" : "is-compact"}`} role="dialog" aria-labelledby="cookie-consent-title" aria-live="polite">
      <div className="cookie-consent-glow" aria-hidden="true"/>
      <div className="cookie-consent-shell" data-native-wheel>
        <div className="cookie-consent-icon" aria-hidden="true">
          <Cookie size={20} strokeWidth={1.65}/>
        </div>

        <div className="cookie-consent-copy">
          <p className="cookie-consent-kicker">Privacy preferences</p>
          <h2 id="cookie-consent-title">Cookies keep this experience precise.</h2>
          <p>
            We use essential cookies to keep the site stable. Optional analytics preferences are reserved for aggregate site performance if analytics are enabled later.
          </p>
          <nav className="cookie-consent-legal" aria-label="Cookie and privacy policies">
            <a href="/cookie-policy">Cookie Policy</a>
            <span aria-hidden="true">·</span>
            <a href="/privacy-policy">Privacy Policy</a>
          </nav>

          {settingsOpen ? (<div className="cookie-consent-settings" aria-label="Cookie settings">
              <div className="cookie-consent-setting-row">
                <span>
                  <strong>Essential cookies</strong>
                  <small>Required for navigation, consent storage, and site stability.</small>
                </span>
                <span className="cookie-consent-lock">
                  <ShieldCheck size={15} strokeWidth={1.8}/>
                  Always on
                </span>
              </div>

              <button type="button" className={`cookie-consent-setting-row cookie-consent-toggle-row ${analyticsEnabled ? "is-enabled" : ""}`} aria-pressed={analyticsEnabled} onClick={() => setAnalyticsEnabled((current) => !current)}>
                <span>
                  <strong>Analytics cookies</strong>
                  <small>Currently inactive. If enabled later, they would be used only for aggregate usage insight.</small>
                </span>
                <span className="cookie-consent-switch" aria-hidden="true">
                  <span />
                </span>
              </button>
            </div>) : null}
        </div>

        <div className="cookie-consent-actions">
          <button type="button" className="cookie-consent-button cookie-consent-button-primary" aria-label="Accept cookies" onClick={() => saveChoice({ analytics: true, mode: "all" })}>
            <span className="cookie-consent-button-icon" aria-hidden="true">
              <Check size={16} strokeWidth={2}/>
            </span>
            Accept all
          </button>
          <button type="button" className="cookie-consent-button" aria-label={settingsOpen ? "Save cookie choice" : "Open cookie settings"} onClick={() => settingsOpen
            ? saveChoice({ analytics: analyticsEnabled, mode: "custom" })
            : setSettingsOpen(true)}>
            <span className="cookie-consent-button-icon" aria-hidden="true">
              <Settings2 size={16} strokeWidth={1.9}/>
            </span>
            {settingsOpen ? "Save" : "Settings"}
          </button>
          <button type="button" className="cookie-consent-button cookie-consent-button-quiet" aria-label="Use necessary cookies only" onClick={() => saveChoice({ analytics: false, mode: "necessary" })}>
            <span className="cookie-consent-button-icon" aria-hidden="true">
              <X size={16} strokeWidth={1.9}/>
            </span>
            Reject
          </button>
        </div>
      </div>
    </aside>);
}
