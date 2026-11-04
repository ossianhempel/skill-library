import type {
  ContributorRanking,
  SkillVersion,
  WorkspaceCatalogEntry,
} from "@skill-library/domain";
import { readSkillFolder } from "@skill-library/validation";
import type { RegistryApi } from "../index.js";
import { hasRole } from "../auth.js";
import { visibleWorkspaceCatalog } from "../workspace-catalog.js";
import type { McpUser } from "./oauth.js";

/** What every MCP tool call knows about where and for whom it runs. */
export interface McpToolContext {
  api: RegistryApi;
  user: McpUser;
  workspaceId: string;
  /** Public site URL, without a trailing slash, for links the person opens. */
  baseUrl: string;
  appName: string;
}

export interface SkillFile {
  path: string;
  size: number;
  /** UTF-8 text, or undefined for binary files. */
  text?: string;
  bytes: Buffer;
}

export interface CatalogView {
  entries: WorkspaceCatalogEntry[];
  contributors: ContributorRanking[];
}

/** The catalog as the web app shows it to this person, with ranking. */
export async function loadCatalog(ctx: McpToolContext): Promise<CatalogView> {
  const [snapshot, ranking] = await Promise.all([
    ctx.api.workspaceCatalog(ctx.workspaceId),
    ctx.api.workspaceRanking(ctx.workspaceId, ctx.user.id),
  ]);

  return {
    entries: visibleWorkspaceCatalog(snapshot, ctx.user, ranking.skills),
    contributors: ranking.contributors,
  };
}

/**
 * Finds a skill by slug, name or package id, case-insensitively. Returns the
 * closest names when nothing matches so the error can suggest them.
 */
export function findSkill(
  entries: WorkspaceCatalogEntry[],
  reference: string
): { entry: WorkspaceCatalogEntry } | { suggestions: string[] } {
  const wanted = normalize(reference);
  const entry =
    entries.find((item) => normalize(item.package.slug) === wanted) ??
    entries.find((item) => normalize(item.package.name) === wanted) ??
    entries.find((item) => normalize(item.package.id) === wanted);

  if (entry) {
    return { entry };
  }

  const terms = wanted.split("-").filter(Boolean);
  return {
    suggestions: entries
      .filter((item) => terms.some((term) => haystack(item).includes(term)))
      .slice(0, 5)
      .map((item) => item.package.slug),
  };
}

/** Skills matching every word of the query in name, slug, description or category. */
export function matchSkills(
  entries: WorkspaceCatalogEntry[],
  query: string | undefined
): WorkspaceCatalogEntry[] {
  const terms = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) =>
    terms.every((term) => haystack(entry).includes(term))
  );
}

export type SkillSort = "popular" | "newest" | "name";

export function sortSkills(
  entries: WorkspaceCatalogEntry[],
  sort: SkillSort
): WorkspaceCatalogEntry[] {
  const sorted = [...entries];

  if (sort === "name") {
    sorted.sort((a, b) => a.package.name.localeCompare(b.package.name));
  } else if (sort === "newest") {
    sorted.sort((a, b) => updatedAt(b).localeCompare(updatedAt(a)));
  } else {
    sorted.sort(
      (a, b) =>
        (b.ranking?.score ?? 0) - (a.ranking?.score ?? 0) ||
        a.package.name.localeCompare(b.package.name)
    );
  }

  return sorted;
}

/**
 * The version this person gets: the latest approved one, or for maintainers
 * and the skill's own author (whose draft is not approved yet) the newest
 * version they can see.
 */
export function versionFor(
  entry: WorkspaceCatalogEntry,
  user: McpUser
): SkillVersion | undefined {
  if (entry.latestApproved) {
    return entry.latestApproved;
  }

  const active = entry.activeVersion;
  const mayUseUnapproved =
    hasRole(user, "maintainer") || active?.provenance.actorId === user.id;
  return mayUseUnapproved ? active : undefined;
}

/** The skill's files, relative to its SKILL.md folder. */
export async function readSkillFiles(
  ctx: McpToolContext,
  entry: WorkspaceCatalogEntry,
  version: SkillVersion
): Promise<{ folder: string; files: SkillFile[] }> {
  const download = await ctx.api.artifactDownload(version.artifactDigest);

  if (!download) {
    throw new Error(
      `The files for ${entry.package.slug} ${version.version} are missing from storage.`
    );
  }

  const { folder, entries } = await readSkillFolder(
    download.content,
    entry.package.slug
  );

  return {
    folder,
    files: entries
      .filter((item) => item.kind !== "directory")
      .map((item) => {
        const bytes = Buffer.from(item.content ?? "");
        return {
          path: item.path,
          size: bytes.length,
          text: asText(bytes),
          bytes,
        };
      })
      .sort(
        (a, b) =>
          fileOrder(a.path) - fileOrder(b.path) || a.path.localeCompare(b.path)
      ),
  };
}

export function skillPageUrl(
  ctx: McpToolContext,
  entry: WorkspaceCatalogEntry
): string {
  return `${ctx.baseUrl}/s/${encodeURIComponent(ctx.workspaceId)}/${encodeURIComponent(entry.package.slug)}`;
}

/**
 * A download link for the Claude apps' upload format. Opened in the browser,
 * it uses the person's web session and counts as their install.
 */
export function claudeAppDownloadUrl(
  ctx: McpToolContext,
  entry: WorkspaceCatalogEntry,
  version: SkillVersion
): string {
  const query = new URLSearchParams({
    packageId: entry.package.id,
    versionId: version.id,
    layout: "claude-app",
  });
  return `${ctx.baseUrl}/api/artifacts/${encodeURIComponent(version.artifactDigest)}/download?${query}`;
}

function asText(bytes: Buffer): string | undefined {
  if (bytes.includes(0)) {
    return undefined;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function fileOrder(path: string): number {
  return path === "SKILL.md" ? 0 : 1;
}

function haystack(entry: WorkspaceCatalogEntry): string {
  const pkg = entry.package;
  return [pkg.slug, pkg.name, pkg.description, ...pkg.categories]
    .join(" ")
    .toLowerCase();
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function updatedAt(entry: WorkspaceCatalogEntry): string {
  return (
    entry.latestApproved?.approvedAt ??
    entry.latestApproved?.createdAt ??
    entry.package.updatedAt
  );
}
