import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { SkillPackage, SkillVersion, Workspace } from "@skill-library/domain";
import { createRegistryStore, type SqlRegistryStore } from "@skill-library/storage";
import { createHttpApp } from "./http.js";

const tmpDirs: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tmpDirs.length = 0;
});

describe("HTTP registry API", () => {
  it("serves health and catalog search", async () => {
    const { app, store } = await createSeededApp();

    try {
      const health = await app.request("/health");
      const catalog = await app.request("/api/workspaces/workspace-1/packages?q=review");

      await expect(health.json()).resolves.toEqual({ ok: true, mode: "pglite" });
      await expect(catalog.json()).resolves.toEqual({
        packages: [expect.objectContaining({ id: "package-1", slug: "review-helper" })]
      });
    } finally {
      await store.close();
    }
  });

  it("omits non-approved packages from ordinary catalog search", async () => {
    const { app, store } = await createSeededApp();

    try {
      const draftPkg: SkillPackage = {
        id: "package-draft",
        workspaceId: "workspace-1",
        slug: "draft-skill",
        name: "Draft Skill",
        description: "Not approved yet.",
        categories: ["draft"],
        createdAt: "2026-06-07T10:00:00.000Z",
        updatedAt: "2026-06-07T10:00:00.000Z"
      };
      await store.upsertPackage(draftPkg);
      await store.createVersion({
        id: "version-draft",
        packageId: draftPkg.id,
        version: "0.1.0",
        lifecycleState: "published",
        artifactDigest: "sha256:draft",
        validation: { ok: true, files: [], issues: [] },
        provenance: { kind: "upload", importedAt: "2026-06-07T10:00:00.000Z" },
        createdAt: "2026-06-07T10:00:00.000Z"
      });

      const ordinary = await app.request("/api/workspaces/workspace-1/packages");
      const maintainer = await app.request("/api/workspaces/workspace-1/packages", { headers: maintainerHeaders() });

      await expect(ordinary.json()).resolves.toEqual({
        packages: [expect.objectContaining({ id: "package-1" })]
      });
      await expect(maintainer.json()).resolves.toEqual({
        packages: expect.arrayContaining([expect.objectContaining({ id: "package-1" }), expect.objectContaining({ id: "package-draft" })])
      });
    } finally {
      await store.close();
    }
  });

  it("serves package details and latest approved versions", async () => {
    const { app, store } = await createSeededApp();

    try {
      const detail = await app.request("/api/packages/package-1");
      const version = await app.request("/api/packages/package-1/latest-approved");
      const usage = await app.request("/api/workspaces/workspace-1/usage-counts?eventType=view&packageId=package-1", { headers: maintainerHeaders() });

      expect(detail.status).toBe(200);
      expect(version.status).toBe(200);
      await expect(version.json()).resolves.toEqual({
        version: expect.objectContaining({ id: "version-1", lifecycleState: "approved" })
      });
      await expect(usage.json()).resolves.toEqual({ count: 1 });
    } finally {
      await store.close();
    }
  });

  it("serves package version lists and version detail", async () => {
    const { app, store } = await createSeededApp();

    try {
      const versions = await app.request("/api/packages/package-1/versions");
      const detail = await app.request("/api/versions/version-1");

      expect(versions.status).toBe(200);
      expect(detail.status).toBe(200);
      await expect(versions.json()).resolves.toEqual({
        versions: [expect.objectContaining({ id: "version-1", packageId: "package-1" })]
      });
      await expect(detail.json()).resolves.toEqual({
        version: expect.objectContaining({ id: "version-1", lifecycleState: "approved" })
      });
    } finally {
      await store.close();
    }
  });

  it("hides non-approved versions from ordinary version routes", async () => {
    const { app, store } = await createSeededApp();

    try {
      await store.createVersion({
        id: "version-draft-list",
        packageId: "package-1",
        version: "9.9.9",
        lifecycleState: "draft",
        artifactDigest: "sha256:draft-list",
        validation: { ok: true, files: [], issues: [] },
        provenance: { kind: "upload", importedAt: "2026-06-07T10:00:00.000Z" },
        createdAt: "2026-06-07T12:00:00.000Z"
      });

      const ordinaryVersions = await app.request("/api/packages/package-1/versions");
      const maintainerVersions = await app.request("/api/packages/package-1/versions", { headers: maintainerHeaders() });
      const deniedDetail = await app.request("/api/versions/version-draft-list");

      await expect(ordinaryVersions.json()).resolves.toEqual({
        versions: [expect.objectContaining({ id: "version-1", lifecycleState: "approved" })]
      });
      await expect(maintainerVersions.json()).resolves.toEqual({
        versions: expect.arrayContaining([
          expect.objectContaining({ id: "version-1" }),
          expect.objectContaining({ id: "version-draft-list" })
        ])
      });
      expect(deniedDetail.status).toBe(403);
    } finally {
      await store.close();
    }
  });

  it("validates, ingests, and downloads artifacts", async () => {
    const { app, store } = await createSeededApp();

    try {
      const entries = [{ path: "demo/SKILL.md", content: "# Demo\n" }];
      const validation = await app.request("/api/validation/package-tree", {
        method: "POST",
        body: JSON.stringify({ entries })
      });
      const ingest = await app.request("/api/artifacts/ingest", {
        method: "POST",
        headers: maintainerHeaders(),
        body: JSON.stringify({ entries })
      });
      const body = (await ingest.json()) as { artifact: { digest: string } };
      const ingestedVersion: SkillVersion = {
        id: "version-ingest",
        packageId: "package-1",
        version: "1.0.1",
        lifecycleState: "approved",
        artifactDigest: body.artifact.digest,
        validation: { ok: true, files: [], issues: [] },
        provenance: { kind: "upload", importedAt: "2026-06-07T10:00:00.000Z" },
        createdAt: "2026-06-07T10:00:00.000Z",
        approvedAt: "2026-06-07T10:05:00.000Z"
      };
      await store.createVersion(ingestedVersion);
      const download = await app.request(`/api/artifacts/${body.artifact.digest}/download?packageId=package-1&versionId=version-ingest`);
      const usage = await app.request("/api/workspaces/workspace-1/usage-counts?eventType=download&packageId=package-1&versionId=version-ingest", { headers: maintainerHeaders() });

      expect(validation.status).toBe(200);
      expect(ingest.status).toBe(201);
      expect(download.status).toBe(200);
      expect(download.headers.get("content-type")).toBe("application/zip");
      await expect(usage.json()).resolves.toEqual({ count: 1 });
    } finally {
      await store.close();
    }
  });

  it("creates uploaded draft versions and transitions lifecycle state", async () => {
    const { app, store } = await createSeededApp();

    try {
      const created = await app.request("/api/workspaces/workspace-1/packages/upload", {
        method: "POST",
        headers: maintainerHeaders(),
        body: JSON.stringify({
          packageSlug: "release-notes",
          packageName: "Release Notes",
          description: "Draft release notes from changes.",
          categories: ["release"],
          version: "1.0.0",
          entries: [{ path: "release-notes/SKILL.md", content: "# Release notes\n" }],
          actorId: "actor-1"
        })
      });
      const createdBody = (await created.json()) as { version: { id: string } };
      const published = await app.request(`/api/versions/${createdBody.version.id}/lifecycle`, {
        method: "POST",
        headers: maintainerHeaders(),
        body: JSON.stringify({ toState: "published", actorId: "actor-1" })
      });
      const approved = await app.request(`/api/versions/${createdBody.version.id}/lifecycle`, {
        method: "POST",
        headers: maintainerHeaders(),
        body: JSON.stringify({ toState: "approved", actorId: "actor-1" })
      });

      expect(created.status).toBe(201);
      await expect(published.json()).resolves.toEqual({ version: expect.objectContaining({ lifecycleState: "published" }) });
      await expect(approved.json()).resolves.toEqual({ version: expect.objectContaining({ lifecycleState: "approved", approvedAt: expect.any(String) }) });
    } finally {
      await store.close();
    }
  });

  it("creates a default workspace when publishing into a fresh registry", async () => {
    const store = await createRegistryStore({ dataDir: await makeTmpDir() });
    await store.migrate();
    const app = createHttpApp(store);

    try {
      const created = await app.request("/api/workspaces/acme/packages/upload", {
        method: "POST",
        headers: maintainerHeaders(),
        body: JSON.stringify({
          packageSlug: "review-helper",
          packageName: "Review Helper",
          description: "Review local changes.",
          version: "1.0.0",
          entries: [{ path: "SKILL.md", content: "# Review\n" }]
        })
      });
      const catalog = await app.request("/api/workspaces/acme/packages", { headers: maintainerHeaders() });

      expect(created.status).toBe(201);
      await expect(catalog.json()).resolves.toEqual({
        packages: [expect.objectContaining({ id: "acme-review-helper", workspaceId: "acme" })]
      });
    } finally {
      await store.close();
    }
  });

  it("creates invalid draft versions but blocks approval", async () => {
    const { app, store } = await createSeededApp();

    try {
      const response = await app.request("/api/workspaces/workspace-1/packages/upload", {
        method: "POST",
        headers: maintainerHeaders(),
        body: JSON.stringify({
          packageSlug: "broken",
          packageName: "Broken",
          description: "Invalid package.",
          version: "1.0.0",
          entries: [{ path: "README.md", content: "No skill file\n" }]
        })
      });
      const body = (await response.json()) as { version: { id: string } };
      const approve = await app.request(`/api/versions/${body.version.id}/lifecycle`, {
        method: "POST",
        headers: maintainerHeaders(),
        body: JSON.stringify({ toState: "approved" })
      });

      expect(response.status).toBe(201);
      expect(body).toEqual({
        version: expect.objectContaining({
          lifecycleState: "draft",
          validation: expect.objectContaining({ ok: false })
        })
      });
      expect(approve.status).toBe(422);
      await expect(approve.json()).resolves.toEqual({ error: "Cannot approve a version with validation errors." });
    } finally {
      await store.close();
    }
  });

  it("creates draft versions from Git imports with commit provenance", async () => {
    const { app, store } = await createSeededApp();
    const repoPath = await createGitSkillRepo();

    try {
      const response = await app.request("/api/workspaces/workspace-1/packages/import-git", {
        method: "POST",
        headers: maintainerHeaders(),
        body: JSON.stringify({
          packageSlug: "git-skill",
          packageName: "Git Skill",
          description: "Imported from Git.",
          version: "1.0.0",
          repositoryPath: repoPath,
          ref: "HEAD",
          subdirectory: "skills/git-skill",
          actorId: "actor-1"
        })
      });

      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body).toEqual({
        version: expect.objectContaining({
          lifecycleState: "draft",
          provenance: expect.objectContaining({
            kind: "git",
            ref: "HEAD",
            commit: expect.stringMatching(/^[a-f0-9]{40}$/)
          })
        })
      });
    } finally {
      await store.close();
    }
  });

  it("rejects Git import subdirectory path traversal", async () => {
    const { app, store } = await createSeededApp();
    const repoPath = await createGitSkillRepo();

    try {
      const response = await app.request("/api/workspaces/workspace-1/packages/import-git", {
        method: "POST",
        headers: maintainerHeaders(),
        body: JSON.stringify({
          packageSlug: "traversal-skill",
          packageName: "Traversal Skill",
          description: "Should not escape the archive.",
          version: "1.0.0",
          repositoryPath: repoPath,
          ref: "HEAD",
          subdirectory: "../../../../../etc",
          actorId: "actor-1"
        })
      });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({
        error: "Subdirectory must stay within the extracted archive."
      });
    } finally {
      await store.close();
    }
  });

  it("accepts install reports", async () => {
    const { app, store } = await createSeededApp();

    try {
      const response = await app.request("/api/install-reports", {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify({
          installId: "install-1",
          packageId: "package-1",
          versionId: "version-1",
          state: "current",
          reportedAt: "2026-06-07T12:00:00.000Z",
          targetKind: "codex-global"
        })
      });

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({ accepted: true });
    } finally {
      await store.close();
    }
  });

  it("serves maintainer package and workspace reports with latest install state per install", async () => {
    const { app, store } = await createSeededApp();

    try {
      await app.request("/api/packages/package-1");
      await store.recordUsageEvent({
        id: "usage-download-1",
        workspaceId: "workspace-1",
        packageId: "package-1",
        versionId: "version-1",
        eventType: "download",
        createdAt: "2026-06-07T12:00:00.000Z"
      });
      await app.request("/api/install-reports", {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify({
          installId: "install-1",
          packageId: "package-1",
          versionId: "version-1",
          state: "current",
          reportedAt: "2026-06-07T12:00:00.000Z",
          targetKind: "codex-global"
        })
      });
      await app.request("/api/install-reports", {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify({
          installId: "install-1",
          packageId: "package-1",
          versionId: "version-1",
          state: "stale",
          reportedAt: "2026-06-07T13:00:00.000Z",
          targetKind: "codex-global"
        })
      });
      await app.request("/api/install-reports", {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify({
          installId: "install-2",
          packageId: "package-1",
          versionId: "version-1",
          state: "modified-local-content",
          reportedAt: "2026-06-07T12:30:00.000Z",
          targetKind: "project"
        })
      });

      const packageReport = await app.request("/api/packages/package-1/report", { headers: maintainerHeaders() });
      const workspaceReports = await app.request("/api/workspaces/workspace-1/reports", { headers: maintainerHeaders() });
      const denied = await app.request("/api/packages/package-1/report", { headers: userHeaders() });

      expect(packageReport.status).toBe(200);
      expect(workspaceReports.status).toBe(200);
      expect(denied.status).toBe(403);
      await expect(packageReport.json()).resolves.toEqual({
        report: expect.objectContaining({
          packageId: "package-1",
          workspaceId: "workspace-1",
          versionCount: 1,
          latestApprovedVersionId: "version-1",
          views: 1,
          downloads: 1,
          installs: {
            total: 2,
            byState: expect.objectContaining({
              current: 0,
              stale: 1,
              "modified-local-content": 1
            })
          }
        })
      });
      await expect(workspaceReports.json()).resolves.toEqual({
        reports: [expect.objectContaining({ packageId: "package-1", installs: expect.objectContaining({ total: 2 }) })]
      });
    } finally {
      await store.close();
    }
  });

  it("denies maintainer routes without sufficient role", async () => {
    const { app, store } = await createSeededApp();

    try {
      const upload = await app.request("/api/workspaces/workspace-1/packages/upload", {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify({
          packageSlug: "release-notes",
          packageName: "Release Notes",
          description: "Draft release notes from changes.",
          version: "1.0.0",
          entries: [{ path: "release-notes/SKILL.md", content: "# Release notes\n" }]
        })
      });
      const report = await app.request("/api/install-reports", {
        method: "POST",
        body: JSON.stringify({})
      });

      expect(upload.status).toBe(403);
      expect(report.status).toBe(403);
    } finally {
      await store.close();
    }
  });

  it("accepts configured bearer API keys for protected routes", async () => {
    const previousKeys = process.env.SKILL_LIBRARY_API_KEYS;
    process.env.SKILL_LIBRARY_API_KEYS = "maintainer-secret:maintainer:maintainer-api,user-secret:user:user-api";
    const { app, store } = await createSeededApp();

    try {
      const usage = await app.request("/api/workspaces/workspace-1/usage-counts", {
        headers: { authorization: "Bearer maintainer-secret" }
      });
      const denied = await app.request("/api/workspaces/workspace-1/usage-counts", {
        headers: { authorization: "Bearer user-secret" }
      });

      expect(usage.status).toBe(200);
      expect(denied.status).toBe(403);
    } finally {
      if (previousKeys === undefined) {
        delete process.env.SKILL_LIBRARY_API_KEYS;
      } else {
        process.env.SKILL_LIBRARY_API_KEYS = previousKeys;
      }
      await store.close();
    }
  });

  it("rejects dev role headers in production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSecret = process.env.BETTER_AUTH_SECRET;
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_SECRET = "test-production-secret";

    try {
      const { app, store } = await createSeededApp();
      const denied = await app.request("/api/workspaces/workspace-1/packages/upload", {
        method: "POST",
        headers: maintainerHeaders(),
        body: JSON.stringify({
          packageSlug: "blocked-upload",
          packageName: "Blocked Upload",
          description: "Should not upload with dev headers in production.",
          version: "1.0.0",
          entries: [{ path: "blocked/SKILL.md", content: "# Blocked\n" }]
        })
      });

      expect(denied.status).toBe(403);
      await store.close();
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }

      if (previousSecret === undefined) {
        delete process.env.BETTER_AUTH_SECRET;
      } else {
        process.env.BETTER_AUTH_SECRET = previousSecret;
      }
    }
  });

  it("requires BETTER_AUTH_SECRET in production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSecret = process.env.BETTER_AUTH_SECRET;
    process.env.NODE_ENV = "production";
    delete process.env.BETTER_AUTH_SECRET;

    try {
      const { resolveBetterAuthSecret } = await import("./better-auth.js");
      expect(() => resolveBetterAuthSecret()).toThrow(/BETTER_AUTH_SECRET is required/);
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }

      if (previousSecret === undefined) {
        delete process.env.BETTER_AUTH_SECRET;
      } else {
        process.env.BETTER_AUTH_SECRET = previousSecret;
      }
    }
  });

  it("protects private workspace browse routes and lets admins update reporting policy", async () => {
    const store = await createRegistryStore({ dataDir: await makeTmpDir() });
    await store.migrate();
    await seedPrivateStore(store as SqlRegistryStore);
    const app = createHttpApp(store);

    try {
      const deniedCatalog = await app.request("/api/workspaces/private-workspace/packages");
      const allowedCatalog = await app.request("/api/workspaces/private-workspace/packages", { headers: userHeaders() });
      const deniedDetail = await app.request("/api/packages/private-package");
      const deniedDownload = await app.request("/api/artifacts/sha256:private/download?packageId=private-package&versionId=private-version");
      const allowedDownload = await app.request("/api/artifacts/sha256:private/download?packageId=private-package&versionId=private-version", {
        headers: userHeaders()
      });
      const updated = await app.request("/api/workspaces/private-workspace", {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify({ reportingPolicy: "required", visibility: "public" })
      });
      const publicCatalog = await app.request("/api/workspaces/private-workspace/packages");

      expect(deniedCatalog.status).toBe(403);
      expect(allowedCatalog.status).toBe(200);
      expect(deniedDetail.status).toBe(403);
      expect(deniedDownload.status).toBe(403);
      expect(allowedDownload.status).toBe(404);
      await expect(updated.json()).resolves.toEqual({ workspace: expect.objectContaining({ reportingPolicy: "required", visibility: "public" }) });
      expect(publicCatalog.status).toBe(200);
    } finally {
      await store.close();
    }
  });

  it("admin can list, update, and delete users", async () => {
    const { app, store } = await createSeededApp();

    try {
      // Seed a user into the "user" table
      await store.query(
        'insert into "user" (id, name, email, "emailVerified", role, created_at, updated_at) values ($1, $2, $3, $4, $5, now(), now())',
        ["user-1", "Test User", "test@example.com", false, "user"]
      );

      // Non-admin is denied
      const denied = await app.request("/api/admin/users", { headers: userHeaders() });
      expect(denied.status).toBe(403);

      // Admin can list users
      const list = await app.request("/api/admin/users", { headers: adminHeaders() });
      expect(list.status).toBe(200);
      const listBody = (await list.json()) as { users: any[] };
      expect(listBody.users).toEqual([
        expect.objectContaining({ id: "user-1", email: "test@example.com", role: "user" })
      ]);

      // Admin can update a user's role
      const updated = await app.request("/api/admin/users/user-1", {
        method: "PATCH",
        headers: { ...adminHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ role: "maintainer" })
      });
      expect(updated.status).toBe(200);
      const updatedBody = (await updated.json()) as { user: any };
      expect(updatedBody.user).toEqual(expect.objectContaining({ id: "user-1", role: "maintainer" }));

      // Admin can delete a user
      const deleted = await app.request("/api/admin/users/user-1", {
        method: "DELETE",
        headers: adminHeaders()
      });
      expect(deleted.status).toBe(200);
      const deletedBody = (await deleted.json()) as { deleted: boolean };
      expect(deletedBody.deleted).toBe(true);

      // Verify user is deleted
      const afterDelete = await app.request("/api/admin/users", { headers: adminHeaders() });
      const afterDeleteBody = (await afterDelete.json()) as { users: any[] };
      expect(afterDeleteBody.users).toHaveLength(0);
    } finally {
      await store.close();
    }
  });

  it("rejects invalid role in admin PATCH", async () => {
    const { app, store } = await createSeededApp();

    try {
      const response = await app.request("/api/admin/users/user-1", {
        method: "PATCH",
        headers: { ...adminHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ role: "superadmin" })
      });
      expect(response.status).toBe(400);
    } finally {
      await store.close();
    }
  });
});

