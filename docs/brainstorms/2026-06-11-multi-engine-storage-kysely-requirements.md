---
date: 2026-06-11
topic: multi-engine-storage-kysely
title: "Engine-portable storage via Kysely (add Azure SQL Server)"
---

# Engine-portable storage via Kysely (add Azure SQL Server)

> **Status:** Requirements  ·  **Depth:** Deep (feature)  ·  **Target:** upstream OSS (`ossianhempel/skill-library`)

## Summary

Route all storage and auth SQL through [Kysely](https://kysely.dev) so the database engine becomes a configuration choice rather than something baked into hand-written SQL. PGlite (the zero-config bundled default) and PostgreSQL keep working unchanged; Azure SQL Server becomes the first newly supported engine; MySQL/SQLite become cheap to add later. The deliverable is **engine portability** — "bring your own SQL database" — so the registry works for more adopters, not a one-off SQL Server backend.

---

## Problem Frame

The app supports two *deployment targets* today — bundled PGlite and external PostgreSQL — but only ever speaks **one SQL dialect**, because PGlite is an embedded build of Postgres. That made adding PGlite nearly free and meant no dialect abstraction was ever needed.

Adopters whose organizations mandate a different engine (the first concrete case: a company that requires Azure Microsoft SQL Server) cannot run the registry at all. There is no connection-string swap that helps, because the SQL is hand-written and Postgres-specific in two places: the registry store queries and migrations in `packages/storage/src/index.ts`, and a custom Better Auth database adapter in `apps/server/src/better-auth-adapter.ts` that dynamically generates Postgres SQL (`$N` placeholders, `RETURNING *`, `LIMIT $n`, `ON CONFLICT`). The dialect lives in application code, so a new engine means editing application code — unless a dialect-aware layer is introduced.

The counterfactual for a SQL-Server-mandated org is "cannot adopt." Without portability, every new engine an adopter requires is a fresh bespoke effort.

---

## Key Decisions

- **Adopt Kysely as the query layer (query builder, not a full ORM).** Kysely ships first-party dialects for PGlite, PostgreSQL, MySQL, SQLite, and MSSQL (via `tedious`), so one tool spans every engine the project cares about while preserving the embedded PGlite default. A full ORM was rejected: Prisma is heavy and does not support the embedded PGlite default; Drizzle's SQL Server dialect is still 1.0-beta on the exact engine needed first.
- **Retire the custom Better Auth adapter in favor of Better Auth's native Kysely adapter.** Better Auth runs on Kysely internally and officially supports SQL Server through it. Sharing one Kysely instance across registry store and auth collapses the two SQL-emitting surfaces into one and deletes ~235 lines of hand-written adapter code. The trade-off: auth-table schema and migrations become Better Auth's responsibility rather than the app's hand-written DDL.
- **PGlite stays the zero-config default; PostgreSQL and existing deployments keep working.** Portability adds engines; it does not replace or regress the current ones.
- **Engine selection is config-driven.** No code change to switch engines; the exact mechanism (connection-target scheme vs. explicit setting) is a planning decision.
- **Ship engine-agnostic to upstream OSS.** The abstraction carries no Rebtech-specific hostnames or identifiers; portability benefits all adopters.

---

## Requirements

**Engine support & selection**

- R1. The storage layer supports at least three SQL engines — bundled PGlite (default), PostgreSQL, and Azure SQL Server — chosen by configuration without code changes.
- R2. PGlite remains the zero-config default when no external database is configured; existing PGlite and PostgreSQL deployments continue to work unchanged after the migration.
- R3. The engine is selected from configuration; the exact selection mechanism is deferred to planning.

**Query layer**

- R4. All persistence SQL — registry store queries and migrations — is expressed through Kysely rather than hand-written dialect-specific SQL strings.
- R5. Dialect-divergent operations produce correct behavior on every supported engine — notably upsert (Postgres `ON CONFLICT` vs. SQL Server `MERGE`), row-return semantics (`RETURNING` vs. `OUTPUT`), and pagination (`LIMIT/OFFSET` vs. `OFFSET/FETCH`).
- R6. JSON-bearing columns (`categories`, `validation`, `provenance`) round-trip correctly across engines despite differing native JSON types.

**Auth integration**

- R7. The custom Better Auth database adapter is retired in favor of Better Auth's native Kysely adapter, sharing one engine/dialect configuration with the registry store.
- R8. All existing auth behavior — Microsoft Entra sign-in, session, account linking, and the agent API token — is preserved across supported engines.

**Migrations & schema**

- R9. Schema creation/migration runs successfully and idempotently (re-runs are safe) on a fresh database of each supported engine.
- R10. Auth-table schema is owned by Better Auth's migration mechanism; application-table schema is owned by the app's Kysely migrations. The two coexist without clobbering each other.

**Compatibility & contributor workflow**

- R11. The change ships to upstream OSS and the engine abstraction stays engine-agnostic — no Rebtech-specific hostnames, tenant IDs, or resource names in the storage/auth layer.
- R12. The data layer is tested against each supported engine — at minimum PGlite plus one server engine, with SQL Server coverage for the dialect-divergent operations in R5.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3.** With Azure SQL Server configured, the app boots, runs migrations, and serves. With no database configured, it falls back to the bundled PGlite default. Both paths use the same code.
- AE2. **Covers R5.** Upserting the same workspace twice updates the existing row rather than creating a duplicate or erroring — on both PostgreSQL and SQL Server.
- AE3. **Covers R6.** A package created with a non-empty `categories` array on a SQL Server deployment reads back as the identical array.
- AE4. **Covers R7, R8.** A user signs in via Microsoft Entra on a SQL Server deployment; the session persists and the account links correctly, with no custom adapter in the path.

---

## Scope Boundaries

**Deferred for later**

- MySQL and SQLite engine support — cheap to add once the Kysely layer exists, but not part of this work.
- A data-migration / export tool to move existing data between engines.

**Outside this product's identity**

- Becoming a general multi-tenant database service, or supporting non-SQL stores.
- Cross-engine live replication, heterogeneous sharding, or running multiple engines simultaneously in one deployment.

---

## Dependencies / Assumptions

- Kysely's first-party dialects for PGlite, PostgreSQL, and MSSQL (`tedious`) are production-suitable for this workload.
- Better Auth's Kysely adapter supports SQL Server as documented. A known MSSQL edge case ([better-auth#3143](https://github.com/better-auth/better-auth/issues/3143)) must be validated early — it is the single biggest feasibility risk and should be smoke-tested before full cutover.
- Each deployment runs a **single** engine; there is no requirement to move existing data between engines, so no cross-engine data-migration tooling is needed.
- The SQL Server path adds `tedious` (driver) and `tarn` (pooling) as runtime dependencies; Better Auth's MSSQL join support requires the `experimental.joins` option.

---

## Outstanding Questions

**Deferred to Planning**

- Engine-selection mechanism: infer from a connection-target scheme (`postgres://` vs `sqlserver://`) vs. an explicit engine setting.
- Whether to move the existing PostgreSQL path onto Kysely's `pg` dialect for uniformity, or keep node-`pg` only for that path (uniformity is likely preferable).
- Migration orchestration: how the app's Kysely migrator and Better Auth's `getMigrations` are sequenced and run on a fresh database.
- Connection pooling configuration per engine (`tarn` for MSSQL; pool sizing for server engines vs. in-process PGlite).
- Upsert strategy in Kysely where it does not fully unify `ON CONFLICT`/`MERGE` — per-dialect query branches vs. a thin helper.

---

## Sources / Research

- `packages/storage/src/index.ts` — `RegistryStore` interface, the `query(sql, params)` seam, the Postgres-specific migration array and queries to port.
- `apps/server/src/better-auth-adapter.ts` — the ~235-line custom adapter to retire.
- [Kysely dialects](https://kysely.dev/docs/dialects) — first-party PGlite / Postgres / MSSQL support.
- [kysely-pglite](https://github.com/dnlsandiego/kysely-pglite) and Kysely's built-in PGlite dialect — embedded-default story.
- [Better Auth — MS SQL adapter](https://better-auth.com/docs/adapters/mssql) — native Kysely-based SQL Server support.
- [better-auth#3143](https://github.com/better-auth/better-auth/issues/3143) — known MSSQL edge case to validate.
- Alternatives considered: [Drizzle MSSQL](https://orm.drizzle.team/docs/get-started-mssql) (1.0-beta), Prisma `sqlserver` (mature but heavy, no PGlite default).
