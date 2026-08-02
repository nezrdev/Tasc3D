# T10 Map, Config, and Metadata Evidence

## Scope

- Replaced the Process contact card's eager third-party Google Maps iframe with the local `public/media/tasc-office-map-static-20260802.webp` preview.
- Kept the existing normal `Open in Google Maps` link as the only map interaction; no API key or background iframe request is used.
- Removed the obsolete map-arming prop/data attribute and the now-unused embed URL export.
- Corrected the Vision logo intrinsic metadata from `3430x2160` to the source asset's measured `1600x1008` dimensions. CSS sizing remains unchanged.
- Added `experimental.optimizePackageImports` for `lucide-react`.
- Enabled production console removal while preserving `console.warn` and `console.error`.
- Removed the application `/media/:path*` response-header block so media response ownership stays outside Next.js.
- Replaced sitemap `Date` construction with stable ISO date strings: site content `2026-08-02`; both policy pages `2026-07-10`, matching their visible effective/updated dates.

## Static Asset

- Path: `public/media/tasc-office-map-static-20260802.webp`
- Dimensions: `1152x890`
- Size: `91,448` bytes
- SHA-256: `B759E2EB388E8A026D665F498F56E11AC00CE5C5AF00741720D6CBCD76CD03B6`

The preview was captured from the existing public Google Maps embed without an API key and retains the rendered map attribution. It is served locally and lazy-loaded through `next/image`.

## Live Header Check Before Deployment

Read-only checks were run against `https://tascagency.com` on 2026-08-02. No server configuration or deployment was changed.

```text
GET /
HTTP/1.1 200 OK
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0
Pragma: no-cache
Expires: 0
```

```text
GET /media/hero-earth-poster-1080-20260715.webp
Range: bytes=0-1

HTTP/1.1 206 Partial Content
Content-Length: 2
Cache-Control: max-age=31536000
Cache-Control: public, max-age=31536000, immutable
Accept-Ranges: bytes
Content-Range: bytes 0-1/198190
```

The live site therefore already supports byte ranges and immutable media caching, but currently emits duplicate `Cache-Control` fields. This T10 change removes Next.js as a second possible media-header owner. After a separately approved deployment, the same read-only range request must be repeated. If duplicate fields remain, the remaining overlap is inside Nginx (`expires` plus `add_header`) and must be corrected there rather than reintroduced in the application.

## Verification

- `pnpm lint`: pass.
- `pnpm typecheck`: pass after the parallel T10 cleanup settled.
- Focused ESLint for all TypeScript files in this package: pass.
- Focused `git diff --check`: pass; only line-ending normalization notices were reported.
