# TASC 3D Current Memory

## Project State

- Worktree: `C:\workflow\Freelance\projects\tasc-3d-site`.
- Active optimization chain: T6, T13, T12, T7, T8, T9, T10, and T11 are stacked in isolated branches and draft PRs.
- Current branch in this worktree: `main`.
- Production deployment is approved for the current scroll-repair task after local QA.

## Scroll Repair Release (2026-08-07)

- Release candidate `20260807-042641` keeps document scrolling native at `1.0`; only an actively playing Services or Domino media segment owns the bounded scroll lock.
- Services settles every authored stop on a decoded frame (`90/187/307`) and holds the visually complete frame `340` through the real pin exit. Reverse traversal is monotonic `3 -> 2 -> 1`; the transparent frame `339` is never a resting surface.
- Clients flare/gradient and the two star layers use one direction-independent handoff with a combined star-opacity floor of `1.0`, so Services cannot open on a black intermediate frame.
- Datum has one pinned ScrollTrigger owner. Cards reveal in order, cards/waitlist overlap during the handoff, and post-scrub leave-back reasserts the hidden reset instead of allowing the timeline start frame to overwrite it.
- How copy transitions are nearly sequential and spatially separated, removing doubled ghost text. Process keeps one sequential `01 -> 05` reveal owner. Domino may prewarm offscreen but starts only after a real forward crossing of its top boundary.
- Local production build `Md-Pecx963W7tGl_DiEWH` passed exact Services stop checks in desktop Chromium, touch Chromium and mobile WebKit. Datum's 17-point transition floor is at least `0.78` in the final WebKit run, with reverse cards visible and leave-back opacity `0`; console errors are `0`.
- Physical iPhone Safari and Android hardware remain an external acceptance gate; Windows Playwright WebKit is regression evidence, not physical Safari acceptance.

## Runtime Decisions

- ScrollTrigger global `sort()` and `refresh()` calls are centralized through `src/lib/scroll-trigger-refresh.ts`.
- Anchor navigation must not run immediate global refresh/sort or delayed retry ladders. It applies one settled position in one animation frame and clears `data-programmatic-anchor`.
- Scrolling is native in every browser. Lenis was removed on 2026-08-04: it was already detached from input on Apple devices, so the site ran two scroll models at once and ScrollTrigger had to reconcile them.
- Nothing in the motion runtime writes a scroll position. Anchor navigation is the single exception. Any future "settle", "snap" or "align" that moves the page is the bug the 2026-08-04 rebuild removed.
- Services is pinned across `SERVICES_PIN_VIEWPORTS` (2.4) of real document and its three stops are read off trigger progress (`SERVICES_STOP_PROGRESS`, exit at `SERVICES_EXIT_PROGRESS`). The old one-viewport pin plus `--services-pin-flow-compensation` is gone; the band has to be real document for progress-driven stops to work.
- Refresh priority order is intentional: hero `40`, Services `30`, How entrance `25`, How reversible `20`, Datum `10`, Domino `5`.
- `src/lib/scroll-lock.ts` is the only thing that holds the reader still: it swallows wheel/touchmove/keydown, never moves the page, and releases itself after `SCROLL_LOCK_SAFETY_MS` (6000). Only Services stops and the Domino sequence take it.
- A settled story never keeps the scroll lock. Services advances forward and traverses its authored palindrome backward `3 -> 2 -> 1`; Domino plays forward once per page load and leaves its final frame alone on the way back up.
- `src/lib/motion-input-bus.ts` is now an observer-only tap on the input stream (all listeners passive, no ownership). Anchor settling and the reveal watchdog are its only consumers.
- How we work and Datum keep their pins by the owner's decision (2026-08-04) but carry no input capture - the steps run on `scrub` while the frame is held.
- Initial connection classification only accepts `saveData`, `slow-2g`, and `2g`. A low `downlink` value alone cannot select mobile assets; measured first-media throughput can constrain later assets.
- T8 profile bootstrap is synchronous in `layout.tsx` and sets `data-tasc-profile-ready` last; React reads it through lazy initializers but only enables motion after hydration to avoid conditional DOM mismatches.
- Mobile/desktop profile switching uses exact `> 80px` hysteresis from the width where the current mode was actually selected; same-mode resize drift does not reset the baseline. `visualViewport` resize is included.
- A live reduced-motion preference disables and fully cleans the current runtime through a per-run GSAP context plus residual-trigger sweep. Returning to no-preference creates one clean replacement runtime; verified ScrollTrigger totals are `33→0→33` and ordinary profile rotations still reuse the original runtime.
- Services video identity is transport-keyed only. Same-transport profile swaps reuse the same DOM node and call `video.load()` explicitly.
- Real Safari acceptance still requires physical macOS/iPhone Safari or an equivalent real-device remote session. Windows Playwright WebKit is regression coverage only.
- Browser QA must run against one stable local `next start` process. Do not rebuild `.next` or start a second server while Playwright/perf harnesses are running.
- Run `scripts/tasc-deploy.ps1` with no output redirection. Piping it through `2>&1` in Windows PowerShell 5.1 turns the remote `ssh` build chatter on stderr into a terminating `NativeCommandError` and kills the deploy mid-upload (observed 2026-08-04; no release directory was created and the `current` symlink was left untouched, so it fails safe).
- `TascLanding` keeps one event-gated `useGSAP` runtime. Section markup is split mechanically and media state is owned by `useMediaOrchestrator`. `useServicesStory` was deleted with the gesture machine.
- Sections after a pin climb the z stack in document order on mobile (Datum `4`, Process `5`, footer `6`). A pinned section that outgrows its spacer would otherwise paint over whatever scrolled up under it.
- Domino media failure releases the lock and settles the story as complete rather than retrying: the reader gets the form, not a frozen frame. The reverse Domino video is never armed, so it is neither downloaded nor decoded.
- Domino readiness is now transport-only: a ready media event cannot start playback by itself. Forward playback requires a real forward pin entry at the scene boundary; backward entry warms media and never claims the reader.
- Process rows have one sequential reveal owner with a bounded watchdog fail-open path. The old per-row `ScrollTrigger.batch` is not used, so rows and their internal copy cannot compete for reveal ownership.
- Clients-to-Services backdrop opacity is synchronized directly from the bidirectional handoff progress. The Clients flare and gradient leave before Services copy, while the star stage remains visible through the handoff in both directions.
- Packed alpha Services playback respects its authored `maxFps` when handling `requestVideoFrameCallback`, avoiding redundant WebGL texture uploads while preserving the video transport and motion.

