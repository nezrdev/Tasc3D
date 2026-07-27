import type { Metadata } from "next";
import { preload } from "react-dom";
import { TascLanding } from "@/components/TascLanding";
import { SITE_DESCRIPTION, SITE_NAME, SITE_OG_IMAGE, SITE_TITLE, SITE_URL } from "@/lib/site-seo";
const criticalMediaPreloads = [
    { href: "/media/safari-static-starfield-20260713.svg", type: "image/svg+xml" },
    { href: "/media/hero-earth-poster-1080-20260715.webp", type: "image/webp" },
    { href: "/media/hero-mission-transition-20260712.svg", type: "image/svg+xml" },
] as const;
export const metadata: Metadata = {
    alternates: {
        canonical: "/",
    },
    openGraph: {
        type: "website",
        locale: "en_US",
        url: "/",
        siteName: SITE_NAME,
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        images: [SITE_OG_IMAGE],
    },
    twitter: {
        card: "summary_large_image",
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        images: [SITE_OG_IMAGE.url],
    },
};
const organizationJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": ["Organization", "ProfessionalService"],
            "@id": `${SITE_URL}/#organization`,
            name: SITE_NAME,
            legalName: "Tasci Strategic Communications Agency FZ LLC",
            url: SITE_URL,
            logo: `${SITE_URL}/media/tasc-logo-20260710.svg`,
            description: SITE_DESCRIPTION,
            email: "info@tascagency.com",
            telephone: "+9713670826",
            areaServed: [
                { "@type": "Place", name: "Worldwide" },
                { "@type": "Country", name: "United Arab Emirates" },
            ],
            knowsAbout: [
                "Strategic communications",
                "Corporate communications",
                "Government communications",
                "International marketing",
                "Advertising",
                "Reputation management",
            ],
            contactPoint: {
                "@type": "ContactPoint",
                contactType: "business enquiries",
                email: "info@tascagency.com",
                telephone: "+9713670826",
                availableLanguage: ["English"],
                areaServed: "Worldwide",
            },
            address: {
                "@type": "PostalAddress",
                streetAddress: "Office 15, Building 4, Dubai Media City",
                addressLocality: "Dubai",
                addressCountry: "AE",
            },
        },
        {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            url: SITE_URL,
            name: SITE_NAME,
            inLanguage: "en",
            publisher: {
                "@id": `${SITE_URL}/#organization`,
            },
        },
        {
            "@type": "WebPage",
            "@id": `${SITE_URL}/#webpage`,
            url: SITE_URL,
            name: SITE_TITLE,
            description: SITE_DESCRIPTION,
            inLanguage: "en",
            isPartOf: {
                "@id": `${SITE_URL}/#website`,
            },
            about: {
                "@id": `${SITE_URL}/#organization`,
            },
        },
    ],
};
export default function Page() {
    criticalMediaPreloads.forEach((resource) => {
        preload(resource.href, {
            as: "image",
            type: resource.type,
            fetchPriority: "high",
        });
    });
    return (<>
      <script type="application/ld+json" dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd).replace(/</g, "\\u003c"),
        }}/>
      <TascLanding />
    </>);
}
