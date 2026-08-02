# TASC 3D Current Memory

## Project State

- Worktree: `C:\workflow\Freelance\projects\tasc-3d-site`.
- Active optimization chain: T6 and T13 are already stacked under the current T12 work.
- Current branch in this worktree: `task/t12-pin-seams`, based on `9d9b6f1`.
- Production deployment is intentionally out of scope until separately approved.

## Runtime Decisions

- ScrollTrigger global `sort()` and `refresh()` calls are centralized through `src/lib/scroll-trigger-refresh.ts`.
- Anchor navigation must not run immediate global refresh/sort or delayed retry ladders. It applies one settled position in one animation frame and clears `data-programmatic-anchor`.
- Services keeps its authored one-viewport visual pin. The extra GSAP pin spacer flow is cancelled by `--services-pin-flow-compensation` on `.pin-spacer-services-reversible`, not by shortening the visual story.
- Refresh priority order is intentional: hero `40`, Services `30`, How entrance `25`, How reversible `20`, Datum `10`, Domino `5`.
- Real Safari acceptance still requires physical macOS/iPhone Safari or an equivalent real-device remote session. Windows Playwright WebKit is regression coverage only.

## Latest Evidence

- `pnpm qa:t12` passed.
- `pnpm qa:t12:browser -- --url=http://127.0.0.1:3112/ --output=output/playwright/t12-browser-seam-final-race` passed on Chromium desktop and WebKit mobile, including rapid `Services → How → Services` navigation.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:leads`, `pnpm media:verify`, and `pnpm build` passed.
- `node scripts/perf-baseline.mjs --preset=smoke --url=http://127.0.0.1:3112/ --no-server --output=docs/perf-smoke-t12-2026-08-02.json` passed with no structural failures, acceptance failures, or advisories.
- The 24-case full matrix in `output/perf/t12-perf-baseline-final.json` completed without structural failures. It still reports four acceptance failures: three WebKit normal-network preloader reveals above 2500 ms and six hidden reveal-managed elements in `webkit-mobile-large-430-1mbps`. These are carried into T8/T10 and must be green in T11.
- Independent visual review confirmed that the former WebKit mobile Services blank state is fixed: direct Services content appeared in 165 ms and rapid-return content in 153 ms, with no overflow or browser errors.
