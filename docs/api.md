# API

The registry API is implemented in `apps/server` and uses the same `RegistryApi` service contract as future web, CLI, and MCP callers.

## Current Routes

- `GET /health`: health check with active database mode.
- `GET /api/workspaces/:workspaceId`: workspace settings for reporting policy and visibility.
- `PATCH /api/workspaces/:workspaceId`: admin workspace settings update for `reportingPolicy` and `visibility`.
- `GET /api/workspaces/:workspaceId/packages?q=`: catalog search within a workspace.
- `GET /api/packages/:packageId`: package detail.
- `GET /api/packages/:packageId/latest-approved`: latest approved version lookup.
- `GET /api/packages/:packageId/report`: maintainer package report with views, downloads, version count, latest approved version, and install-state totals.
- `GET /api/packages/:packageId/versions`: package version list.
- `GET /api/versions/:versionId`: version detail.
- `POST /api/validation/package-tree`: validate normalized package-tree entries.
- `POST /api/artifacts/ingest`: validate and store a package artifact by digest.
- `POST /api/workspaces/:workspaceId/packages/upload`: validate uploaded package-tree entries, store the artifact by digest, upsert package metadata, and create a draft version.
- `POST /api/workspaces/:workspaceId/packages/import-git`: import a package tree from a Git repository path/ref/subdirectory, store the artifact by digest, upsert package metadata, and create a draft version with Git provenance.
- `POST /api/versions/:versionId/lifecycle`: transition a version to `draft`, `published`, `approved`, `hidden`, or `deprecated`.
- `GET /api/artifacts/:digest/download`: download stored artifact zip bytes.
- `GET /api/workspaces/:workspaceId/usage-counts?eventType=&packageId=&versionId=`: count recorded view/download events.
- `GET /api/workspaces/:workspaceId/reports`: maintainer package reports for all packages in a workspace.
- `POST /api/install-reports`: record CLI/MCP install or status reports.

## Response Policy

Catalog and latest-version routes should expose approved installable versions to ordinary users. Maintainer-only visibility for draft, hidden, deprecated, and failed versions will be added with auth and role checks.

Artifact ingestion refuses invalid packages with `422` and stores valid packages immutably by validation digest.

Private workspaces require at least `user` role for catalog, package, and version reads. Public workspaces may be browsed without credentials.

Package detail requests record `view` usage events. Artifact downloads record `download` usage events when `packageId` and `versionId` query parameters are provided. These counters support reporting without mutating package version content.

Package reports count views and downloads as raw events. Install reports are deduplicated by `installId`; only the latest report timestamp for each install contributes to the package's current install-state totals. This lets repeated status checks update stale/current state without inflating adoption.

Lifecycle routes currently enforce valid state names, missing-version handling, and maintainer role checks.

## Current Auth

Protected routes accept bearer API keys configured through `SKILL_LIBRARY_API_KEYS`:

```text
Authorization: Bearer <token>
```

Development and tests may also use:

- `x-skill-library-role`: `user`, `maintainer`, or `admin`
- `x-skill-library-actor`: optional actor ID for provenance

Publishing, artifact ingestion, lifecycle transitions, usage counters, and report routes require `maintainer` or `admin`. Workspace settings changes require `admin`. Install reports require at least `user`.
