import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { WorkspaceCatalogEntry } from "@skill-library/domain";
import type { McpUser } from "./oauth.js";
import { versionFor } from "./skills.js";

/** A successful tool result: markdown for the model, JSON for clients that use it. */
export function ok(
  text: string,
  structured?: Record<string, unknown>
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

/** A tool error the model can act on (MCP `isError`, not a protocol error). */
export function fail(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/** One skill as a markdown list item. */
export function skillLine(entry: WorkspaceCatalogEntry, user: McpUser): string {
  const version = versionFor(entry, user);
  const ranking = entry.ranking;
  const facts = [
    version ? `v${version.version}` : undefined,
    version && version.lifecycleState !== "approved"
      ? `${version.lifecycleState}, not approved yet`
      : undefined,
    version?.provenance.actorName
      ? `by ${version.provenance.actorName}`
      : undefined,
    ranking?.colleagues
      ? `used by ${ranking.colleagues} colleague(s)`
      : undefined,
    ranking?.upvotes ? `${ranking.upvotes} upvote(s)` : undefined,
    ranking?.votedByMe ? "you upvoted it" : undefined,
  ].filter(Boolean);

  return `- **${entry.package.name}** (\`${entry.package.slug}\`): ${entry.package.description}${facts.length ? ` [${facts.join(", ")}]` : ""}`;
}
