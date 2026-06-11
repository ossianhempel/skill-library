import { type Kysely, sql, type RawBuilder } from "kysely";
import type { DatabaseEngine, DatabaseSchema } from "./kysely.js";

/**
 * Cross-dialect schema creation for the registry's own tables. Replaces the
 * hand-written Postgres DDL array with Kysely schema-builder definitions whose
 * physical column types are chosen per engine:
 *
 *   - JSON columns        jsonb (pg/pglite)        nvarchar(max) (mssql)
 *   - timestamps          timestamptz              datetimeoffset
 *   - now() default       now()                    sysdatetimeoffset()
 *   - key text (pk/unique/fk) text                 nvarchar(450)  (mssql can't index nvarchar(max))
 *   - free text           text                     nvarchar(max)
 *
 * Idempotent: every table is created `if not exists`, so re-running migrate()
 * is a safe no-op. Auth tables (user/session/account/verification) are NOT
 * created here — they are owned by Better Auth's own migrations.
 */
export async function runRegistryMigrations(db: Kysely<DatabaseSchema>, engine: DatabaseEngine): Promise<void> {
  const t = engineColumnTypes(engine);

  // SQL Server has no `CREATE TABLE IF NOT EXISTS`, so idempotency comes from an
  // introspection check rather than the `.ifNotExists()` clause (which is pg/pglite only).
  const existing = new Set((await db.introspection.getTables()).map((table) => table.name));

  // SQL Server forbids multiple cascade paths to the same table. install_reports and
  // usage_events reach skill_packages/workspaces both directly and via skill_versions,
  // so their secondary FKs use NO ACTION on mssql (the primary chain stays cascade).
  // Postgres/PGlite allow the diamond and keep full cascade.
  const fkSecondary: "cascade" | "no action" = engine === "mssql" ? "no action" : "cascade";

  if (!existing.has("workspaces")) {
    await db.schema
      .createTable("workspaces")
      .addColumn("id", t.keyText, (c) => c.primaryKey())
      .addColumn("slug", t.keyText, (c) => c.notNull().unique())
      .addColumn("name", t.freeText, (c) => c.notNull())
      .addColumn("reporting_policy", t.keyText, (c) =>
        c.notNull().check(sql`reporting_policy in ('disabled', 'opt-in', 'required')`)
      )
      .addColumn("visibility", t.keyText, (c) =>
        c.notNull().defaultTo(sql.lit("private")).check(sql`visibility in ('public', 'private')`)
      )
      .addColumn("created_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .execute();
  }

  if (!existing.has("skill_packages")) {
    await db.schema
      .createTable("skill_packages")
      .addColumn("id", t.keyText, (c) => c.primaryKey())
      .addColumn("workspace_id", t.keyText, (c) => c.notNull().references("workspaces.id").onDelete("cascade"))
      .addColumn("slug", t.keyText, (c) => c.notNull())
      .addColumn("name", t.freeText, (c) => c.notNull())
      .addColumn("description", t.freeText, (c) => c.notNull())
      .addColumn("categories", t.json, (c) => c.notNull().defaultTo(t.emptyJsonArray))
      .addColumn("created_at", t.timestamp, (c) => c.notNull())
      .addColumn("updated_at", t.timestamp, (c) => c.notNull())
      .addUniqueConstraint("skill_packages_workspace_slug_unique", ["workspace_id", "slug"])
      .execute();
  }

  if (!existing.has("artifacts")) {
    await db.schema
      .createTable("artifacts")
      .addColumn("digest", t.keyText, (c) => c.primaryKey())
      .addColumn("storage_path", t.freeText, (c) => c.notNull())
      .addColumn("size_bytes", "bigint", (c) => c.notNull())
      .addColumn("created_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .execute();
  }

  if (!existing.has("skill_versions")) {
    await db.schema
      .createTable("skill_versions")
      .addColumn("id", t.keyText, (c) => c.primaryKey())
      .addColumn("package_id", t.keyText, (c) => c.notNull().references("skill_packages.id").onDelete("cascade"))
      .addColumn("version", t.keyText, (c) => c.notNull())
      .addColumn("lifecycle_state", t.keyText, (c) =>
        c.notNull().check(sql`lifecycle_state in ('draft', 'published', 'approved', 'hidden', 'deprecated')`)
      )
      .addColumn("artifact_digest", t.keyText, (c) => c.notNull())
      .addColumn("validation", t.json, (c) => c.notNull())
      .addColumn("provenance", t.json, (c) => c.notNull())
      .addColumn("created_at", t.timestamp, (c) => c.notNull())
      .addColumn("approved_at", t.timestamp)
      .addColumn("replacement_version_id", t.keyText, (c) => c.references("skill_versions.id"))
      .addUniqueConstraint("skill_versions_package_version_unique", ["package_id", "version"])
      .execute();
  }

  if (!existing.has("lifecycle_events")) {
    await db.schema
      .createTable("lifecycle_events")
      .addColumn("id", t.keyText, (c) => c.primaryKey())
      .addColumn("version_id", t.keyText, (c) => c.notNull().references("skill_versions.id").onDelete("cascade"))
      .addColumn("from_state", t.keyText)
      .addColumn("to_state", t.keyText, (c) => c.notNull())
      .addColumn("actor_id", t.keyText)
      .addColumn("created_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .execute();
  }

  if (!existing.has("install_reports")) {
    await db.schema
      .createTable("install_reports")
      .addColumn("install_id", t.keyText, (c) => c.notNull())
      .addColumn("package_id", t.keyText, (c) => c.notNull().references("skill_packages.id").onDelete("cascade"))
      .addColumn("version_id", t.keyText, (c) => c.notNull().references("skill_versions.id").onDelete(fkSecondary))
      .addColumn("state", t.keyText, (c) => c.notNull())
      .addColumn("reported_at", t.timestamp, (c) => c.notNull())
      .addColumn("target_kind", t.keyText, (c) => c.notNull())
      .addPrimaryKeyConstraint("install_reports_pk", ["install_id", "reported_at"])
      .execute();
  }

  if (!existing.has("usage_events")) {
    await db.schema
      .createTable("usage_events")
      .addColumn("id", t.keyText, (c) => c.primaryKey())
      .addColumn("workspace_id", t.keyText, (c) => c.notNull().references("workspaces.id").onDelete("cascade"))
      .addColumn("package_id", t.keyText, (c) => c.references("skill_packages.id").onDelete(fkSecondary))
      .addColumn("version_id", t.keyText, (c) => c.references("skill_versions.id").onDelete(fkSecondary))
      .addColumn("event_type", t.keyText, (c) => c.notNull())
      .addColumn("created_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .execute();
  }
}

/**
 * Cross-dialect creation of the Better Auth tables (user/session/account/verification).
 * Better Auth's native Kysely adapter owns runtime CRUD; the store owns the schema so it
 * works on every engine. Column names mirror the existing schema (mostly camelCase, with
 * created_at/updated_at/ip_address/user_agent snake_case — mapped via Better Auth `fields`).
 * Idempotent via introspection. Orphan cleanups run after creation (no-ops on a fresh DB).
 */
export async function runAuthMigrations(db: Kysely<DatabaseSchema>, engine: DatabaseEngine): Promise<void> {
  const t = engineColumnTypes(engine);
  const existing = new Set((await db.introspection.getTables()).map((table) => table.name));

  if (!existing.has("user")) {
    await db.schema
      .createTable("user")
      .addColumn("id", t.keyText, (c) => c.primaryKey())
      .addColumn("name", t.freeText, (c) => c.notNull())
      .addColumn("email", t.keyText, (c) => c.notNull().unique())
      .addColumn("emailVerified", t.bool, (c) => c.notNull().defaultTo(t.falseDefault))
      .addColumn("image", t.freeText)
      .addColumn("role", t.keyText, (c) => c.notNull().defaultTo(sql.lit("user")))
      .addColumn("agent_api_token", t.keyText, (c) => c.unique())
      .addColumn("created_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .addColumn("updated_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .execute();
  }

  if (!existing.has("session")) {
    await db.schema
      .createTable("session")
      .addColumn("id", t.keyText, (c) => c.primaryKey())
      .addColumn("expiresAt", t.timestamp, (c) => c.notNull())
      .addColumn("token", t.keyText, (c) => c.notNull().unique())
      .addColumn("created_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .addColumn("updated_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .addColumn("ip_address", t.freeText)
      .addColumn("user_agent", t.freeText)
      .addColumn("userId", t.keyText, (c) => c.notNull().references("user.id").onDelete("cascade"))
      .execute();
  }

  if (!existing.has("account")) {
    await db.schema
      .createTable("account")
      .addColumn("id", t.keyText, (c) => c.primaryKey())
      .addColumn("accountId", t.keyText, (c) => c.notNull())
      .addColumn("providerId", t.keyText, (c) => c.notNull())
      .addColumn("userId", t.keyText, (c) => c.notNull().references("user.id").onDelete("cascade"))
      .addColumn("accessToken", t.freeText)
      .addColumn("refreshToken", t.freeText)
      .addColumn("idToken", t.freeText)
      .addColumn("accessTokenExpiresAt", t.timestamp)
      .addColumn("refreshTokenExpiresAt", t.timestamp)
      .addColumn("scope", t.freeText)
      .addColumn("password", t.freeText)
      .addColumn("created_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .addColumn("updated_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .execute();
  }

  if (!existing.has("verification")) {
    await db.schema
      .createTable("verification")
      .addColumn("id", t.keyText, (c) => c.primaryKey())
      .addColumn("identifier", t.keyText, (c) => c.notNull())
      .addColumn("value", t.freeText, (c) => c.notNull())
      .addColumn("expiresAt", t.timestamp, (c) => c.notNull())
      .addColumn("created_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .addColumn("updated_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .execute();
  }

  // Remove orphaned auth rows left by historical partial-signup bugs (no-op on fresh DBs).
  await db
    .deleteFrom("session")
    .where("userId", "in", (eb) =>
      eb.selectFrom("user").leftJoin("account", "account.userId", "user.id").select("user.id").where("account.id", "is", null)
    )
    .execute();
  await db
    .deleteFrom("user")
    .where("id", "not in", (eb) => eb.selectFrom("account").select("account.userId"))
    .execute();
}

interface ColumnTypeMap {
  keyText: RawBuilder<unknown>;
  freeText: RawBuilder<unknown>;
  json: RawBuilder<unknown>;
  timestamp: RawBuilder<unknown>;
  bool: RawBuilder<unknown>;
  now: RawBuilder<unknown>;
  falseDefault: RawBuilder<unknown>;
  emptyJsonArray: RawBuilder<unknown>;
}

export function engineColumnTypes(engine: DatabaseEngine): ColumnTypeMap {
  if (engine === "mssql") {
    return {
      // SQL Server cannot index nvarchar(max), so pk/unique/fk columns are bounded.
      keyText: sql`nvarchar(450)`,
      freeText: sql`nvarchar(max)`,
      json: sql`nvarchar(max)`,
      timestamp: sql`datetimeoffset`,
      bool: sql`bit`,
      now: sql`sysdatetimeoffset()`,
      falseDefault: sql`0`,
      emptyJsonArray: sql`'[]'`
    };
  }

  // pglite and postgres share the same dialect.
  return {
    keyText: sql`text`,
    freeText: sql`text`,
    json: sql`jsonb`,
    timestamp: sql`timestamptz`,
    bool: sql`boolean`,
    now: sql`now()`,
    falseDefault: sql`false`,
    emptyJsonArray: sql`'[]'::jsonb`
  };
}
