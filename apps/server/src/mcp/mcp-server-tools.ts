import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpServerEntry } from "@skill-library/domain";
import {
  removeMcpServer,
  saveMcpServer,
  viewMcpServer,
} from "../mcp-servers.js";
import type { McpToolContext } from "./skills.js";
import { fail, ok } from "./format.js";

/**
 * The MCPs tab for agents: find the team's other MCP servers and how to
 * connect to them, and add, change or remove entries like the tab does.
 */
export function registerMcpServerTools(server: McpServer, ctx: McpToolContext) {
  server.registerTool(
    "mcp_servers_list",
    {
      title: "List the team's MCP servers",
      description: `Other MCP servers (connectors) colleagues use, listed in ${ctx.appName}: what each does, its URL, who can use it and how to connect from the Claude app, Claude Code or Codex. Call it when the person asks which connectors exist, how to connect one, or needs a tool that another server may have.`,
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe("Words to look for in the name or description."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query }) => {
      const all = await ctx.api.mcpServers.list(ctx.workspaceId);
      const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const matches = all.filter((entry) => {
        const haystack =
          `${entry.slug} ${entry.name} ${entry.description}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      });

      if (matches.length === 0) {
        return ok(
          all.length === 0
            ? `No MCP servers are listed in ${ctx.appName} yet. Add one with mcp_servers_save.`
            : `No MCP server matches "${query}". There are ${all.length}: ${all.map((entry) => entry.slug).join(", ")}.`
        );
      }

      return ok(
        [
          `${matches.length} MCP server(s). Open the list at ${ctx.baseUrl}/?tab=mcps`,
          "",
          ...matches.map((entry) => describe(ctx, entry)),
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "mcp_servers_save",
    {
      title: "Add or change an MCP server",
      description: `List an MCP server in ${ctx.appName} so colleagues and their assistants can find it, or change one. With an existing slug it updates that entry (only whoever added it or a maintainer may). Show the person what will be listed before saving.`,
      inputSchema: {
        slug: z
          .string()
          .optional()
          .describe(
            'Short name, also used in "claude mcp add". Leave out for a new server to derive it from the name.'
          ),
        name: z.string().min(1).describe('E.g. "Company brain".'),
        description: z
          .string()
          .min(1)
          .describe("What it does and when to use it, in a sentence or two."),
        url: z
          .string()
          .min(1)
          .describe("The MCP endpoint, usually ending in /mcp."),
        access: z
          .string()
          .optional()
          .describe('Who can use it, e.g. "Everyone at the company".'),
        notes: z
          .string()
          .optional()
          .describe(
            "Anything else needed to connect, e.g. which account to sign in with."
          ),
        docs_url: z.string().optional().describe("A page with more help."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const result = await saveMcpServer(ctx.api, ctx.user, ctx.workspaceId, {
        slug: args.slug,
        name: args.name,
        description: args.description,
        url: args.url,
        access: args.access,
        notes: args.notes,
        docsUrl: args.docs_url,
      });
      if ("error" in result) return fail(result.error);
      return ok(
        [
          `${result.created ? "Added" : "Updated"} ${result.entry.name}. Colleagues see it under MCPs at ${ctx.baseUrl}/?tab=mcps`,
          "",
          describe(ctx, result.entry),
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "mcp_servers_remove",
    {
      title: "Remove an MCP server from the list",
      description:
        "Take an MCP server off the list, e.g. when it has been shut down. Only whoever added it or a maintainer may. Confirm with the person first.",
      inputSchema: {
        slug: z.string().min(1).describe("The slug mcp_servers_list shows."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ slug }) => {
      const result = await removeMcpServer(
        ctx.api,
        ctx.user,
        ctx.workspaceId,
        slug
      );
      if ("error" in result) return fail(result.error);
      return ok(`Removed ${result.removed.name} from the list.`);
    }
  );
}

function describe(ctx: McpToolContext, entry: McpServerEntry): string {
  const view = viewMcpServer(entry, ctx.user);
  return [
    `## ${entry.name} (\`${entry.slug}\`)`,
    entry.description,
    "",
    `- URL: ${entry.url}`,
    entry.access ? `- Who can use it: ${entry.access}` : undefined,
    entry.notes ? `- Notes: ${entry.notes}` : undefined,
    entry.docsUrl ? `- Help: ${entry.docsUrl}` : undefined,
    entry.createdByName ? `- Added by ${entry.createdByName}` : undefined,
    view.canEdit ? "- You can change or remove it." : undefined,
    "- Connect in the Claude app (web or desktop): Settings > Connectors > Add custom connector, paste the URL, Connect and sign in.",
    `- Connect in Claude Code: \`${view.claudeCodeCommand}\`, then run /mcp to sign in.`,
    `- Connect in Codex: \`${view.codexCommand}\`, then \`codex mcp login ${entry.slug}\` if it asks you to sign in.`,
    "",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}
