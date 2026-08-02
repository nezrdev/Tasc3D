import type { NextConfig } from "next";
const nextConfig: NextConfig = {
    compress: true,
    poweredByHeader: false,
    reactStrictMode: true,
    compiler: {
        removeConsole: process.env.NODE_ENV === "production"
            ? { exclude: ["error", "warn"] }
            : false,
    },
    experimental: {
        optimizePackageImports: ["lucide-react"],
    },
};
export default nextConfig;
