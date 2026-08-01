# T5 Physical Safari Acceptance

This runbook is the external gate for PR #7. Do not merge, deploy, or start T6 from T5 until this pass is accepted on real Apple hardware.

## Scope

- macOS Safari.
- iPhone Safari.
- Optional: iPhone Chrome, only as an extra iOS WebKit shell check.

Windows Playwright WebKit is useful regression coverage, but it is not physical Safari acceptance.

## Remote Real-Device Alternative

If local Apple hardware is unavailable, an authenticated remote session is acceptable only when it exposes real macOS Safari and real iPhone Safari. BrowserStack Live or an equivalent real-device service may be used when the session provides the same screen recording, Safari/Web Inspector evidence and downloadable network artifacts required below. Provider name or plan is not proof of equivalence: session metadata must identify physical Apple hardware, OS version, Safari build, viewport and DPR. Simulators, generic WebKit sessions and provider logs without the required Safari Timeline tracks are not accepted.

The remote route does not relax the gate:

- browser-engine emulation, Windows Playwright WebKit and screenshots without a full journey are not accepted;
- baseline and candidate must run on the same real device, Safari build, viewport, DPR and network profile;
- the remote device must reach both T4 and T5 revisions through a provider-supported secure tunnel or authorized staging endpoints;
- every endpoint must be an immutable build of baseline commit `21a0e00c48b5f32188a6b7274dd6e68aae3e4ebb` or the exact candidate commit recorded immediately before the run; save verifiable deployment/build identity in every evidence bundle because a URL or run label alone is insufficient;
- all three matched runs per revision and device remain mandatory;
- the constrained-network candidate run remains mandatory; if the selected plan cannot throttle the real session, perform that run on a physical limited network instead;
- account access or provider credentials must be supplied by the authorized account owner and must not be committed to the repository.

Current Windows-hosted automation can prepare and validate the evidence bundle, but it cannot create this real Safari evidence by itself.

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

Use `t4-baseline-1`, `t4-baseline-2`, `t4-baseline-3` and matching `t5-candidate-1`, `t5-candidate-2`, `t5-candidate-3` labels. Click `Start capture`; the probe panel disappears completely so it cannot repaint over the measured page. Perform the journey below, then run this in Web Inspector:

```js
window.__tascPhysicalSafariProbe.stop(true)
```

The panel returns with the summary and the probe JSON downloads. Keep each JSON with its screen recording, Timeline and HAR.

The probe is external QA instrumentation. It adds no runtime code to the application, does not intercept input, samples video and story state every 250 ms, and removes its panel from layout and paint while recording. Web Inspector Timeline remains the primary compositor evidence and overrides probe timing when they disagree.

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
node scripts\compare-t5-physical-safari.mjs "C:\evidence\baseline.json" "C:\evidence\candidate.json" "C:\evidence\comparison.json" --evidence-root "C:\evidence"
```

Run the kit self-check before collecting evidence:

```powershell
pnpm qa:t5:physical-kit
```

The comparator requires the same device, Safari build, viewport and DPR. It verifies and hashes the referenced Timeline, HAR and screen recording files for both revisions. It enforces both raw and adaptive `scrollFrameBudget` 2x gates, p95/p99/max-frame regression limits, the `250 ms` Long Tasks gate when Safari exposes it, the exact Process/Footer CSS invariant, full ordered section coverage, all three Services stops in both directions, Datum playback, Domino forward/reverse/replay, section-specific media progression, empty runtime errors and the exact five manual checks.

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
  - both selectors report exact `containIntrinsicSize: none`;
  - T5 `metrics.raf.over16_7Ratio` is at most half of the matched T4 value;
  - T5 `metrics.raf.adaptiveSlowRatio` is at most half of the matched T4 value;
  - p95, p99 and maximum frame duration do not regress from T4, and the maximum frame duration stays at or below `1000 ms`;
  - the ordered journey includes Hero, Clients, Services, How We Work, Datum, Process, Domino and Footer;
  - Services stages `1`, `2`, `3`, the reverse return through stages `2`, `1`, Datum playback and two Domino forward runs around one reverse run are observed;
  - Services, Datum, Domino-forward and Domino-reverse video transports each progress without unresolved stalls or media errors;
  - Long Tasks sum is at most `250 ms` when supported;
  - when Long Tasks are unsupported, the saved Web Inspector Timeline must show no sustained blocking cluster during the Clients/Services handoff.

## Evidence Bundle

Save these files per device:

- probe JSON from `Stop + download`;
- screen recording;
- Safari Timeline recording;
- HAR or Network export;
- device/browser/version note, including physical-device session metadata for remote runs;
- immutable build/revision identity for the tested endpoint.

Keep the filenames written into each probe report relative to the bundle directory passed through `--evidence-root`. A filename alone is not accepted: every file must exist, be non-empty and receive a SHA-256 hash in the comparison result. Timeline, HAR and screen recording must be three different canonical files inside each report. Baseline and candidate reports must also reference separate files; reused paths are rejected.

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
