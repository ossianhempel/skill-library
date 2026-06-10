import type { RegistryBrandingConfig } from "@skill-library/domain";

export const MCP_TOOL_NAMES = ["search", "packageDetail", "validatePackage", "installPlan", "submitStatusReport"] as const;

export const MCP_SETUP_REPO_URL = "https://github.com/ossianhempel/skill-library.git";

export type McpSetupTarget = "claude-code" | "claude-desktop" | "codex" | "cursor" | "chatgpt";

export interface McpSetupTargetOption {
  id: McpSetupTarget;
  label: string;
  hint: string;
}

export const MCP_SETUP_TARGETS: McpSetupTargetOption[] = [
  { id: "claude-code", label: "Claude Code", hint: "CLI + project .mcp.json" },
  { id: "claude-desktop", label: "Claude Desktop", hint: "claude_desktop_config.json" },
  { id: "codex", label: "Codex", hint: "~/.codex/config.toml" },
  { id: "cursor", label: "Cursor", hint: ".cursor/mcp.json" },
  { id: "chatgpt", label: "ChatGPT", hint: "Desktop connectors" }
];

export interface McpSetupAgentAuth {
  token: string;
  role: string;
  actorId: string;
}

export interface McpSetupContext {
  registryUrl: string;
  workspaceId: string;
  appName: string;
  companyName: string;
  agentAuth?: McpSetupAgentAuth;
}

export function buildMcpSetupContext(branding: RegistryBrandingConfig, workspaceId: string, registryUrl?: string): McpSetupContext {
  return {
    registryUrl: registryUrl?.trim() || branding.registryPublicUrl,
    workspaceId,
    appName: branding.appName,
    companyName: branding.companyName
  };
}

export function withMcpSetupAgentAuth(context: McpSetupContext, agentAuth: McpSetupAgentAuth): McpSetupContext {
  return {
    ...context,
    agentAuth
  };
}

