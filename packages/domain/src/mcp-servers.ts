/**
 * MCP servers the team uses, listed next to the skills so colleagues (and their
 * agents) can find them and connect. An entry is a pointer: the library never
 * proxies or signs in to the server itself.
 */
export interface McpServerEntry {
  id: string;
  workspaceId: string;
  /** Short name, also used as the server name in `claude mcp add`. */
  slug: string;
  name: string;
  description: string;
  /** The remote MCP endpoint (streamable HTTP). */
  url: string;
  /** Who can use it, in plain words, e.g. "Everyone at the company". */
  access: string;
  /** Anything else a colleague needs to know to connect, e.g. which account to sign in with. */
  notes: string;
  /** A page with more help, if there is one. */
  docsUrl: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What a person or agent sends to add or change an entry. */
export interface McpServerInput {
  name: string;
  description: string;
  url: string;
  access?: string;
  notes?: string;
  docsUrl?: string | null;
}

export const MCP_SERVER_LIMITS = {
  name: 80,
  description: 600,
  access: 200,
  notes: 1000,
  url: 500,
} as const;

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

/** A lowercase, dash-separated slug from a name: "Company Brain" -> "company-brain". */
export function mcpServerSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

export function isValidMcpServerSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/**
 * Checks and trims an entry. Returns the first problem in words a person can
 * act on. Only https URLs are accepted, except http on localhost for testing.
 */
export function normalizeMcpServerInput(
  input: Partial<McpServerInput>
):
  | { ok: true; value: Required<McpServerInput> }
  | { ok: false; error: string } {
  const name = text(input.name);
  const description = text(input.description);
  const url = text(input.url);
  const access = text(input.access);
  const notes = text(input.notes);
  const docsUrl = text(input.docsUrl ?? undefined);

  if (!name) return { ok: false, error: "Give the MCP server a name." };
  if (!description)
    return { ok: false, error: "Describe what the MCP server does." };
  if (!url) return { ok: false, error: "Give the MCP server's URL." };

  for (const [field, value] of [
    ["name", name],
    ["description", description],
    ["access", access],
    ["notes", notes],
    ["url", url],
  ] as const) {
    if (value.length > MCP_SERVER_LIMITS[field]) {
      return {
        ok: false,
        error: `The ${field} is too long (at most ${MCP_SERVER_LIMITS[field]} characters).`,
      };
    }
  }

  if (!isMcpUrl(url)) {
    return {
      ok: false,
      error: `"${url}" is not an https URL. Use the address that ends in /mcp, e.g. https://example.com/mcp.`,
    };
  }

  if (docsUrl && !isWebUrl(docsUrl)) {
    return { ok: false, error: `"${docsUrl}" is not a web link.` };
  }

  return {
    ok: true,
    value: { name, description, url, access, notes, docsUrl: docsUrl || null },
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMcpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

function isWebUrl(value: string): boolean {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** The Claude Code command that connects to an entry, for every user's projects. */
export function claudeCodeAddCommand(
  entry: Pick<McpServerEntry, "slug" | "url">
): string {
  return `claude mcp add --transport http --scope user ${entry.slug} ${entry.url}`;
}

/** The Codex CLI command that connects to an entry. */
export function codexAddCommand(
  entry: Pick<McpServerEntry, "slug" | "url">
): string {
  return `codex mcp add ${entry.slug} --url ${entry.url}`;
}
