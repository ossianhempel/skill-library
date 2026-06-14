import { describe, expect, it } from "vitest";
import type {
  InstallReport,
  SkillPackage,
  SkillVersion,
} from "@skill-library/domain";
import { validatePackageTree } from "@skill-library/validation";
import {
  createHttpMcpApi,
  createInstallPlan,
  createRegistryMcpTools,
  handleMcpJsonRpc,
  type McpRegistryApi,
} from "./index.js";

describe("MCP registry tools", () => {
  it("creates CLI-backed install plans", () => {
    expect(createInstallPlan("review-helper", "project")).toEqual({
      command: "npx @skill-library/cli install review-helper --target project",
      metadataBehavior:
        "Installer writes generated registry metadata after verifying the artifact digest.",
    });
  });

  it("searches, fetches details, validates, and reports status through the registry API contract", async () => {
    const reports: InstallReport[] = [];
    const api: McpRegistryApi = {
      async search() {
        return [pkg];
      },
      async packageDetail() {
        return pkg;
      },
      async latestApprovedVersion() {
        return version;
      },
      validate(entries) {
        return {
          ok: entries.some((entry) => entry.path.endsWith("SKILL.md")),
          files: [],
          issues: [],
        };
      },
      async recordInstallReport(report) {
        reports.push(report);
      },
    };
    const tools = createRegistryMcpTools(api);

    await expect(
      tools.search({ workspaceId: "workspace-1", query: "review" })
    ).resolves.toEqual({ packages: [pkg] });
    await expect(
      tools.packageDetail({ packageId: "package-1" })
    ).resolves.toEqual({ package: pkg, latestApproved: version });
    await expect(
      tools.validatePackage({
        entries: [
          { path: "demo/SKILL.md", content: skillMd("demo", "Demo skill.") },
        ],
      })
    ).resolves.toEqual({
      validation: {
        ok: true,
        files: expect.any(Array),
        issues: expect.any(Array),
      },
    });
    await expect(
      tools.submitStatusReport({
        report: {
          installId: "install-1",
          packageId: "package-1",
          versionId: "version-1",
          state: "current",
          reportedAt: "2026-06-07T12:00:00.000Z",
          targetKind: "codex-global",
        },
      })
    ).resolves.toEqual({ accepted: true });
    expect(reports).toHaveLength(1);
  });

  it("returns frontmatter validation issues through validatePackage", async () => {
    const tools = createRegistryMcpTools({
      async search() {
        return [];
      },
      async packageDetail() {
        return pkg;
      },
      async latestApprovedVersion() {
        return version;
      },
      validate(entries) {
        return validatePackageTree(entries);
      },
    });

    await expect(
      tools.validatePackage({
        entries: [
          { path: "demo/SKILL.md", content: "# Missing frontmatter\n" },
        ],
      })
    ).resolves.toEqual({
      validation: expect.objectContaining({
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ ruleId: "skill-md-missing-frontmatter" }),
        ]),
      }),
    });
  });

  it("handles JSON-RPC tool list and tool calls", async () => {
    const tools = createRegistryMcpTools({
      async search() {
        return [pkg];
      },
      async packageDetail() {
        return pkg;
      },
      async latestApprovedVersion() {
        return version;
      },
      validate() {
        return { ok: true, files: [], issues: [] };
      },
    });

    await expect(
      handleMcpJsonRpc(tools, { jsonrpc: "2.0", id: 1, method: "tools/list" })
    ).resolves.toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "search" }),
        ]),
      },
    });
    await expect(
      handleMcpJsonRpc(tools, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "search", arguments: { workspaceId: "workspace-1" } },
      })
    ).resolves.toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: { packages: [pkg] },
    });
    await expect(
      handleMcpJsonRpc(tools, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "missing", arguments: {} },
      })
    ).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: -32602 }),
      })
    );
  });

  it("creates an HTTP-backed MCP API with auth headers", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const api = createHttpMcpApi({
      registryUrl: "http://registry.test",
      role: "maintainer",
      actorId: "agent-1",
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });

        if (String(input).includes("/api/workspaces/workspace-1/packages")) {
          return jsonResponse({ packages: [pkg] });
        }

        if (String(input).endsWith("/api/install-reports")) {
          return jsonResponse({ accepted: true }, 201);
        }

        return jsonResponse({ error: "not found" }, 404);
      },
    });

    await expect(api.search("workspace-1", "review")).resolves.toEqual([pkg]);
    await expect(
      api.recordInstallReport?.({
        installId: "install-1",
        packageId: "package-1",
        versionId: "version-1",
        state: "current",
        reportedAt: "2026-06-07T12:00:00.000Z",
        targetKind: "codex-global",
      })
    ).resolves.toBeUndefined();
    expect(requests[0]?.init).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-skill-library-role": "maintainer",
        }),
      })
    );
    expect(requests[1]?.init).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-skill-library-actor": "agent-1",
        }),
      })
    );
  });

  it("creates an HTTP-backed MCP API with bearer token auth", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const api = createHttpMcpApi({
      registryUrl: "http://registry.test",
      apiToken: "maintainer-secret",
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });

        if (String(input).includes("/api/workspaces/workspace-1/packages")) {
          return jsonResponse({ packages: [pkg] });
        }

        return jsonResponse({ error: "not found" }, 404);
      },
    });

    await expect(api.search("workspace-1", "review")).resolves.toEqual([pkg]);
    expect(requests[0]?.init).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer maintainer-secret",
        }),
      })
    );
  });
});

const pkg: SkillPackage = {
  id: "package-1",
  workspaceId: "workspace-1",
  slug: "review-helper",
  name: "Review Helper",
  description: "Review local code changes.",
  categories: ["review"],
  createdAt: "2026-06-07T12:00:00.000Z",
  updatedAt: "2026-06-07T12:00:00.000Z",
};

const version: SkillVersion = {
  id: "version-1",
  packageId: "package-1",
  version: "1.0.0",
  lifecycleState: "approved",
  artifactDigest: "sha256:one",
  validation: { ok: true, files: [], issues: [] },
  provenance: { kind: "upload", importedAt: "2026-06-07T12:00:00.000Z" },
  createdAt: "2026-06-07T12:00:00.000Z",
  approvedAt: "2026-06-07T12:05:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function skillMd(
  name: string,
  description: string,
  body = "# Skill\n\nBody content.\n"
): string {
  return `---
name: ${name}
description: ${description}
---
${body}`;
}
