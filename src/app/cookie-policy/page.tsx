import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_OG_IMAGE } from "@/lib/site-seo";
const cookieDescription = "Cookie Policy for TASC Strategic Communications.";
export const metadata: Metadata = {
    title: "Cookie Policy",
    description: cookieDescription,
    alternates: {
        canonical: "/cookie-policy",
    },
    openGraph: {
        type: "website",
        locale: "en_US",
        url: "/cookie-policy",
        siteName: SITE_NAME,
        title: "Cookie Policy | TASC",
        description: cookieDescription,
        images: [SITE_OG_IMAGE],
    },
    twitter: {
        card: "summary_large_image",
        title: "Cookie Policy | TASC",
        description: cookieDescription,
        images: [SITE_OG_IMAGE.url],
    },
};
const updatedDate = "July 10, 2026";
export default function CookiePolicyPage() {
    return (<main className="legal-page">
      <div className="legal-page-inner">
        <Link className="legal-page-back" href="/">
          Back to site
        </Link>
        <h1>Cookie Policy</h1>
        <p className="legal-updated">Effective Date: {updatedDate} | Last Updated: {updatedDate}</p>

        <section>
          <h2>Overview</h2>
          <p>
            {'This Cookie Policy explains how Tasci Strategic Communications Agency FZ LLC, operator of tascagency.com ("TASC," "we," "us"), uses cookies and similar technologies on the Site. It supplements our Privacy Policy.'}
          </p>
        </section>

        <section>
          <h2>1. What Are Cookies</h2>
          <p>Cookies are small text files placed on your device when you visit a website.</p>
        </section>

        <section>
          <h2>2. Categories of Cookies We Use</h2>
          <div className="legal-table" role="table" aria-label="Cookie categories">
            <div className="legal-table-row" role="row">
              <span role="columnheader">Category</span>
              <span role="columnheader">Purpose</span>
              <span role="columnheader">Examples</span>
              <span role="columnheader">Requires consent?</span>
            </div>
            <div className="legal-table-row" role="row">
              <span role="cell">Strictly necessary</span>
              <span role="cell">Core site function, security, remembering your cookie choice</span>
              <span role="cell">session cookie, cookie-consent state</span>
              <span role="cell">No</span>
            </div>
          </div>
          <p>
            We do not currently use analytics, marketing/retargeting, or advertising cookies on this Site. The contact
            section may embed Google Maps, which can use third-party cookies or similar technologies according to
            {"Google's own policies."}
          </p>
        </section>

        <section>
          <h2>3. Cookie Table</h2>
          <div className="legal-table" role="table" aria-label="Cookie table">
            <div className="legal-table-row" role="row">
              <span role="columnheader">Cookie Name</span>
              <span role="columnheader">Provider</span>
              <span role="columnheader">Purpose</span>
              <span role="columnheader">Duration</span>
            </div>
            <div className="legal-table-row" role="row">
              <span role="cell">tasc_cookie_consent_v1</span>
              <span role="cell">TASC own domain</span>
              <span role="cell">Stores your cookie preference</span>
              <span role="cell">Persistent until changed or cleared</span>
            </div>
          </div>
          <p>Table to be updated if any additional cookie or tracking technology is introduced.</p>
        </section>

        <section>
          <h2>4. Your Choices</h2>
          <p>
            On first visit, a cookie banner built in-house lets you accept cookies, open cookie settings, save your
            choice, or use necessary cookies only.
          </p>
          <p>
            Since we currently only use strictly necessary cookies, declining does not affect your ability to browse the
            Site.
          </p>
        </section>

        <section>
          <h2>5. Third-Party Cookies</h2>
          <p>
            The Site may include an embedded Google Maps view for office location context. Google may set its own
            cookies or similar technologies when that map is loaded. Other than this map embed, we do not currently use
            third-party analytics, marketing pixels, or retargeting tools.
          </p>
        </section>

        <section>
          <h2>6. Changes to This Policy</h2>
          <p>
            We will update this Cookie Policy before introducing any new cookie or tracking technology - not
            {'retroactively. The "Last Updated" date above reflects the latest revision.'}
          </p>
        </section>

        <section>
          <h2>7. Contact</h2>
          <p>info@tascagency.com</p>
        </section>
      </div>
    </main>);
}