async function createSeededApp() {
  const store = await createRegistryStore({ dataDir: await makeTmpDir() });
  await store.migrate();
  await seedStore(store as SqlRegistryStore);

  return {
    app: createHttpApp(store),
    store
  };
}

async function makeTmpDir() {
  const dir = await mkdtemp(join(tmpdir(), "skill-library-http-"));
  tmpDirs.push(dir);
  return dir;
}

async function createGitSkillRepo() {
  const repoPath = await makeTmpDir();
  const skillPath = join(repoPath, "skills", "git-skill");

  await mkdir(skillPath, { recursive: true });
  await writeFile(join(skillPath, "SKILL.md"), "# Git skill\n");
  await execFileAsync("git", ["init"], { cwd: repoPath });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repoPath });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: repoPath });
  await execFileAsync("git", ["add", "."], { cwd: repoPath });
  await execFileAsync("git", ["commit", "-m", "Add skill"], { cwd: repoPath });

  return repoPath;
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
  const version: SkillVersion = {
    id: "version-1",
    packageId: pkg.id,
    version: "1.0.0",
    lifecycleState: "approved",
    artifactDigest: "sha256:one",
    validation: { ok: true, files: [], issues: [] },
    provenance: { kind: "upload", importedAt: "2026-06-07T10:00:00.000Z" },
    createdAt: "2026-06-07T10:00:00.000Z",
    approvedAt: "2026-06-07T10:05:00.000Z"
  };

  await store.seed(workspace, [pkg], [version]);
}

