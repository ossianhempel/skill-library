import {
  DEFAULT_REGISTRY_BRANDING,
  DOWNLOAD_HISTORY_DAYS,
  WORKSPACE_ROLE_LABELS,
  type DownloadHistoryPoint,
  type SkillPackage,
  type SkillVersion,
  type WorkspaceRole,
} from "@skill-library/domain";
import { parse as parseYaml } from "yaml";

export function titleize(slug: string) {
  return slug
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function formatRoleLabel(
  role: string,
  labels: Record<WorkspaceRole, string> = WORKSPACE_ROLE_LABELS
): string {
  if (role === "user" || role === "maintainer" || role === "admin") {
    return labels[role];
  }

  return role;
}

/**
 * Reads a SKILL.md's YAML frontmatter with a real YAML parser, so folded and
 * literal blocks (`description: >-`) come back as their text, not as ">-".
 * Returns {} when there is no frontmatter or it is not a YAML mapping.
 */
export function parseSimpleFrontmatter(content: string): Record<string, any> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try {
    const parsed = parseYaml(match[1] || "");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : {};
  } catch {
    return {};
  }
}

export function renderCatalogTitle(
  packages: SkillPackage[],
  appName = DEFAULT_REGISTRY_BRANDING.appName
) {
  return `${appName} (${packages.length})`;
}

export function renderLifecycleBadge(version: SkillVersion) {
  return version.lifecycleState.toUpperCase();
}

export function emptyDownloadHistory(): DownloadHistoryPoint[] {
  return Array.from({ length: DOWNLOAD_HISTORY_DAYS }, (_, index) => {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - (DOWNLOAD_HISTORY_DAYS - 1 - index));

    return {
      date: day.toISOString().slice(0, 10),
      count: 0,
    };
  });
}