## Client Review Pass Decisions (2026-08-03)

- Datum owns a real pin again. `datum-content-transition` carries
  `pin`/`pinSpacing`/`anticipatePin` and `end: +=getStableDatumPinDistance()`;
  `datum-content-visibility` still reveals the cards at 25% visibility and
  `datum-reversible` stays the zero-length anchor/priority marker.
- `.services-story-video-wrap` is positioned from the viewport
  (`left: 50%` + `translateX(-50%)` + `vw` widths) in every breakpoint. Percentage
  offsets against the pinned scene box drift while the pin spacer settles.
- Services media stays mounted and opaque at every stop; only the handoff timeline
  animates its children.

## Client Review Pass Two Decisions (2026-08-03)

- The Clients-era backdrops are owned by the `clients-services-handoff` scrub
  timeline, not by a CSS state keyed on `data-services-pinned`. The order is fixed:
  the gradient field and the flare plate fade out with the cards (0 to 0.34), the
  shared starfield dips to zero and comes back (0.02 to 0.72), and only then do the
  Services copy (0.6) and media (0.56) arrive. Services must never be handed a bare
  stage that the text lands on first. Do not put a CSS `transition` on any property
  that timeline writes - a transition on a scrubbed property lags by its own
  duration and reads as a smear.
- `services-keyframes-mobile-lean-20260721.webm` carried `ALPHA_MODE=1` but no alpha
  plane, so every phone painted Services on an opaque black rectangle. Replaced by
  `services-keyframes-mobile-alpha-960-20260803.webm`. When re-deriving a VP9 alpha
  variant, pass `-c:v libvpx-vp9` on the *input* - ffmpeg's default VP9 decoder
  silently drops the alpha side data and the tag survives regardless. Verify by
  rendering the file over a saturated background, never by reading the tag.
- Services frame 339 (`exitFrame`) is fully transparent and frame 340
  (`reverseStopFrames[2]`) is the first reverse frame. `seekServicesFrame` used a
  fixed 0.12s (3.6 frame) acceptance window, so a reverse entry accepted the
  transparent exit frame and Services looked empty when re-entered backwards from
  How we work. Seeks that land on that cut pass `SERVICES_SEAM_SEEK_TOLERANCE` and
  target `+ SERVICES_SEAM_FRAME_NUDGE`.
- The Services frame is exactly `100vw` on phones. Wider boxes plus
  `object-fit: contain` size the render to the box, so the authored frame is cropped
  by the screen and the object reads as cut in half.
- Domino pin travel is `clamp(620, 1.15vh, 1400)` and the reverse story engages at
  `progress <= 0.12`. The gesture path (`startReverseFromCompletedBoundary`) also
  requires `hasClimbedIntoDominoReverseBand()`: `isDominoVisuallyNear()` alone covers
  the whole brief form and most of the footer, so one wheel notch up off the bottom
  of the page re-ran the sequence. A reverse session locks at the reader's current Y
  clamped into the band, never at `trigger.end - 1`, so engaging moves nothing.
