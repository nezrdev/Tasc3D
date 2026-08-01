# T5 Physical Safari Acceptance

This runbook is the external gate for PR #7. Do not merge, deploy, or start T6 from T5 until this pass is accepted on real Apple hardware.

## Scope

- macOS Safari.
- iPhone Safari.
- Optional: iPhone Chrome, only as an extra iOS WebKit shell check.

Windows Playwright WebKit is useful regression coverage, but it is not physical Safari acceptance.

## Candidate

- Branch: `task/t5-safari-css-flare`
- Commit: `8521eccc83b7eabb645fd0d21926a894a205f666`
- PR: `https://github.com/nezrdev/Tasc3D/pull/7`
- Production must remain untouched.

## Local Candidate Server

From the checked-out T5 worktree:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm start --hostname 0.0.0.0 --port 3213
```

Open the candidate on the physical device through the machine LAN IP:

```text
http://<host-lan-ip>:3213/?t5_physical=<timestamp>
```

Use a fresh timestamp for each pass to avoid browser cache ambiguity.

## Safari Setup

For macOS Safari:

- Enable Develop menu.
- Open Web Inspector for the candidate tab.
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

After the page has loaded at the top, paste the full contents of:

```text
scripts/t5-physical-safari-probe.js
```

into the Safari Web Inspector console and press Enter. The probe panel appears in the bottom-right corner.

Fill:

- run label;
- device;
- Timeline filename;
- HAR filename;
- screen recording filename.

Click `Start capture`, perform the journey below, then click `Stop + download`. Keep the downloaded JSON together with the screen recording, Timeline and HAR.

## Journey

1. Start at the top of the page after a cold reload.
2. Scroll down normally through Hero, Vision, Clients and Services.
3. Confirm Services reaches all three authored forward stages.
4. Reverse from Services back through the prior stages.
5. Continue through How We Work, Datum, Process, Domino and Footer.
6. Confirm Datum loops autonomously and does not lock ordinary scroll.
7. Confirm Domino completes forward, reverse back to Process, then forward replay.
8. Resize or rotate once where applicable, then continue scrolling.
9. Check direct links in fresh tabs: `#clients`, `#services`, `#datum`, `#process`, `#brief`.

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
  - `metrics.raf.p95Ms` is acceptable for the device refresh rate and has no sustained multi-second stalls;
  - Long Tasks can be `unsupported`; if supported, no sustained blocking cluster appears during Clients/Services handoff.

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

Acceptance can be marked only after the physical evidence is reviewed and explicitly accepted.
