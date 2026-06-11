# Architecture

Skill Library is a TypeScript monorepo for a self-hosted company skill catalog. The package boundaries are intentionally small at the scaffold stage so the web UI, registry server, CLI, and MCP surface share one vocabulary without reaching into each other's private code.

## Deployment Shape

The reference deployment is one application container. In default mode, that container serves the web UI, registry API, upload/download routes, health checks, and the registry's local persistence needs.

Default self-hosted mode uses:

- PGlite for relational data, stored under a mounted data directory such as `/data/db`.
- Local artifact storage under the same persistent volume, such as `/data/artifacts`.
- One public base URL for browser users, CLI users, and MCP/agent workflows.

An external database engine is a configuration swap, not a separate application topology. When `DATABASE_URL` is set, the same app container connects to managed or separately hosted PostgreSQL or Azure SQL Server while continuing to serve the UI/API and local artifact storage unless an artifact-store adapter is configured later.

The Docker and deployment work should preserve this invariant: a small team can run the product with one container and one persistent volume, while company deployments can point at an external engine without changing client behavior.

## Packages

- `packages/domain` owns shared types for workspaces, packages, immutable versions, lifecycle states, validation output, install destinations, install metadata, and reports.
- `packages/validation` owns reusable skill package validation. It accepts normalized package tree entries, rejects unsafe paths, requires one `SKILL.md`, preserves file metadata, and computes a deterministic digest.
- `packages/storage` owns persistence contracts, database-engine selection, migrations, and the registry store. All SQL is expressed through [Kysely](https://kysely.dev) so the engine — bundled PGlite, external PostgreSQL, or Azure SQL Server — is a configuration choice rather than a code path. It also keeps an in-memory implementation for narrow tests that do not need SQL behavior.
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
- `databaseUrl`: when set, switches relational storage from the bundled PGlite to an external engine. The engine is inferred from the URL scheme (`postgres://`/`postgresql://` → PostgreSQL, `sqlserver://` → Azure SQL Server).

PGlite mode enforces a single-writer lock file under `dataDir` at startup and logs persistence guidance. External engines skip the lock.

The registry server should call `createRegistryStore`, run `migrate`, and keep all clients on the same API regardless of the selected engine.

### Database engines

The query layer is engine-portable. One shared Kysely instance, with a dialect chosen from config, feeds both the registry store and Better Auth, and each owns its own cross-dialect migrations. The store absorbs the T-SQL divergences (upsert via `MERGE` vs `ON CONFLICT`, `OFFSET/FETCH` vs `LIMIT`, `nvarchar(max)` JSON vs `jsonb`, `datetimeoffset` vs `timestamptz`, `bit` vs `boolean`, `JSON_VALUE` vs `->>`) behind the same method signatures.

| Engine | Selected by | Driver | Use |
|--------|-------------|--------|-----|
| PGlite | default (no `databaseUrl`) | `@electric-sql/pglite` | Zero-config bundled default; single-writer, one replica |
| PostgreSQL | `postgres://` / `postgresql://` | `pg` | External managed/self-hosted Postgres for HA |
| Azure SQL Server | `sqlserver://` | `tedious` + `tarn` | Orgs that mandate Microsoft SQL Server (T-SQL); TLS on by default |

Adding a further engine (e.g. MySQL or SQLite) is a matter of wiring its first-party Kysely dialect into the factory and the migration type helper — no new query code path.

## Current Verification

The root `pnpm verify` command builds all workspace packages and runs tests. Behavioral coverage includes package validation and PGlite-backed storage migrations/query behavior. The cross-dialect store and auth paths are additionally validated against a live SQL Server via a gated integration suite (see [deployment.md](./deployment.md#database-engines-and-azure-sql-server)).
