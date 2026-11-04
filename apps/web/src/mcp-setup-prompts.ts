import type { RegistryBrandingConfig } from "@skill-library/domain";

/** Tools the hosted MCP server at `<registry>/mcp` offers every signed-in person. */
export const MCP_TOOL_NAMES = [
  "skills_search",
  "skills_get",
  "skills_read_file",
  "skills_install",
  "skills_vote",
  "skills_leaderboard",
  "skills_publish",
] as const;

export type McpSetupTarget =
  | "claude-code"
  | "claude-desktop"
  | "codex"
  | "cursor"
  | "chatgpt";

export interface McpSetupTargetOption {
  id: McpSetupTarget;
  label: string;
  hint: string;
}

export const MCP_SETUP_TARGETS: McpSetupTargetOption[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    hint: "claude mcp add --transport http",
  },
  {
    id: "claude-desktop",
    label: "Claude app",
    hint: "Settings > Connectors",
  },
  { id: "codex", label: "Codex", hint: "codex mcp add --url" },
  { id: "cursor", label: "Cursor", hint: "~/.cursor/mcp.json" },
  { id: "chatgpt", label: "ChatGPT", hint: "Custom connector" },
];

export interface McpSetupAgentAuth {
  token: string;
  role: string;
  actorId: string;
}

export interface McpSetupContext {
  /** The hosted MCP endpoint, `<registry>/mcp`. */
  mcpUrl: string;
  appName: string;
  companyName: string;
}

/** The hosted MCP endpoint for a registry base URL. */
export function mcpEndpointUrl(registryUrl: string): string {
  return `${registryUrl.replace(/\/$/, "")}/mcp`;
}

export function buildMcpSetupContext(
  branding: RegistryBrandingConfig,
  registryUrl?: string
): McpSetupContext {
  return {
    mcpUrl: mcpEndpointUrl(registryUrl?.trim() || branding.registryPublicUrl),
    appName: branding.appName,
    companyName: branding.companyName,
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
      const response = await request(`${baseUrl}/api/me/agent-token`, {
        credentials: "include",
      });

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
      actorId: "local-dev",
    };
  }

  return undefined;
}

/**
 * A prompt that has an agent connect itself (or walk the person through
 * connecting) to the hosted MCP server. Sign-in is the registry's own SSO
 * through OAuth, so the prompt carries no secret.
 */
export function buildMcpSetupPrompt(
  target: McpSetupTarget,
  context: McpSetupContext
): string {
  const shared = [
    `Connect me to the ${context.appName} MCP server so you can find, read and install ${context.companyName} skills for me.`,
    "",
    "Facts:",
    `- MCP server URL: ${context.mcpUrl} (remote, Streamable HTTP).`,
    "- Sign-in is OAuth: the first time it connects, a browser window opens and I sign in with my usual company account. There is no API key or token to paste.",
    "",
  ];
  const verify = [
    "",
    `When it is connected, list its tools (expect ${MCP_TOOL_NAMES.join(", ")}) and call skills_search with no query to show me what is there. Report success only after that call returns skills or an empty library, not an auth error.`,
  ];

  return [...shared, ...platformSteps(target, context), ...verify].join("\n");
}

function platformSteps(
  target: McpSetupTarget,
  context: McpSetupContext
): string[] {
  switch (target) {
    case "claude-code":
      return [
        "Steps (Claude Code):",
        "```bash",
        `claude mcp add --transport http --scope user skill-library ${context.mcpUrl}`,
        "```",
        "Then tell me to run /mcp, pick skill-library and choose Authenticate, which opens the browser sign-in.",
      ];
    case "codex":
      return [
        "Steps (Codex):",
        "```bash",
        `codex mcp add skill-library --url ${context.mcpUrl}`,
        "codex mcp login skill-library",
        "```",
        "The login command opens the browser sign-in.",
      ];
    case "cursor":
      return [
        "Steps (Cursor): add this to ~/.cursor/mcp.json (merge with existing servers):",
        "```json",
        JSON.stringify(
          { mcpServers: { "skill-library": { url: context.mcpUrl } } },
          null,
          2
        ),
        "```",
        'Then open Settings > MCP and click "Needs login" next to skill-library.',
      ];
    case "claude-desktop":
      return [
        "This is done in the Claude app (claude.ai, desktop or mobile), not from a terminal. Walk me through it:",
        "1. Open Settings > Connectors and click Add custom connector.",
        `2. Name it ${context.appName} and paste ${context.mcpUrl} as the URL. Click Add.`,
        "3. Click Connect and sign in with my company account.",
        "4. In a chat, make sure the connector is switched on under + > Connectors.",
      ];
    case "chatgpt":
      return [
        "This is done in ChatGPT's settings, not from a terminal. Walk me through it:",
        "1. Open Settings > Apps & Connectors (turn on Developer mode under Advanced if Create is missing) and click Create.",
        `2. Name it ${context.appName}, paste ${context.mcpUrl} as the MCP server URL and choose OAuth.`,
        "3. Save, then sign in with my company account when asked.",
      ];
  }
}
