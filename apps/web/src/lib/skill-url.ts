// Shareable per-skill URLs. A skill is addressed by its workspace id and slug
// at `/s/<workspace>/<slug>`. The slug is immutable after first publish (see
// the server's persistedSlug guard), so these links stay stable over time.

export const SKILL_PATH_PREFIX = "s";

export interface SkillPathParts {
  workspaceId: string;
  slug: string;
}

/**
 * Parse `/s/<workspace>/<slug>` into its parts. Returns null for any other
 * path so callers can fall back to the default catalog view. Segments are URL
 * decoded; extra trailing segments are ignored.
 */
export function parseSkillPath(pathname: string): SkillPathParts | null {
  const [prefix, rawWorkspaceId, rawSlug] = pathname.split("/").filter(Boolean);

  if (prefix !== SKILL_PATH_PREFIX || !rawWorkspaceId || !rawSlug) {
    return null;
  }

  const workspaceId = safeDecode(rawWorkspaceId);
  const slug = safeDecode(rawSlug);

  if (!workspaceId || !slug) {
    return null;
  }

  return { workspaceId, slug };
}

/** Build the path (no origin) for a skill, with each segment URL encoded. */
export function buildSkillPath(workspaceId: string, slug: string): string {
  return `/${SKILL_PATH_PREFIX}/${encodeURIComponent(workspaceId)}/${encodeURIComponent(slug)}`;
}

/** Build an absolute, shareable URL for a skill. */
export function buildSkillUrl(
  origin: string,
  workspaceId: string,
  slug: string
): string {
  return `${origin.replace(/\/$/, "")}${buildSkillPath(workspaceId, slug)}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