async function seedPrivateStore(store: SqlRegistryStore) {
  const workspace: Workspace = {
    id: "private-workspace",
    slug: "private",
    name: "Private",
    reportingPolicy: "opt-in",
    visibility: "private"
  };
  const pkg: SkillPackage = {
    id: "private-package",
    workspaceId: workspace.id,
    slug: "private-skill",
    name: "Private Skill",
    description: "Private package.",
    categories: ["private"],
    createdAt: "2026-06-07T10:00:00.000Z",
    updatedAt: "2026-06-07T10:00:00.000Z"
  };
  const version: SkillVersion = {
    id: "private-version",
    packageId: pkg.id,
    version: "1.0.0",
    lifecycleState: "approved",
    artifactDigest: "sha256:private",
    validation: { ok: true, files: [], issues: [] },
    provenance: { kind: "upload", importedAt: "2026-06-07T10:00:00.000Z" },
    createdAt: "2026-06-07T10:00:00.000Z",
    approvedAt: "2026-06-07T10:05:00.000Z"
  };

  await store.seed(workspace, [pkg], [version]);
}

function maintainerHeaders() {
  return {
    "x-skill-library-role": "maintainer",
    "x-skill-library-actor": "actor-1"
  };
}

function userHeaders() {
  return {
    "x-skill-library-role": "user",
    "x-skill-library-actor": "user-1"
  };
}

function adminHeaders() {
  return {
    "x-skill-library-role": "admin",
    "x-skill-library-actor": "admin-1"
  };
}
