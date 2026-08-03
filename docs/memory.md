# TASC 3D Current Memory

## Project State

- Worktree: `C:\workflow\Freelance\projects\tasc-3d-site`.
- Active optimization chain: T6, T13, T12, T7, T8, T9, T10, and T11 are stacked in isolated branches and draft PRs.
- Current branch in this worktree: `task/t11-final-verification`, based on the T10 branch.
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
- Mobile/desktop profile switching uses exact `> 80px` hysteresis from the width where the current mode was actually selected; same-mode resize drift does not reset the baseline. `visualViewport` resize is included.
- A live reduced-motion preference disables and fully cleans the current runtime through a per-run GSAP context plus residual-trigger sweep. Returning to no-preference creates one clean replacement runtime; verified ScrollTrigger totals are `33→0→33` and ordinary profile rotations still reuse the original runtime.
- Services video identity is transport-keyed only. Same-transport profile swaps reuse the same DOM node and call `video.load()` explicitly.
- Mobile portion scrolling stops and writes through Lenis while it owns a transition, then synchronizes and resumes Lenis on every completion, interruption, watchdog release, and cleanup.
- Real Safari acceptance still requires physical macOS/iPhone Safari or an equivalent real-device remote session. Windows Playwright WebKit is regression coverage only.
- Browser QA must run against one stable local `next start` process. Do not rebuild `.next` or start a second server while Playwright/perf harnesses are running.
- `TascLanding` keeps one event-gated `useGSAP` runtime. Section markup is split mechanically, media state is owned by `useMediaOrchestrator`, and Services input behavior is created through `useServicesStory` inside that same runtime.
- An active Services story survives ScrollTrigger refresh/profile changes; refresh recomputes and corrects the lock coordinate instead of releasing ownership.
- Domino transport failure exits through the normal direction-aware boundary path. Forward failure exposes the form, reverse failure returns toward Process, and both paths release Lenis/document input.

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
