import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createRegistryStore } from "@skill-library/storage";
import type { WorkspaceCatalogEntry } from "@skill-library/domain";
import { createHttpApp } from "./http.js";
import { defaultRegistryBrandingConfig } from "./registry-config.js";
import { skillMd } from "./test-git-repo.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { recursive: true, force: true }))
  );
  dirs.length = 0;
});

const as = (id: string, role = "user") => ({
  "x-skill-library-role": role,
  "x-skill-library-actor": id,
});

async function createApp() {
  const dataDir = await mkdtemp(join(tmpdir(), "skill-library-proposals-"));
  dirs.push(dataDir);
  const store = await createRegistryStore({ dataDir });
  await store.migrate();
  return createHttpApp(store, defaultRegistryBrandingConfig());
}

type App = Awaited<ReturnType<typeof createApp>>;

async function upload(
  app: App,
  actor: string,
  version: string,
  description: string
): Promise<string> {
  const response = await app.request("/api/workspaces/ws/packages/upload", {
    method: "POST",
    headers: as(actor),
    body: JSON.stringify({
      packageSlug: "cv-tailor",
      packageName: actor === "ossian" ? "CV Tailor" : "Renamed by colleague",
      description,
      version,
      entries: [
        { path: "SKILL.md", content: skillMd("cv-tailor", description) },
      ],
    }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { version: { id: string } }).version.id;
}

function decide(
  app: App,
  versionId: string,
  headers: Record<string, string>,
  toState: string
) {
  return app.request(`/api/versions/${versionId}/lifecycle`, {
    method: "POST",
    headers,
    body: JSON.stringify({ toState }),
  });
}

async function catalogEntry(
  app: App,
  actor: string
): Promise<WorkspaceCatalogEntry> {
  const response = await app.request("/api/workspaces/ws/catalog", {
    headers: as(actor),
  });
  const body = (await response.json()) as { packages: WorkspaceCatalogEntry[] };
  return body.packages.find((entry) => entry.package.slug === "cv-tailor")!;
}

describe("proposed changes on the web API", () => {
  it("lets the owner, not the proposer, approve a colleague's change", async () => {
    const app = await createApp();
    const first = await upload(app, "ossian", "1.0.0", "Tailor a CV.");
    expect(
      (await decide(app, first, as("max", "maintainer"), "approved")).status
    ).toBe(200);

    const proposal = await upload(
      app,
      "christoffer",
      "1.0.1",
      "Tailor a CV, two pages."
    );

    // The catalog entry keeps the owner's name and description until approval.
    const forOwner = await catalogEntry(app, "ossian");
    expect(forOwner.owner).toEqual({ id: "ossian", name: undefined });
    expect(forOwner.proposal?.id).toBe(proposal);
    expect(forOwner.package.name).toBe("CV Tailor");
    expect(forOwner.package.description).toBe("Tailor a CV.");
    expect((await catalogEntry(app, "christoffer")).proposal?.id).toBe(
      proposal
    );
    expect((await catalogEntry(app, "bob")).proposal).toBeUndefined();

    expect(
      (await decide(app, proposal, as("christoffer"), "approved")).status
    ).toBe(403);
    expect((await decide(app, proposal, as("bob"), "approved")).status).toBe(
      403
    );
    // The owner may approve or reject, not deprecate.
    expect(
      (await decide(app, proposal, as("ossian"), "deprecated")).status
    ).toBe(403);

    const approved = await decide(app, proposal, as("ossian"), "approved");
    expect(approved.status).toBe(200);
    const after = await catalogEntry(app, "bob");
    expect(after.latestApproved?.id).toBe(proposal);
    expect(after.proposal).toBeUndefined();
    // Approval brings in the proposal's description; the name stays the owner's.
    expect(after.package.description).toBe("Tailor a CV, two pages.");
    expect(after.package.name).toBe("CV Tailor");
  });

  it("keeps a proposer's own change visible when someone proposes after them", async () => {
    const app = await createApp();
    const first = await upload(app, "ossian", "1.0.0", "Tailor a CV.");
    await decide(app, first, as("max", "maintainer"), "approved");
    const alices = await upload(app, "alice", "1.0.1", "Alice's change.");
    const bobs = await upload(app, "bob", "1.0.2", "Bob's change.");

    expect((await catalogEntry(app, "alice")).proposal?.id).toBe(alices);
    expect((await catalogEntry(app, "bob")).proposal?.id).toBe(bobs);
    expect((await catalogEntry(app, "ossian")).proposal?.id).toBe(bobs);
  });

  it("still needs a maintainer to approve the owner's own versions", async () => {
    const app = await createApp();
    const first = await upload(app, "ossian", "1.0.0", "Tailor a CV.");
    expect((await decide(app, first, as("ossian"), "approved")).status).toBe(
      403
    );
    expect(
      (await decide(app, first, as("max", "maintainer"), "approved")).status
    ).toBe(200);
  });
});
