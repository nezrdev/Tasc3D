import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-seo";

const SITE_CONTENT_LAST_MODIFIED = "2026-08-02";
const POLICY_LAST_MODIFIED = "2026-07-10";

export default function sitemap(): MetadataRoute.Sitemap {
    return [
        {
            url: SITE_URL,
            lastModified: SITE_CONTENT_LAST_MODIFIED,
        },
        {
            url: `${SITE_URL}/privacy-policy`,
            lastModified: POLICY_LAST_MODIFIED,
        },
        {
            url: `${SITE_URL}/cookie-policy`,
            lastModified: POLICY_LAST_MODIFIED,
        },
    ];
}
