# Privacy and Reporting

The registry supports adoption and staleness reporting without collecting local filesystem paths.

## Reported Data

Install/status reports contain:

- `packageId`
- `versionId`
- anonymous or client-generated `installId`
- current install state
- report timestamp
- target kind, such as `codex-global` or `project`

Reports do not require a local path, username, hostname, repository path, shell history, or skill invocation content.

## Aggregation

Package and workspace reports are maintainer-only API responses.

Views and downloads are counted as raw registry events. Install totals are deduplicated by `installId`; only the latest report timestamp for each install contributes to the current state counts. Repeated status checks can therefore move one install from `current` to `stale` without increasing the install total.

## Consent

Workspace records include a reporting policy of `disabled`, `opt-in`, or `required`. The CLI reads workspace config before reporting:

- `disabled`: no install/status report is sent.
- `opt-in`: report only when local consent is enabled.
- `required`: report even without local opt-in.

The CLI metadata model stores report consent for each local install.

## Operational Boundary

Registry telemetry answers operational questions such as:

- Which package versions are being viewed or downloaded?
- How many distinct installs have reported status?
- How many reported installs are stale, deprecated, hidden, or locally modified?

It is not designed to prove actual runtime skill usage. Agents may read or invoke skills outside the registry's visibility.
