# T7 Verification

## Scope

T7 replaces competing Services, How, Domino, and mobile portion input listeners with one explicit motion input bus. It also removes raw `downlink` from initial device classification and measures first-media throughput for later asset selection.

## Implemented Contracts

- One capture listener set owns wheel, touch, keyboard, and scroll observation.
- Exactly one story can own input. Priority order is Services, How, Domino, then mobile portion scrolling.
- Owner state lives in the module; DOM datasets remain CSS and QA projections.
- A 4000 ms no-progress watchdog releases through the same cleanup path as normal ownership.
- Services and reversible stories no longer use `stopImmediatePropagation` or cross-owner dataset arbitration.
- Mobile portion scrolling uses Lenis as its sole scroll writer while active and resumes the previous running state on every terminal path.
- `saveData`, `slow-2g`, and `2g` are the only explicit constrained signals. First-media `PerformanceResourceTiming` throughput may constrain subsequent media.

## Green Checks

- `pnpm qa:t7:static`: pass, 9/9 static contracts.
- `pnpm qa:t7 -- --url=http://127.0.0.1:3118/ --output=docs/t7-motion-input-qa-2026-08-02.json`: pass in Chromium and WebKit.
- Browser journey proof: Services `1→2→3→2→1`, How `1→2→3→2→1`, maximum one owner, watchdog fail-open, no viewport teleport, no page or critical asset errors.
- A synthetic `downlink=0.35` desktop session initially selects desktop Services media; measured throughput can only affect later media.
- `pnpm qa:t6`: pass.
- `pnpm qa:t12`: pass.
- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test:leads`: pass, 8/8.
- `pnpm media:verify`: pass, 20/20 current runtime videos.
- `pnpm build`: pass.

## Carried Final-Matrix Work

The focused mobile portion matrix passes Chromium 390 after Lenis ownership was unified. Chromium 430 still exposes a refresh/render correction while crossing Clients into Services, and synthetic WebKit rapid retargeting can exceed the existing terminal-time limit under 350–410 ms frame gaps. Target selection, ordered interruption, final settling, and one-owner lifecycles remain correct.

These checks are not waived. T8 owns the full-runtime reinitialization/profile path that produces the observed refresh stall, and T11 must rerun the complete mobile portion, performance, and cross-device/network matrices without weakening the 420 ms `power2.out` contract.

## Acceptance Boundary

The branch is not merged or deployed. Windows Playwright WebKit is regression coverage only; physical macOS/iPhone Safari remains an external T11 acceptance step.
