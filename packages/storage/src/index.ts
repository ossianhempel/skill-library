import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Client } from "pg";
import {
  acquirePgliteWriterLock,
  formatPglitePersistenceWarning,
  type PgliteWriterLockOptions
} from "./pglite-lock.js";
import type { Kysely } from "kysely";
import { createKyselyInstance, type DatabaseEngine, type DatabaseSchema } from "./kysely.js";
import { runRegistryMigrations } from "./migrations.js";
import type {
  InstallReport,
  InstalledSkillState,
  LifecycleState,
  PackageReport,
  SkillPackage,
  SkillVersion,
  UsageEvent,
  Workspace
} from "@skill-library/domain";

export type DatabaseMode = "pglite" | "postgres";

export {
  resolveDatabaseEngine,
  createKyselyInstance,
  buildTediousConfig
} from "./kysely.js";
export type { DatabaseEngine, DatabaseSchema, KyselyEngineConfig } from "./kysely.js";

export interface RegistryStore {
  mode: DatabaseMode;
  paths: RegistryStoragePaths;
  migrate(): Promise<void>;
  close(): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  putArtifact(artifact: ArtifactInput): Promise<StoredArtifact>;
  getArtifact(digest: string): Promise<StoredArtifact | undefined>;
  readArtifactContent(digest: string): Promise<Buffer | undefined>;
  getWorkspace(workspaceId: string): Promise<Workspace | undefined>;
  upsertWorkspace(workspace: Workspace): Promise<void>;
  upsertPackage(pkg: SkillPackage): Promise<void>;
  createVersion(version: SkillVersion): Promise<SkillVersion>;
  transitionVersion(input: VersionTransitionInput): Promise<SkillVersion | undefined>;
  listPackages(workspaceId: string): Promise<SkillPackage[]>;
  getPackage(packageId: string): Promise<SkillPackage | undefined>;
  listVersions(packageId: string): Promise<SkillVersion[]>;
  getVersion(versionId: string): Promise<SkillVersion | undefined>;
  getLatestApprovedVersion(packageId: string): Promise<SkillVersion | undefined>;
  recordInstallReport(report: InstallReport): Promise<void>;
  recordUsageEvent(event: UsageEvent): Promise<void>;
  countUsageEvents(filter: UsageEventFilter): Promise<number>;
  getPackageReport(packageId: string): Promise<PackageReport | undefined>;
  getWorkspaceReports(workspaceId: string): Promise<PackageReport[]>;
}

export interface RegistryStoreConfig {
  databaseUrl?: string;
  dataDir?: string;
  pgliteDataDir?: string;
  artifactDir?: string;
  pgliteWriterLock?: PgliteWriterLockOptions;
}

export interface RegistryStoragePaths {
  dataDir: string;
  pgliteDataDir: string;
  artifactDir: string;
}

export interface ArtifactInput {
  digest: string;
  content: Uint8Array;
}

export interface StoredArtifact {
  digest: string;
  storagePath: string;
  sizeBytes: number;
  createdAt: string;
}

export interface UsageEventFilter {
  workspaceId: string;
  eventType?: UsageEvent["eventType"];
  packageId?: string;
  versionId?: string;
}

export interface VersionTransitionInput {
  versionId: string;
  toState: LifecycleState;
  actorId?: string;
  replacementVersionId?: string;
}

interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const defaultDataDir = process.env.SKILL_LIBRARY_DATA_DIR ?? "/data";

export function resolveDatabaseMode(config: RegistryStoreConfig): DatabaseMode {
  return config.databaseUrl ? "postgres" : "pglite";
}

export function resolveStoragePaths(config: RegistryStoreConfig = {}): RegistryStoragePaths {
  const dataDir = config.dataDir ?? defaultDataDir;

  return {
    dataDir,
    pgliteDataDir: config.pgliteDataDir ?? join(dataDir, "db"),
    artifactDir: config.artifactDir ?? join(dataDir, "artifacts")
  };
}

