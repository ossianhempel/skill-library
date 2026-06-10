import { describe, expect, it } from "vitest";
import { DEFAULT_REGISTRY_BRANDING } from "@skill-library/domain";
import {
  MCP_SETUP_TARGETS,
  MCP_TOOL_NAMES,
  buildMcpSetupContext,
  buildMcpSetupPrompt,
  fetchMcpSetupAgentAuth,
  withMcpSetupAgentAuth
} from "./mcp-setup-prompts.js";

describe("mcp-setup-prompts", () => {
  const context = buildMcpSetupContext(
    {
      ...DEFAULT_REGISTRY_BRANDING,
      appName: "Rebtech Skills",
      companyName: "Rebtech",
      registryPublicUrl: "https://skills.rebtech.se",
      defaultWorkspaceId: "workspace-1"
    },
    "workspace-1",
    "https://skills.rebtech.se"
  );

  it("lists supported agent targets", () => {
    expect(MCP_SETUP_TARGETS.map((target) => target.id)).toEqual([
      "claude-code",
      "claude-desktop",
      "codex",
      "cursor",
      "chatgpt"
    ]);
  });

  it("states MCP uses API tokens and is not Microsoft SSO", () => {
    const prompt = buildMcpSetupPrompt("claude-code", context);

    expect(prompt).toContain("does **not** use Microsoft SSO");
    expect(prompt).toContain("SKILL_LIBRARY_MCP_TOKEN");
    expect(prompt).toContain("local stdio process");
    expect(prompt).toContain("Ask me for my API token if I have not provided one yet");
  });

  it("embeds the signed-in user's personal MCP token when provided", () => {
    const prompt = buildMcpSetupPrompt(
      "cursor",
      withMcpSetupAgentAuth(context, {
        token: "sl_test_token_123",
        role: "maintainer",
        actorId: "user-abc"
      })
    );

    expect(prompt).toContain("SKILL_LIBRARY_MCP_TOKEN=sl_test_token_123");
    expect(prompt).toContain("SKILL_LIBRARY_MCP_ROLE=maintainer");
    expect(prompt).toContain("SKILL_LIBRARY_MCP_ACTOR=user-abc");
    expect(prompt).toContain('"SKILL_LIBRARY_MCP_TOKEN": "sl_test_token_123"');
    expect(prompt).not.toContain("<my-api-token>");
    expect(prompt).not.toContain("Ask me for my API token");
  });

  it("includes registry URL, workspace, and validation steps", () => {
    const prompt = buildMcpSetupPrompt("cursor", context);

    expect(prompt).toContain("https://skills.rebtech.se");
    expect(prompt).toContain('workspaceId "workspace-1"');
    expect(prompt).toContain("tools/list");
    for (const tool of MCP_TOOL_NAMES) {
      expect(prompt).toContain(tool);
    }
  });

  it("includes platform-specific config for Codex", () => {
    const prompt = buildMcpSetupPrompt("codex", context);

    expect(prompt).toContain("[mcp_servers.skill-library]");
    expect(prompt).toContain("codex mcp add skill-library");
  });

  it("includes platform-specific config for Claude Desktop", () => {
    const prompt = buildMcpSetupPrompt("claude-desktop", context);

    expect(prompt).toContain("claude_desktop_config.json");
    expect(prompt).toContain("mcpServers");
  });

  it("loads a personal MCP token for signed-in users", async () => {
    const auth = await fetchMcpSetupAgentAuth({
      registryUrl: "https://skills.rebtech.se",
      hasSession: true,
      request: async () =>
        new Response(JSON.stringify({ token: "sl_test_token_123", role: "user", actorId: "user-abc" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    });

    expect(auth).toEqual({
      token: "sl_test_token_123",
      role: "user",
      actorId: "user-abc"
    });
  });

  it("falls back to the local dev API key when there is no session", async () => {
    const auth = await fetchMcpSetupAgentAuth({
      registryUrl: "http://localhost:3000",
      hasSession: false,
      activeToken: "maintainer-secret"
    });

    expect(auth).toEqual({
      token: "maintainer-secret",
      role: "user",
      actorId: "local-dev"
    });
  });
});
