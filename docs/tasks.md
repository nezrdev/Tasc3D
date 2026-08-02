# Active Tasks

## Done In Current Stack

- T6: Datum and Domino playback stabilization.
- T13: lead submission timing across devices.
- T12: Services to How pin/anchor seam stabilization is locally verified.
- T7: unified motion input ownership, explicit/observed connection classification, and focused Chromium/WebKit journey QA are implemented.

## Remaining Goal Scope

- T8: stabilize transport selection and video key hysteresis.
- T9: decompose landing implementation into smaller atomic commits without behavior drift.
- T10: remove dead code/assets and close A20-A23.
- T11: full final gate across build, browser journeys, performance, cross-device/network evidence and handoff.

## Carried Performance Findings

- Reduce WebKit normal-network preloader reveal from 2829–3113 ms to at most 2500 ms.
- Restore all reveal-managed content for `webkit-mobile-large-430-1mbps`.
- Treat throttled WebKit byte/reveal measurements as advisories, but keep functional hidden-content failures blocking.
- Eliminate the refresh/render stall seen by the mobile portion harness at the 430 px Clients/Services transition and bring WebKit rapid-retarget terminal timing under the existing 1620 ms ceiling without weakening the 420 ms motion contract.

## External Boundary

- Do not mark production/Safari complete until real physical Safari acceptance evidence exists.
- Do not deploy or merge without explicit approval.
