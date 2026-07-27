import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-seo";
export default function sitemap(): MetadataRoute.Sitemap {
    return [
        {
            url: SITE_URL,
            lastModified: new Date("2026-07-18T00:00:00.000Z"),
        },
        {
            url: `${SITE_URL}/privacy-policy`,
            lastModified: new Date("2026-07-10T00:00:00.000Z"),
        },
        {
            url: `${SITE_URL}/cookie-policy`,
            lastModified: new Date("2026-07-10T00:00:00.000Z"),
        },
    ];
}
