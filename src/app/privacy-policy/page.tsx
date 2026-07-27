import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_OG_IMAGE } from "@/lib/site-seo";
const privacyDescription = "Privacy Policy for TASC Strategic Communications.";
export const metadata: Metadata = {
    title: "Privacy Policy",
    description: privacyDescription,
    alternates: {
        canonical: "/privacy-policy",
    },
    openGraph: {
        type: "website",
        locale: "en_US",
        url: "/privacy-policy",
        siteName: SITE_NAME,
        title: "Privacy Policy | TASC",
        description: privacyDescription,
        images: [SITE_OG_IMAGE],
    },
    twitter: {
        card: "summary_large_image",
        title: "Privacy Policy | TASC",
        description: privacyDescription,
        images: [SITE_OG_IMAGE.url],
    },
};
const updatedDate = "July 10, 2026";
const sections = [
    {
        title: "1. Who We Are",
        body: [
            'This Privacy Policy is issued by Tasci Strategic Communications Agency FZ LLC ("TASC," "we," "us," "our"), operator of tascagency.com (the "Site") and provider of strategic communications, marketing, advertising, research, and related services (the "Services").',
            'This Policy explains what personal data we collect through the Site, why, how we use and protect it, and what rights you have. It is written to comply with the UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data ("UAE PDPL"). Because our clients and website visitors are located worldwide, including in the European Economic Area and United Kingdom, we also apply the relevant principles of the EU/UK General Data Protection Regulation ("GDPR") where they set a higher standard than UAE PDPL, and we extend GDPR-equivalent rights to individuals located in those regions regardless of where our systems are hosted.',
            "For privacy matters, contact: info@tascagency.com. Office address: Office 15, Building 4, Media City, Dubai, UAE.",
        ],
    },
    {
        title: "2. Scope",
        body: [
            "This Policy covers personal data collected when you submit an enquiry through our contact form, contact us directly by email or phone, or otherwise visit and interact with the Site.",
            "It applies regardless of whether you contact us as an individual, or on behalf of a company, brand, agency, or government entity.",
            "For cookies and tracking technologies, see our separate Cookie Policy.",
        ],
    },
    {
        title: "3. What Data We Collect",
        body: [
            "Through the Site forms we collect only your email address, the form you used, the time and version of your consent, the page path, and any standard UTM campaign parameters already present in that page URL. If you contact us directly, we also receive whatever information you choose to include in that communication.",
            "Our web server may process IP address, browser and request metadata in short-lived security and operational logs. Raw IP addresses and user-agent strings are not stored in the lead-submissions database.",
            "We do not request, and do not knowingly collect, payment card data, government ID numbers, precise geolocation, or special-category data such as health, political opinion, or religion.",
        ],
    },
    {
        title: "4. Organisational vs. Personal Data",
        body: [
            "Where you submit an enquiry on behalf of an organisation, we treat any business context you choose to share in your message as confidential, separately from your personal data as the individual submitting it.",
            "Any additional confidentiality terms will be governed by a separate agreement, such as an NDA, where one is put in place between TASC and your organisation.",
        ],
    },
    {
        title: "5. Why We Collect It",
        body: [
            "We collect personal data to respond to enquiries, coordinate and deliver contracted Services once engaged, maintain internal client and prospect records, and protect Site security.",
            "We do not currently send marketing communications to contacts collected via the Site. If this changes in future, we will introduce a separate, specific consent mechanism before doing so.",
        ],
    },
    {
        title: "6. How We Use Your Data",
        body: [
            "We use the data collected strictly to read and respond to your enquiry, coordinate and deliver Services if we enter into an engagement, and support internal reporting and business development in aggregate or anonymised form where possible.",
            "We do not sell your personal data, and we do not use contact data to build advertising profiles for unrelated third parties.",
        ],
    },
    {
        title: "7. Who We Share Data With",
        body: [
            "Site-form enquiries are stored in a dedicated PostgreSQL database on the same protected application VPS as the Site. Amazon Web Services provides the underlying infrastructure in its Europe (Stockholm) Region in Sweden. The database is not exposed to the public internet, and form data is not routed through a third-party CRM, marketing platform, or automation tool.",
            "We may share information with authorised TASC personnel and service providers needed to respond to an enquiry or deliver an agreed project, only to the extent necessary and subject to appropriate confidentiality and data-protection obligations.",
        ],
    },
    {
        title: "8. International Data Transfers",
        body: [
            "Site-form data is hosted in Sweden and may therefore be transferred from your location, including from the UAE, to the European Union. We use access controls, encrypted HTTPS transport, restricted database permissions, and contractual or legal safeguards appropriate to the transfer.",
            "If the hosting location or material processing arrangements change, we will update this section before relying on the new arrangement for Site-form submissions.",
        ],
    },
    {
        title: "9. Data Retention",
        body: [
            "Site-form enquiries that do not lead to an engagement are retained for up to 180 days from submission and are then deleted, unless you request earlier deletion or a longer period is required to establish, exercise, or defend legal claims.",
            "If an enquiry becomes an active client engagement, related contract and correspondence records are retained under the applicable agreement and statutory retention requirements.",
        ],
    },
    {
        title: "10. Your Rights",
        body: [
            "Under UAE PDPL, and under GDPR if you are located in the EEA or UK, you have the right to access the data we hold about you, correct inaccurate data, delete your data subject to legal or contractual retention requirements, restrict or object to processing, withdraw consent where processing is based on consent, request data portability where technically feasible, and complain to the relevant authority.",
            "To exercise any right, email info@tascagency.com. We aim to respond within 30 days, subject to any lawful extension or identity-verification requirement.",
        ],
    },
    {
        title: "11. Data Security",
        body: [
            "We apply reasonable technical and organisational safeguards appropriate to the nature and volume of data we hold. Since our enquiry data is stored on a self-hosted database on our own server, access is restricted to authorised TASC personnel.",
            "If a personal-data breach requires notification, we will notify the relevant authority and affected individuals as required by applicable law.",
        ],
    },
    {
        title: "12. Confidentiality of Business Information",
        body: [
            "Any commercially sensitive information you choose to share with us in an enquiry is treated as confidential and is not disclosed outside the TASC team members directly involved in evaluating or responding to it, except as required by law or with your consent.",
        ],
    },
    {
        title: "13. Children",
        body: [
            "The TASC website and service offering are directed at businesses, organisations, and professionals - not at individuals under 18. We do not knowingly collect data from minors.",
        ],
    },
    {
        title: "14. Changes to This Policy",
        body: [
            'We may update this Policy periodically. The "Last Updated" date above reflects the latest revision. Material changes will be posted on the Site.',
        ],
    },
    {
        title: "15. Contact",
        body: ["Tasci Strategic Communications Agency FZ LLC", "info@tascagency.com", "Office 15, Building 4, Dubai Media City, Dubai, UAE"],
    },
];
export default function PrivacyPolicyPage() {
    return (<main className="legal-page">
      <div className="legal-page-inner">
        <Link className="legal-page-back" href="/">
          Back to site
        </Link>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Effective Date: {updatedDate} | Last Updated: {updatedDate}</p>
        {sections.map((section) => (<section key={section.title}>
            <h2>{section.title}</h2>
            {section.body.map((paragraph) => (<p key={paragraph}>{paragraph}</p>))}
          </section>))}
      </div>
    </main>);
}
