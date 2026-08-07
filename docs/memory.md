# TASC 3D Current Memory

## Project State

- Worktree: `C:\workflow\Freelance\projects\tasc-3d-site\worktrees\t14-motion-story-controller`.
- Active optimization chain includes T0-T13 plus the T14 motion/story controller hardening.
- Current branch: `task/t14-motion-story-controller`, rebased on production `main` at `a1d612a`.
- This T14 request explicitly authorizes commit, push to `main`, production deployment, and one live smoke after local GO. Physical Nothing Phone (3a) and real Safari acceptance remain external gates.

## Prior Scroll Repair Baseline (superseded by T14)

- The 2026-08-04 native/progress-driven rebuild reached production candidate `20260807-042641` and supplied later Safari-alpha, media, stacking, deployment, and process-reveal fixes.
- T14 intentionally supersedes its native `1.0` scroll, progress-driven stories, and Domino played-once behavior with the approved Lenis/discrete-story contract below.

## Runtime Decisions

- ScrollTrigger global `sort()` and `refresh()` calls are centralized through `src/lib/scroll-trigger-refresh.ts`.
- Anchor navigation must not run immediate global refresh/sort or delayed retry ladders. It applies one settled position in one animation frame and clears `data-programmatic-anchor`.
- `src/lib/motion-input-bus.ts` is the only raw wheel/touch/key listener set. `MotionStoryController` owns Services, How, Datum, and Domino with priorities `100/80/75/70`; stories request transitions and never install competing gesture listeners.
- The motion owner watchdog is fixed at 4000 ms and releases fail-open through the normal cleanup path.
- Lenis is the single document scroll owner with wheel/touch multipliers `0.7` and one GSAP ticker. A story holds one lock coordinate through each transition and releases only after the current wheel burst or touch gesture ends.
- Initial connection classification only accepts `saveData`, `slow-2g`, and `2g`. A low `downlink` value alone cannot select mobile assets; measured first-media throughput can constrain later assets.
- T8 profile bootstrap is synchronous in `layout.tsx` and sets `data-tasc-profile-ready` last; React reads it through lazy initializers but only enables motion after hydration to avoid conditional DOM mismatches.
- Mobile/desktop profile switching uses exact `> 80px` hysteresis from the width where the current mode was actually selected; same-mode resize drift does not reset the baseline. `visualViewport` resize is included.
- A live reduced-motion preference disables and fully cleans the current runtime through a per-run GSAP context plus residual-trigger sweep. Returning to no-preference creates one clean replacement runtime; verified ScrollTrigger totals are `33→0→33` and ordinary profile rotations still reuse the original runtime.
- Services video identity is transport-keyed only. Same-transport profile swaps reuse the same DOM node and call `video.load()` explicitly.
- Real Safari acceptance still requires physical macOS/iPhone Safari or an equivalent real-device remote session. Windows Playwright WebKit is regression coverage only.
- Browser QA must run against one stable local `next start` process. Do not rebuild `.next` or start a second server while Playwright/perf harnesses are running.
- Run `scripts/tasc-deploy.ps1` with no output redirection. Piping it through `2>&1` in Windows PowerShell 5.1 turns the remote `ssh` build chatter on stderr into a terminating `NativeCommandError` and kills the deploy mid-upload (observed 2026-08-04; no release directory was created and the `current` symlink was left untouched, so it fails safe).
- `TascLanding` keeps one event-gated `useGSAP` runtime. Section markup is split mechanically, media state is owned by `useMediaOrchestrator`, and Services input behavior is created through `useServicesStory` inside that same runtime.
- Sections after a pin climb the z stack in document order on mobile (Datum `4`, Process `5`, footer `6`). A pinned section that outgrows its spacer would otherwise paint over whatever scrolled up under it.
- Process rows have one sequential reveal owner with a bounded watchdog fail-open path. The old per-row `ScrollTrigger.batch` is not used, so rows and their internal copy cannot compete for reveal ownership.
- Clients-to-Services backdrop opacity is synchronized directly from the bidirectional handoff progress. The Clients flare and gradient leave before Services copy, while the star stage remains visible through the handoff in both directions.
- Packed alpha Services playback respects its authored `maxFps` when handling `requestVideoFrameCallback`, avoiding redundant WebGL texture uploads while preserving the video transport and motion.
- An active Services story survives ScrollTrigger refresh/profile changes; refresh recomputes and corrects the lock coordinate instead of releasing ownership.
- Domino transport failure exits through the normal direction-aware boundary path. Forward failure exposes the form, reverse failure returns toward Process, and both paths release Lenis/document input.
- T14 replaces progress-driven Services/How/Datum behavior with discrete stages. Domino is one pinned `video -> title -> form` scene and replays without a session-wide played-once flag.
- `MediaPriorityQueue` serializes startup preparation and enforces at most one playing decoder on mobile and two on desktop. Mobile uses the packed 1280x360 H.264 transport / 640x360 alpha output and CSS starfields instead of WebGL.

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

## T14 Verification (2026-08-07)

- T14 production build, typecheck, lint, 8/8 lead tests, 20/20 media contracts, and diff checks pass.
- The final three-profile browser matrix passed 28 Chromium desktop, 28 Android Chromium, and 16 WebKit checks with zero console/media errors; ordinary 200 px input moved 140 px.
- Post-review desktop evidence additionally passes direct header `#work` navigation with zero visible Services panels, fixed story `scrollY`, momentum-burst isolation, two Domino forward/reverse cycles, and a 62.95 px title/form gap.
- See `docs/t14-verification-2026-08-07.md`; synthetic Android/WebKit evidence is not physical-device acceptance.
- Production release `20260807-064628` is active at `/var/www/tascagency/current` from application commit `5df474e`; PM2 PID `1274026` and internal/public health are healthy.
- Live smoke passed root/www HTTP 200, all three T14 media range requests as HTTP 206, fixed Services stage input, direct How with zero Services ghosts, Domino form geometry, and mobile Datum/header/static-starfield checks with no console/page errors.
