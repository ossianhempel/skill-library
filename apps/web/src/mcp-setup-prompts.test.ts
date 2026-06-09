import { describe, expect, it } from "vitest";
import { DEFAULT_REGISTRY_BRANDING } from "@skill-library/domain";
import {
  MCP_SETUP_TARGETS,
  MCP_TOOL_NAMES,
  buildMcpSetupContext,
  buildMcpSetupPrompt
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
    expect(prompt).toContain("do not try Microsoft login for MCP");
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
});
