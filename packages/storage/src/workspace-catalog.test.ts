import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type {
  SkillPackage,
  SkillVersion,
  Workspace,
} from "@skill-library/domain";
import {
  createRegistryStore,
  MemoryRegistryStore,
  type RegistryStore,
  type SqlRegistryStore,
} from "./index.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.map((dir) => rm(dir, { recursive: true, force: true }))
  );
  tmpDirs.length = 0;
});

const FIXTURE_NOW = "2026-06-07T13:00:00.000Z";
const fixtureClock = () => new Date(FIXTURE_NOW);

const workspace: Workspace = {
  id: "workspace-1",
  slug: "acme",
  name: "Acme",
  reportingPolicy: "opt-in",
  visibility: "public",
};

function pkg(id: string, name: string): SkillPackage {
  return {
    id,
    workspaceId: workspace.id,
    slug: id,
    name,
    description: `${name} skill`,
    categories: ["review"],
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

function version(
  id: string,
  packageId: string,
  lifecycleState: SkillVersion["lifecycleState"],
  createdAt: string,
  approvedAt?: string
): SkillVersion {
  return {
    id,
    packageId,
    version: id,
    lifecycleState,
    artifactDigest: `sha256:${id}`,
    validation: { ok: true, files: [], issues: [] },
    provenance: { kind: "upload", actorId: "author-1", importedAt: createdAt },
    createdAt,
    approvedAt,
  };
}

async function seed(store: RegistryStore & { seed: Function }) {
  const otherWorkspace = { ...workspace, id: "workspace-2", slug: "other" };
  await store.seed(
    workspace,
    [pkg("alpha", "Alpha"), pkg("beta", "Beta"), pkg("gamma", "Gamma")],
    [
      version(
        "a1",
        "alpha",
        "approved",
        "2026-06-02T10:00:00.000Z",
        "2026-06-02T11:00:00.000Z"
      ),
      version(
        "a2",
        "alpha",
        "approved",
        "2026-06-03T10:00:00.000Z",
        "2026-06-04T11:00:00.000Z"
      ),
      version("a3", "alpha", "draft", "2026-06-05T10:00:00.000Z"),
      version("b1", "beta", "draft", "2026-06-02T10:00:00.000Z"),
    ]
  );
  await store.seed(
    otherWorkspace,
    [{ ...pkg("delta", "Delta"), workspaceId: "workspace-2" }],
    [
      version(
        "d1",
        "delta",
        "approved",
        "2026-06-02T10:00:00.000Z",
        "2026-06-02T11:00:00.000Z"
      ),
    ]
  );

  const events = [
    ["alpha", "download", "2026-06-07T09:00:00.000Z"],
    ["alpha", "download", "2026-06-06T09:00:00.000Z"],
    ["alpha", "download", "2026-05-01T09:00:00.000Z"],
    ["alpha", "view", "2026-06-07T09:00:00.000Z"],
    ["beta", "view", "2026-06-07T09:00:00.000Z"],
  ] as const;
  for (const [index, [packageId, eventType, createdAt]] of events.entries()) {
    await store.recordUsageEvent({
      id: `event-${index}`,
      workspaceId: workspace.id,
      packageId,
      versionId: "a1",
      eventType,
      createdAt,
    });
  }
  await store.recordUsageEvent({
    id: "event-other",
    workspaceId: "workspace-2",
    packageId: "delta",
    eventType: "download",
    createdAt: "2026-06-07T09:00:00.000Z",
  });

  for (const [installId, state, reportedAt] of [
    ["install-1", "stale", "2026-06-06T09:00:00.000Z"],
    ["install-1", "current", "2026-06-07T09:00:00.000Z"],
    ["install-2", "modified-local-content", "2026-06-07T09:00:00.000Z"],
  ] as const) {
    await store.recordInstallReport({
      installId,
      packageId: "alpha",
      versionId: "a2",
      state,
      reportedAt,
      targetKind: "project",
    });
  }
}

describe("workspace catalog snapshot", () => {
  it("matches the per-package reads it replaces", async () => {
    const dir = await mkdtemp(join(tmpdir(), "skill-library-catalog-"));
    tmpDirs.push(dir);
    const store = (await createRegistryStore({
      dataDir: dir,
      now: fixtureClock,
    })) as SqlRegistryStore;

    try {
      await store.migrate();
      await seed(store);

      const snapshot = await store.getWorkspaceCatalog("workspace-1");

      expect(snapshot.packages.map((entry) => entry.id)).toEqual([
        "alpha",
        "beta",
        "gamma",
      ]);
      for (const entry of snapshot.packages) {
        expect(snapshot.versionsByPackage.get(entry.id)).toEqual(
          await store.listVersions(entry.id)
        );
        expect(snapshot.latestApprovedByPackage.get(entry.id)).toEqual(
          await store.getLatestApprovedVersion(entry.id)
        );
        expect(
          snapshot.reports.find((report) => report.packageId === entry.id)
        ).toEqual(await store.getPackageReport(entry.id));
      }

      const alpha = snapshot.stats.find((stats) => stats.packageId === "alpha");
      expect(alpha).toMatchObject({
        downloads: 3,
        lastModifiedAt: "2026-06-05T10:00:00.000Z",
      });
      expect(alpha?.downloadHistory.slice(-2)).toEqual([
        { date: "2026-06-06", count: 1 },
        { date: "2026-06-07", count: 1 },
      ]);
      expect(snapshot.latestApprovedByPackage.get("alpha")?.id).toBe("a2");
      expect(snapshot.reports[0]?.installs).toMatchObject({
        total: 2,
        byState: { current: 1, "modified-local-content": 1, stale: 0 },
      });
      expect(snapshot.reports[0]).toMatchObject({ views: 1, versionCount: 3 });
    } finally {
      await store.close();
    }
  });

  it("is served by the in-memory store with the same shape", async () => {
    const store = new MemoryRegistryStore({ now: fixtureClock });
    await seed(store);

    const snapshot = await store.getWorkspaceCatalog("workspace-1");

    expect(snapshot.packages).toHaveLength(3);
    expect(snapshot.latestApprovedByPackage.get("alpha")?.id).toBe("a2");
    expect(snapshot.latestApprovedByPackage.has("beta")).toBe(false);
    expect(snapshot.stats.find((s) => s.packageId === "alpha")?.downloads).toBe(
      3
    );
  });
});
