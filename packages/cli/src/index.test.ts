import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { InstallMetadata, SkillVersion } from "@skill-library/domain";
import { packPackageZip, validatePackageTree } from "@skill-library/validation";
import {
  createRegistryClient,
  getInstalledSkillStatus,
  installFromRegistry,
  installPackageTree,
  readInstallMetadata,
  resolveInstallTarget,
  runCli,
  updateFromRegistry,
  writeInstallMetadata
} from "./index.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tmpDirs.length = 0;
});

describe("CLI install foundations", () => {
  it("resolves global and project install targets", async () => {
    const projectRoot = await makeTmpDir();

    expect(resolveInstallTarget({ target: "codex-global" })).toEqual(expect.objectContaining({ kind: "codex-global", root: "~/.codex/skills" }));
    expect(resolveInstallTarget({ target: "project", projectRoot })).toEqual(
      expect.objectContaining({
        kind: "project",
        root: join(projectRoot, ".agents", "skills")
      })
    );
  });

  it("writes and reads generated install metadata", async () => {
    const skillRoot = await makeTmpDir();
    const metadata = makeMetadata({ versionId: "version-1" });

    await writeInstallMetadata(skillRoot, metadata);

    await expect(readInstallMetadata(skillRoot)).resolves.toEqual(metadata);
  });

  it("reports missing, current, and stale metadata states", async () => {
    const skillRoot = await makeTmpDir();
    const latest = makeVersion({ id: "version-2" });

    await expect(getInstalledSkillStatus(skillRoot, latest)).resolves.toEqual({
      state: "missing-metadata",
      latestApprovedVersionId: "version-2"
    });

    await writeFile(join(skillRoot, "SKILL.md"), skillMd("demo-skill", "Demo skill.", "# Demo\n"));
    const contentDigest = validatePackageTree([{ path: "SKILL.md", content: skillMd("demo-skill", "Demo skill.", "# Demo\n") }]).digest;

    await writeInstallMetadata(skillRoot, makeMetadata({ versionId: "version-1", contentDigest }));
    await expect(getInstalledSkillStatus(skillRoot, latest)).resolves.toEqual(
      expect.objectContaining({
        state: "stale",
        latestApprovedVersionId: "version-2"
      })
    );

    await writeInstallMetadata(skillRoot, makeMetadata({ versionId: "version-2", contentDigest }));
    await expect(getInstalledSkillStatus(skillRoot, latest)).resolves.toEqual(
      expect.objectContaining({
        state: "current",
        latestApprovedVersionId: "version-2"
      })
    );
  });

  it("reports modified local content before update overwrite", async () => {
    const skillRoot = await makeTmpDir();
    const latest = makeVersion({ id: "version-1" });

    await writeFile(join(skillRoot, "SKILL.md"), "# Locally changed\n");
    await writeInstallMetadata(skillRoot, makeMetadata({ versionId: "version-1", contentDigest: "sha256:original" }));

    await expect(getInstalledSkillStatus(skillRoot, latest)).resolves.toEqual(expect.objectContaining({ state: "modified-local-content" }));
  });

  it("installs package files into a destination root and writes metadata", async () => {
    const destinationRoot = await makeTmpDir();
    const metadata = makeMetadata({ versionId: "version-1" });
    const result = await installPackageTree({
      destinationRoot,
      metadata,
      entries: [
        { path: "demo-skill/SKILL.md", content: skillMd("demo-skill", "Demo skill.", "# Demo\n") },
        { path: "demo-skill/references/a.md", content: "A\n" }
      ]
    });

    expect(result.skillRoot).toBe(join(destinationRoot, "demo-skill"));
    expect(result.filesWritten).toEqual(["SKILL.md", "references/a.md"]);
    await expect(readFile(join(result.skillRoot, "SKILL.md"), "utf8")).resolves.toBe(skillMd("demo-skill", "Demo skill.", "# Demo\n"));
    await expect(readInstallMetadata(result.skillRoot)).resolves.toEqual(metadata);
  });

  it("refuses unmanaged overwrites unless forced", async () => {
    const destinationRoot = await makeTmpDir();
    const unmanagedRoot = join(destinationRoot, "demo-skill");

    await mkdir(unmanagedRoot, { recursive: true });
    await writeFile(join(unmanagedRoot, "SKILL.md"), "# Local\n");

    const install = {
      destinationRoot,
      metadata: makeMetadata({ versionId: "version-1" }),
      entries: [{ path: "demo-skill/SKILL.md", content: skillMd("demo-skill", "Remote skill.", "# Remote\n") }]
    };

    await expect(installPackageTree(install)).rejects.toThrow("Refusing to overwrite unmanaged");
    await expect(installPackageTree({ ...install, force: true })).resolves.toEqual(expect.objectContaining({ skillRoot: unmanagedRoot }));
    await expect(readFile(join(unmanagedRoot, "SKILL.md"), "utf8")).resolves.toBe(skillMd("demo-skill", "Remote skill.", "# Remote\n"));
  });

  it("searches the registry through HTTP", async () => {
    const client = createRegistryClient({
      registryUrl: "http://registry.test",
      token: "secret",
      fetch: async (input, init) => {
        expect(String(input)).toBe("http://registry.test/api/workspaces/workspace-1/packages?q=review");
        expect(init).toEqual(expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer secret" }) }));
        return jsonResponse({ packages: [{ id: "package-1", slug: "review-helper" }] });
      }
    });

    await expect(client.search("workspace-1", "review")).resolves.toEqual([expect.objectContaining({ slug: "review-helper" })]);
  });

  it("installs the latest approved registry artifact and writes generated metadata", async () => {
    const destinationRoot = await makeTmpDir();
    const archivePath = join(await makeTmpDir(), "artifact.zip");
    const entries = [
      { path: "remote-skill/SKILL.md", content: skillMd("remote-skill", "Remote skill.", "# Remote\n") },
      { path: "remote-skill/references/a.md", content: "A\n" }
    ];
    const digest = validatePackageTree(entries).digest!;
    const installedDigest = validatePackageTree([
      { path: "SKILL.md", content: skillMd("remote-skill", "Remote skill.", "# Remote\n") },
      { path: "references/a.md", content: "A\n" }
    ]).digest!;
    const archive = await packPackageZip(entries);
    const reports: unknown[] = [];
    const client = createRegistryClient({
      registryUrl: "http://registry.test",
      fetch: async (input, init) => {
        const url = String(input);

        if (url.endsWith("/api/packages/package-1/latest-approved")) {
          return jsonResponse({ version: makeVersion({ id: "version-2", artifactDigest: digest }) });
        }

        if (url.startsWith("http://registry.test/api/artifacts/")) {
          return new Response(new Uint8Array(archive), { status: 200 });
        }

        if (url.endsWith("/api/install-reports")) {
          reports.push(JSON.parse(String(init?.body)));
          return jsonResponse({ ok: true });
        }

        return jsonResponse({ error: "not found" }, 404);
      }
    });
    const target = resolveInstallTarget({ explicitRoot: destinationRoot, target: "project" });
    const result = await installFromRegistry({
      client,
      registryUrl: "http://registry.test",
      workspaceId: "workspace-1",
      packageId: "package-1",
      packageSlug: "remote-skill",
      destinationRoot,
      installTarget: target,
      archivePath,
      reportConsent: true
    });

    expect(result.filesWritten).toEqual(["SKILL.md", "references/a.md"]);
    await expect(readFile(join(result.skillRoot, "SKILL.md"), "utf8")).resolves.toBe(skillMd("remote-skill", "Remote skill.", "# Remote\n"));
    await expect(readInstallMetadata(result.skillRoot)).resolves.toEqual(
      expect.objectContaining({
        registryUrl: "http://registry.test",
        workspaceId: "workspace-1",
        packageId: "package-1",
        versionId: "version-2",
        contentDigest: installedDigest,
        reportConsent: true
      })
    );
    expect(reports).toEqual([expect.objectContaining({ packageId: "package-1", versionId: "version-2", state: "current" })]);
  });

  it("honors workspace reporting policy during installs", async () => {
    const disabledReports = await installWithReportingPolicy("disabled", true);
    const requiredReports = await installWithReportingPolicy("required", false);

    expect(disabledReports).toEqual([]);
    expect(requiredReports).toEqual([expect.objectContaining({ state: "current", packageId: "package-1" })]);
  });

  it("updates stale managed installs to the latest approved version", async () => {
    const destinationRoot = await makeTmpDir();
    const skillRoot = join(destinationRoot, "remote-skill");
    const archivePath = join(await makeTmpDir(), "artifact.zip");
    const entries = [{ path: "remote-skill/SKILL.md", content: skillMd("remote-skill", "Remote skill v2.", "# Remote v2\n") }];
    const digest = validatePackageTree(entries).digest!;
    const installedDigest = validatePackageTree([{ path: "SKILL.md", content: skillMd("remote-skill", "Remote skill v2.", "# Remote v2\n") }]).digest!;
    const archive = await packPackageZip(entries);
    const reports: unknown[] = [];

    await mkdir(skillRoot, { recursive: true });
    await writeFile(join(skillRoot, "SKILL.md"), skillMd("remote-skill", "Remote skill v1.", "# Remote v1\n"));
    await writeInstallMetadata(
      skillRoot,
      makeMetadata({
        versionId: "version-1",
        contentDigest: validatePackageTree([{ path: "SKILL.md", content: skillMd("remote-skill", "Remote skill v1.", "# Remote v1\n") }]).digest,
        reportConsent: true,
        installTarget: { kind: "project", agent: "codex", root: destinationRoot }
      })
    );

    const client = createRegistryClient({
      registryUrl: "http://registry.test",
      fetch: async (input, init) => {
        const url = String(input);

        if (url.endsWith("/api/packages/package-1/latest-approved")) {
          return jsonResponse({ version: makeVersion({ id: "version-2", artifactDigest: digest }) });
        }

        if (url.startsWith("http://registry.test/api/artifacts/")) {
          return new Response(new Uint8Array(archive), { status: 200 });
        }

        if (url.endsWith("/api/install-reports")) {
          reports.push(JSON.parse(String(init?.body)));
          return jsonResponse({ accepted: true }, 201);
        }

        return jsonResponse({ error: "not found" }, 404);
      }
    });

    const result = await updateFromRegistry({
      client,
      registryUrl: "http://registry.test",
      skillRoot,
      archivePath
    });

    expect(result.updated).toBe(true);
    expect(result.status.state).toBe("stale");
    await expect(readFile(join(skillRoot, "SKILL.md"), "utf8")).resolves.toBe(skillMd("remote-skill", "Remote skill v2.", "# Remote v2\n"));
    await expect(readInstallMetadata(skillRoot)).resolves.toEqual(expect.objectContaining({ versionId: "version-2", contentDigest: installedDigest }));
    expect(reports).toEqual([expect.objectContaining({ packageId: "package-1", versionId: "version-2", state: "current" })]);
  });

  it("removes files deleted in newer managed updates", async () => {
    const destinationRoot = await makeTmpDir();
    const archivePath = join(await makeTmpDir(), "artifact.zip");
    const initialEntries = [
      { path: "remote-skill/SKILL.md", content: skillMd("remote-skill", "Remote skill v1.", "# Remote v1\n") },
      { path: "remote-skill/references/a.md", content: "A\n" }
    ];
    const entries = [{ path: "remote-skill/SKILL.md", content: skillMd("remote-skill", "Remote skill v2.", "# Remote v2\n") }];
    const digest = validatePackageTree(entries).digest!;
    const archive = await packPackageZip(entries);
    const installed = await installPackageTree({
      destinationRoot,
      packageSlug: "remote-skill",
      force: true,
      metadata: makeMetadata({
        versionId: "version-1",
        contentDigest: validatePackageTree([
          { path: "SKILL.md", content: skillMd("remote-skill", "Remote skill v1.", "# Remote v1\n") },
          { path: "references/a.md", content: "A\n" }
        ]).digest
      }),
      entries: initialEntries
    });
    const skillRoot = installed.skillRoot;

    const client = createRegistryClient({
      registryUrl: "http://registry.test",
      fetch: async (input) => {
        const url = String(input);

        if (url.endsWith("/api/packages/package-1/latest-approved")) {
          return jsonResponse({ version: makeVersion({ id: "version-2", artifactDigest: digest }) });
        }

        if (url.startsWith("http://registry.test/api/artifacts/")) {
          return new Response(new Uint8Array(archive), { status: 200 });
        }

        return jsonResponse({ error: "not found" }, 404);
      }
    });

    await updateFromRegistry({
      client,
      registryUrl: "http://registry.test",
      skillRoot,
      archivePath,
      force: true
    });

    await expect(stat(join(skillRoot, "references/a.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not update current installs", async () => {
    const skillRoot = await makeTmpDir();
    const contentDigest = validatePackageTree([{ path: "SKILL.md", content: skillMd("current-skill", "Current skill.", "# Current\n") }]).digest;
    const reports: unknown[] = [];

    await writeFile(join(skillRoot, "SKILL.md"), skillMd("current-skill", "Current skill.", "# Current\n"));
    await writeInstallMetadata(skillRoot, makeMetadata({ versionId: "version-1", contentDigest, reportConsent: true }));

    const client = createRegistryClient({
      registryUrl: "http://registry.test",
      fetch: async (input, init) => {
        const url = String(input);

        if (url.endsWith("/api/packages/package-1/latest-approved")) {
          return jsonResponse({ version: makeVersion({ id: "version-1", artifactDigest: contentDigest }) });
        }

        if (url.endsWith("/api/install-reports")) {
          reports.push(JSON.parse(String(init?.body)));
          return jsonResponse({ accepted: true }, 201);
        }

        return jsonResponse({ error: "not found" }, 404);
      }
    });

    await expect(updateFromRegistry({ client, registryUrl: "http://registry.test", skillRoot, archivePath: join(await makeTmpDir(), "artifact.zip") })).resolves.toEqual(
      expect.objectContaining({
        updated: false,
        status: expect.objectContaining({ state: "current" })
      })
    );
    expect(reports).toEqual([expect.objectContaining({ state: "current", versionId: "version-1" })]);
  });

  it("runs search, info, install-plan, status, install, and update commands", async () => {
    const destinationRoot = await makeTmpDir();
    const archivePath = join(await makeTmpDir(), "artifact.zip");
    const entries = [{ path: "cli-skill/SKILL.md", content: skillMd("cli-skill", "CLI skill.", "# CLI\n") }];
    const digest = validatePackageTree(entries).digest!;
    const archive = await packPackageZip(entries);
    const outputs: string[] = [];
    const errors: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);

      if (url.includes("/api/workspaces/workspace-1/packages")) {
        return jsonResponse({ packages: [{ id: "package-1", workspaceId: "workspace-1", slug: "cli-skill", name: "CLI Skill", description: "", categories: [] }] });
      }

      if (url.endsWith("/api/workspaces/workspace-1")) {
        return jsonResponse({ workspace: { id: "workspace-1", slug: "workspace-1", name: "Workspace 1", reportingPolicy: "required", visibility: "private" } });
      }

      if (url.endsWith("/api/packages/package-1")) {
        return jsonResponse({ package: { id: "package-1", workspaceId: "workspace-1", slug: "cli-skill", name: "CLI Skill", description: "", categories: [] } });
      }

      if (url.endsWith("/api/packages/package-1/latest-approved")) {
        return jsonResponse({ version: makeVersion({ id: "version-2", artifactDigest: digest }) });
      }

      if (url.startsWith("http://registry.test/api/artifacts/")) {
        return new Response(new Uint8Array(archive), { status: 200 });
      }

      if (url.endsWith("/api/install-reports")) {
        expect(init?.method).toBe("POST");
        return jsonResponse({ accepted: true }, 201);
      }

      return jsonResponse({ error: "not found" }, 404);
    };
    const runtime = {
      fetch: fetchImpl,
      stdout: (line: string) => outputs.push(line),
      stderr: (line: string) => errors.push(line)
    };

    await expect(runCli(["workspace", "--workspace", "workspace-1", "--registry", "http://registry.test", "--token", "secret"], runtime)).resolves.toBe(0);
    await expect(runCli(["search", "--workspace", "workspace-1", "--registry", "http://registry.test", "--token", "secret", "cli"], runtime)).resolves.toBe(0);
    await expect(runCli(["info", "package-1", "--registry", "http://registry.test"], runtime)).resolves.toBe(0);
    await expect(runCli(["install-plan", "cli-skill", "--target", "project"], runtime)).resolves.toBe(0);
    await expect(
      runCli(
        [
          "install",
          "package-1",
          "--workspace",
          "workspace-1",
          "--root",
          destinationRoot,
          "--slug",
          "cli-skill",
          "--target",
          "project",
          "--archive",
          archivePath,
          "--registry",
          "http://registry.test",
          "--report"
        ],
        runtime
      )
    ).resolves.toBe(0);
    await expect(runCli(["status", "--root", join(destinationRoot, "cli-skill"), "--package", "package-1", "--registry", "http://registry.test"], runtime)).resolves.toBe(0);
    await expect(runCli(["validate", "--root", join(destinationRoot, "cli-skill")], runtime)).resolves.toBe(0);
    await expect(runCli(["update", "--root", join(destinationRoot, "cli-skill"), "--registry", "http://registry.test"], runtime)).resolves.toBe(0);

    expect(errors).toEqual([]);
    expect(outputs.some((line) => line.includes("skill-library install cli-skill --target project"))).toBe(true);
    await expect(readFile(join(destinationRoot, "cli-skill", "SKILL.md"), "utf8")).resolves.toBe(skillMd("cli-skill", "CLI skill.", "# CLI\n"));
  });

  it("reports frontmatter validation issues from validate --root", async () => {
    const skillRoot = await makeTmpDir();
    await writeFile(join(skillRoot, "SKILL.md"), "# Missing frontmatter\n");
    const outputs: string[] = [];

    await expect(runCli(["validate", "--root", skillRoot], { stdout: (line) => outputs.push(line), stderr: () => undefined })).resolves.toBe(0);
    expect(JSON.parse(outputs.join("\n"))).toEqual(
      expect.objectContaining({
        validation: expect.objectContaining({
          ok: false,
          issues: expect.arrayContaining([expect.objectContaining({ ruleId: "skill-md-missing-frontmatter" })])
        })
      })
    );
  });
});

function skillMd(name: string, description: string, body = "# Skill\n\nBody content.\n"): string {
  return `---
name: ${name}
description: ${description}
---
${body}`;
}

async function makeTmpDir() {
  const dir = await mkdtemp(join(tmpdir(), "skill-library-cli-"));
  tmpDirs.push(dir);
  return dir;
}

function makeMetadata(overrides: Partial<InstallMetadata>): InstallMetadata {
  return {
    registryUrl: "http://localhost:3000",
    workspaceId: "workspace-1",
    packageId: "package-1",
    versionId: "version-1",
    contentDigest: "sha256:one",
    installTarget: { kind: "codex-global", agent: "codex", root: "~/.codex/skills" },
    installedAt: "2026-06-07T12:00:00.000Z",
    installerVersion: "0.1.0",
    reportConsent: false,
    ...overrides
  };
}

function makeVersion(overrides: Partial<SkillVersion>): SkillVersion {
  return {
    id: "version-1",
    packageId: "package-1",
    version: "1.0.0",
    lifecycleState: "approved",
    artifactDigest: "sha256:one",
    validation: { ok: true, files: [], issues: [] },
    provenance: { kind: "upload", importedAt: "2026-06-07T12:00:00.000Z" },
    createdAt: "2026-06-07T12:00:00.000Z",
    approvedAt: "2026-06-07T12:05:00.000Z",
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function installWithReportingPolicy(reportingPolicy: "disabled" | "required", reportConsent: boolean) {
  const destinationRoot = await makeTmpDir();
  const archivePath = join(await makeTmpDir(), "artifact.zip");
  const entries = [{ path: "policy-skill/SKILL.md", content: skillMd("policy-skill", "Policy skill.", "# Policy\n") }];
  const digest = validatePackageTree(entries).digest!;
  const archive = await packPackageZip(entries);
  const reports: unknown[] = [];
  const client = createRegistryClient({
    registryUrl: "http://registry.test",
    fetch: async (input, init) => {
      const url = String(input);

      if (url.endsWith("/api/workspaces/workspace-1")) {
        return jsonResponse({ workspace: { id: "workspace-1", slug: "workspace-1", name: "Workspace", reportingPolicy, visibility: "private" } });
      }

      if (url.endsWith("/api/packages/package-1/latest-approved")) {
        return jsonResponse({ version: makeVersion({ id: "version-policy", artifactDigest: digest }) });
      }

      if (url.startsWith("http://registry.test/api/artifacts/")) {
        return new Response(new Uint8Array(archive), { status: 200 });
      }

      if (url.endsWith("/api/install-reports")) {
        reports.push(JSON.parse(String(init?.body)));
        return jsonResponse({ accepted: true }, 201);
      }

      return jsonResponse({ error: "not found" }, 404);
    }
  });

  await installFromRegistry({
    client,
    registryUrl: "http://registry.test",
    workspaceId: "workspace-1",
    packageId: "package-1",
    packageSlug: "policy-skill",
    destinationRoot,
    installTarget: resolveInstallTarget({ explicitRoot: destinationRoot, target: "project" }),
    archivePath,
    reportConsent
  });

  return reports;
}
