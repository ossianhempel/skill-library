import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SkillPackage, SkillVersion, Workspace } from "@skill-library/domain";
import { createKyselyInstance } from "./kysely.js";
import { createRegistryStore, type RegistryStore } from "./index.js";

/**
 * Live SQL Server validation for the cross-dialect store. Skipped unless MSSQL_TEST_URL
 * points at a reachable SQL Server (admin/master connection, no database in the path),
 * e.g. a local container:
 *
 *   docker run -d --name sl-mssql-test -e ACCEPT_EULA=Y \
 *     -e MSSQL_SA_PASSWORD='Skill_Lib_Test_2026!' -p 14333:1433 \
 *     mcr.microsoft.com/mssql/server:2022-latest
 *   MSSQL_TEST_URL='sqlserver://sa:Skill_Lib_Test_2026!@localhost:14333' pnpm test
 */
const ADMIN_URL = process.env.MSSQL_TEST_URL;
const DB_NAME = "skilltest";

const workspace: Workspace = {
  id: "ws-1",
  slug: "team",
  name: "Team",
  reportingPolicy: "opt-in",
  visibility: "private"
};

const pkg: SkillPackage = {
  id: "pkg-1",
  workspaceId: workspace.id,
  slug: "deploy",
  name: "Deploy",
  description: "Deploy skill",
  categories: ["ops", "ci"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

function version(id: string, state: SkillVersion["lifecycleState"], approvedAt?: string): SkillVersion {
  return {
    id,
    packageId: pkg.id,
    version: id,
    lifecycleState: state,
    artifactDigest: "sha256:abc",
    validation: { ok: true } as never,
    provenance: { source: "test" } as never,
    createdAt: new Date().toISOString(),
    approvedAt,
    replacementVersionId: undefined
  };
}

describe.skipIf(!ADMIN_URL)("SQL Server registry store (live)", () => {
  let store: RegistryStore;
  let dataDir: string;

  beforeAll(async () => {
    // Local containers present a self-signed cert; trust it for the test connections.
    const adminUrl = `${ADMIN_URL}?trustServerCertificate=true`;
    const storeUrl = `${ADMIN_URL}/${DB_NAME}?trustServerCertificate=true`;

    // Provision a clean database via the admin/master connection.
    const { db: admin } = createKyselyInstance({ databaseUrl: adminUrl, databaseEngine: "mssql" });
    await sql`drop database if exists ${sql.ref(DB_NAME)}`.execute(admin);
    await sql`create database ${sql.ref(DB_NAME)}`.execute(admin);
    await admin.destroy();

    dataDir = await mkdtemp(join(tmpdir(), "sl-mssql-"));
    store = await createRegistryStore({ databaseUrl: storeUrl, dataDir });
    await store.migrate();
    await store.migrate(); // idempotent
  }, 60000);

  afterAll(async () => {
    await store?.close();
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("upserts a workspace idempotently (MERGE-equivalent, no duplicate)", async () => {
    await store.upsertWorkspace(workspace);
    await store.upsertWorkspace({ ...workspace, name: "Renamed Team" });

    const fetched = await store.getWorkspace(workspace.id);
    expect(fetched?.name).toBe("Renamed Team");
  });

  it("round-trips JSON categories stored as nvarchar(max)", async () => {
    await store.upsertPackage(pkg);
    const fetched = await store.getPackage(pkg.id);
    expect(fetched?.categories).toEqual(["ops", "ci"]);
  });

  it("stores artifacts with insert-ignore semantics", async () => {
    const content = new TextEncoder().encode("zip-bytes");
    const first = await store.putArtifact({ digest: "sha256:abc", content });
    const second = await store.putArtifact({ digest: "sha256:abc", content });
    expect(second.digest).toBe(first.digest);
  });

  it("creates versions, transitions lifecycle, and orders latest-approved with nulls last", async () => {
    await store.createVersion(version("1.0.0", "draft"));
    await store.createVersion(version("1.1.0", "draft"));

    await store.transitionVersion({ versionId: "1.0.0", toState: "approved" });
    await store.transitionVersion({ versionId: "1.1.0", toState: "approved" });

    const versions = await store.listVersions(pkg.id);
    expect(versions).toHaveLength(2);

    const latest = await store.getLatestApprovedVersion(pkg.id);
    // Both approved; the one approved last sorts first under the nulls-last CASE ordering.
    expect(latest?.id).toBe("1.1.0");
  });

  it("records install and usage events", async () => {
    await store.recordInstallReport({
      installId: "inst-1",
      packageId: pkg.id,
      versionId: "1.0.0",
      state: "current",
      reportedAt: new Date().toISOString(),
      targetKind: "claude-global"
    });
    await store.recordUsageEvent({
      id: "ue-1",
      workspaceId: workspace.id,
      packageId: pkg.id,
      versionId: "1.0.0",
      eventType: "download",
      createdAt: new Date().toISOString()
    });
    // No throw on the insert-ignore paths is the assertion; re-recording is a no-op.
    await store.recordUsageEvent({
      id: "ue-1",
      workspaceId: workspace.id,
      packageId: pkg.id,
      versionId: "1.0.0",
      eventType: "download",
      createdAt: new Date().toISOString()
    });
    expect(true).toBe(true);
  });
});
