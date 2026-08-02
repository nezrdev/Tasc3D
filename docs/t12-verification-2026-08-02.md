# T12 Verification

## Scope

T12 removes the Services and How We Work pin conflict, centralizes global ScrollTrigger refreshes, and makes anchor navigation settle once without retry ladders.

## Automated Checks

- `pnpm qa:t12`: pass.
- `pnpm qa:t12:browser -- --url=http://127.0.0.1:3112/ --output=output/playwright/t12-browser-seam-final-clean3`: pass on Chromium desktop and WebKit mobile.
- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test:leads`: pass.
- `pnpm media:verify`: pass.
- `pnpm build`: pass.
- `node scripts/perf-baseline.mjs --preset=smoke --url=http://127.0.0.1:3112/ --no-server --output=docs/perf-smoke-t12-2026-08-02.json`: pass.

## Browser Evidence

The browser seam run verifies all eight anchors, exact one-viewport Services pin geometry, no horizontal overflow, and visible Services and How content.

- `output/playwright/t12-browser-seam-final-clean3/summary.json`
- `output/playwright/t12-browser-seam-final-clean3/chromium-desktop/services-seam.png`
- `output/playwright/t12-browser-seam-final-clean3/chromium-desktop/how-seam.png`
- `output/playwright/t12-browser-seam-final-clean3/webkit-mobile/services-seam.png`
- `output/playwright/t12-browser-seam-final-clean3/webkit-mobile/how-seam.png`

Independent code and visual reviews found no blocking issues. The WebKit mobile Services screenshot is intentionally restrained but no longer blank.

## Full Matrix Carry-Forward

`output/perf/t12-perf-baseline-final.json` completed all 24 cases with no structural failures. It reports four acceptance failures:

- `webkit-desktop-1440-normal`: preloader reveal 2829 ms.
- `webkit-mac-1280-normal`: preloader reveal 3083 ms.
- `webkit-mobile-390-normal`: preloader reveal 3113 ms.
- `webkit-mobile-large-430-1mbps`: six reveal-managed elements remained hidden.

These are not waived. T8 and T10 own the relevant runtime/preloader reductions, and T11 must rerun the full matrix successfully.

## Acceptance Boundary

Windows Playwright WebKit is regression coverage, not physical Safari acceptance. Real macOS/iPhone Safari remains the final external acceptance boundary. No merge or production deployment is part of T12.
