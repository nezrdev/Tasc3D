# T15 Client Motion Hotfix - 2026-08-07

## Client contract

- The curtain must reveal within 3 seconds; the normal local path should finish near 2-2.5 seconds.
- Clients cards use the same independent, portioned reveal choreography.
- The shared Galaxy remains animated on desktop and mobile, including while story video is active.
- Services, How, Datum, Process, Domino, and the footer hand off without empty pin tails or synthetic release jumps.
- Android uses the 960x540 packed H.264 Services transport and the 640x640 60 fps packed Hero transport.
- Domino has no poster layer. Its terminal video frame remains visible behind the form, and reverse playback returns the scene from the footer.

## Local evidence

- `pnpm typecheck`, `pnpm build`, `pnpm media:verify`, and `git diff --check` pass.
- The hard curtain deadline is 2300 ms. Final cold Chromium sampling opened it in 1763 ms; the earlier Pixel 5 pass opened in 2068 ms.
- Pixel 5 emulation kept one active decoder, selected `services-keyframes-packed-960-gop15-t4-20260801.mp4`, and sampled 27.9 presented frames per second against the authored 30 fps stream.
- The mobile Galaxy produced different rendered frames 350 ms apart while the shared stage was visible.
- Mobile header geometry is a bounded 64 px; logo and 40 px menu control remain inside it.
- A focused Domino pass showed zero `.domino-poster` elements. Forward holds the final video frame behind the form; on reverse the footer is below the viewport while the reverse video owns the pinned screen.
- Atomic Services -> How -> Datum handoffs show the incoming story in the release gesture and hide the outgoing copy in the same frame. Datum -> Process lands with Process at `top=-2px`.
- A three-event `wheel(1400)` reverse burst from Process is captured by Datum stage 2 and cannot skip to How. Services playback sampling is monotonic after interactive ownership; late warmup no longer seeks it back to zero.
- Two independent final reviews returned GO: visual handoff/ghost coverage and technical input/media/error coverage. Console, page, media, story, and watchdog errors were zero.

## External gate

- Browser emulation is regression evidence, not physical Nothing Phone (3a) acceptance. The user owns the final hardware check.
