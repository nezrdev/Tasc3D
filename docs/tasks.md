# Active Tasks

## Client Review Pass (2026-08-03)

Regressions the T0-T13 optimisation stack introduced, restored against `0b693f7`:

- Datum pin was removed in `b4ab9bd`. `pin`/`pinSpacing`/`getStableDatumPinDistance`
  and the live `datumPinned` flag are back, so the cards to waitlist story locks
  the viewport again. `verify-t6-datum-domino.mjs` asserted the missing pin as a
  requirement; the assertion was inverted.
- Clients starfield faded to `0.32` and back to `1` instead of to `0`.

New review items:

- The ambient `first-four-gradient-field`, the Clients flare plate and the shared
  starfield stage fade out once Services is pinned, so Services arrives on black.
  Four separate `opacity: 1 !important` declarations had to be un-forced first.
  The fade is a CSS state change, not a scrub tween: an earlier GSAP version of
  this regressed `qa:t7` on Chromium.
- Services media is never hidden per stop. The `[data-services-active="0"|"3"]`
  display gates and the pinned/inrange opacity gate are gone.
- Services media geometry is viewport anchored in every mobile breakpoint. Four
  files disagreed on `left`/`width` percentages resolved against the pinned scene.
- The `-36vw` pan on stops 1 and 3 is gone; all stops share one framing.
- Packed alpha canvas uses `object-fit: contain`, not `cover`.
- Domino reserves `0.55` viewport of approach and the reverse session waits for
  `progress <= 0.35`, with an `onLeaveBack` fallback so a fast flick delays the
  story instead of skipping it.
- Hero/Vision pin travel cut to `2.05` desktop / `1.6` mobile / `1.75` mac.
  Mobile `touchMultiplier` damped to `0.8`.

## Done In Current Stack

- T6: Datum and Domino playback stabilization.
- T13: lead submission timing across devices.
- T12: Services to How pin/anchor seam stabilization is locally verified.
- T7: unified motion input ownership, explicit/observed connection classification, and focused Chromium/WebKit journey QA are implemented.
- T8: runtime profile bootstrap, stable-baseline viewport hysteresis, stable Services media identity, controlled late measured-throughput isolation, and dynamic reduced-motion teardown/restart are implemented and locally verified.
- T9: section extraction, media reducer orchestration, Services story extraction, and visual media memoization are implemented and locally verified without behavior drift.
- T10: dead-code/media cleanup, font subsetting, local map delivery, stable metadata, and final T10 journey are implemented and locally verified.
- T11: final software gate, Services refresh/source-swap regression, Domino fail-open, first-visit consent/navigation, performance matrix, and handoff evidence are implemented and locally verified.
- T14: one Lenis owner, discrete Services/How/Datum stories, repeatable bidirectional Domino, sequential media preparation, mobile decoder/WebGL budgets, header/Clients/Process regressions, and focused Chromium/WebKit QA are implemented and locally verified.
- Client review pass two (2026-08-03): Hero/Vision pin travel cut again, Clients to
  Services backdrop handover moved onto the scrub timeline, mobile Services alpha
  source replaced, reverse Services entry frame fixed, mobile Services frame refit to
  one viewport, How we work step copy softened, Domino tail given ~1.85 viewports of
  free scrolling, mobile starfield density raised, mobile Datum frame +5%.

## Remaining Goal Scope

- No remaining T14 local software implementation scope after two independent frontend reviews.
- Commit as `netherdef`, push to `main`, deploy production, and run one live smoke are authorized by this request.

## Carried Performance Findings

- The T11 24-case matrix has zero structural and acceptance failures. Keep the recorded WebKit Fast 3G/1 Mbps preloader and startup-byte advisories visible during physical acceptance.
- Treat throttled WebKit byte/reveal measurements as advisories, but keep functional hidden-content failures blocking.
- Keep browser QA single-server and serial around `.next`; concurrent rebuilds or duplicate `next start` processes can invalidate build identity and produce false `ERR_CONNECTION_REFUSED`.

## External Boundary

- Do not mark production/Safari complete until real physical Safari acceptance evidence exists.
- T14 deployment approval was given on 2026-08-07; do not extend that approval to unrelated changes.
- Validate the approved build on physical iPhone Safari/Chrome, Android Chrome, and macOS Safari using `t5-physical-safari-acceptance.md`.
- After an approved deployment, verify that Nginx emits one immutable media cache policy and rerun the live range/header check.
- Verify real PostgreSQL persistence only in an authorized staging/production environment.

## Scroll Repair Execution (2026-08-06)

- Completed the approved main-branch repair for native `1.0` scrolling, exact Services frame ownership and reverse `3 -> 2 -> 1`, Domino footer gating, sequential Process reveals, Clients-to-Services backdrop/star handoff, Datum reveal/crossfade/reset, and How copy ghosting.
- Candidate release: `20260807-042641`; local Next build: `Md-Pecx963W7tGl_DiEWH`.
- Local acceptance is green through production build, lint, typecheck, `qa:t8:static`, `qa:t12`, exact desktop/touch/WebKit Services journeys, and 17-point Datum crossfade/reverse/reset checks. Physical Safari and Android hardware remain external acceptance surfaces.
- Before future releases, refresh the stale T6/T7/T12 browser scripts so their contracts describe the current main-branch runtime instead of the removed preflight, mobile-portioned-scroll, and one-viewport Services implementations.