- Phones paint only the primary starfield (`interactiveGalaxyEnabled` is gated off on
  `mobilePerformanceMode`), so the layer carries density 1.05 and 0.72 opacity where
  desktop stacks two layers at 0.55 and 0.36.

## Latest Evidence

- `pnpm qa:t12` passed.
- `pnpm qa:t12:browser -- --url=http://127.0.0.1:3112/ --output=output/playwright/t12-browser-seam-final-race` passed on Chromium desktop and WebKit mobile, including rapid `Services → How → Services` navigation.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:leads`, `pnpm media:verify`, and `pnpm build` passed.
- `node scripts/perf-baseline.mjs --preset=smoke --url=http://127.0.0.1:3112/ --no-server --output=docs/perf-smoke-t12-2026-08-02.json` passed with no structural failures, acceptance failures, or advisories.
- The 24-case full matrix in `output/perf/t12-perf-baseline-final.json` completed without structural failures. It still reports four acceptance failures: three WebKit normal-network preloader reveals above 2500 ms and six hidden reveal-managed elements in `webkit-mobile-large-430-1mbps`. These are carried into T8/T10 and must be green in T11.
- Independent visual review confirmed that the former WebKit mobile Services blank state is fixed: direct Services content appeared in 165 ms and rapid-return content in 153 ms, with no overflow or browser errors.
- `docs/t7-motion-input-qa-2026-08-02.json` passed static contracts plus Chromium and WebKit journeys: Services `1→2→3→2→1`, How `1→2→3→2→1`, at most one owner, watchdog fail-open, no page/critical asset errors, and no viewport teleport.
- `docs/t8-motion-lifecycle-qa-2026-08-02.json` passed Chromium and WebKit profile rotation: one runtime init, exact 80/81 hysteresis behavior, one Services video node, explicit load count on source swaps, and no nested pin spacers.
- The same T8 run passed a controlled late `0.8 Mbps` resource measurement without a Services source/node/load change, a same-mode baseline drift path `800→881→901`, and dynamic reduced-motion teardown/restart.
- `docs/t7-on-t8-motion-input-qa-2026-08-02.json` passed full Chromium and WebKit T7 regression on the T8 branch.
- `docs/t8-perf-smoke-2026-08-02.json` passed the Chromium mobile 390 smoke run; measured long-task sum in the first 7 seconds is 207 ms, under the 250 ms T8 target.
- The focused Chromium 390 mobile portion run passed 65/65 checks without changing its timing limits.
- T9 passed `pnpm check`, Chromium/WebKit structural QA, T8 lifecycle QA, and T7 forward/reverse input QA on production BUILD_ID `6Cv4-YD_ip1O1H6_JeSAj`; see `docs/t9-verification-2026-08-02.md`.
- T10 passed cleanup, build, and 4/4 cold normal-network journey gates; public delivery is 47,955,173 bytes and local fonts total 75,124 bytes.
- T11 candidate BUILD_ID `3il90V6IuZEtqb2tTRyTJ` passes lint, typecheck, 8/8 lead tests, 20/20 media contracts, T6/T8/T9/T10/T12 gates, exact Chromium/WebKit Services and How reverse journeys, 4/4 cold first visits, 8/8 Domino fault paths, 3/3 WebGL paths, and a 24-case performance matrix with zero structural or acceptance failures.
- The strict mobile portion harness remains unmodified. Chromium 390/430 passes; Windows synthetic WebKit reaches every target with zero positional error but exceeds six rapid timing assertions. Physical Safari timing acceptance remains external.
- See `docs/t11-verification-2026-08-02.md` for the authoritative final evidence and boundaries.

## Scroll Repair Verification (2026-08-06)

- `pnpm check` passed: lint, typecheck, 8/8 lead tests, 20/20 runtime media contracts, and production build.
- `pnpm qa:t8:static` and `pnpm qa:t12` passed.
- Stable `next start` QA passed in Chromium 1440x900 and WebKit mobile 390x844: footer-to-Domino small upward movement stayed `ready`/unpinned; forward boundary reached `complete`; Process rows revealed 01 through 05; Clients flare reached opacity 0 while Services stars remained visible in both handoff directions; no page errors or console errors were observed.
- Existing `qa:t12:browser` still asserts the retired one-viewport Services pin and reports that stale geometry contract. Existing `qa:t6` asserts a removed Domino preflight machine, and `qa:t7:static` references the removed `useMobilePortionedScroll`; these scripts need contract refresh before they can be used as release gates.
