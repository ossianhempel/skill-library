import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type {
  SkillPackage,
  SkillVersion,
  Workspace,
} from "@skill-library/domain";
import { createKyselyInstance } from "./kysely.js";
import { runRegistryMigrations } from "./migrations.js";
import { createRegistryStore, type SqlRegistryStore } from "./index.js";

const tmpDirs: string[] = [];
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.map((close) => close()));
  closers.length = 0;
  await Promise.all(
    tmpDirs.map((dir) => rm(dir, { recursive: true, force: true }))
  );
  tmpDirs.length = 0;
});

describe("ranking signals (PGlite)", () => {
  it("returns one install per person with their latest download, votes, and resolved authors", async () => {
    const store = await seededStore();

    for (const [actorId, createdAt] of [
      ["user-bo", "2026-06-01T10:00:00.000Z"],
      ["user-bo", "2026-06-05T10:00:00.000Z"],
      ["user-cy", "2026-06-02T10:00:00.000Z"],
      [undefined, "2026-06-03T10:00:00.000Z"],
    ] as const) {
      await store.recordUsageEvent({
        id: `event-${actorId}-${createdAt}`,
        workspaceId: "workspace-1",
        packageId: "package-1",
        versionId: "version-1",
        eventType: "download",
        createdAt,
        actorId,
      });
    }
    await store.setSkillVote({
      packageId: "package-1",
      userId: "user-bo",
      voted: true,
    });
    // Voting twice is idempotent.
    await store.setSkillVote({
      packageId: "package-1",
      userId: "user-bo",
      voted: true,
    });

    const signals = await store.getRankingSignals("workspace-1");

    expect(
      signals.installs.sort((a, b) => a.userId.localeCompare(b.userId))
    ).toEqual([
      {
        packageId: "package-1",
        userId: "user-bo",
        lastAt: "2026-06-05T10:00:00.000Z",
      },
      {
        packageId: "package-1",
        userId: "user-cy",
        lastAt: "2026-06-02T10:00:00.000Z",
      },
    ]);
    expect(signals.votes).toEqual([
      { packageId: "package-1", userId: "user-bo" },
    ]);
    expect(signals.authors).toEqual([
      {
        packageId: "package-1",
        userId: "user-ada",
        name: "Ada Author",
        image: null,
        approved: true,
      },
    ]);
  });

  it("treats concurrent duplicate upvotes as one vote", async () => {
    const store = await seededStore();
    const vote = { packageId: "package-1", userId: "user-bo", voted: true };

    await Promise.all([store.setSkillVote(vote), store.setSkillVote(vote)]);

    expect((await store.getRankingSignals("workspace-1")).votes).toEqual([
      { packageId: "package-1", userId: "user-bo" },
    ]);
  });

  it("removes a vote when it is withdrawn or the voter is deleted", async () => {
    const store = await seededStore();
    const vote = { packageId: "package-1", userId: "user-bo", voted: true };

    await store.setSkillVote(vote);
    await store.setSkillVote({ ...vote, voted: false });
    expect((await store.getRankingSignals("workspace-1")).votes).toEqual([]);

    await store.setSkillVote(vote);
    await store.deleteUser("user-bo");
    expect((await store.getRankingSignals("workspace-1")).votes).toEqual([]);
  });

  it("adds actor_id to a usage_events table created before ranking existed", async () => {
    const { db } = createKyselyInstance({});
    closers.push(() => db.destroy());
    await db.schema
      .createTable("usage_events")
      .addColumn("id", "text", (c) => c.primaryKey())
      .addColumn("workspace_id", "text", (c) => c.notNull())
      .addColumn("package_id", "text")
      .addColumn("version_id", "text")
      .addColumn("event_type", "text", (c) => c.notNull())
      .addColumn("created_at", "timestamptz", (c) => c.notNull())
      .execute();

    await runRegistryMigrations(db, "pglite");
    await runRegistryMigrations(db, "pglite");

    const table = (await db.introspection.getTables()).find(
      (entry) => entry.name === "usage_events"
    );
    expect(table?.columns.map((column) => column.name)).toContain("actor_id");
  });
});

async function seededStore(): Promise<SqlRegistryStore> {
  const dataDir = await mkdtemp(join(tmpdir(), "skill-library-ranking-"));
  tmpDirs.push(dataDir);
  const store = (await createRegistryStore({ dataDir })) as SqlRegistryStore;
  closers.push(() => store.close());
  await store.migrate();

  for (const [id, name] of [
    ["user-ada", "Ada Author"],
    ["user-bo", "Bo Colleague"],
  ]) {
    await store.kysely
      .insertInto("user")
      .values({
        id: id!,
        name: name!,
        email: `${id}@example.com`,
        emailVerified: true,
        role: "user",
      })
      .execute();
    // runAuthMigrations removes users without an account row; keep them linked.
    await store.kysely
      .insertInto("account")
      .values({
        id: `account-${id}`,
        accountId: id!,
        providerId: "test",
        userId: id!,
      })
      .execute();
  }

  const workspace: Workspace = {
    id: "workspace-1",
    slug: "acme",
    name: "Acme",
    reportingPolicy: "opt-in",
    visibility: "private",
  };
  const pkg: SkillPackage = {
    id: "package-1",
    workspaceId: workspace.id,
    slug: "review-helper",
    name: "Review Helper",
    description: "Review local code changes.",
    categories: [],
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-01T09:00:00.000Z",
  };
  const version = (id: string, state: SkillVersion["lifecycleState"]) => ({
    id,
    packageId: pkg.id,
    version: id,
    lifecycleState: state,
    artifactDigest: `sha256:${id}`,
    validation: { ok: true, files: [], issues: [] },
    provenance: {
      kind: "upload" as const,
      actorId: "user-ada",
      importedAt: "2026-06-01T09:00:00.000Z",
    },
    createdAt: "2026-06-01T09:00:00.000Z",
  });
  await store.seed(
    workspace,
    [pkg],
    [version("version-1", "approved"), version("version-2", "draft")]
  );
  return store;
}