export async function createRegistryStore(config: RegistryStoreConfig = {}): Promise<RegistryStore> {
  const mode = resolveDatabaseMode(config);
  const paths = resolveStoragePaths(config);

  await mkdir(paths.artifactDir, { recursive: true });

  if (mode === "postgres") {
    const client = new Client({ connectionString: config.databaseUrl });
    await client.connect();
    // Kysely runs migrations over its own pool; the legacy client serves CRUD until
    // those queries are ported. Both close on shutdown.
    const { db: kysely } = createKyselyInstance({ databaseUrl: config.databaseUrl, databaseEngine: "postgres" });
    return new SqlRegistryStore(mode, paths, client, "postgres", kysely, async () => {
      await client.end();
      await kysely.destroy();
    });
  }

  console.warn(`[skill-library] ${formatPglitePersistenceWarning(paths.dataDir)}`);

  await mkdir(paths.dataDir, { recursive: true });
  const releasePgliteWriterLock = await acquirePgliteWriterLock(paths.dataDir, config.pgliteWriterLock);
  await mkdir(dirname(paths.pgliteDataDir), { recursive: true });
  const db = new PGlite(paths.pgliteDataDir);
  // One PGlite instance backs both the legacy query path and Kysely. PGliteDriver.destroy()
  // closes the instance, so we close it directly once here instead of via kysely.destroy().
  const { db: kysely } = createKyselyInstance({ databaseEngine: "pglite", pgliteInstance: db });

  return new SqlRegistryStore(mode, paths, db, "pglite", kysely, async () => {
    if (!db.closed) {
      await db.close();
    }
    await releasePgliteWriterLock();
  });
}

export class SqlRegistryStore implements RegistryStore {
  constructor(
    readonly mode: DatabaseMode,
    readonly paths: RegistryStoragePaths,
    private readonly db: Queryable,
    private readonly engine: DatabaseEngine,
    private readonly kysely: Kysely<DatabaseSchema>,
    private readonly closeDb: () => Promise<void>
  ) {}

  async migrate(): Promise<void> {
    await runRegistryMigrations(this.kysely, this.engine);

    // Auth tables are still created via legacy Postgres DDL until Better Auth's native
    // Kysely adapter owns them (U5). These statements are Postgres-only; on mssql the
    // auth schema comes from Better Auth, so skip them.
    if (this.engine !== "mssql") {
      for (const migration of legacyAuthMigrations) {
        await this.db.query(migration);
      }
    }
  }

  async close(): Promise<void> {
    await this.closeDb();
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
    return this.db.query<T>(sql, params);
  }

  async putArtifact(artifact: ArtifactInput): Promise<StoredArtifact> {
    const storagePath = artifactPath(this.paths.artifactDir, artifact.digest);

    await mkdir(dirname(storagePath), { recursive: true });
    await writeFile(storagePath, artifact.content, { flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") {
        throw error;
      }
    });

    await this.db.query(
      `insert into artifacts (digest, storage_path, size_bytes)
       values ($1, $2, $3)
       on conflict (digest) do nothing`,
      [artifact.digest, storagePath, artifact.content.byteLength]
    );

    const stored = await this.getArtifact(artifact.digest);

    if (!stored) {
      throw new Error(`Artifact record was not stored for digest ${artifact.digest}`);
    }

