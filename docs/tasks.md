# Active Tasks

## Done In Current Stack

- T6: Datum and Domino playback stabilization.
- T13: lead submission timing across devices.
- T12: Services to How pin/anchor seam stabilization is locally verified.
- T7: unified motion input ownership, explicit/observed connection classification, and focused Chromium/WebKit journey QA are implemented.
- T8: runtime profile bootstrap, stable-baseline viewport hysteresis, stable Services media identity, controlled late measured-throughput isolation, and dynamic reduced-motion teardown/restart are implemented and locally verified.
- T9: section extraction, media reducer orchestration, Services story extraction, and visual media memoization are implemented and locally verified without behavior drift.
- T10: dead-code/media cleanup, font subsetting, local map delivery, stable metadata, and final T10 journey are implemented and locally verified.
- T11: final software gate, Services refresh/source-swap regression, Domino fail-open, first-visit consent/navigation, performance matrix, and handoff evidence are implemented and locally verified.

## Remaining Goal Scope

- No remaining local software implementation scope.
- Review and merge the stacked draft PRs only after explicit approval.

## Carried Performance Findings

- The T11 24-case matrix has zero structural and acceptance failures. Keep the recorded WebKit Fast 3G/1 Mbps preloader and startup-byte advisories visible during physical acceptance.
- Treat throttled WebKit byte/reveal measurements as advisories, but keep functional hidden-content failures blocking.
- Keep browser QA single-server and serial around `.next`; concurrent rebuilds or duplicate `next start` processes can invalidate build identity and produce false `ERR_CONNECTION_REFUSED`.

## External Boundary

- Do not mark production/Safari complete until real physical Safari acceptance evidence exists.
- Do not deploy or merge without explicit approval.
- Validate the approved build on physical iPhone Safari/Chrome, Android Chrome, and macOS Safari using `t5-physical-safari-acceptance.md`.
- After an approved deployment, verify that Nginx emits one immutable media cache policy and rerun the live range/header check.
- Verify real PostgreSQL persistence only in an authorized staging/production environment.
