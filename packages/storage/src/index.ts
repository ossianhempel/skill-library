import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  acquirePgliteWriterLock,
  formatPglitePersistenceWarning,
  type PgliteWriterLockOptions,
} from "./pglite-lock.js";
import { sql, type Kysely } from "kysely";
import {
  createKyselyInstance,
  resolveDatabaseEngine,
  type DatabaseEngine,
  type DatabaseSchema,
} from "./kysely.js";
import { runRegistryMigrations, runAuthMigrations } from "./migrations.js";
import type {
  CatalogPackageStats,
  DownloadHistoryPoint,
  InstallReport,
  InstalledSkillState,
  LifecycleState,
  PackageReport,
  SkillPackage,
  SkillVersion,
  UsageEvent,
  Workspace,
} from "@skill-library/domain";
import { DOWNLOAD_HISTORY_DAYS } from "@skill-library/domain";

export type DatabaseMode = DatabaseEngine;

export {
  resolveDatabaseEngine,
  createKyselyInstance,
  buildTediousConfig,
} from "./kysely.js";
export type {
  DatabaseEngine,
  DatabaseSchema,
  KyselyEngineConfig,
} from "./kysely.js";

export interface RegistryStore {
  mode: DatabaseMode;
  paths: RegistryStoragePaths;
  /** Resolved engine and shared Kysely instance — present on SQL-backed stores, absent on the in-memory store. */
  engine?: DatabaseEngine;
  kysely?: Kysely<DatabaseSchema>;
  migrate(): Promise<void>;
  close(): Promise<void>;
  countUsers(): Promise<number>;
  getAgentToken(userId: string): Promise<string | undefined>;
  /** Persist a new agent token. Returns the token if the user existed, else undefined. */
  setAgentToken(userId: string, token: string): Promise<string | undefined>;
  findUserByAgentToken(token: string): Promise<UserIdentity | undefined>;
  listTeamMembers(): Promise<TeamMemberRecord[]>;
  updateUserRole(userId: string, role: string): Promise<UserRecord | undefined>;
  deleteUser(userId: string): Promise<void>;
  putArtifact(artifact: ArtifactInput): Promise<StoredArtifact>;
  getArtifact(digest: string): Promise<StoredArtifact | undefined>;
  readArtifactContent(digest: string): Promise<Buffer | undefined>;
  getWorkspace(workspaceId: string): Promise<Workspace | undefined>;
  upsertWorkspace(workspace: Workspace): Promise<void>;
  upsertPackage(pkg: SkillPackage): Promise<void>;
  createVersion(version: SkillVersion): Promise<SkillVersion>;
  transitionVersion(
    input: VersionTransitionInput
  ): Promise<SkillVersion | undefined>;
  listPackages(workspaceId: string): Promise<SkillPackage[]>;
  getPackage(packageId: string): Promise<SkillPackage | undefined>;
  listVersions(packageId: string): Promise<SkillVersion[]>;
  getVersion(versionId: string): Promise<SkillVersion | undefined>;
  getLatestApprovedVersion(
    packageId: string
  ): Promise<SkillVersion | undefined>;
  recordInstallReport(report: InstallReport): Promise<void>;
  recordUsageEvent(event: UsageEvent): Promise<void>;
  countUsageEvents(filter: UsageEventFilter): Promise<number>;
  getDownloadHistory(
    filter: UsageEventFilter,
    days?: number
  ): Promise<DownloadHistoryPoint[]>;
  getPackageReport(packageId: string): Promise<PackageReport | undefined>;
  getWorkspaceReports(workspaceId: string): Promise<PackageReport[]>;
  getWorkspaceCatalogStats(
    workspaceId: string,
    days?: number
  ): Promise<CatalogPackageStats[]>;
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

/** Minimal actor identity resolved from an agent token. */
export interface UserIdentity {
  id: string;
  role: string;
}

/** A Better-Auth-owned user as surfaced to admin/team views. */
export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  image: string | null;
}

/** A team member plus their count of submitted skill versions. */
export interface TeamMemberRecord extends UserRecord {
  skillsSubmitted: number;
}

const defaultDataDir = process.env.SKILL_LIBRARY_DATA_DIR ?? "/data";

export function resolveDatabaseMode(config: RegistryStoreConfig): DatabaseMode {
  return config.databaseUrl ? "postgres" : "pglite";
}

