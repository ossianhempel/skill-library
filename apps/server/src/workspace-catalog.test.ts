import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type {
  SkillPackage,
  SkillVersion,
  WorkspaceCatalogResponse,
} from "@skill-library/domain";
import {
  createRegistryStore,
  type SqlRegistryStore,
} from "@skill-library/storage";
import { createHttpApp } from "./http.js";
import { defaultRegistryBrandingConfig } from "./registry-config.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.map((dir) => rm(dir, { recursive: true, force: true }))
  );
  tmpDirs.length = 0;
});

const roles = {
  anonymous: {},
  user: { "x-skill-library-role": "user", "x-skill-library-actor": "user-1" },
  maintainer: {
    "x-skill-library-role": "maintainer",
    "x-skill-library-actor": "maintainer-1",
  },
} as const;

function pkg(id: string, workspaceId = "workspace-1"): SkillPackage {
  return {
    id,
    workspaceId,
    slug: id,
    name: id,
    description: `${id} skill`,
    categories: [],
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

function version(
  id: string,
  packageId: string,
  lifecycleState: SkillVersion["lifecycleState"],
  createdAt: string,
  actorId?: string
): SkillVersion {
  return {
    id,
    packageId,
    version: id,
    lifecycleState,
    artifactDigest: `sha256:${id}`,
    validation: { ok: true, files: [], issues: [] },
    provenance: { kind: "upload", actorId, importedAt: createdAt },
    createdAt,
    approvedAt: lifecycleState === "approved" ? createdAt : undefined,
  };
}

async function createApp(visibility: "public" | "private" = "public") {
  const dir = await mkdtemp(join(tmpdir(), "skill-library-catalog-http-"));
  tmpDirs.push(dir);
  const store = (await createRegistryStore({
    dataDir: dir,
  })) as SqlRegistryStore;
  await store.migrate();
  await store.seed(
    {
      id: "workspace-1",
      slug: "acme",
      name: "Acme",
      reportingPolicy: "opt-in",
      visibility,
    },
    [pkg("approved"), pkg("mine"), pkg("theirs")],
    [
      version("approved-1", "approved", "approved", "2026-06-02T10:00:00.000Z"),
      version("approved-2", "approved", "draft", "2026-06-03T10:00:00.000Z"),
      version("mine-1", "mine", "draft", "2026-06-02T10:00:00.000Z", "user-1"),
      version("theirs-1", "theirs", "published", "2026-06-02T10:00:00.000Z"),
    ]
  );

  return {
    app: createHttpApp(store, defaultRegistryBrandingConfig()),
    store,
  };
}

/** What the web client assembled from the per-package endpoints before. */
async function legacyCatalog(
  app: ReturnType<typeof createHttpApp>,
  headers: Record<string, string>
) {
  const { packages } = (await (
    await app.request("/api/workspaces/workspace-1/packages", { headers })
  ).json()) as { packages: SkillPackage[] };

  return Promise.all(
    packages.map(async (entry) => {
      const latest = await app.request(
        `/api/packages/${entry.id}/latest-approved`,
        { headers }
      );
      const latestApproved = latest.ok
        ? ((await latest.json()) as { version: SkillVersion }).version
        : undefined;
      const { versions } = (await (
        await app.request(`/api/packages/${entry.id}/versions`, { headers })
      ).json()) as { versions: SkillVersion[] };

      return {
        id: entry.id,
        latestApprovedId: latestApproved?.id,
        activeVersionId: (versions[0] ?? latestApproved)?.id,
      };
    })
  );
}

describe("GET /api/workspaces/:workspaceId/catalog", () => {
  it.each(Object.keys(roles) as (keyof typeof roles)[])(
    "shows a %s the same packages and versions as the per-package endpoints",
    async (role) => {
      const { app, store } = await createApp();

      try {
        const response = await app.request(
          "/api/workspaces/workspace-1/catalog",
          { headers: roles[role] }
        );
        const body = (await response.json()) as WorkspaceCatalogResponse;

        expect(response.status).toBe(200);
        expect(
          body.packages.map((entry) => ({
            id: entry.package.id,
            latestApprovedId: entry.latestApproved?.id,
            activeVersionId: entry.activeVersion?.id,
          }))
        ).toEqual(await legacyCatalog(app, roles[role]));
        expect(body.packages.some((entry) => entry.report)).toBe(
          role === "maintainer"
        );
      } finally {
        await store.close();
      }
    }
  );

  it("applies the role rules it is meant to", async () => {
    const { app, store } = await createApp();

    try {
      const ids = async (headers: Record<string, string>) =>
        (
          (await (
            await app.request("/api/workspaces/workspace-1/catalog", {
              headers,
            })
          ).json()) as WorkspaceCatalogResponse
        ).packages.map((entry) => [entry.package.id, entry.activeVersion?.id]);

      expect(await ids(roles.anonymous)).toEqual([["approved", "approved-1"]]);
      expect(await ids(roles.user)).toEqual([
        ["approved", "approved-1"],
        ["mine", undefined],
      ]);
      expect(await ids(roles.maintainer)).toEqual([
        ["approved", "approved-2"],
        ["mine", "mine-1"],
        ["theirs", "theirs-1"],
      ]);
    } finally {
      await store.close();
    }
  });

  it("names the viewer and refuses anonymous access to a private workspace", async () => {
    const { app, store } = await createApp("private");

    try {
      const denied = await app.request("/api/workspaces/workspace-1/catalog");
      const allowed = await app.request("/api/workspaces/workspace-1/catalog", {
        headers: roles.user,
      });

      expect(denied.status).toBe(403);
      await expect(allowed.json()).resolves.toMatchObject({
        viewer: { id: "user-1", role: "user" },
      });
    } finally {
      await store.close();
    }
  });
});
