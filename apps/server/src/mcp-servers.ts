import { randomUUID } from "node:crypto";
import {
  claudeCodeAddCommand,
  codexAddCommand,
  isValidMcpServerSlug,
  mcpServerSlug,
  normalizeMcpServerInput,
  type Actor,
  type McpServerEntry,
  type McpServerInput,
} from "@skill-library/domain";
import type { RegistryApi } from "./index.js";
import { hasRole } from "./auth.js";

/**
 * The rules for the MCP server list, shared by the web API and the MCP tools so
 * an agent can do everything the MCPs tab can: any signed-in colleague can add
 * a server; only whoever added it, or a maintainer, can change or remove it.
 */
export interface McpServerActor extends Actor {
  /** Shown as "Added by"; API keys have none. */
  name?: string;
}

export type McpServerResult =
  | { entry: McpServerEntry; created: boolean }
  | { error: string; status: 400 | 403 | 404 | 409 };

/** An entry as the API returns it: with connect commands and the viewer's rights. */
export interface McpServerView extends McpServerEntry {
  canEdit: boolean;
  claudeCodeCommand: string;
  codexCommand: string;
}

export function mayEditMcpServer(
  actor: Actor | undefined,
  entry: McpServerEntry
): boolean {
  return (
    hasRole(actor, "maintainer") ||
    (actor !== undefined && entry.createdById === actor.id)
  );
}

export function viewMcpServer(
  entry: McpServerEntry,
  actor: Actor | undefined
): McpServerView {
  return {
    ...entry,
    canEdit: mayEditMcpServer(actor, entry),
    claudeCodeCommand: claudeCodeAddCommand(entry),
    codexCommand: codexAddCommand(entry),
  };
}

/**
 * Adds a server, or changes the one with this slug. `mode` "create" refuses an
 * existing slug, "update" a missing one; "save" does whichever applies.
 */
export async function saveMcpServer(
  api: RegistryApi,
  actor: McpServerActor | undefined,
  workspaceId: string,
  input: Partial<McpServerInput> & { slug?: string },
  mode: "create" | "update" | "save" = "save"
): Promise<McpServerResult> {
  if (!actor || !hasRole(actor, "user")) {
    return { error: "Sign in to add MCP servers.", status: 403 };
  }

  const normalized = normalizeMcpServerInput(input);
  if (!normalized.ok) return { error: normalized.error, status: 400 };

  const slug = input.slug?.trim() || mcpServerSlug(normalized.value.name);
  if (!isValidMcpServerSlug(slug)) {
    return {
      error: `"${slug}" can't be used as a short name. Use lowercase letters, digits and dashes, e.g. "company-brain".`,
      status: 400,
    };
  }

  const current = await api.mcpServers.get(workspaceId, slug);
  if (current && mode === "create") {
    return {
      error: `There is already an MCP server called "${slug}". Change that one, or pick another short name.`,
      status: 409,
    };
  }
  if (!current && mode === "update") {
    return { error: `No MCP server called "${slug}".`, status: 404 };
  }
  if (current && !mayEditMcpServer(actor, current)) {
    return {
      error: `Only ${current.createdByName ?? "whoever added it"} or a maintainer can change "${slug}".`,
      status: 403,
    };
  }

  const now = new Date().toISOString();
  const entry = await api.mcpServers.save({
    id: current?.id ?? randomUUID(),
    workspaceId,
    slug,
    ...normalized.value,
    createdById: current ? current.createdById : actor.id,
    createdByName: current ? current.createdByName : (actor.name ?? null),
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  });
  return { entry, created: !current };
}

export async function removeMcpServer(
  api: RegistryApi,
  actor: Actor | undefined,
  workspaceId: string,
  slug: string
): Promise<{ removed: McpServerEntry } | { error: string; status: 403 | 404 }> {
  const current = await api.mcpServers.get(workspaceId, slug);
  if (!current)
    return { error: `No MCP server called "${slug}".`, status: 404 };
  if (!mayEditMcpServer(actor, current)) {
    return {
      error: `Only ${current.createdByName ?? "whoever added it"} or a maintainer can remove "${slug}".`,
      status: 403,
    };
  }
  await api.mcpServers.remove(workspaceId, slug);
  return { removed: current };
}
