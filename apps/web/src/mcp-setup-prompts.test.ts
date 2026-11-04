import { describe, expect, it } from "vitest";
import { DEFAULT_REGISTRY_BRANDING } from "@skill-library/domain";
import {
  MCP_SETUP_TARGETS,
  MCP_TOOL_NAMES,
  buildMcpSetupContext,
  buildMcpSetupPrompt,
  fetchMcpSetupAgentAuth,
  mcpEndpointUrl,
} from "./mcp-setup-prompts.js";

describe("mcp-setup-prompts", () => {
  const context = buildMcpSetupContext(
    {
      ...DEFAULT_REGISTRY_BRANDING,
      appName: "Rebtech Skills",
      companyName: "Rebtech",
      registryPublicUrl: "https://skills.rebtech.se",
    },
    "https://skills.rebtech.se/"
  );

  it("lists supported agent targets", () => {
    expect(MCP_SETUP_TARGETS.map((target) => target.id)).toEqual([
      "claude-code",
      "claude-desktop",
      "codex",
      "cursor",
      "chatgpt",
    ]);
  });

  it("points every agent at the hosted endpoint and needs no token", () => {
    expect(context.mcpUrl).toBe("https://skills.rebtech.se/mcp");

    for (const target of MCP_SETUP_TARGETS) {
      const prompt = buildMcpSetupPrompt(target.id, context);
      expect(prompt).toContain("https://skills.rebtech.se/mcp");
      expect(prompt).toContain("There is no API key or token to paste");
      expect(prompt).not.toContain("SKILL_LIBRARY_MCP_TOKEN");
      expect(prompt).not.toContain("stdio");
      for (const tool of MCP_TOOL_NAMES) {
        expect(prompt).toContain(tool);
      }
    }
  });

  it("gives each agent its own connect command", () => {
    expect(buildMcpSetupPrompt("claude-code", context)).toContain(
      "claude mcp add --transport http --scope user skill-library https://skills.rebtech.se/mcp"
    );
    expect(buildMcpSetupPrompt("codex", context)).toContain(
      "codex mcp login skill-library"
    );
    expect(buildMcpSetupPrompt("cursor", context)).toContain(
      '"url": "https://skills.rebtech.se/mcp"'
    );
    expect(buildMcpSetupPrompt("claude-desktop", context)).toContain(
      "Settings > Connectors"
    );
  });

  it("builds the endpoint from a base URL with or without a trailing slash", () => {
    expect(mcpEndpointUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/mcp"
    );
    expect(mcpEndpointUrl("http://localhost:3000/")).toBe(
      "http://localhost:3000/mcp"
    );
  });

  it("loads a personal agent token for signed-in users", async () => {
    const auth = await fetchMcpSetupAgentAuth({
      registryUrl: "https://skills.rebtech.se",
      hasSession: true,
      request: async () =>
        new Response(
          JSON.stringify({ token: "sl_test", role: "user", actorId: "u" }),
          { status: 200, headers: { "content-type": "application/json" } }
        ),
    });

    expect(auth).toEqual({ token: "sl_test", role: "user", actorId: "u" });
  });
});