export function resolveStoragePaths(
  config: RegistryStoreConfig = {}
): RegistryStoragePaths {
  const dataDir = config.dataDir ?? defaultDataDir;

  return {
    dataDir,
    pgliteDataDir: config.pgliteDataDir ?? join(dataDir, "db"),
    artifactDir: config.artifactDir ?? join(dataDir, "artifacts"),
  };
}

export async function createRegistryStore(
  config: RegistryStoreConfig = {}
): Promise<RegistryStore> {
  const engine = resolveDatabaseEngine(config);
  const paths = resolveStoragePaths(config);

  await mkdir(paths.artifactDir, { recursive: true });

  if (engine === "postgres") {
    const { db: kysely } = createKyselyInstance({
      databaseUrl: config.databaseUrl,
      databaseEngine: "postgres",
    });
    return new SqlRegistryStore(engine, paths, "postgres", kysely, async () => {
      await kysely.destroy();
    });
  }

  if (engine === "mssql") {
    const { db: kysely } = createKyselyInstance({
      databaseUrl: config.databaseUrl,
      databaseEngine: "mssql",
    });
    return new SqlRegistryStore(engine, paths, "mssql", kysely, async () => {
      await kysely.destroy();
    });
  }

  console.warn(
    `[skill-library] ${formatPglitePersistenceWarning(paths.dataDir)}`
  );

  await mkdir(paths.dataDir, { recursive: true });
  const releasePgliteWriterLock = await acquirePgliteWriterLock(
    paths.dataDir,
    config.pgliteWriterLock
  );
  await mkdir(dirname(paths.pgliteDataDir), { recursive: true });
  const db = new PGlite(paths.pgliteDataDir);
  // One PGlite instance backs both the legacy query path and Kysely. PGliteDriver.destroy()
  // closes the instance, so we close it directly once here instead of via kysely.destroy().
  const { db: kysely } = createKyselyInstance({
    databaseEngine: "pglite",
    pgliteInstance: db,
  });

  return new SqlRegistryStore("pglite", paths, "pglite", kysely, async () => {
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
    readonly engine: DatabaseEngine,
    readonly kysely: Kysely<DatabaseSchema>,
    private readonly closeDb: () => Promise<void>
  ) {}

  async migrate(): Promise<void> {
    await runRegistryMigrations(this.kysely, this.engine);
    await runAuthMigrations(this.kysely, this.engine);
  }

  async close(): Promise<void> {
    await this.closeDb();
  }

  // Dialect-aware upsert helpers. Postgres/PGlite use ON CONFLICT; SQL Server has no
  // ON CONFLICT, so it gets an equivalent exists-then-insert / update-then-insert inside a
  // transaction. Table names are dynamic here, so these two helpers hold the only `any`
  // casts in the store — every call site passes a fully typed value object.
  private async insertIgnore(
    table: keyof DatabaseSchema,
    conflictColumns: string[],
    values: Record<string, unknown>,
    matches: ReadonlyArray<readonly [string, unknown]>
  ): Promise<void> {
    if (this.engine === "mssql") {
      await this.kysely.transaction().execute(async (trx) => {
        let query = (trx as any).selectFrom(table).select(conflictColumns[0]);
        for (const [column, value] of matches) {
          query = query.where(column, "=", value);
        }
        const existing = await query.executeTakeFirst();
        if (!existing) {
          await (trx as any).insertInto(table).values(values).execute();
        }
      });
      return;
    }

    await (this.kysely as any)
      .insertInto(table)
      .values(values)
      .onConflict((oc: any) => oc.columns(conflictColumns).doNothing())
      .execute();
  }

  private async upsertRow(
    table: keyof DatabaseSchema,
    keyColumn: string,
    keyValue: unknown,
    insertValues: Record<string, unknown>,
    updateValues: Record<string, unknown>
  ): Promise<void> {
    if (this.engine === "mssql") {
      await this.kysely.transaction().execute(async (trx) => {
        const updated = await (trx as any)
          .updateTable(table)
          .set(updateValues)
          .where(keyColumn, "=", keyValue)
          .executeTakeFirst();

        if (Number(updated?.numUpdatedRows ?? 0n) === 0) {
          await (trx as any).insertInto(table).values(insertValues).execute();
        }
      });
      return;
    }

    await (this.kysely as any)
      .insertInto(table)
      .values(insertValues)
      .onConflict((oc: any) => oc.column(keyColumn).doUpdateSet(updateValues))
      .execute();
  }

  async putArtifact(artifact: ArtifactInput): Promise<StoredArtifact> {
    const storagePath = artifactPath(this.paths.artifactDir, artifact.digest);

    await mkdir(dirname(storagePath), { recursive: true });
    await writeFile(storagePath, artifact.content, { flag: "wx" }).catch(
      async (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") {
          throw error;
        }
      }
    );

    await this.insertIgnore(
      "artifacts",
      ["digest"],
      {
        digest: artifact.digest,
        storage_path: storagePath,
        size_bytes: artifact.content.byteLength,
      },
      [["digest", artifact.digest]]
    );

    const stored = await this.getArtifact(artifact.digest);

    if (!stored) {
      throw new Error(
        `Artifact record was not stored for digest ${artifact.digest}`
      );
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
      .select([
        "id",
        "slug",
        "name",
        "logo_url",
        "reporting_policy",
        "visibility",
      ])
      .where("id", "=", workspaceId)
      .executeTakeFirst();

    return row ? fromWorkspaceRow(row) : undefined;
  }

  async upsertWorkspace(workspace: Workspace): Promise<void> {
    await this.upsertRow(
      "workspaces",
      "id",
      workspace.id,
      {
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        logo_url: workspace.logoUrl ?? null,
        reporting_policy: workspace.reportingPolicy,
        visibility: workspace.visibility,
      },
      {
        slug: workspace.slug,
        name: workspace.name,
        logo_url: workspace.logoUrl ?? null,
        reporting_policy: workspace.reportingPolicy,
        visibility: workspace.visibility,
      }
    );
  }

  async upsertPackage(pkg: SkillPackage): Promise<void> {
    const categories = JSON.stringify(pkg.categories);

    await this.upsertRow(
      "skill_packages",
      "id",
      pkg.id,
      {
        id: pkg.id,
        workspace_id: pkg.workspaceId,
        slug: pkg.slug,
        name: pkg.name,
        description: pkg.description,
        categories,
        created_at: pkg.createdAt,
        updated_at: pkg.updatedAt,
      },
      {
        workspace_id: pkg.workspaceId,
        slug: pkg.slug,
        name: pkg.name,
        description: pkg.description,
        categories,
        updated_at: pkg.updatedAt,
      }
    );
  }

  async createVersion(version: SkillVersion): Promise<SkillVersion> {
    await this.kysely
      .insertInto("skill_versions")
      .values({
        id: version.id,
        package_id: version.packageId,
        version: version.version,
        lifecycle_state: version.lifecycleState,
        artifact_digest: version.artifactDigest,
        validation: JSON.stringify(version.validation),
        provenance: JSON.stringify(version.provenance),
        created_at: version.createdAt,
        approved_at: version.approvedAt ?? null,
        replacement_version_id: version.replacementVersionId ?? null,
      })
      .execute();

    return version;
  }

  async transitionVersion(
    input: VersionTransitionInput
  ): Promise<SkillVersion | undefined> {
    const current = await this.getVersion(input.versionId);

    if (!current) {
      return undefined;
    }

    const approvedAt =
      input.toState === "approved"
        ? new Date().toISOString()
        : current.approvedAt;

    await this.kysely
      .updateTable("skill_versions")
      .set({
        lifecycle_state: input.toState,
        approved_at: approvedAt ?? null,
        replacement_version_id:
          input.replacementVersionId ?? current.replacementVersionId ?? null,
      })
      .where("id", "=", input.versionId)
      .execute();

    await this.kysely
      .insertInto("lifecycle_events")
      .values({
        id: randomUUID(),
        version_id: input.versionId,
        from_state: current.lifecycleState,
        to_state: input.toState,
        actor_id: input.actorId ?? null,
      })
      .execute();

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
    const actorId = this.jsonText("v.provenance", "actorId");
    const actorEmail = this.jsonText("v.provenance", "actorEmail");
    const gitAuthorEmail = this.jsonText("v.provenance", "gitAuthorEmail");
    const rows = await this.kysely
      .selectFrom("skill_versions as v")
      .leftJoin("user as u", (join) =>
        join.on((eb) =>
          eb.or([
            eb(actorId, "=", eb.ref("u.id")),
            eb(actorId, "=", eb.ref("u.email")),
            eb(actorEmail, "=", eb.ref("u.email")),
            eb(gitAuthorEmail, "=", eb.ref("u.email")),
          ])
        )
      )
      .select([
        "v.id",
        "v.package_id",
        "v.version",
        "v.lifecycle_state",
        "v.artifact_digest",
        "v.validation",
        "v.provenance",
        "v.created_at",
        "v.approved_at",
        "v.replacement_version_id",
        "u.name as actor_name",
        "u.email as actor_email",
      ])
      .where("v.package_id", "=", packageId)
      .orderBy("v.created_at", "desc")
      .execute();

    return rows.map(fromVersionRow);
  }

  async getVersion(versionId: string): Promise<SkillVersion | undefined> {
    const actorId = this.jsonText("v.provenance", "actorId");
    const actorEmail = this.jsonText("v.provenance", "actorEmail");
    const gitAuthorEmail = this.jsonText("v.provenance", "gitAuthorEmail");
    const row = await this.kysely
      .selectFrom("skill_versions as v")
      .leftJoin("user as u", (join) =>
        join.on((eb) =>
          eb.or([
            eb(actorId, "=", eb.ref("u.id")),
            eb(actorId, "=", eb.ref("u.email")),
            eb(actorEmail, "=", eb.ref("u.email")),
            eb(gitAuthorEmail, "=", eb.ref("u.email")),
          ])
        )
      )
      .select([
        "v.id",
        "v.package_id",
        "v.version",
        "v.lifecycle_state",
        "v.artifact_digest",
        "v.validation",
        "v.provenance",
        "v.created_at",
        "v.approved_at",
        "v.replacement_version_id",
        "u.name as actor_name",
        "u.email as actor_email",
      ])
      .where("v.id", "=", versionId)
      .executeTakeFirst();

    return row ? fromVersionRow(row) : undefined;
  }

  async getLatestApprovedVersion(
    packageId: string
  ): Promise<SkillVersion | undefined> {
    const actorId = this.jsonText("v.provenance", "actorId");
    const actorEmail = this.jsonText("v.provenance", "actorEmail");
    const gitAuthorEmail = this.jsonText("v.provenance", "gitAuthorEmail");
    const base = this.kysely
      .selectFrom("skill_versions as v")
      .leftJoin("user as u", (join) =>
        join.on((eb) =>
          eb.or([
            eb(actorId, "=", eb.ref("u.id")),
            eb(actorId, "=", eb.ref("u.email")),
            eb(actorEmail, "=", eb.ref("u.email")),
            eb(gitAuthorEmail, "=", eb.ref("u.email")),
          ])
        )
      )
      .select([
        "v.id",
        "v.package_id",
        "v.version",
        "v.lifecycle_state",
        "v.artifact_digest",
        "v.validation",
        "v.provenance",
        "v.created_at",
        "v.approved_at",
        "v.replacement_version_id",
        "u.name as actor_name",
        "u.email as actor_email",
      ])
      .where("v.package_id", "=", packageId)
      .where("v.lifecycle_state", "=", "approved");

    // Row-limiting and null ordering both diverge: SQL Server uses TOP (not LIMIT) and has
    // no NULLS LAST (emulated with a leading CASE); pg/pglite use LIMIT and NULLS LAST.
    const query =
      this.engine === "mssql"
        ? base
            .top(1)
            .orderBy(sql`case when v.approved_at is null then 1 else 0 end`)
            .orderBy("v.approved_at", "desc")
            .orderBy("v.created_at", "desc")
        : base
            .orderBy(sql`v.approved_at desc nulls last`)
            .orderBy("v.created_at", "desc")
            .limit(1);

    const row = await query.executeTakeFirst();

    return row ? fromVersionRow(row) : undefined;
  }

  async recordInstallReport(report: InstallReport): Promise<void> {
    await this.insertIgnore(
      "install_reports",
      ["install_id", "reported_at"],
      {
        install_id: report.installId,
        package_id: report.packageId,
        version_id: report.versionId,
        state: report.state,
        reported_at: report.reportedAt,
        target_kind: report.targetKind,
      },
      [
        ["install_id", report.installId],
        ["reported_at", report.reportedAt],
      ]
    );
  }

  async recordUsageEvent(event: UsageEvent): Promise<void> {
    await this.insertIgnore(
      "usage_events",
      ["id"],
      {
        id: event.id,
        workspace_id: event.workspaceId,
        package_id: event.packageId ?? null,
        version_id: event.versionId ?? null,
        event_type: event.eventType,
        created_at: event.createdAt,
      },
      [["id", event.id]]
    );
  }

  async countUsageEvents(filter: UsageEventFilter): Promise<number> {
    let query = this.kysely
      .selectFrom("usage_events")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("workspace_id", "=", filter.workspaceId);

    if (filter.eventType) {
      query = query.where("event_type", "=", filter.eventType);
    }
    if (filter.packageId) {
      query = query.where("package_id", "=", filter.packageId);
    }
    if (filter.versionId) {
      query = query.where("version_id", "=", filter.versionId);
    }

    const row = await query.executeTakeFirst();

    // count is bigint on Postgres (string), int on SQL Server (number) — normalize.
    return Number(row?.count ?? 0);
  }

  async countUsers(): Promise<number> {
    const row = await this.kysely
      .selectFrom("user")
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirst();

    return Number(row?.count ?? 0);
  }

  // Dialect-aware text extraction from a JSON column. Postgres/PGlite use the `->>`
  // operator on jsonb; SQL Server stores JSON as nvarchar(max) and reads it with
  // JSON_VALUE(col, '$.key'). Used by the team-roster join on provenance->>'actorId'.
  private jsonText(columnRef: string, key: string) {
    return this.engine === "mssql"
      ? sql<string>`json_value(${sql.ref(columnRef)}, ${sql.lit(`$.${key}`)})`
      : sql<string>`${sql.ref(columnRef)} ->> ${sql.lit(key)}`;
  }

  async getAgentToken(userId: string): Promise<string | undefined> {
    const row = await this.kysely
      .selectFrom("user")
      .select("agent_api_token")
      .where("id", "=", userId)
      .executeTakeFirst();

    return row?.agent_api_token ?? undefined;
  }

  async setAgentToken(
    userId: string,
    token: string
  ): Promise<string | undefined> {
    // Bind updated_at as a JS Date rather than now()/sysdatetimeoffset() so the write
    // is identical across dialects.
    const result = await this.kysely
      .updateTable("user")
      .set({ agent_api_token: token, updated_at: new Date() })
      .where("id", "=", userId)
      .executeTakeFirst();

    return Number(result?.numUpdatedRows ?? 0n) > 0 ? token : undefined;
  }

  async findUserByAgentToken(token: string): Promise<UserIdentity | undefined> {
    const row = await this.kysely
      .selectFrom("user")
      .select(["id", "role"])
      .where("agent_api_token", "=", token)
      .executeTakeFirst();

    return row ? { id: row.id, role: row.role } : undefined;
  }

  async listTeamMembers(): Promise<TeamMemberRecord[]> {
    const actorId = this.jsonText("v.provenance", "actorId");
    const actorEmail = this.jsonText("v.provenance", "actorEmail");
    const gitAuthorEmail = this.jsonText("v.provenance", "gitAuthorEmail");

    const rows = await this.kysely
      .selectFrom("user as u")
      .leftJoin("skill_versions as v", (join) =>
        join.on((eb) =>
          eb.or([
            eb(actorId, "=", eb.ref("u.id")),
            eb(actorId, "=", eb.ref("u.email")),
            eb(actorEmail, "=", eb.ref("u.email")),
            eb(gitAuthorEmail, "=", eb.ref("u.email")),
          ])
        )
      )
      .select((eb) => [
        "u.id",
        "u.name",
        "u.email",
        "u.role",
        "u.created_at",
        "u.image",
        eb.fn.count("v.id").as("skills_submitted"),
      ])
      .groupBy([
        "u.id",
        "u.name",
        "u.email",
        "u.role",
        "u.created_at",
        "u.image",
      ])
      .orderBy("u.created_at", "asc")
      .execute();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: toIsoString(row.created_at),
      image: row.image,
      skillsSubmitted: Number(row.skills_submitted ?? 0),
    }));
  }

  async updateUserRole(
    userId: string,
    role: string
  ): Promise<UserRecord | undefined> {
    await this.kysely
      .updateTable("user")
      .set({ role })
      .where("id", "=", userId)
      .execute();

    // Read back instead of RETURNING/OUTPUT so the path is dialect-agnostic; a missing
    // user yields undefined (404 at the caller).
    const row = await this.kysely
      .selectFrom("user")
      .select(["id", "name", "email", "role", "created_at", "image"])
      .where("id", "=", userId)
      .executeTakeFirst();

    return row
      ? {
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role,
          createdAt: toIsoString(row.created_at),
          image: row.image,
        }
      : undefined;
  }

  async deleteUser(userId: string): Promise<void> {
    await this.kysely.deleteFrom("user").where("id", "=", userId).execute();
  }

  async getDownloadHistory(
    filter: UsageEventFilter,
    days: number = DOWNLOAD_HISTORY_DAYS
  ): Promise<DownloadHistoryPoint[]> {
    // Bucket downloads by calendar day. CAST(created_at AS date) is portable across
    // Postgres/PGlite and SQL Server; the returned day is normalized to YYYY-MM-DD in JS.
    const day = sql`cast(created_at as date)`;

    let query = this.kysely
      .selectFrom("usage_events")
      .select((eb) => [day.as("day"), eb.fn.countAll().as("count")])
      .where("workspace_id", "=", filter.workspaceId)
      .where("event_type", "=", "download")
      .where("created_at", ">=", new Date(downloadHistoryStartIso(days)));

    if (filter.packageId) {
      query = query.where("package_id", "=", filter.packageId);
    }

    if (filter.versionId) {
      query = query.where("version_id", "=", filter.versionId);
    }

    const rows = await query.groupBy(day).orderBy(day).execute();

    return fillDownloadHistory(
      rows.map((row) => fromDownloadHistoryRow(row as DownloadHistoryRow)),
      days
    );
  }

  async getPackageReport(
    packageId: string
  ): Promise<PackageReport | undefined> {
    const pkg = await this.getPackage(packageId);

    if (!pkg) {
      return undefined;
    }

    const versions = await this.listVersions(packageId);
    const latestApprovedVersion =
      await this.getLatestApprovedVersion(packageId);
    const views = await this.countUsageEvents({
      workspaceId: pkg.workspaceId,
      packageId,
      eventType: "view",
    });
    const downloads = await this.countUsageEvents({
      workspaceId: pkg.workspaceId,
      packageId,
      eventType: "download",
    });
    const downloadHistory = await this.getDownloadHistory({
      workspaceId: pkg.workspaceId,
      packageId,
      eventType: "download",
    });
    const reportRows = await this.kysely
      .selectFrom("install_reports")
      .select(["install_id", "state", "reported_at"])
      .where("package_id", "=", packageId)
      .execute();

    return buildPackageReport({
      packageId,
      workspaceId: pkg.workspaceId,
      versionCount: versions.length,
      latestApprovedVersionId: latestApprovedVersion?.id,
      views,
      downloads,
      downloadHistory,
      lastModifiedAt: resolveLastModifiedAt(versions),
      reports: reportRows.map((row) => ({
        installId: row.install_id,
        state: row.state as InstalledSkillState,
        reportedAt: toIsoString(row.reported_at),
      })),
    });
  }

  async getWorkspaceCatalogStats(
    workspaceId: string,
    days: number = DOWNLOAD_HISTORY_DAYS
  ): Promise<CatalogPackageStats[]> {
    const packages = await this.listPackages(workspaceId);
    const stats: CatalogPackageStats[] = [];

    for (const pkg of packages) {
      const versions = await this.listVersions(pkg.id);
      const downloads = await this.countUsageEvents({
        workspaceId,
        packageId: pkg.id,
        eventType: "download",
      });
      const downloadHistory = await this.getDownloadHistory(
        {
          workspaceId,
          packageId: pkg.id,
          eventType: "download",
        },
        days
      );

      stats.push({
        packageId: pkg.id,
        downloads,
        downloadHistory,
        lastModifiedAt: resolveLastModifiedAt(versions),
      });
    }

    return stats;
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

  async seed(
    workspace: Workspace,
    packages: SkillPackage[],
    versions: SkillVersion[]
  ): Promise<void> {
    await this.upsertWorkspace(workspace);

    for (const pkg of packages) {
      await this.upsertPackage(pkg);
    }

    for (const version of versions) {
      await this.createVersion(version).catch(
        (error: NodeJS.ErrnoException) => {
          if (!String(error.message).includes("duplicate key")) {
            throw error;
          }
        }
      );
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

  // The in-memory store has no user table; auth/agent-token flows are unsupported here.
  async getAgentToken(_userId: string): Promise<string | undefined> {
    return undefined;
  }

  async setAgentToken(
    _userId: string,
    _token: string
  ): Promise<string | undefined> {
    return undefined;
  }

  async findUserByAgentToken(
    _token: string
  ): Promise<UserIdentity | undefined> {
    return undefined;
  }

  async listTeamMembers(): Promise<TeamMemberRecord[]> {
    return [];
  }

  async updateUserRole(
    _userId: string,
    _role: string
  ): Promise<UserRecord | undefined> {
    return undefined;
  }

  async deleteUser(_userId: string): Promise<void> {}

  async putArtifact(artifact: ArtifactInput): Promise<StoredArtifact> {
    return {
      digest: artifact.digest,
      storagePath: artifactPath(this.paths.artifactDir, artifact.digest),
      sizeBytes: artifact.content.byteLength,
      createdAt: new Date().toISOString(),
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

  async transitionVersion(
    input: VersionTransitionInput
  ): Promise<SkillVersion | undefined> {
    const version = await this.getVersion(input.versionId);

    if (!version) {
      return undefined;
    }

    version.lifecycleState = input.toState;
    version.approvedAt =
      input.toState === "approved"
        ? new Date().toISOString()
        : version.approvedAt;
    version.replacementVersionId =
      input.replacementVersionId ?? version.replacementVersionId;
    return version;
  }

  seed(
    workspace: Workspace,
    packages: SkillPackage[],
    versions: SkillVersion[]
  ) {
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
    return [...this.packages.values()].filter(
      (pkg) => pkg.workspaceId === workspaceId
    );
  }

  async getPackage(packageId: string): Promise<SkillPackage | undefined> {
    return this.packages.get(packageId);
  }

  async listVersions(packageId: string): Promise<SkillVersion[]> {
    return (this.versions.get(packageId) ?? []).sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
  }

  async getVersion(versionId: string): Promise<SkillVersion | undefined> {
    return [...this.versions.values()]
      .flat()
      .find((version) => version.id === versionId);
  }

  async getLatestApprovedVersion(
    packageId: string
  ): Promise<SkillVersion | undefined> {
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

  async countUsers(): Promise<number> {
    return 0;
  }

  async getDownloadHistory(
    filter: UsageEventFilter,
    days: number = DOWNLOAD_HISTORY_DAYS
  ): Promise<DownloadHistoryPoint[]> {
    const startMs = Date.parse(downloadHistoryStartIso(days));
    const counts = new Map<string, number>();

    for (const event of this.usageEvents) {
      if (
        event.workspaceId !== filter.workspaceId ||
        event.eventType !== "download" ||
        Date.parse(event.createdAt) < startMs ||
        (filter.packageId && event.packageId !== filter.packageId) ||
        (filter.versionId && event.versionId !== filter.versionId)
      ) {
        continue;
      }

      const day = event.createdAt.slice(0, 10);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }

    return fillDownloadHistory(
      [...counts.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((left, right) => left.date.localeCompare(right.date)),
      days
    );
  }

  async getPackageReport(
    packageId: string
  ): Promise<PackageReport | undefined> {
    const pkg = await this.getPackage(packageId);

    if (!pkg) {
      return undefined;
    }

    const versions = await this.listVersions(packageId);
    const latestApprovedVersion =
      await this.getLatestApprovedVersion(packageId);
    const views = await this.countUsageEvents({
      workspaceId: pkg.workspaceId,
      packageId,
      eventType: "view",
    });
    const downloads = await this.countUsageEvents({
      workspaceId: pkg.workspaceId,
      packageId,
      eventType: "download",
    });
    const downloadHistory = await this.getDownloadHistory({
      workspaceId: pkg.workspaceId,
      packageId,
      eventType: "download",
    });

    return buildPackageReport({
      packageId,
      workspaceId: pkg.workspaceId,
      versionCount: versions.length,
      latestApprovedVersionId: latestApprovedVersion?.id,
      views,
      downloads,
      downloadHistory,
      lastModifiedAt: resolveLastModifiedAt(versions),
      reports: this.reports.filter((report) => report.packageId === packageId),
    });
  }

  async getWorkspaceCatalogStats(
    workspaceId: string,
    days: number = DOWNLOAD_HISTORY_DAYS
  ): Promise<CatalogPackageStats[]> {
    const packages = await this.listPackages(workspaceId);
    const stats: CatalogPackageStats[] = [];

    for (const pkg of packages) {
      const versions = await this.listVersions(pkg.id);
      const downloads = await this.countUsageEvents({
        workspaceId,
        packageId: pkg.id,
        eventType: "download",
      });
      const downloadHistory = await this.getDownloadHistory(
        {
          workspaceId,
          packageId: pkg.id,
          eventType: "download",
        },
        days
      );

      stats.push({
        packageId: pkg.id,
        downloads,
        downloadHistory,
        lastModifiedAt: resolveLastModifiedAt(versions),
      });
    }

    return stats;
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
  "modified-local-content",
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
  logo_url?: string | null;
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
  actor_name?: string | null;
  actor_email?: string | null;
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

interface DownloadHistoryRow {
  day: string | Date;
  count: string | number;
}

interface ReportInput {
  packageId: string;
  workspaceId: string;
  versionCount: number;
  latestApprovedVersionId?: string;
  views: number;
  downloads: number;
  downloadHistory: DownloadHistoryPoint[];
  lastModifiedAt: string;
  reports: Pick<InstallReport, "installId" | "state" | "reportedAt">[];
}

function buildPackageReport(input: ReportInput): PackageReport {
  const latestByInstall = new Map<
    string,
    Pick<InstallReport, "installId" | "state" | "reportedAt">
  >();

  for (const report of input.reports) {
    const current = latestByInstall.get(report.installId);

    if (!current || report.reportedAt > current.reportedAt) {
      latestByInstall.set(report.installId, report);
    }
  }

  const byState = Object.fromEntries(
    installStates.map((state) => [state, 0])
  ) as PackageReport["installs"]["byState"];

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
    downloadHistory: input.downloadHistory,
    lastModifiedAt: input.lastModifiedAt,
    installs: {
      total: latestByInstall.size,
      byState,
    },
  };
}

function resolveLastModifiedAt(versions: SkillVersion[]): string {
  const newest = versions[0];

  return newest?.createdAt ?? new Date(0).toISOString();
}

function downloadHistoryStartIso(days: number): string {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return start.toISOString();
}

function fillDownloadHistory(
  points: DownloadHistoryPoint[],
  days: number
): DownloadHistoryPoint[] {
  const counts = new Map(points.map((point) => [point.date, point.count]));
  const filled: DownloadHistoryPoint[] = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() - (days - 1));

  for (let index = 0; index < days; index += 1) {
    const date = cursor.toISOString().slice(0, 10);
    filled.push({ date, count: counts.get(date) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return filled;
}

function fromDownloadHistoryRow(row: DownloadHistoryRow): DownloadHistoryPoint {
  return {
    date: toDayString(row.day),
    count: Number(row.count),
  };
}

function toDayString(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return new Date(value).toISOString().slice(0, 10);
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
    updatedAt: toIsoString(row.updated_at),
  };
}

function fromWorkspaceRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl: row.logo_url ?? undefined,
    reportingPolicy: row.reporting_policy,
    visibility: row.visibility,
  };
}

function fromVersionRow(row: VersionRow): SkillVersion {
  const provenance = parseJson(row.provenance);

  let author: string | undefined = undefined;
  if (row.actor_name) {
    author = row.actor_name;
  } else if (row.actor_email) {
    author = row.actor_email;
  } else if (
    provenance &&
    typeof provenance === "object" &&
    "actorName" in provenance &&
    typeof (provenance as any).actorName === "string" &&
    (provenance as any).actorName
  ) {
    author = (provenance as any).actorName;
  } else if (
    provenance &&
    typeof provenance === "object" &&
    "actorEmail" in provenance &&
    typeof (provenance as any).actorEmail === "string" &&
    (provenance as any).actorEmail
  ) {
    author = (provenance as any).actorEmail;
  } else if (
    provenance &&
    typeof provenance === "object" &&
    "gitAuthorName" in provenance &&
    typeof (provenance as any).gitAuthorName === "string" &&
    (provenance as any).gitAuthorName
  ) {
    author = (provenance as any).gitAuthorName;
  } else if (
    provenance &&
    typeof provenance === "object" &&
    "gitAuthorEmail" in provenance &&
    typeof (provenance as any).gitAuthorEmail === "string" &&
    (provenance as any).gitAuthorEmail
  ) {
    author = (provenance as any).gitAuthorEmail;
  } else if (
    provenance &&
    typeof provenance === "object" &&
    "actorId" in provenance &&
    typeof (provenance as any).actorId === "string"
  ) {
    author = (provenance as any).actorId;
  }

  return {
    id: row.id,
    packageId: row.package_id,
    version: row.version,
    lifecycleState: row.lifecycle_state,
    artifactDigest: row.artifact_digest,
    validation: parseJson(row.validation),
    provenance,
    createdAt: toIsoString(row.created_at),
    approvedAt: row.approved_at ? toIsoString(row.approved_at) : undefined,
    replacementVersionId: row.replacement_version_id ?? undefined,
    author,
  };
}

function fromArtifactRow(row: ArtifactRow): StoredArtifact {
  return {
    digest: row.digest,
    storagePath: row.storage_path,
    sizeBytes: Number(row.size_bytes),
    createdAt: toIsoString(row.created_at),
  };
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function artifactPath(artifactDir: string, digest: string): string {
  const normalizedDigest = digest.replace(/^sha256:/, "");
  return join(
    artifactDir,
    normalizedDigest.slice(0, 2),
    `${normalizedDigest}.zip`
  );
}
