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

  await db.schema
    .createTable("workspaces")
    .ifNotExists()
    .addColumn("id", t.keyText, (c) => c.primaryKey())
    .addColumn("slug", t.keyText, (c) => c.notNull().unique())
    .addColumn("name", t.freeText, (c) => c.notNull())
    .addColumn("reporting_policy", t.keyText, (c) =>
      c.notNull().check(sql`reporting_policy in ('disabled', 'opt-in', 'required')`)
    )
    .addColumn("visibility", t.keyText, (c) =>
      c.notNull().defaultTo("private").check(sql`visibility in ('public', 'private')`)
    )
    .addColumn("created_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
    .execute();

  await db.schema
    .createTable("skill_packages")
    .ifNotExists()
    .addColumn("id", t.keyText, (c) => c.primaryKey())
    .addColumn("workspace_id", t.keyText, (c) =>
      c.notNull().references("workspaces.id").onDelete("cascade")
    )
    .addColumn("slug", t.keyText, (c) => c.notNull())
    .addColumn("name", t.freeText, (c) => c.notNull())
    .addColumn("description", t.freeText, (c) => c.notNull())
    .addColumn("categories", t.json, (c) => c.notNull().defaultTo(t.emptyJsonArray))
    .addColumn("created_at", t.timestamp, (c) => c.notNull())
    .addColumn("updated_at", t.timestamp, (c) => c.notNull())
    .addUniqueConstraint("skill_packages_workspace_slug_unique", ["workspace_id", "slug"])
    .execute();

  await db.schema
    .createTable("artifacts")
    .ifNotExists()
    .addColumn("digest", t.keyText, (c) => c.primaryKey())
    .addColumn("storage_path", t.freeText, (c) => c.notNull())
    .addColumn("size_bytes", "bigint", (c) => c.notNull())
    .addColumn("created_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
    .execute();

  await db.schema
    .createTable("skill_versions")
    .ifNotExists()
    .addColumn("id", t.keyText, (c) => c.primaryKey())
    .addColumn("package_id", t.keyText, (c) =>
      c.notNull().references("skill_packages.id").onDelete("cascade")
    )
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

  await db.schema
    .createTable("lifecycle_events")
    .ifNotExists()
    .addColumn("id", t.keyText, (c) => c.primaryKey())
    .addColumn("version_id", t.keyText, (c) =>
      c.notNull().references("skill_versions.id").onDelete("cascade")
    )
    .addColumn("from_state", t.keyText)
    .addColumn("to_state", t.keyText, (c) => c.notNull())
    .addColumn("actor_id", t.keyText)
    .addColumn("created_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
    .execute();

  await db.schema
    .createTable("install_reports")
    .ifNotExists()
    .addColumn("install_id", t.keyText, (c) => c.notNull())
    .addColumn("package_id", t.keyText, (c) =>
      c.notNull().references("skill_packages.id").onDelete("cascade")
    )
    .addColumn("version_id", t.keyText, (c) =>
      c.notNull().references("skill_versions.id").onDelete("cascade")
    )
    .addColumn("state", t.keyText, (c) => c.notNull())
    .addColumn("reported_at", t.timestamp, (c) => c.notNull())
    .addColumn("target_kind", t.keyText, (c) => c.notNull())
    .addPrimaryKeyConstraint("install_reports_pk", ["install_id", "reported_at"])
    .execute();

  await db.schema
    .createTable("usage_events")
    .ifNotExists()
    .addColumn("id", t.keyText, (c) => c.primaryKey())
    .addColumn("workspace_id", t.keyText, (c) =>
      c.notNull().references("workspaces.id").onDelete("cascade")
    )
    .addColumn("package_id", t.keyText, (c) => c.references("skill_packages.id").onDelete("cascade"))
    .addColumn("version_id", t.keyText, (c) => c.references("skill_versions.id").onDelete("cascade"))
    .addColumn("event_type", t.keyText, (c) => c.notNull())
    .addColumn("created_at", t.timestamp, (c) => c.notNull().defaultTo(t.now))
    .execute();
}

interface ColumnTypeMap {
  keyText: RawBuilder<unknown>;
  freeText: RawBuilder<unknown>;
  json: RawBuilder<unknown>;
  timestamp: RawBuilder<unknown>;
  now: RawBuilder<unknown>;
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
      now: sql`sysdatetimeoffset()`,
      emptyJsonArray: sql`'[]'`
    };
  }

  // pglite and postgres share the same dialect.
  return {
    keyText: sql`text`,
    freeText: sql`text`,
    json: sql`jsonb`,
    timestamp: sql`timestamptz`,
    now: sql`now()`,
    emptyJsonArray: sql`'[]'::jsonb`
  };
}
