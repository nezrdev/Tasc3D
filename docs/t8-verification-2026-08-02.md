# T8 Verification

## Scope

T8 makes the runtime profile deterministic before hydration, prevents viewport/profile changes from rebuilding the GSAP runtime, and preserves one Services video element while its mobile or desktop source changes.

## Implemented Contracts

- `layout.tsx` publishes the complete bootstrap profile synchronously and writes `data-tasc-profile-ready` last.
- React reads device/profile values through lazy initializers while motion remains disabled until hydration completes, avoiding conditional-DOM hydration drift.
- Mobile and desktop transport selection changes only after a viewport-width delta greater than 80 px; an exact 80 px change does not switch profile.
- The main GSAP/ScrollTrigger runtime initializes once and reads current device/viewport values through refs.
- Explicit constrained signals are latched independently from measured first-media throughput. A late throughput measurement can constrain lower media without replacing the active Services source.
- Services uses a transport-only React key. Mobile/desktop source changes reuse one DOM node and call `load()` explicitly once per source transition.

## Green Checks

- `pnpm qa:t8 -- --url=http://127.0.0.1:3120/`: pass in Chromium and WebKit.
- Exact profile journey: `960 → 880 → 879 → 959 → 960`; runtime init count remains `1`, Services node identity remains `1`, and nested pin spacer count remains `0`.
- `pnpm qa:t7 -- --url=http://127.0.0.1:3120/ --engines=chromium,webkit`: pass on the current production build. Services remains `1→2→3→2→1`; How remains `1→2→3→2→1`.
- A synthetic desktop `downlink=0.35` plus measured constrained throughput keeps the desktop Services source instead of swapping it during playback.
- Focused Chromium 390 mobile portion QA: pass, 65/65 checks, unchanged 420 ms timing contract.
- Chromium mobile 390 performance smoke: 218 ms total long-task time in the first 7 seconds, below the 250 ms target; preloader reveal 1408.9 ms; non-Hero startup bytes 710015.
- `pnpm qa:t12`, `pnpm lint`, `pnpm typecheck`, `pnpm test:leads`, `pnpm media:verify`, `pnpm build`, and `git diff --check`: pass.

## Evidence

- `docs/t8-motion-lifecycle-qa-2026-08-02.json`
- `docs/t7-on-t8-motion-input-qa-2026-08-02.json`
- `docs/t8-perf-smoke-2026-08-02.json`

## Acceptance Boundary

The branch is not merged or deployed. Windows Playwright WebKit is regression coverage; physical macOS/iPhone Safari remains an external T11 acceptance step.
