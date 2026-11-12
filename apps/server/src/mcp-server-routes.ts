import type { Hono } from "hono";
import type { Actor, Workspace } from "@skill-library/domain";
import type { RegistryStore } from "@skill-library/storage";
import type { RegistryApi } from "./index.js";
import {
  removeMcpServer,
  saveMcpServer,
  viewMcpServer,
  type McpServerActor,
} from "./mcp-servers.js";

/**
 * The MCPs tab's API: list the workspace's MCP servers with connect commands,
 * add one (POST), change one (PUT) or remove one (DELETE). The same rules back
 * the mcp_servers_* tools, so an agent can do what the tab does.
 */
export function registerMcpServerRoutes(
  app: Hono,
  deps: {
    api: RegistryApi;
    store: RegistryStore;
    resolveActor: (headers: Headers) => Promise<Actor | undefined>;
    canAccessWorkspace: (
      headers: Headers,
      workspace: Workspace
    ) => Promise<boolean>;
  }
) {
  const { api, store, resolveActor, canAccessWorkspace } = deps;
  const base = "/api/workspaces/:workspaceId/mcp-servers";

  /** The workspace may not exist yet: a fresh library still lists servers. */
  async function mayRead(headers: Headers, workspaceId: string) {
    const workspace = await api.workspaceDetail(workspaceId);
    if (workspace) return canAccessWorkspace(headers, workspace);
    return (await resolveActor(headers)) !== undefined;
  }

  async function actorWithName(
    headers: Headers
  ): Promise<McpServerActor | undefined> {
    const actor = await resolveActor(headers);
    if (!actor) return undefined;
    const member = (await store.listTeamMembers().catch(() => [])).find(
      (user) => user.id === actor.id
    );
    return { ...actor, name: member?.name };
  }

  app.get(base, async (context) => {
    const workspaceId = context.req.param("workspaceId");
    const headers = context.req.raw.headers;
    if (!(await mayRead(headers, workspaceId))) {
      return context.json({ error: "User role required" }, 403);
    }
    const actor = await resolveActor(headers);
    const entries = await api.mcpServers.list(workspaceId);
    return context.json({
      servers: entries.map((entry) => viewMcpServer(entry, actor)),
    });
  });

  for (const [method, mode] of [
    ["post", "create"],
    ["put", "update"],
  ] as const) {
    const path = mode === "create" ? base : `${base}/:slug`;
    app[method](path, async (context) => {
      const workspaceId = context.req.param("workspaceId");
      const headers = context.req.raw.headers;
      if (!(await mayRead(headers, workspaceId))) {
        return context.json({ error: "User role required" }, 403);
      }
      const body = (await context.req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const actor = await actorWithName(headers);
      const result = await saveMcpServer(
        api,
        actor,
        workspaceId,
        {
          slug: mode === "update" ? context.req.param("slug") : str(body.slug),
          name: str(body.name),
          description: str(body.description),
          url: str(body.url),
          access: str(body.access),
          notes: str(body.notes),
          docsUrl: str(body.docsUrl),
        },
        mode
      );
      if ("error" in result) {
        return context.json({ error: result.error }, result.status);
      }
      return context.json(
        { server: viewMcpServer(result.entry, actor) },
        result.created ? 201 : 200
      );
    });
  }

  app.delete(`${base}/:slug`, async (context) => {
    const headers = context.req.raw.headers;
    const result = await removeMcpServer(
      api,
      await resolveActor(headers),
      context.req.param("workspaceId"),
      context.req.param("slug")
    );
    if ("error" in result) {
      return context.json({ error: result.error }, result.status);
    }
    return context.json({ removed: result.removed.slug });
  });
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
