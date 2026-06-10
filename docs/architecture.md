# Architecture

Skill Library is a TypeScript monorepo for a self-hosted company skill catalog. The package boundaries are intentionally small at the scaffold stage so the web UI, registry server, CLI, and MCP surface share one vocabulary without reaching into each other's private code.

## Deployment Shape

The reference deployment is one application container. In default mode, that container serves the web UI, registry API, upload/download routes, health checks, and the registry's local persistence needs.

Default self-hosted mode uses:

- PGlite for relational data, stored under a mounted data directory such as `/data/db`.
- Local artifact storage under the same persistent volume, such as `/data/artifacts`.
- One public base URL for browser users, CLI users, and MCP/agent workflows.

External Postgres is a configuration swap, not a separate application topology. When `DATABASE_URL` is set, the same app container connects to managed or separately hosted Postgres while continuing to serve the UI/API and local artifact storage unless an artifact-store adapter is configured later.

The Docker and deployment work should preserve this invariant: a small team can run the product with one container and one persistent volume, while company deployments can add external Postgres without changing client behavior.

## Packages

- `packages/domain` owns shared types for workspaces, packages, immutable versions, lifecycle states, validation output, install destinations, install metadata, and reports.
- `packages/validation` owns reusable skill package validation. It accepts normalized package tree entries, rejects unsafe paths, requires one `SKILL.md`, preserves file metadata, and computes a deterministic digest.
- `packages/storage` owns persistence contracts, database-mode selection, migrations, and the PGlite/Postgres-backed registry store. It also keeps an in-memory implementation for narrow tests that do not need SQL behavior.
- `apps/server` owns the registry API composition layer. It depends on storage and validation rather than reimplementing rules.
- `apps/web` owns human catalog rendering code. It consumes domain contracts only at this stage.
- `packages/cli` owns local installation destinations and command rendering. It is the future filesystem actor for installs, updates, status, and reporting.
- `packages/mcp` owns agent-facing install-plan contracts and delegates local filesystem actions to CLI guidance.

## Dependency Direction

Domain has no internal workspace dependencies. Validation depends on domain. Storage depends on domain. Server depends on domain, storage, and validation. Web depends on domain. CLI depends on domain and validation. MCP depends on domain and CLI.

This keeps validation consistent across upload, Git import, CLI validation, and MCP validation while avoiding browser or server code becoming the only source of truth.

## Storage Configuration

Storage is configured through one `RegistryStoreConfig` shape:

- `dataDir`: defaults to `SKILL_LIBRARY_DATA_DIR` or `/data`.
- `pgliteDataDir`: defaults to `${dataDir}/db`.
- `artifactDir`: defaults to `${dataDir}/artifacts`.
- `databaseUrl`: when set, switches relational storage from PGlite to external Postgres.

PGlite mode enforces a single-writer lock file under `dataDir` at startup and logs persistence guidance. External Postgres mode skips the lock.

The registry server should call `createRegistryStore`, run `migrate`, and keep all clients on the same API regardless of the selected database mode.

## Current Verification

The root `pnpm verify` command builds all workspace packages and runs tests. Current behavioral coverage includes package validation and PGlite-backed storage migrations/query behavior.
