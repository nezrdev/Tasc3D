# T14 Verification - 2026-08-07

## Candidate

- Branch: `task/t14-motion-story-controller`
- Rebased production base: `a1d612a`
- Production runtime: one Lenis/GSAP ticker and one `MotionStoryController`

## Contract

- Document wheel/touch multiplier: `0.7`.
- One completed wheel burst or touch gesture can advance at most one story stage.
- Services runs `1 -> 2 -> 3 -> release`; How runs `01 -> 02 -> 03`; Datum runs cards -> waitlist -> release, all symmetrically reversible.
- Domino replays forward and reverse on every entry and owns video, title, and working form in one pin.
- Preloader soft reveal is 3500 ms and hard fail-open is 4700 ms.
- Active decoder ceilings are one on mobile and two on desktop; mobile starfields are CSS-only.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test:leads`, `pnpm media:verify`, `pnpm build`, and `git diff --check` pass.
- `output/playwright/t14-motion-story-final/report.json`: Chromium desktop 28 checks, Android Chromium 28 checks, and Windows WebKit 16 checks passed with zero console, page, or media errors.
- All tested 200 px ordinary gestures moved 140 px. Story transition samples held `scrollY` within 0-3 px.
- Services, How, and Datum reject multi-stage gesture bursts; desktop explicitly rejects release-and-enter on the same wheel momentum burst.
- Domino completed two forward/form/reverse cycles; active decoder sampling stayed within the platform ceiling.
- `output/playwright/t14-direct-nav-fix-desktop/report.json` confirms direct header navigation to How leaves zero visible Services panels. The same run confirms a 62.95 px Domino title/form gap and all functional story checks.
- `output/playwright/t14-rebased-final-desktop/report.json` passes the full desktop journey after rebasing on current production `main`.
- Carried upstream safeguards include exact decoded Services terminal frames, measured mobile Datum media space, hydration-safe runtime telemetry, and explicit Domino `pagehide` cancellation/terminal-frame hold.
- The deployment package allowlist includes all T14 media; package-only preflight produced a 63.27 MB archive successfully.
- Independent visual review covered hierarchy, Services -> How, direct header -> How, Domino form spacing, Clients stars, mobile header, and Process layout. Independent technical review covered ownership, cancellation, lock release, decoder limits, timing, and console/media errors.

## External Gates

- Windows Playwright mobile profiles are regression coverage, not physical-device acceptance.
- Final Nothing Phone (3a) acceptance belongs to the user.
- Real iPhone/macOS Safari acceptance remains pending until observed on Apple hardware or an equivalent real-device session.
