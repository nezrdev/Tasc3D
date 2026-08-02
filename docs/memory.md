# TASC 3D Current Memory

## Project State

- Worktree: `C:\workflow\Freelance\projects\tasc-3d-site`.
- Active optimization chain: T6, T13, T12, and T7 are stacked under the current T8 work.
- Current branch in this worktree: `task/t8-motion-lifecycle`, based on `2570c5d`.
- Production deployment is intentionally out of scope until separately approved.

## Runtime Decisions

- ScrollTrigger global `sort()` and `refresh()` calls are centralized through `src/lib/scroll-trigger-refresh.ts`.
- Anchor navigation must not run immediate global refresh/sort or delayed retry ladders. It applies one settled position in one animation frame and clears `data-programmatic-anchor`.
- Services keeps its authored one-viewport visual pin. The extra GSAP pin spacer flow is cancelled by `--services-pin-flow-compensation` on `.pin-spacer-services-reversible`, not by shortening the visual story.
- Refresh priority order is intentional: hero `40`, Services `30`, How entrance `25`, How reversible `20`, Datum `10`, Domino `5`.
- `src/lib/motion-input-bus.ts` is the only owner-level wheel/touch/key listener set. Services, How, Domino, and mobile portion scrolling register explicitly with priorities `100/80/70/10`; DOM `data-*` values are telemetry only.
- The motion owner watchdog is fixed at 4000 ms and releases fail-open through the normal cleanup path.
- Initial connection classification only accepts `saveData`, `slow-2g`, and `2g`. A low `downlink` value alone cannot select mobile assets; measured first-media throughput can constrain later assets.
- T8 profile bootstrap is synchronous in `layout.tsx` and sets `data-tasc-profile-ready` last; React reads it through lazy initializers but only enables motion after hydration to avoid conditional DOM mismatches.
- Mobile/desktop profile switching uses exact `> 80px` hysteresis around 900 px, including `visualViewport` resize.
- Services video identity is transport-keyed only. Same-transport profile swaps reuse the same DOM node and call `video.load()` explicitly.
- Mobile portion scrolling stops and writes through Lenis while it owns a transition, then synchronizes and resumes Lenis on every completion, interruption, watchdog release, and cleanup.
- Real Safari acceptance still requires physical macOS/iPhone Safari or an equivalent real-device remote session. Windows Playwright WebKit is regression coverage only.
- Browser QA must run against one stable local `next start` process. Do not rebuild `.next` or start a second server while Playwright/perf harnesses are running.

## Latest Evidence

- `pnpm qa:t12` passed.
- `pnpm qa:t12:browser -- --url=http://127.0.0.1:3112/ --output=output/playwright/t12-browser-seam-final-race` passed on Chromium desktop and WebKit mobile, including rapid `Services → How → Services` navigation.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:leads`, `pnpm media:verify`, and `pnpm build` passed.
- `node scripts/perf-baseline.mjs --preset=smoke --url=http://127.0.0.1:3112/ --no-server --output=docs/perf-smoke-t12-2026-08-02.json` passed with no structural failures, acceptance failures, or advisories.
- The 24-case full matrix in `output/perf/t12-perf-baseline-final.json` completed without structural failures. It still reports four acceptance failures: three WebKit normal-network preloader reveals above 2500 ms and six hidden reveal-managed elements in `webkit-mobile-large-430-1mbps`. These are carried into T8/T10 and must be green in T11.
- Independent visual review confirmed that the former WebKit mobile Services blank state is fixed: direct Services content appeared in 165 ms and rapid-return content in 153 ms, with no overflow or browser errors.
- `docs/t7-motion-input-qa-2026-08-02.json` passed static contracts plus Chromium and WebKit journeys: Services `1→2→3→2→1`, How `1→2→3→2→1`, at most one owner, watchdog fail-open, no page/critical asset errors, and no viewport teleport.
- `docs/t8-motion-lifecycle-qa-2026-08-02.json` passed Chromium and WebKit profile rotation: one runtime init, exact 80/81 hysteresis behavior, one Services video node, explicit load count on source swaps, and no nested pin spacers.
- `docs/t7-on-t8-motion-input-qa-2026-08-02.json` passed full Chromium and WebKit T7 regression on the T8 branch.
- `docs/t8-perf-smoke-2026-08-02.json` passed the Chromium mobile 390 smoke run; measured long-task sum in the first 7 seconds is 218 ms, under the 250 ms T8 target.
- The focused Chromium 390 mobile portion run passed 65/65 checks without changing its timing limits.
