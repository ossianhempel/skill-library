import { Kysely, MssqlDialect, PGliteDialect, PostgresDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import * as Tedious from "tedious";
import * as Tarn from "tarn";
import type { ColumnType, Generated } from "kysely";
import type { SkillVersion, Workspace } from "@skill-library/domain";

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
export function resolveDatabaseEngine(
  config: KyselyEngineConfig
): DatabaseEngine {
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
  return {
    db: new Kysely<DatabaseSchema>({ dialect: createDialect(engine, config) }),
    engine,
  };
}

function createDialect(engine: DatabaseEngine, config: KyselyEngineConfig) {
  switch (engine) {
    case "pglite":
      return new PGliteDialect({
        pglite: config.pgliteInstance ?? new PGlite(config.pgliteDataDir),
      });
    case "postgres":
      return new PostgresDialect({
        pool: new Pool({ connectionString: config.databaseUrl }),
      });
    case "mssql":
      return new MssqlDialect({
        tarn: { ...Tarn, options: { min: 0, max: 10 } },
        tedious: {
          ...Tedious,
          connectionFactory: () =>
            new Tedious.Connection(buildTediousConfig(config.databaseUrl)),
        },
      });
  }
}

/**
 * Parse a `sqlserver://user:pass@host:port/database` URL into a tedious config.
 *
 * Azure SQL requires encryption, so `encrypt` defaults on and the server certificate
 * is trusted (`trustServerCertificate=false`) — Azure presents a real CA cert. Two
 * query params override these for other environments:
 *   - `?encrypt=false` — disable TLS (non-Azure servers without TLS)
 *   - `?trustServerCertificate=true` — accept self-signed certs (local containers)
 */
export function buildTediousConfig(
  databaseUrl: string | undefined
): Tedious.ConnectionConfiguration {
  if (!databaseUrl) {
    throw new Error(
      "A sqlserver:// connection string is required for the mssql engine."
    );
  }

  const url = new URL(databaseUrl);

  return {
    server: url.hostname,
    options: {
      port: url.port ? Number(url.port) : 1433,
      database: url.pathname.replace(/^\//, "") || undefined,
      encrypt: url.searchParams.get("encrypt") !== "false",
      trustServerCertificate:
        url.searchParams.get("trustServerCertificate") === "true",
    },
    authentication: {
      type: "default",
      options: {
        userName: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      },
    },
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
  // Better Auth tables. Runtime CRUD is owned by Better Auth's native Kysely adapter;
  // these types exist so the store can create the schema cross-dialect and run typed
  // maintenance queries (orphan cleanup, user count). Column names mirror the existing
  // schema: mostly camelCase (Better Auth defaults), with 4 snake_case columns mapped
  // via Better Auth's `fields` config.
  user: UserTable;
  session: SessionTable;
  account: AccountTable;
  verification: VerificationTable;
}

type Timestamp = ColumnType<Date, Date | string, Date | string>;
// Timestamp columns with a DB default (now()/sysdatetimeoffset()): optional on insert.
type GeneratedTimestamp = ColumnType<
  Date,
  Date | string | undefined,
  Date | string
>;

interface WorkspacesTable {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  reporting_policy: Workspace["reportingPolicy"];
  visibility: Workspace["visibility"];
  created_at: GeneratedTimestamp;
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
  created_at: GeneratedTimestamp;
}

interface SkillVersionsTable {
  id: string;
  package_id: string;
  version: string;
  lifecycle_state: SkillVersion["lifecycleState"];
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
  created_at: GeneratedTimestamp;
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
  created_at: GeneratedTimestamp;
}

interface UserTable {
  id: string;
  name: string;
  email: string;
  emailVerified: ColumnType<boolean, boolean | undefined, boolean>;
  image: string | null;
  role: Generated<string>;
  agent_api_token: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

interface SessionTable {
  id: string;
  expiresAt: Timestamp;
  token: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  ip_address: string | null;
  user_agent: string | null;
  userId: string;
}

interface AccountTable {
  id: string;
  accountId: string;
  providerId: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: Timestamp | null;
  refreshTokenExpiresAt: Timestamp | null;
  scope: string | null;
  password: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

interface VerificationTable {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Timestamp;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}
