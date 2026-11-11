import { readFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { WorkspaceCatalogEntry } from "@skill-library/domain";
import type { FileDiff } from "./diff.js";
import { skillPageUrl, versionFor, type McpToolContext } from "./skills.js";

/**
 * MCP Apps (https://modelcontextprotocol.io/extensions/apps): hosts that
 * support the UI extension (Claude on the web and desktop, ChatGPT, VS Code)
 * render this page beside a tool's result. Bump the version in the URI when
 * the page changes, so hosts that cache resources fetch the new one.
 */
export const VIEW_URI = "ui://skill-library/skills-v1.html";
export const VIEW_MIME_TYPE = "text/html;profile=mcp-app";

/**
 * Where a result's view data travels. MCP Apps passes the whole tool result,
 * `_meta` included, to the view, and `_meta` never reaches the model.
 * structuredContent would also reach the view, but Claude Code gives the model
 * structuredContent instead of the text, so the text stays the only content.
 */
export const VIEW_DATA_KEY = "skill-library/view";

/** Request `_meta` the view sets on its own tool calls, for usage stats. */
export const VIEW_CALL_KEY = "skill-library/caller";

/** Tool `_meta` that attaches the view (current key plus the older flat one). */
export const VIEW_TOOL_META = {
  ui: { resourceUri: VIEW_URI },
  "ui/resourceUri": VIEW_URI,
} as const;

export interface SkillCard {
  slug: string;
  name: string;
  description: string;
  categories: string[];
  version?: string;
  status?: string;
  author?: string;
  colleagues: number;
  upvotes: number;
  upvotedByMe: boolean;
  mine: boolean;
  url: string;
}

export interface ProposalCard {
  slug: string;
  name: string;
  version: string;
  author?: string;
  createdAt: string;
  owner?: string;
  valid: boolean;
  currentVersion?: string;
  url: string;
  files?: FileDiff[];
}

export type ViewData =
  | {
      kind: "catalog";
      title: string;
      query?: string;
      total: number;
      skills: SkillCard[];
    }
  | { kind: "proposals"; forMe: ProposalCard[]; fromMe: ProposalCard[] }
  | {
      kind: "vote";
      slug: string;
      upvotes: number;
      colleagues: number;
      upvotedByMe: boolean;
    }
  | { kind: "install"; slug: string; name: string; downloadUrl: string }
  | { kind: "review"; slug: string; version: string; decision: string };

/** Adds view data to a text result without changing what the model reads. */
export function withView(result: CallToolResult, data: ViewData) {
  return { ...result, _meta: { ...result._meta, [VIEW_DATA_KEY]: data } };
}

export function skillCard(
  ctx: McpToolContext,
  entry: WorkspaceCatalogEntry
): SkillCard {
  const version = versionFor(entry, ctx.user);
  return {
    slug: entry.package.slug,
    name: entry.package.name,
    description: entry.package.description,
    categories: entry.package.categories,
    version: version?.version,
    status: version?.lifecycleState,
    author: version?.provenance.actorName,
    colleagues: entry.ranking?.colleagues ?? 0,
    upvotes: entry.ranking?.upvotes ?? 0,
    upvotedByMe: entry.ranking?.votedByMe ?? false,
    // Matches the vote rule: nobody upvotes a skill they wrote a version of.
    mine:
      entry.ranking?.authoredByMe ??
      version?.provenance.actorId === ctx.user.id,
    url: skillPageUrl(ctx, entry),
  };
}

/** Registers the view's HTML as a `ui://` resource. */
export function registerViewResource(server: McpServer, ctx: McpToolContext) {
  server.registerResource(
    "skills-view",
    VIEW_URI,
    {
      title: `${ctx.appName} view`,
      description:
        "Interactive skill cards and proposed-change diffs for hosts that render MCP Apps.",
      mimeType: VIEW_MIME_TYPE,
    },
    async () => ({
      contents: [
        {
          uri: VIEW_URI,
          mimeType: VIEW_MIME_TYPE,
          text: viewHtml(),
          _meta: {
            ui: {
              // The page loads nothing from the network and calls tools
              // through the host, so the default (deny-all) CSP fits. No
              // `domain`: the view needs no fixed origin, and in Claude a value
              // that differs from the connector URL as typed (a trailing
              // slash, another host) stops the view from loading.
              csp: {},
              prefersBorder: false,
            },
          },
        },
      ],
    })
  );
}

let cachedHtml: string | undefined;

/** The view as one self-contained page: its CSS and script are inlined. */
export function viewHtml(): string {
  if (cachedHtml) return cachedHtml;
  const read = (name: string) =>
    readFileSync(new URL(`./view/${name}`, import.meta.url), "utf8");
  cachedHtml = read("skills-view.html")
    .replace("/* VIEW_CSS */", () => read("skills-view.css"))
    .replace("/* VIEW_HOST_JS */", () => read("skills-view-host.js"))
    .replace("/* VIEW_JS */", () => read("skills-view.js"));
  return cachedHtml;
}
