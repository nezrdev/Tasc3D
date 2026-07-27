import type { NextConfig } from "next";
const nextConfig: NextConfig = {
    compress: true,
    poweredByHeader: false,
    reactStrictMode: true,
    async headers() {
        return [
            {
                source: "/media/:path*",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, max-age=31536000, immutable",
                    },
                    {
                        key: "Accept-Ranges",
                        value: "bytes",
                    },
                ],
            },
        ];
    },
};
export default nextConfig;
