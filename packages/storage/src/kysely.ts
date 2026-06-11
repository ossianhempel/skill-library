import { Kysely, MssqlDialect, PGliteDialect, PostgresDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import * as Tedious from "tedious";
import * as Tarn from "tarn";
import type { ColumnType, Generated } from "kysely";

/**
 * Supported database engines. PGlite is the bundled zero-config default; Postgres
 * and Azure SQL Server (mssql) are external. The dialect for each is first-party in
 * Kysely, so a single query layer spans all three.
 */
export type DatabaseEngine = "pglite" | "postgres" | "mssql";

export interface KyselyEngineConfig {
  /** External connection string. Absent → PGlite default. */
  databaseUrl?: string;
  /** Explicit engine override; otherwise inferred from the connection string scheme. */
  databaseEngine?: DatabaseEngine;
  /** Filesystem path for the embedded PGlite database (pglite engine only). */
  pgliteDataDir?: string;
  /** Pre-constructed PGlite instance (lets callers reuse the writer-locked instance). */
  pgliteInstance?: PGlite;
}

/**
 * Resolve which engine to use. An explicit `databaseEngine` wins; otherwise the
 * connection string scheme decides; otherwise PGlite. Mirrors the precedence the
 * legacy `resolveDatabaseMode` used, widened to three engines.
 */
export function resolveDatabaseEngine(config: KyselyEngineConfig): DatabaseEngine {
  if (config.databaseEngine) {
    if (!isDatabaseEngine(config.databaseEngine)) {
      throw new Error(
        `Unknown database engine "${config.databaseEngine}". Supported engines: pglite, postgres, mssql.`
      );
    }
    return config.databaseEngine;
  }

  if (!config.databaseUrl) {
    return "pglite";
  }

  return engineFromConnectionString(config.databaseUrl);
}

function isDatabaseEngine(value: string): value is DatabaseEngine {
  return value === "pglite" || value === "postgres" || value === "mssql";
}

function engineFromConnectionString(connectionString: string): DatabaseEngine {
  const scheme = connectionString.split("://", 1)[0]?.toLowerCase() ?? "";

  if (scheme === "sqlserver" || scheme === "mssql") {
    return "mssql";
  }

  if (scheme === "postgres" || scheme === "postgresql") {
    return "postgres";
  }

  throw new Error(
    `Could not infer a database engine from connection string scheme "${scheme}://". ` +
      `Use a postgres://, postgresql://, or sqlserver:// URL, or set databaseEngine explicitly.`
  );
}

/**
 * Build a Kysely instance for the resolved engine. The returned instance is the single
 * shared query surface for both the registry store and Better Auth.
 *
 * Azure SQL Server connections enable TLS by default (Azure requires encryption);
 * tuning of pool size and certificate trust is layered on in the Azure-enablement unit.
 */
export function createKyselyInstance(config: KyselyEngineConfig): {
  db: Kysely<DatabaseSchema>;
  engine: DatabaseEngine;
} {
  const engine = resolveDatabaseEngine(config);
  return { db: new Kysely<DatabaseSchema>({ dialect: createDialect(engine, config) }), engine };
}

function createDialect(engine: DatabaseEngine, config: KyselyEngineConfig) {
  switch (engine) {
    case "pglite":
      return new PGliteDialect({
        pglite: config.pgliteInstance ?? new PGlite(config.pgliteDataDir)
      });
    case "postgres":
      return new PostgresDialect({ pool: new Pool({ connectionString: config.databaseUrl }) });
    case "mssql":
      return new MssqlDialect({
        tarn: { ...Tarn, options: { min: 0, max: 10 } },
        tedious: {
          ...Tedious,
          connectionFactory: () => new Tedious.Connection(buildTediousConfig(config.databaseUrl))
        }
      });
  }
}

/**
 * Parse a `sqlserver://user:pass@host:port/database` URL into a tedious config.
 * Azure SQL requires encryption, so `encrypt` defaults on. Certificate-trust and
 * pool tuning are refined in the Azure-enablement unit.
 */
export function buildTediousConfig(databaseUrl: string | undefined): Tedious.ConnectionConfiguration {
  if (!databaseUrl) {
    throw new Error("A sqlserver:// connection string is required for the mssql engine.");
  }

  const url = new URL(databaseUrl);

  return {
    server: url.hostname,
    options: {
      port: url.port ? Number(url.port) : 1433,
      database: url.pathname.replace(/^\//, "") || undefined,
      encrypt: true,
      trustServerCertificate: false
    },
    authentication: {
      type: "default",
      options: {
        userName: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password)
      }
    }
  };
}

/**
 * Typed database schema for Kysely. Column types follow the existing Postgres DDL;
 * the per-engine physical types (jsonb vs nvarchar(max), timestamptz vs datetimeoffset)
 * are produced by the cross-dialect migrations. JSON columns are stored as text and
 * (de)serialized at the store boundary, so they are typed `string` here.
 */
export interface DatabaseSchema {
  workspaces: WorkspacesTable;
  skill_packages: SkillPackagesTable;
  artifacts: ArtifactsTable;
  skill_versions: SkillVersionsTable;
  lifecycle_events: LifecycleEventsTable;
  install_reports: InstallReportsTable;
  usage_events: UsageEventsTable;
}

type Timestamp = ColumnType<Date, Date | string, Date | string>;

interface WorkspacesTable {
  id: string;
  slug: string;
  name: string;
  reporting_policy: string;
  visibility: string;
  created_at: Generated<Timestamp>;
}

interface SkillPackagesTable {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  description: string;
  // jsonb on pg/pglite (returned pre-parsed), nvarchar(max) on mssql (raw string).
  // Has a DB default, so optional on insert; the store boundary normalizes reads.
  categories: Generated<string>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface ArtifactsTable {
  digest: string;
  storage_path: string;
  size_bytes: ColumnType<number, number | bigint, number | bigint>;
  created_at: Generated<Timestamp>;
}

interface SkillVersionsTable {
  id: string;
  package_id: string;
  version: string;
  lifecycle_state: string;
  artifact_digest: string;
  validation: string;
  provenance: string;
  created_at: Timestamp;
  approved_at: Timestamp | null;
  replacement_version_id: string | null;
}

interface LifecycleEventsTable {
  id: string;
  version_id: string;
  from_state: string | null;
  to_state: string;
  actor_id: string | null;
  created_at: Generated<Timestamp>;
}

interface InstallReportsTable {
  install_id: string;
  package_id: string;
  version_id: string;
  state: string;
  reported_at: Timestamp;
  target_kind: string;
}

interface UsageEventsTable {
  id: string;
  workspace_id: string;
  package_id: string | null;
  version_id: string | null;
  event_type: string;
  created_at: Generated<Timestamp>;
}
