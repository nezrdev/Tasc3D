# T5 Physical Safari Acceptance

This runbook is the external gate for PR #7. Do not merge, deploy, or start T6 from T5 until this pass is accepted on real Apple hardware.

## Scope

- macOS Safari.
- iPhone Safari.
- Optional: iPhone Chrome, only as an extra iOS WebKit shell check.

Windows Playwright WebKit is useful regression coverage, but it is not physical Safari acceptance.

## Revisions

- Baseline branch: `task/a3-t4-webgl-transport`
- Baseline commit: `21a0e00c48b5f32188a6b7274dd6e68aae3e4ebb`
- Candidate branch: `task/t5-safari-css-flare`
- Record the candidate commit with `git rev-parse HEAD` immediately before the run.
- PR: `https://github.com/nezrdev/Tasc3D/pull/7`
- Production must remain untouched.

## Local Servers

Build and run the T4 baseline:

```powershell
cd C:\workflow\Freelance\projects\tasc-3d-site\worktrees\a3-t4-webgl-transport
pnpm install --frozen-lockfile
pnpm build
pnpm start --hostname 0.0.0.0 --port 3212
```

Build and run the T5 candidate in a second terminal:

```powershell
cd C:\workflow\Freelance\projects\tasc-3d-site\worktrees\t5-safari-css-flare
pnpm install --frozen-lockfile
pnpm build
pnpm start --hostname 0.0.0.0 --port 3213
```

Open both revisions through the machine LAN IP:

```text
http://<host-lan-ip>:3212/?t5_physical=t4-<timestamp>
http://<host-lan-ip>:3213/?t5_physical=t5-<timestamp>
```

Use a fresh timestamp for each pass to avoid browser cache ambiguity.

## Safari Setup

For macOS Safari:

- Enable Develop menu.
- Open Web Inspector for the active revision tab before each baseline or candidate run.
- Disable cache while Web Inspector is open.
- Record Timelines.
- Export or save the Network record as HAR if available.
- Record the screen for the whole journey.

For iPhone Safari:

- Connect the iPhone to the Mac.
- Enable Safari Web Inspector on iPhone.
- Open the iPhone page from macOS Safari Develop menu.
- Keep the phone on screen recording during the journey.

## Probe

After the page has loaded at the top, paste the full contents of the T5 worktree file into the Safari Web Inspector console for both revisions:

```text
scripts/t5-physical-safari-probe.js
```

Press Enter. The probe panel appears in the bottom-right corner.

Fill:

- run label;
- device;
- Timeline filename;
- HAR filename;
- screen recording filename.

Use `t4-baseline-1`, `t4-baseline-2`, `t4-baseline-3` and matching `t5-candidate-1`, `t5-candidate-2`, `t5-candidate-3` labels. Click `Start capture`, perform the journey below, then click `Stop + download`. Keep each JSON with its screen recording, Timeline and HAR.

The probe is external QA instrumentation. It adds no runtime code to the application, does not intercept input, and samples video state only every 250 ms. Web Inspector Timeline remains the primary compositor evidence.

## Journey

Run the same journey three times per revision and device. The first run is cold with cache disabled. The next two are warm with identical viewport, orientation and network.

1. Record the cold preloader in Web Inspector Timeline and the screen recording, then inject the probe after the page settles at `scrollY=0`.
2. Scroll down normally through Hero, Vision, Clients and Services.
3. Confirm Services reaches all three authored forward stages.
4. Reverse from Services back through the prior stages.
5. Continue through How We Work, Datum, Process, Domino and Footer.
6. Confirm Datum loops autonomously and does not lock ordinary scroll.
7. Confirm Domino completes forward, reverse back to Process, then forward replay.
8. Resize or rotate once where applicable, then continue scrolling.
9. Check direct links in fresh tabs: `#clients`, `#services`, `#datum`, `#process`, `#brief`.

Repeat one candidate journey on a constrained real network or a physical weak device. Do not use the synthetic Windows WebKit throttle as physical Safari evidence.

## Comparison

Compare matching baseline and candidate runs:

```powershell
node scripts\compare-t5-physical-safari.mjs "C:\evidence\baseline.json" "C:\evidence\candidate.json" "C:\evidence\comparison.json"
```

Run the kit self-check before collecting evidence:

```powershell
pnpm qa:t5:physical-kit
```

The comparator requires the same device, Safari build, viewport and DPR. It enforces the raw `scrollFrameBudget` 2x gate, the `250 ms` Long Tasks gate when Safari exposes it, video progression, empty runtime errors, completed manual checks and named evidence files.

Safari may not expose `longtask` through `PerformanceObserver`. In that case the comparison is deliberately `needs-web-inspector-review`, never a synthetic pass. Review the Frames, JavaScript & Events, Layout & Rendering and Media & Animations tracks in the saved Timeline before accepting the run.

## Pass Criteria

- No blank locked viewport.
- No full-page horizontal overflow.
- No visible Clients flare edge or white plane on Vision.
- Header, Clients cards and CTA surfaces do not produce obvious Safari blur/compositor stalls.
- Scroll is visibly smooth in both directions on real hardware.
- Services, Datum and Domino media move as authored, without slideshow fallback.
- Web Inspector console has no uncaught runtime errors from the site.
- Probe JSON:
  - `runtimeErrors` is empty;
  - `computedStyles[".process-contact-section"].contentVisibility` is `visible`;
  - `computedStyles[".site-footer"].contentVisibility` is `visible`;
  - T5 `metrics.raf.over16_7Ratio` is at most half of the matched T4 value;
  - adaptive cadence, p95 and p99 have no sustained multi-second stalls;
  - Long Tasks sum is at most `250 ms` when supported;
  - when Long Tasks are unsupported, the saved Web Inspector Timeline must show no sustained blocking cluster during the Clients/Services handoff.

## Evidence Bundle

Save these files per device:

- probe JSON from `Stop + download`;
- screen recording;
- Safari Timeline recording;
- HAR or Network export;
- device/browser/version note.

Name the bundle:

```text
t5-physical-safari-<device>-<date>-<commit>
```

Acceptance can be marked only after all three matched comparisons per device and the physical evidence are reviewed and explicitly accepted.

## Primary References

- Apple Safari developer tools: `https://developer.apple.com/safari/tools/`
- WebKit remote inspection: `https://webkit.org/web-inspector/enabling-web-inspector/`
- WebKit Timelines: `https://webkit.org/web-inspector/timelines-tab/`
- WebKit Network and HAR: `https://webkit.org/web-inspector/network-tab/`
- MDN requestAnimationFrame: `https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame`
- MDN requestVideoFrameCallback: `https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback`
- MDN PerformanceObserver supported entry types: `https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver/supportedEntryTypes_static`
