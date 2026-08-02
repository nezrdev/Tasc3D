# Active Tasks

## Done In Current Stack

- T6: Datum and Domino playback stabilization.
- T13: lead submission timing across devices.
- T12: Services to How pin/anchor seam stabilization is locally verified.
- T7: unified motion input ownership, explicit/observed connection classification, and focused Chromium/WebKit journey QA are implemented.
- T8: runtime profile bootstrap, exact viewport hysteresis, stable Services media identity, and measured-throughput isolation are implemented and locally verified.

## Remaining Goal Scope

- T9: decompose landing implementation into smaller atomic commits without behavior drift.
- T10: remove dead code/assets and close A20-A23.
- T11: full final gate across build, browser journeys, performance, cross-device/network evidence and handoff.

## Carried Performance Findings

- Re-run the full 24-case matrix after T9/T10; earlier T12 WebKit normal-network preloader and `webkit-mobile-large-430-1mbps` reveal issues must be confirmed closed in T11.
- Treat throttled WebKit byte/reveal measurements as advisories, but keep functional hidden-content failures blocking.
- Keep browser QA single-server and serial around `.next`; concurrent rebuilds or duplicate `next start` processes can invalidate build identity and produce false `ERR_CONNECTION_REFUSED`.

## External Boundary

- Do not mark production/Safari complete until real physical Safari acceptance evidence exists.
- Do not deploy or merge without explicit approval.
