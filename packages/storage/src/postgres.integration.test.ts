import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SkillPackage, SkillVersion, Workspace } from "@skill-library/domain";
import { createKyselyInstance } from "./kysely.js";
import { createRegistryStore, type RegistryStore } from "./index.js";

/**
 * Live PostgreSQL validation for the cross-dialect store. PGlite already exercises the
 * Postgres SQL dialect (it is embedded Postgres), so this suite's job is to prove the
 * real `pg` driver + pool path — connection handling, parameter binding, and JSON/now()
 * behavior over the wire — against an actual server.
 *
 * Skipped unless POSTGRES_TEST_URL points at a reachable admin connection (the default
 * `postgres` database, used to provision a clean test database), e.g. a local container:
 *
 *   docker run -d --name sl-pg-test -e POSTGRES_PASSWORD=Skill_Lib_Test_2026 \
 *     -e POSTGRES_DB=postgres -p 55432:5432 postgres:16
 *   POSTGRES_TEST_URL='postgres://postgres:Skill_Lib_Test_2026@localhost:55432/postgres' pnpm test
 */
const ADMIN_URL = process.env.POSTGRES_TEST_URL;
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

function swapDatabase(adminUrl: string, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

describe.skipIf(!ADMIN_URL)("PostgreSQL registry store (live)", () => {
  let store: RegistryStore;
  let dataDir: string;

  beforeAll(async () => {
    // Provision a clean database via the admin (`postgres`) connection. WITH (FORCE)
    // drops it even if a prior run left connections open.
    const { db: admin } = createKyselyInstance({ databaseUrl: ADMIN_URL, databaseEngine: "postgres" });
    await sql`drop database if exists ${sql.ref(DB_NAME)} with (force)`.execute(admin);
    await sql`create database ${sql.ref(DB_NAME)}`.execute(admin);
    await admin.destroy();

    dataDir = await mkdtemp(join(tmpdir(), "sl-pg-"));
    store = await createRegistryStore({ databaseUrl: swapDatabase(ADMIN_URL!, DB_NAME), dataDir });
    await store.migrate();
    await store.migrate(); // idempotent
  }, 60000);

  afterAll(async () => {
    await store?.close();
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("upserts a workspace idempotently (ON CONFLICT, no duplicate)", async () => {
    await store.upsertWorkspace(workspace);
    await store.upsertWorkspace({ ...workspace, name: "Renamed Team" });

    const fetched = await store.getWorkspace(workspace.id);
    expect(fetched?.name).toBe("Renamed Team");
  });

  it("round-trips JSON categories stored as jsonb", async () => {
    await store.upsertPackage(pkg);
    const fetched = await store.getPackage(pkg.id);
    expect(fetched?.categories).toEqual(["ops", "ci"]);
  });

  it("creates versions, transitions lifecycle, and orders latest-approved with nulls last", async () => {
    await store.createVersion(version("1.0.0", "draft"));
    await store.createVersion(version("1.1.0", "draft"));

    await store.transitionVersion({ versionId: "1.0.0", toState: "approved" });
    await store.transitionVersion({ versionId: "1.1.0", toState: "approved" });

    const versions = await store.listVersions(pkg.id);
    expect(versions).toHaveLength(2);

    const latest = await store.getLatestApprovedVersion(pkg.id);
    expect(latest?.id).toBe("1.1.0");
  });

  it("records install and usage events and computes analytics", async () => {
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

    const downloads = await store.countUsageEvents({ workspaceId: workspace.id, packageId: pkg.id, eventType: "download" });
    expect(downloads).toBe(1);

    const report = await store.getPackageReport(pkg.id);
    expect(report?.downloads).toBe(1);
    expect(report?.versionCount).toBe(2);
    expect(report?.installs.total).toBe(1);
  });

  it("creates auth tables and exercises user + agent-token paths over the pg driver (U5/U6)", async () => {
    await store.kysely!
      .insertInto("user")
      .values({ id: "u-1", name: "Ada", email: "ada@example.com", emailVerified: false, role: "admin" })
      .execute();

    expect(await store.countUsers()).toBe(1);

    const token = "sl_pg_u6_token";
    expect(await store.setAgentToken("u-1", token)).toBe(token);
    expect(await store.getAgentToken("u-1")).toBe(token);
    expect(await store.findUserByAgentToken(token)).toEqual({ id: "u-1", role: "admin" });

    // The team-roster JSON-path join (provenance->>'actorId') over the real pg driver.
    await store.kysely!
      .insertInto("skill_versions")
      .values({
        id: "v-by-u1",
        package_id: pkg.id,
        version: "2.0.0",
        lifecycle_state: "draft",
        artifact_digest: "sha256:abc",
        validation: JSON.stringify({ ok: true }),
        provenance: JSON.stringify({ source: "test", actorId: "u-1" }),
        created_at: new Date()
      })
      .execute();

    const members = await store.listTeamMembers();
    expect(members.find((member) => member.id === "u-1")?.skillsSubmitted).toBe(1);

    const updated = await store.updateUserRole("u-1", "maintainer");
    expect(updated?.role).toBe("maintainer");

    await store.deleteUser("u-1");
    expect(await store.countUsers()).toBe(0);
  });
});
