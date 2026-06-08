import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { SkillPackage, SkillVersion, Workspace } from "@skill-library/domain";
import { createRegistryStore, resolveDatabaseMode, resolveStoragePaths, type SqlRegistryStore } from "./index.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tmpDirs.length = 0;
});

describe("storage configuration", () => {
  it("uses PGlite mode and /data-style child paths by default", () => {
    const paths = resolveStoragePaths({ dataDir: "/data" });

    expect(resolveDatabaseMode({})).toBe("pglite");
    expect(resolveDatabaseMode({ databaseUrl: "postgres://example" })).toBe("postgres");
    expect(paths).toEqual({
      dataDir: "/data",
      pgliteDataDir: "/data/db",
      artifactDir: "/data/artifacts"
    });
  });
});

describe("PGlite registry store", () => {
  it("runs idempotent migrations and reads package/version data", async () => {
    const dataDir = await makeTmpDir();
    const store = await createRegistryStore({ dataDir });

    try {
      await store.migrate();
      await store.migrate();
      await seedStore(store as SqlRegistryStore);

      await expect(store.listPackages("workspace-1")).resolves.toEqual([
        expect.objectContaining({
          id: "package-1",
          slug: "review-helper",
          categories: ["review", "quality"]
        })
      ]);

      await expect(store.getLatestApprovedVersion("package-1")).resolves.toEqual(
        expect.objectContaining({
          id: "version-2",
          lifecycleState: "approved",
          artifactDigest: "sha256:two"
        })
      );
    } finally {
      await store.close();
    }
  });

  it("records install reports", async () => {
    const dataDir = await makeTmpDir();
    const store = await createRegistryStore({ dataDir });

    try {
      await store.migrate();
      await seedStore(store as SqlRegistryStore);

      await expect(
        store.recordInstallReport({
          installId: "install-1",
          packageId: "package-1",
          versionId: "version-2",
          state: "current",
          reportedAt: "2026-06-07T12:00:00.000Z",
          targetKind: "codex-global"
        })
      ).resolves.toBeUndefined();
    } finally {
      await store.close();
    }
  });

  it("stores immutable artifacts by digest", async () => {
    const dataDir = await makeTmpDir();
    const store = await createRegistryStore({ dataDir });

    try {
      await store.migrate();
      const artifact = await store.putArtifact({
        digest: "sha256:abc123",
        content: Buffer.from("artifact-content")
      });
      const duplicate = await store.putArtifact({
        digest: "sha256:abc123",
        content: Buffer.from("artifact-content")
      });

      await expect(store.getArtifact("sha256:abc123")).resolves.toEqual(
        expect.objectContaining({
          digest: "sha256:abc123",
          sizeBytes: "artifact-content".length
        })
      );
      await expect(store.readArtifactContent("sha256:abc123")).resolves.toEqual(Buffer.from("artifact-content"));
      expect(duplicate.storagePath).toBe(artifact.storagePath);
    } finally {
      await store.close();
    }
  });

  it("records usage events for reporting counters", async () => {
    const dataDir = await makeTmpDir();
    const store = await createRegistryStore({ dataDir });

    try {
      await store.migrate();
      await seedStore(store as SqlRegistryStore);

      await store.recordUsageEvent({
        id: "usage-1",
        workspaceId: "workspace-1",
        packageId: "package-1",
        versionId: "version-2",
        eventType: "download",
        createdAt: "2026-06-07T12:00:00.000Z"
      });

      await expect(store.countUsageEvents({ workspaceId: "workspace-1", eventType: "download", packageId: "package-1" })).resolves.toBe(1);
      await expect(store.countUsageEvents({ workspaceId: "workspace-1", eventType: "view", packageId: "package-1" })).resolves.toBe(0);
    } finally {
      await store.close();
    }
  });

  it("creates immutable versions and records lifecycle transitions", async () => {
    const dataDir = await makeTmpDir();
    const store = await createRegistryStore({ dataDir });

    try {
      await store.migrate();
      await seedStore(store as SqlRegistryStore);
      await store.createVersion({
        id: "version-3",
        packageId: "package-1",
        version: "1.2.0",
        lifecycleState: "draft",
        artifactDigest: "sha256:three",
        validation: { ok: true, files: [], issues: [] },
        provenance: { kind: "upload", importedAt: "2026-06-07T13:00:00.000Z" },
        createdAt: "2026-06-07T13:00:00.000Z"
      });

      await expect(store.getVersion("version-3")).resolves.toEqual(expect.objectContaining({ lifecycleState: "draft" }));
      await expect(store.transitionVersion({ versionId: "version-3", toState: "published", actorId: "actor-1" })).resolves.toEqual(
        expect.objectContaining({ lifecycleState: "published" })
      );
      await expect(store.transitionVersion({ versionId: "version-3", toState: "approved", actorId: "actor-1" })).resolves.toEqual(
        expect.objectContaining({ lifecycleState: "approved", approvedAt: expect.any(String) })
      );
    } finally {
      await store.close();
    }
  });
});

async function makeTmpDir() {
  const dir = await mkdtemp(join(tmpdir(), "skill-library-storage-"));
  tmpDirs.push(dir);
  return dir;
}

async function seedStore(store: SqlRegistryStore) {
  const workspace: Workspace = {
    id: "workspace-1",
    slug: "acme",
    name: "Acme",
    reportingPolicy: "opt-in",
    visibility: "public"
  };
  const pkg: SkillPackage = {
    id: "package-1",
    workspaceId: workspace.id,
    slug: "review-helper",
    name: "Review Helper",
    description: "Review local code changes.",
    categories: ["review", "quality"],
    createdAt: "2026-06-07T10:00:00.000Z",
    updatedAt: "2026-06-07T10:00:00.000Z"
  };
  const versions: SkillVersion[] = [
    {
      id: "version-1",
      packageId: pkg.id,
      version: "1.0.0",
      lifecycleState: "deprecated",
      artifactDigest: "sha256:one",
      validation: { ok: true, files: [], issues: [] },
      provenance: { kind: "upload", importedAt: "2026-06-07T10:00:00.000Z" },
      createdAt: "2026-06-07T10:00:00.000Z"
    },
    {
      id: "version-2",
      packageId: pkg.id,
      version: "1.1.0",
      lifecycleState: "approved",
      artifactDigest: "sha256:two",
      validation: { ok: true, files: [], issues: [] },
      provenance: { kind: "upload", importedAt: "2026-06-07T11:00:00.000Z" },
      createdAt: "2026-06-07T11:00:00.000Z",
      approvedAt: "2026-06-07T11:05:00.000Z"
    }
  ];

  await store.seed(workspace, [pkg], versions);
}
