import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRegistryStore,
  type SqlRegistryStore,
} from "@skill-library/storage";
import { createHttpApp } from "./http.js";
import { defaultRegistryBrandingConfig } from "./registry-config.js";

const tmpDirs: string[] = [];
const stores: SqlRegistryStore[] = [];

afterEach(async () => {
  await Promise.all(stores.map((store) => store.close()));
  stores.length = 0;
  await Promise.all(
    tmpDirs.map((dir) => rm(dir, { recursive: true, force: true }))
  );
  tmpDirs.length = 0;
});

// Dev header auth (non-production) stands in for signed-in users.
const as = (id: string, role = "user") => ({
  "x-skill-library-actor": id,
  "x-skill-library-role": role,
});

describe("ranking routes", () => {
  it("ranks by distinct colleagues and credits the author", async () => {
    const { app } = await createApp();

    for (const user of ["bo", "bo", "cy"]) {
      await download(app, user, "popular");
    }
    await download(app, "bo", "quiet");
    // The author's own download never counts.
    await download(app, "ada", "popular");

    const response = await app.request("/api/workspaces/ws/ranking", {
      headers: as("bo"),
    });
    const { ranking } = await response.json();

    expect(ranking.skills.map((s: any) => [s.packageId, s.colleagues])).toEqual(
      [
        ["popular", 2],
        ["quiet", 1],
      ]
    );
    expect(ranking.contributors).toEqual([
      expect.objectContaining({
        userId: "ada",
        name: "Ada",
        skills: 2,
        colleaguesReached: 2,
      }),
    ]);
  });

  it("includes each skill's ranking in the batched catalog", async () => {
    const { app } = await createApp();
    await download(app, "bo", "popular");
    await vote(app, "cy", "popular", true);

    const response = await app.request("/api/workspaces/ws/catalog", {
      headers: as("cy"),
    });
    const { packages } = await response.json();

    expect(
      packages.find((entry: any) => entry.package.id === "popular").ranking
    ).toMatchObject({ colleagues: 1, upvotes: 1, votedByMe: true });
  });

  it("lets a colleague upvote once and take it back", async () => {
    const { app } = await createApp();

    const first = await vote(app, "bo", "quiet", true);
    const again = await vote(app, "bo", "quiet", true);
    expect(first.status).toBe(200);
    await expect(again.json()).resolves.toEqual({
      skill: expect.objectContaining({
        packageId: "quiet",
        upvotes: 1,
        votedByMe: true,
      }),
    });

    const withdrawn = await vote(app, "bo", "quiet", false);
    await expect(withdrawn.json()).resolves.toEqual({
      skill: expect.objectContaining({ upvotes: 0, votedByMe: false }),
    });
  });

  it("still lets a colleague withdraw a vote after the skill is deprecated", async () => {
    const { app, store } = await createApp();
    await vote(app, "bo", "quiet", true);
    await store.transitionVersion({
      versionId: "quiet-v1",
      toState: "deprecated",
    });

    expect((await vote(app, "bo", "quiet", true)).status).toBe(409);
    const withdrawn = await vote(app, "bo", "quiet", false);
    expect(withdrawn.status).toBe(200);
    expect((await store.getRankingSignals("ws")).votes).toEqual([]);
  });

  it("hides draft skills from colleagues but not from their author", async () => {
    const { app } = await createApp();
    const ids = async (user: string) => {
      const response = await app.request("/api/workspaces/ws/ranking", {
        headers: as(user),
      });
      const { ranking } = await response.json();
      return ranking.skills.map((s: any) => s.packageId).sort();
    };

    expect(await ids("bo")).toEqual(["popular", "quiet"]);
    expect(await ids("ada")).toEqual(["draft", "popular", "quiet"]);
  });

  it("returns zeros after withdrawing a skill's only signal", async () => {
    const { app, store } = await createApp();
    // An author who no longer resolves to a user leaves the vote as the only signal.
    await store.kysely.deleteFrom("user").where("id", "=", "ada").execute();

    await vote(app, "bo", "quiet", true);
    const withdrawn = await vote(app, "bo", "quiet", false);

    await expect(withdrawn.json()).resolves.toEqual({
      skill: expect.objectContaining({ packageId: "quiet", upvotes: 0 }),
    });
  });

  it("does not reveal hidden drafts through the vote route", async () => {
    const { app } = await createApp();

    const response = await vote(app, "bo", "draft", false);

    expect(response.status).toBe(404);
    expect(await response.json()).not.toHaveProperty("skill");
  });

  it("rejects self-votes, anonymous votes, and votes on drafts", async () => {
    const { app } = await createApp();

    expect((await vote(app, "ada", "popular", true)).status).toBe(403);
    expect(
      (
        await app.request("/api/packages/popular/vote", {
          method: "PUT",
          body: JSON.stringify({ voted: true }),
        })
      ).status
    ).toBe(403);
    expect((await vote(app, "bo", "draft", true)).status).toBe(409);
  });
});

async function download(app: App, userId: string, packageId: string) {
  const response = await app.request(
    `/api/artifacts/sha256:${packageId}/download?packageId=${packageId}&versionId=${packageId}-v1`,
    { headers: as(userId) }
  );
  expect(response.status).toBe(200);
}

function vote(app: App, userId: string, packageId: string, voted: boolean) {
  return app.request(`/api/packages/${packageId}/vote`, {
    method: "PUT",
    headers: { ...as(userId), "content-type": "application/json" },
    body: JSON.stringify({ voted }),
  });
}

type App = ReturnType<typeof createHttpApp>;

async function createApp() {
  const dataDir = await mkdtemp(join(tmpdir(), "skill-library-ranking-http-"));
  tmpDirs.push(dataDir);
  const store = (await createRegistryStore({ dataDir })) as SqlRegistryStore;
  stores.push(store);
  await store.migrate();

  await store.kysely
    .insertInto("user")
    .values({ id: "ada", name: "Ada", email: "ada@example.com" })
    .execute();
  await store.kysely
    .insertInto("account")
    .values({
      id: "acc-ada",
      accountId: "ada",
      providerId: "test",
      userId: "ada",
    })
    .execute();

  const now = new Date().toISOString();
  const packages = ["popular", "quiet", "draft"].map((id) => ({
    id,
    workspaceId: "ws",
    slug: id,
    name: id,
    description: `${id} skill`,
    categories: [],
    createdAt: now,
    updatedAt: now,
  }));
  const versions = packages.map((pkg) => ({
    id: `${pkg.id}-v1`,
    packageId: pkg.id,
    version: "1.0.0",
    lifecycleState:
      pkg.id === "draft" ? ("draft" as const) : ("approved" as const),
    artifactDigest: `sha256:${pkg.id}`,
    validation: { ok: true, files: [], issues: [] },
    provenance: { kind: "upload" as const, actorId: "ada", importedAt: now },
    createdAt: now,
  }));
  for (const pkg of packages) {
    await store.putArtifact({
      digest: `sha256:${pkg.id}`,
      content: new TextEncoder().encode(`# ${pkg.id}`),
    });
  }
  await store.seed(
    {
      id: "ws",
      slug: "ws",
      name: "WS",
      reportingPolicy: "opt-in",
      visibility: "private",
    },
    packages,
    versions
  );

  return { app: createHttpApp(store, defaultRegistryBrandingConfig()), store };
}
