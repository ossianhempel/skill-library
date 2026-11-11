import type { McpServerEntry, McpServerInput } from "@skill-library/domain";

/** An MCP server as the API returns it, with connect commands. */
export interface McpServerView extends McpServerEntry {
  canEdit: boolean;
  claudeCodeCommand: string;
  codexCommand: string;
}

export interface McpServersClient {
  list(): Promise<McpServerView[]>;
  /** Adds a server, or changes the one with `slug`. */
  save(input: McpServerInput, slug?: string): Promise<McpServerView>;
  remove(slug: string): Promise<void>;
}

export function createMcpServersClient({
  registryUrl = "",
  token,
  workspaceId,
  request = fetch,
}: {
  registryUrl?: string;
  token?: string;
  workspaceId: string;
  request?: typeof fetch;
}): McpServersClient {
  const base = `${registryUrl.replace(/\/$/, "")}/api/workspaces/${encodeURIComponent(workspaceId)}/mcp-servers`;

  async function call<T>(
    url: string,
    method = "GET",
    body?: unknown
  ): Promise<T> {
    const response = await request(url, {
      method,
      credentials: "include",
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as T & {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error ?? `Request failed: ${response.status}`);
    }
    return data;
  }

  return {
    async list() {
      return (await call<{ servers: McpServerView[] }>(base)).servers;
    },
    async save(input, slug) {
      const url = slug ? `${base}/${encodeURIComponent(slug)}` : base;
      return (
        await call<{ server: McpServerView }>(url, slug ? "PUT" : "POST", input)
      ).server;
    },
    async remove(slug) {
      await call(`${base}/${encodeURIComponent(slug)}`, "DELETE");
    },
  };
}
