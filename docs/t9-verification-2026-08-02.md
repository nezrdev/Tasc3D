# T9 Landing Decomposition Verification

## Scope

- Extracted the Hero, Services, Datum, and Domino JSX roots into section components without changing authored markup.
- Consolidated the 25 landing media states behind `useMediaOrchestrator` while keeping profile selection and preloader ownership separate.
- Moved Services input motorics, pending intent, ownership, and pinned-scroll cleanup into `useServicesStory` without adding a second GSAP lifecycle.
- Memoized `Galaxy` and `PackedAlphaVideo` while preserving their public props and forwarded refs.

## Atomic commits

- `969cd0e` - section extraction.
- `bb1c663` - T9 structural regression gate.
- `4de0c54` - lead test routing for extracted sections.
- `9cb7b74` - media reducer orchestration.
- `7d8392e` - Services input story extraction.
- `1859834` - visual media memoization.

## Verification

- `pnpm check` passed: lint, typecheck, 8/8 lead tests, 20/20 runtime media contracts, and production build.
- `docs/t9-final-decomposition-2026-08-02.json` passed in Chromium and WebKit with one copy of every section, one runtime initialization, one Services video, one Datum video, and two authored Domino direction videos.
- `docs/t9-final-t8-lifecycle-2026-08-02.json` passed Chromium and WebKit profile rotation, exact 80/81 viewport hysteresis, same-node Services source swaps, and reduced-motion teardown/restart.
- `docs/t9-final-motion-input-2026-08-02.json` passed Chromium and WebKit Services `1-2-3-2-1`, How `1-2-3-2-1`, single input owner, four-second fail-open watchdog, no viewport teleport, and current BUILD_ID verification.
- The existing T9 journey screenshots were inspected at desktop and mobile Services stops; the mechanical extraction did not introduce a composition change. Animated Galaxy frame timing is intentionally non-deterministic.

## Boundary

- This is local production-build evidence. No merge or deployment was performed.
- Windows Playwright WebKit is regression coverage, not physical macOS/iPhone Safari acceptance.
