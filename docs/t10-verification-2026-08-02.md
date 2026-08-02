# T10 Cleanup and Delivery Verification

## Scope

- Archived five confirmed-unused media variants outside `public/` with a reversible SHA-256 manifest.
- Reduced the delivered public payload from 82,239,148 bytes to 47,955,173 bytes.
- Subset the authored Roboto and Suisse families to weights 300, 400, and 700; the six delivered fonts total 75,124 bytes.
- Replaced the eager Google Maps iframe with a 91,448-byte local static preview and an explicit external Google Maps link.
- Removed obsolete media telemetry, constant flow gates, unreachable animation bodies, and closed-menu header listeners while preserving the active Services FSM and T7 input ownership.
- Added production console removal with `error` and `warn` preserved, optimized `lucide-react` imports, corrected the Vision logo intrinsic dimensions, and gave sitemap content a stable modification date.

## Verification

- `pnpm qa:t10` passed 17/17 cleanup checks, including the actual SHA-256 of every archived binary, a public payload ceiling of 61 MiB, and a font ceiling of 80 KiB.
- `pnpm check` passed lint, typecheck, 8/8 lead tests, 20/20 runtime media contracts, and the production build.
- `docs/t10-final-t9-decomposition-2026-08-02.json` passed Chromium and WebKit with exactly one authored section instance, one motion runtime, one Services video, one Datum video, and two Domino direction videos.
- `docs/t10-final-t8-lifecycle-2026-08-02.json` passed Chromium and WebKit profile swaps, exact 80 px hysteresis, same-node Services source replacement, and reduced-motion teardown/restart.
- `docs/t10-final-motion-input-2026-08-02.json` passed Chromium and WebKit Services `1-2-3-2-1`, How `1-2-3-2-1`, one input owner, the four-second fail-open watchdog, no viewport teleport, and current BUILD_ID verification.
- `docs/t10-final-journey-summary-2026-08-02.json` passed 4/4 cold-cache normal-network journeys across Chromium/WebKit and desktop wheel/mobile touch. Cross-engine normalized speed ratios were 1.000 desktop and 1.025 mobile.

## Atomic commits

- `aaad90a` archives unused delivery media with a reversible manifest.
- `c985270` subsets the authored local font families.
- `da7a494` replaces the eager map and stabilizes delivery metadata/configuration.
- `9e6c6ff` removes obsolete runtime state and unreachable motion branches.

## Delivery boundary

- This evidence was produced from a local production build. No merge or deployment was performed.
- Production Nginx remains the sole immutable-cache owner for `/media`; T11 must verify the live cache/range contract and the removal of duplicate headers after deployment.
- Windows Playwright WebKit is automated regression coverage, not physical macOS or iPhone Safari acceptance.