export async function fetchMcpSetupAgentAuth(input: {
  registryUrl: string;
  hasSession: boolean;
  activeToken?: string;
  request?: typeof fetch;
}): Promise<McpSetupAgentAuth | undefined> {
  const request = input.request ?? fetch;
  const baseUrl = input.registryUrl.replace(/\/$/, "");

  if (input.hasSession) {
    try {
      const response = await request(`${baseUrl}/api/me/agent-token`, { credentials: "include" });

      if (response.ok) {
        return (await response.json()) as McpSetupAgentAuth;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  if (input.activeToken?.trim()) {
    return {
      token: input.activeToken.trim(),
      role: "user",
      actorId: "local-dev"
    };
  }

  return undefined;
}

export function buildMcpSetupPrompt(target: McpSetupTarget, context: McpSetupContext): string {
  const shared = buildSharedSetupBrief(context);
  const platform = buildPlatformSteps(target, context);
  return `${shared}\n\n${platform}`;
}

function mcpToken(context: McpSetupContext): string {
  return context.agentAuth?.token ?? "<my-api-token>";
}

function mcpRole(context: McpSetupContext): string {
  return context.agentAuth?.role ?? "user";
}

function mcpActor(context: McpSetupContext): string {
  return context.agentAuth?.actorId ?? "<my-name-or-machine-id>";
}

function buildSharedSetupBrief(context: McpSetupContext): string {
  const toolList = MCP_TOOL_NAMES.join(", ");
  const authLines = context.agentAuth
    ? [
        "- Your personal MCP bearer token is included below. Use it exactly as written for SKILL_LIBRARY_MCP_TOKEN.",
        "- MCP auth does **not** use Microsoft SSO / Entra login.",
        "- Treat the token like a password. Do not commit it to git or paste it into public channels."
      ]
    : [
        "- MCP auth uses a **bearer API token** (SKILL_LIBRARY_MCP_TOKEN). It does **not** use Microsoft SSO / Entra login.",
        "- Browser SSO on the web app is separate from MCP. Ask me for my API token if I have not provided one yet."
      ];

  return [
    `Set up the ${context.appName} MCP connection on my machine end to end and prove it works.`,
    "",
    "Important facts:",
    `- Registry API: ${context.registryUrl}`,
    `- Default workspace: ${context.workspaceId}`,
    "- MCP is a **local stdio process** on my machine. It is **not** hosted at the registry URL.",
    ...authLines,
    "",
    "Phase 1 — install the MCP server binary:",
    `1. If needed, clone ${MCP_SETUP_REPO_URL}`,
    "2. In the repo root: pnpm install && pnpm build",
    "3. Note the absolute path to packages/mcp/dist/stdio.js (or use pnpm exec skill-library-mcp from the repo).",
    "",
    "Phase 2 — configure environment:",
    `- SKILL_LIBRARY_REGISTRY_URL=${context.registryUrl}`,
    `- SKILL_LIBRARY_MCP_TOKEN=${mcpToken(context)}`,
    `- SKILL_LIBRARY_MCP_ROLE=${mcpRole(context)}`,
    `- SKILL_LIBRARY_MCP_ACTOR=${mcpActor(context)}`,
    "",
    "Phase 3 — validate the connection:",
    `1. Start the stdio server and send JSON-RPC tools/list. Expect tools: ${toolList}.`,
    `2. Call the search tool with workspaceId "${context.workspaceId}" and a short query.`,
    "3. Report success only after both steps return valid JSON-RPC results (not auth errors).",
    context.agentAuth
      ? "4. If auth fails, tell me to sign out and sign back in, then copy a fresh setup prompt from the registry Overview page."
      : "4. If auth fails, stop and tell me to create or rotate an API token — do not try Microsoft login for MCP."
  ].join("\n");
}

function buildPlatformSteps(target: McpSetupTarget, context: McpSetupContext): string {
  const mcpEntry = buildStdioMcpJson(context);
  const mcpPath = "${SKILL_LIBRARY_REPO}/packages/mcp/dist/stdio.js";

  switch (target) {
    case "claude-code":
      return [
        "Platform: Claude Code",
        "",
        "Preferred setup (user scope):",
        "```bash",
        "claude mcp add skill-library --scope user \\",
        `  --env SKILL_LIBRARY_REGISTRY_URL=${context.registryUrl} \\`,
        `  --env SKILL_LIBRARY_MCP_TOKEN=${mcpToken(context)} \\`,
        `  --env SKILL_LIBRARY_MCP_ROLE=${mcpRole(context)} \\`,
        "  -- node <absolute-path-to>/packages/mcp/dist/stdio.js",
        "```",
        "",
        "Alternative: add to ~/.claude.json (user) or .mcp.json (project):",
        "```json",
        mcpEntry,
        "```",
        "",
        "Restart Claude Code after saving. Then run /mcp or ask me to list MCP tools to confirm skill-library is connected."
      ].join("\n");

    case "claude-desktop":
      return [
        "Platform: Claude Desktop (macOS)",
        "",
        "Edit ~/Library/Application Support/Claude/claude_desktop_config.json and merge:",
        "```json",
        mcpEntry,
        "```",
        "",
        "Replace <absolute-path-to> with the built stdio.js path. Fully quit and reopen Claude Desktop.",
        "In a new chat, ask: \"List skill-library MCP tools\" to confirm the connection."
      ].join("\n");

    case "codex":
      return [
        "Platform: OpenAI Codex CLI / IDE extension",
        "",
        "Add to ~/.codex/config.toml (or trusted project .codex/config.toml):",
        "```toml",
        "[mcp_servers.skill-library]",
        'command = "node"',
        `args = ["${mcpPath}"]`,
        "enabled = true",
        "",
        "[mcp_servers.skill-library.env]",
        `SKILL_LIBRARY_REGISTRY_URL = "${context.registryUrl}"`,
        `SKILL_LIBRARY_MCP_TOKEN = "${mcpToken(context)}"`,
        `SKILL_LIBRARY_MCP_ROLE = "${mcpRole(context)}"`,
        "```",
        "",
        "Or via CLI:",
        "```bash",
        "codex mcp add skill-library \\",
        `  --env SKILL_LIBRARY_REGISTRY_URL=${context.registryUrl} \\`,
        `  --env SKILL_LIBRARY_MCP_TOKEN=${mcpToken(context)} \\`,
        "  -- node <absolute-path-to>/packages/mcp/dist/stdio.js",
        "```",
        "",
        "Restart Codex, run `codex mcp list`, then validate with tools/list."
      ].join("\n");

    case "cursor":
      return [
        "Platform: Cursor",
        "",
        "Create or update .cursor/mcp.json in my home directory or project root:",
        "```json",
        mcpEntry,
        "```",
        "",
        "Reload Cursor MCP (Settings → MCP → refresh). Confirm skill-library appears and tools/list succeeds."
      ].join("\n");

    case "chatgpt":
      return [
        "Platform: ChatGPT desktop app",
        "",
        "ChatGPT connectors are primarily remote HTTP MCP servers. This registry ships a **local stdio** MCP, so use one of:",
        "1. Run a local MCP bridge if ChatGPT only supports HTTP in my build, or",
        "2. Configure via ChatGPT → Settings → Connectors / Developer → MCP (if stdio is supported in my version).",
        "",
        "If stdio is supported, use the same shape as Claude Desktop:",
        "```json",
        mcpEntry,
        "```",
        "",
        "If only HTTP is supported, explain that this registry does not expose a hosted MCP endpoint yet and recommend Claude Code, Cursor, or Codex for native stdio MCP instead.",
        "Either way, validate with tools/list + search once connected."
      ].join("\n");
  }
}

function buildStdioMcpJson(context: McpSetupContext): string {
  return JSON.stringify(
    {
      mcpServers: {
        "skill-library": {
          type: "stdio",
          command: "node",
          args: ["<absolute-path-to>/packages/mcp/dist/stdio.js"],
          env: {
            SKILL_LIBRARY_REGISTRY_URL: context.registryUrl,
            SKILL_LIBRARY_MCP_TOKEN: mcpToken(context),
            SKILL_LIBRARY_MCP_ROLE: mcpRole(context),
            SKILL_LIBRARY_MCP_ACTOR: mcpActor(context)
          }
        }
      }
    },
    null,
    2
  );
}
