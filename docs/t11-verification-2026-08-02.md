# T11 Final Verification

## Candidate

- Branch: `task/t11-final-verification`, stacked on `task/t10-cleanup-and-delivery`.
- Candidate parent: `4d6df7ecee5665fe516d91e9868fed85e0dbf589`.
- Production build: `3il90V6IuZEtqb2tTRyTJ`, served by one stable `next start` process at `http://127.0.0.1:3151/`.
- Environment: Node `v24.11.0`, pnpm `10.33.0`, Playwright `1.62.1`.
- No merge and no deployment were performed.

## Final runtime changes

- Services refreshes now preserve active story ownership and correct the native lock position instead of releasing the story during viewport/profile changes.
- `#work` navigation rejects a stale ScrollTrigger start above the authored How section and falls back to the section position.
- Domino media failures now fail open through the same direction-aware boundary release used by successful playback. Forward failure exposes the form; reverse failure hands control back toward Process. The document and Lenis are never left locked.
- Completed Domino state explicitly exposes the form, controls, and privacy row on every viewport.
- Seam QA isolates navigation from cookie consent, while a separate cold first-visit suite verifies the real consent flow.

## Green gates

- `pnpm lint`, `pnpm typecheck`, `pnpm test:leads` (8/8), `pnpm media:verify` (20/20), `pnpm qa:t6`, `pnpm qa:t10` (17/17), `pnpm qa:t12`, and `pnpm qa:t9` passed.
- `docs/t11-motion-input-authoritative-2026-08-02.json` passed Chromium and WebKit with exact Services `1-2-3-2-1`, How `1-2-3-2-1`, one input owner, watchdog fail-open, no critical asset/runtime errors, and no viewport teleport.
- `docs/t11-focused-regression-authoritative-2026-08-02.json` passed Chromium and WebKit desktop-to-mobile Services source swaps. The same video node was retained, `load()` ran once, and both engines still reached `1-2-3-2-1`.
- `docs/t11-t8-lifecycle-final-2026-08-02.json` passed both engines for profile hysteresis, source replacement, one runtime, and reduced-motion teardown/restart.
- `docs/t11-t9-decomposition-final-2026-08-02.json` passed both engines with one authored instance of every extracted section and one runtime-owned media/story graph.
- `docs/t11-first-visit-smoke-2026-08-02.json` passed 4/4 cold Chromium/WebKit desktop/mobile visits: consent was initially absent, persisted after acceptance, Contact navigation resolved, and no browser errors occurred. Screenshots are stored beside the report.
- `output/playwright/t11-t12-seams-final/summary.json` passed 2/2 Services/How seam cases, including rapid return on WebKit mobile.
- `output/playwright/t11-t6-fault-final/summary.json` passed 8/8 forward/reverse Domino transport-failure cases across Chromium/WebKit desktop/mobile.
- `work/t11-webgl-lifecycle-authoritative-2026-08-02.json` passed 3/3 default and forced-packed WebGL lifecycle cases.
- A local media range request returned `206`, `Content-Range: bytes 0-31/4060298`, and `Content-Length: 32`.

## Performance matrix

- `docs/t11-perf-full-2026-08-02.json` completed all 24 Chromium/WebKit, desktop/mobile, normal/Fast 3G/1 Mbps cases.
- Structural failures: `0`. Acceptance failures: `0`.
- Twelve non-blocking WebKit throttle advisories remain: preloader reveal is about `5.1-8.0 s` on Fast 3G/1 Mbps, and the mobile non-Hero startup lower bound is about `1.66 MB` versus the advisory `1.5 MB` target. No reveal-managed content remained hidden.

## Strict mobile portion evidence

- The unmodified strict harness result is `work/t11-mobile-portions-final-clean-2026-08-02.json`: Chromium 390 and 430 passed 65/65 each.
- Windows Playwright WebKit 390 and 430 selected every expected index, settled at the final target with `0 px` error, preserved functional ownership/geometry/monotonic checks, but exceeded six rapid-retarget timing assertions: terminal timing was about `1.91-2.15 s` against the `1.62 s` ceiling.
- The harness was not weakened. This timing result remains explicitly assigned to physical iPhone/macOS Safari acceptance because Windows WebKit uses synthetic untrusted touch events and is not real iOS momentum/compositor evidence.

## Supplemental journey boundary

- The exhaustive eight-case cross-device journey was timeboxed after one complete passing case and a partial second case because one case took roughly nine minutes. It is not reported as a full pass.
- Current-code coverage instead comes from the 24-case performance matrix, exact motion/story gates, source-swap regression, first-visit smoke, seam QA, Domino fault QA, WebGL lifecycle, and the earlier T10 4/4 cold normal-network journey.

## External acceptance and delivery boundary

- Physical iPhone Safari/Chrome, Android Chrome, and macOS Safari remain the external acceptance step described in `docs/t5-physical-safari-acceptance.md`.
- The currently deployed site is an older build. Its Nginx path still emits duplicate media `Cache-Control` values; the application-side duplicate was removed in T10, but live confirmation requires an approved deployment and infrastructure-owner verification.
- Real PostgreSQL lead persistence still requires an authorized staging/production database. Local route/store tests cover validation, honeypot behavior, elapsed-time handling, and the client clock being five minutes ahead.
- T11 software scope is ready for review as a draft PR. Production remains unchanged until explicit merge/deploy approval.