    return stored;
  }

  async getArtifact(digest: string): Promise<StoredArtifact | undefined> {
    const row = await this.kysely
      .selectFrom("artifacts")
      .select(["digest", "storage_path", "size_bytes", "created_at"])
      .where("digest", "=", digest)
      .executeTakeFirst();

    return row ? fromArtifactRow(row) : undefined;
  }

  async readArtifactContent(digest: string): Promise<Buffer | undefined> {
    const artifact = await this.getArtifact(digest);

    return artifact ? readFile(artifact.storagePath) : undefined;
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | undefined> {
    const row = await this.kysely
      .selectFrom("workspaces")
      .select(["id", "slug", "name", "reporting_policy", "visibility"])
      .where("id", "=", workspaceId)
      .executeTakeFirst();

    return row ? fromWorkspaceRow(row) : undefined;
  }

  async upsertWorkspace(workspace: Workspace): Promise<void> {
    await this.db.query(
      `insert into workspaces (id, slug, name, reporting_policy, visibility)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do update set slug = excluded.slug, name = excluded.name, reporting_policy = excluded.reporting_policy, visibility = excluded.visibility`,
      [workspace.id, workspace.slug, workspace.name, workspace.reportingPolicy, workspace.visibility]
    );
  }

  async upsertPackage(pkg: SkillPackage): Promise<void> {
    await this.db.query(
      `insert into skill_packages (id, workspace_id, slug, name, description, categories, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do update set
         workspace_id = excluded.workspace_id,
         slug = excluded.slug,
         name = excluded.name,
         description = excluded.description,
         categories = excluded.categories,
         updated_at = excluded.updated_at`,
      [pkg.id, pkg.workspaceId, pkg.slug, pkg.name, pkg.description, JSON.stringify(pkg.categories), pkg.createdAt, pkg.updatedAt]
    );
  }

  async createVersion(version: SkillVersion): Promise<SkillVersion> {
    await this.db.query(
      `insert into skill_versions (
        id, package_id, version, lifecycle_state, artifact_digest, validation, provenance, created_at, approved_at, replacement_version_id
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        version.id,
        version.packageId,
        version.version,
        version.lifecycleState,
        version.artifactDigest,
        JSON.stringify(version.validation),
        JSON.stringify(version.provenance),
        version.createdAt,
        version.approvedAt ?? null,
        version.replacementVersionId ?? null
      ]
    );

    return version;
  }

  async transitionVersion(input: VersionTransitionInput): Promise<SkillVersion | undefined> {
    const current = await this.getVersion(input.versionId);

    if (!current) {
      return undefined;
    }

    const approvedAt = input.toState === "approved" ? new Date().toISOString() : current.approvedAt;

    await this.db.query(
      `update skill_versions
       set lifecycle_state = $2, approved_at = $3, replacement_version_id = $4
       where id = $1`,
      [input.versionId, input.toState, approvedAt ?? null, input.replacementVersionId ?? current.replacementVersionId ?? null]
    );
    await this.db.query(
      `insert into lifecycle_events (id, version_id, from_state, to_state, actor_id)
       values ($1, $2, $3, $4, $5)`,
      [randomUUID(), input.versionId, current.lifecycleState, input.toState, input.actorId ?? null]
    );

    return this.getVersion(input.versionId);
  }

  async listPackages(workspaceId: string): Promise<SkillPackage[]> {
    const rows = await this.kysely
      .selectFrom("skill_packages")
      .selectAll()
      .where("workspace_id", "=", workspaceId)
      .orderBy("name", "asc")
      .execute();

    return rows.map(fromPackageRow);
  }

  async getPackage(packageId: string): Promise<SkillPackage | undefined> {
    const row = await this.kysely
      .selectFrom("skill_packages")
      .selectAll()
      .where("id", "=", packageId)
      .executeTakeFirst();

    return row ? fromPackageRow(row) : undefined;
  }

  async listVersions(packageId: string): Promise<SkillVersion[]> {
    const rows = await this.kysely
      .selectFrom("skill_versions")
      .selectAll()
      .where("package_id", "=", packageId)
      .orderBy("created_at", "desc")
      .execute();

    return rows.map(fromVersionRow);
  }

  async getVersion(versionId: string): Promise<SkillVersion | undefined> {
    const row = await this.kysely
      .selectFrom("skill_versions")
      .selectAll()
      .where("id", "=", versionId)
      .executeTakeFirst();

    return row ? fromVersionRow(row) : undefined;
  }

  async getLatestApprovedVersion(packageId: string): Promise<SkillVersion | undefined> {
    const result = await this.db.query<VersionRow>(
      `select id, package_id, version, lifecycle_state, artifact_digest, validation, provenance, created_at, approved_at, replacement_version_id
       from skill_versions
       where package_id = $1 and lifecycle_state = 'approved'
       order by approved_at desc nulls last, created_at desc
       limit 1`,
      [packageId]
    );

    return result.rows[0] ? fromVersionRow(result.rows[0]) : undefined;
  }

  async recordInstallReport(report: InstallReport): Promise<void> {
    await this.db.query(
      `insert into install_reports (install_id, package_id, version_id, state, reported_at, target_kind)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (install_id, reported_at) do nothing`,
      [report.installId, report.packageId, report.versionId, report.state, report.reportedAt, report.targetKind]
    );
  }

  async recordUsageEvent(event: UsageEvent): Promise<void> {
    await this.db.query(
      `insert into usage_events (id, workspace_id, package_id, version_id, event_type, created_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do nothing`,
      [event.id, event.workspaceId, event.packageId ?? null, event.versionId ?? null, event.eventType, event.createdAt]
    );
  }

  async countUsageEvents(filter: UsageEventFilter): Promise<number> {
    const conditions = ["workspace_id = $1"];
    const params: unknown[] = [filter.workspaceId];

    if (filter.eventType) {
      params.push(filter.eventType);
      conditions.push(`event_type = $${params.length}`);
    }

    if (filter.packageId) {
      params.push(filter.packageId);
      conditions.push(`package_id = $${params.length}`);
    }

    if (filter.versionId) {
      params.push(filter.versionId);
      conditions.push(`version_id = $${params.length}`);
    }

    const result = await this.db.query<{ count: string | number }>(`select count(*) as count from usage_events where ${conditions.join(" and ")}`, params);

    return Number(result.rows[0]?.count ?? 0);
  }

  async getPackageReport(packageId: string): Promise<PackageReport | undefined> {
    const pkg = await this.getPackage(packageId);

    if (!pkg) {
      return undefined;
    }

    const versions = await this.listVersions(packageId);
    const latestApprovedVersion = await this.getLatestApprovedVersion(packageId);
    const views = await this.countUsageEvents({
      workspaceId: pkg.workspaceId,
      packageId,
      eventType: "view"
    });
    const downloads = await this.countUsageEvents({
      workspaceId: pkg.workspaceId,
      packageId,
      eventType: "download"
    });
    const reportRows = await this.db.query<InstallReportRow>(
      `select install_id, state, reported_at
       from install_reports
       where package_id = $1`,
      [packageId]
    );

    return buildPackageReport({
      packageId,
      workspaceId: pkg.workspaceId,
      versionCount: versions.length,
      latestApprovedVersionId: latestApprovedVersion?.id,
      views,
      downloads,
      reports: reportRows.rows.map((row) => ({
        installId: row.install_id,
        state: row.state,
        reportedAt: toIsoString(row.reported_at)
      }))
    });
  }

  async getWorkspaceReports(workspaceId: string): Promise<PackageReport[]> {
    const packages = await this.listPackages(workspaceId);
    const reports: PackageReport[] = [];

    for (const pkg of packages) {
      const report = await this.getPackageReport(pkg.id);

      if (report) {
        reports.push(report);
      }
    }

    return reports;
  }

  async seed(workspace: Workspace, packages: SkillPackage[], versions: SkillVersion[]): Promise<void> {
    await this.upsertWorkspace(workspace);

    for (const pkg of packages) {
      await this.upsertPackage(pkg);
    }

    for (const version of versions) {
      await this.createVersion(version).catch((error: NodeJS.ErrnoException) => {
        if (!String(error.message).includes("duplicate key")) {
          throw error;
        }
      });
    }
  }
}

export class MemoryRegistryStore implements RegistryStore {
  readonly mode: DatabaseMode;
  readonly paths: RegistryStoragePaths;
  private readonly packages = new Map<string, SkillPackage>();
  private readonly workspaces = new Map<string, Workspace>();
  private readonly versions = new Map<string, SkillVersion[]>();
  private readonly reports: InstallReport[] = [];
  private readonly usageEvents: UsageEvent[] = [];

  constructor(config: RegistryStoreConfig = {}) {
    this.mode = resolveDatabaseMode(config);
    this.paths = resolveStoragePaths(config);
  }

  async migrate(): Promise<void> {}

  async close(): Promise<void> {}

  async query<T = Record<string, unknown>>(_sql: string, _params?: unknown[]): Promise<{ rows: T[] }> {
    return { rows: [] };
  }

  async putArtifact(artifact: ArtifactInput): Promise<StoredArtifact> {
    return {
      digest: artifact.digest,
      storagePath: artifactPath(this.paths.artifactDir, artifact.digest),
      sizeBytes: artifact.content.byteLength,
      createdAt: new Date().toISOString()
    };
  }

  async getArtifact(_digest: string): Promise<StoredArtifact | undefined> {
    return undefined;
  }

  async readArtifactContent(_digest: string): Promise<Buffer | undefined> {
    return undefined;
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | undefined> {
    return this.workspaces.get(workspaceId);
  }

  async upsertWorkspace(workspace: Workspace): Promise<void> {
    this.workspaces.set(workspace.id, workspace);
  }

  async upsertPackage(pkg: SkillPackage): Promise<void> {
    this.packages.set(pkg.id, pkg);
  }

  async createVersion(version: SkillVersion): Promise<SkillVersion> {
    const current = this.versions.get(version.packageId) ?? [];
    current.push(version);
    this.versions.set(version.packageId, current);
    return version;
  }

  async transitionVersion(input: VersionTransitionInput): Promise<SkillVersion | undefined> {
    const version = await this.getVersion(input.versionId);

    if (!version) {
      return undefined;
    }

    version.lifecycleState = input.toState;
    version.approvedAt = input.toState === "approved" ? new Date().toISOString() : version.approvedAt;
    version.replacementVersionId = input.replacementVersionId ?? version.replacementVersionId;
    return version;
  }

  seed(workspace: Workspace, packages: SkillPackage[], versions: SkillVersion[]) {
    this.workspaces.set(workspace.id, workspace);

    for (const pkg of packages) {
      this.packages.set(pkg.id, pkg);
    }

    for (const version of versions) {
      const current = this.versions.get(version.packageId) ?? [];
      current.push(version);
      this.versions.set(version.packageId, current);
    }
  }

  async listPackages(workspaceId: string): Promise<SkillPackage[]> {
    return [...this.packages.values()].filter((pkg) => pkg.workspaceId === workspaceId);
  }

  async getPackage(packageId: string): Promise<SkillPackage | undefined> {
    return this.packages.get(packageId);
  }

  async listVersions(packageId: string): Promise<SkillVersion[]> {
    return (this.versions.get(packageId) ?? []).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getVersion(versionId: string): Promise<SkillVersion | undefined> {
    return [...this.versions.values()].flat().find((version) => version.id === versionId);
  }

  async getLatestApprovedVersion(packageId: string): Promise<SkillVersion | undefined> {
    return (this.versions.get(packageId) ?? [])
      .filter((version) => version.lifecycleState === "approved")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }

  async recordInstallReport(report: InstallReport): Promise<void> {
    this.reports.push(report);
  }

  async recordUsageEvent(event: UsageEvent): Promise<void> {
    this.usageEvents.push(event);
  }

  async countUsageEvents(filter: UsageEventFilter): Promise<number> {
    return this.usageEvents.filter((event) => {
      return (
        event.workspaceId === filter.workspaceId &&
        (!filter.eventType || event.eventType === filter.eventType) &&
        (!filter.packageId || event.packageId === filter.packageId) &&
        (!filter.versionId || event.versionId === filter.versionId)
      );
    }).length;
  }

  async getPackageReport(packageId: string): Promise<PackageReport | undefined> {
    const pkg = await this.getPackage(packageId);

    if (!pkg) {
      return undefined;
    }

    const versions = await this.listVersions(packageId);
    const latestApprovedVersion = await this.getLatestApprovedVersion(packageId);
    const views = await this.countUsageEvents({
      workspaceId: pkg.workspaceId,
      packageId,
      eventType: "view"
    });
    const downloads = await this.countUsageEvents({
      workspaceId: pkg.workspaceId,
      packageId,
      eventType: "download"
    });

    return buildPackageReport({
      packageId,
      workspaceId: pkg.workspaceId,
      versionCount: versions.length,
      latestApprovedVersionId: latestApprovedVersion?.id,
      views,
      downloads,
      reports: this.reports.filter((report) => report.packageId === packageId)
    });
  }

  async getWorkspaceReports(workspaceId: string): Promise<PackageReport[]> {
    const packages = await this.listPackages(workspaceId);
    const reports: PackageReport[] = [];

    for (const pkg of packages) {
      const report = await this.getPackageReport(pkg.id);

      if (report) {
        reports.push(report);
      }
    }

    return reports;
  }
}

const installStates: InstalledSkillState[] = [
  "current",
  "stale",
  "deprecated",
  "hidden",
  "unknown-registry",
  "missing-metadata",
  "modified-local-content"
];

// Auth tables stay on the legacy raw-SQL path until the Better Auth native Kysely
// adapter takes over schema ownership (see U5). Registry tables are created by
// runRegistryMigrations (cross-dialect). These statements are Postgres-only and run
// for the pglite/postgres engines; mssql auth schema is owned by Better Auth.
const legacyAuthMigrations = [
  `create table if not exists "user" (
    id text primary key,
    name text not null,
    email text not null unique,
    "emailVerified" boolean not null default false,
    image text,
    role text not null default 'user',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists "session" (
    id text primary key,
    "expiresAt" timestamptz not null,
    token text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    ip_address text,
    user_agent text,
    "userId" text not null references "user"(id) on delete cascade
  )`,
  `create table if not exists "account" (
    id text primary key,
    "accountId" text not null,
    "providerId" text not null,
    "userId" text not null references "user"(id) on delete cascade,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamptz,
    "refreshTokenExpiresAt" timestamptz,
    "scope" text,
    password text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `alter table "account" add column if not exists "accessTokenExpiresAt" timestamptz`,
  `alter table "account" add column if not exists "refreshTokenExpiresAt" timestamptz`,
  `alter table "account" add column if not exists "scope" text`,
  `alter table "user" add column if not exists agent_api_token text unique`,
  `delete from "session" where "userId" in (
    select u.id from "user" u
    left join "account" a on a."userId" = u.id
    where a.id is null
  )`,
  `delete from "user" where id not in (select "userId" from "account")`,
  `create table if not exists "verification" (
    id text primary key,
    identifier text not null,
    value text not null,
    "expiresAt" timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`
];

interface PackageRow {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  description: string;
  categories: string[] | string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
  reporting_policy: Workspace["reportingPolicy"];
  visibility: Workspace["visibility"];
}

interface VersionRow {
  id: string;
  package_id: string;
  version: string;
  lifecycle_state: SkillVersion["lifecycleState"];
  artifact_digest: string;
  validation: SkillVersion["validation"] | string;
  provenance: SkillVersion["provenance"] | string;
  created_at: string | Date;
  approved_at?: string | Date | null;
  replacement_version_id?: string | null;
}

interface ArtifactRow {
  digest: string;
  storage_path: string;
  size_bytes: string | number;
  created_at: string | Date;
}

interface InstallReportRow {
  install_id: string;
  state: InstalledSkillState;
  reported_at: string | Date;
}

interface ReportInput {
  packageId: string;
  workspaceId: string;
  versionCount: number;
  latestApprovedVersionId?: string;
  views: number;
  downloads: number;
  reports: Pick<InstallReport, "installId" | "state" | "reportedAt">[];
}

function buildPackageReport(input: ReportInput): PackageReport {
  const latestByInstall = new Map<string, Pick<InstallReport, "installId" | "state" | "reportedAt">>();

  for (const report of input.reports) {
    const current = latestByInstall.get(report.installId);

    if (!current || report.reportedAt > current.reportedAt) {
      latestByInstall.set(report.installId, report);
    }
  }

  const byState = Object.fromEntries(installStates.map((state) => [state, 0])) as PackageReport["installs"]["byState"];

  for (const report of latestByInstall.values()) {
    byState[report.state] += 1;
  }

  return {
    packageId: input.packageId,
    workspaceId: input.workspaceId,
    versionCount: input.versionCount,
    latestApprovedVersionId: input.latestApprovedVersionId,
    views: input.views,
    downloads: input.downloads,
    installs: {
      total: latestByInstall.size,
      byState
    }
  };
}

function fromPackageRow(row: PackageRow): SkillPackage {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    categories: parseJson(row.categories),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function fromWorkspaceRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    reportingPolicy: row.reporting_policy,
    visibility: row.visibility
  };
}

function fromVersionRow(row: VersionRow): SkillVersion {
  return {
    id: row.id,
    packageId: row.package_id,
    version: row.version,
    lifecycleState: row.lifecycle_state,
    artifactDigest: row.artifact_digest,
    validation: parseJson(row.validation),
    provenance: parseJson(row.provenance),
    createdAt: toIsoString(row.created_at),
    approvedAt: row.approved_at ? toIsoString(row.approved_at) : undefined,
    replacementVersionId: row.replacement_version_id ?? undefined
  };
}

function fromArtifactRow(row: ArtifactRow): StoredArtifact {
  return {
    digest: row.digest,
    storagePath: row.storage_path,
    sizeBytes: Number(row.size_bytes),
    createdAt: toIsoString(row.created_at)
  };
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function artifactPath(artifactDir: string, digest: string): string {
  const normalizedDigest = digest.replace(/^sha256:/, "");
  return join(artifactDir, normalizedDigest.slice(0, 2), `${normalizedDigest}.zip`);
}
