import {
  DEFAULT_REGISTRY_BRANDING,
  DOWNLOAD_HISTORY_DAYS,
  WORKSPACE_ROLE_LABELS,
  type DownloadHistoryPoint,
  type SkillPackage,
  type SkillVersion,
} from "@skill-library/domain";

export function titleize(slug: string) {
  return slug
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function formatRoleLabel(role: string): string {
  if (role === "user" || role === "maintainer" || role === "admin") {
    return WORKSPACE_ROLE_LABELS[role];
  }

  return role;
}

export function parseSimpleFrontmatter(content: string): Record<string, any> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const yamlText = match[1] || "";
  const result: Record<string, any> = {};
  const lines = yamlText.split(/\r?\n/);
  let currentKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("-") && currentKey) {
      const val = trimmed
        .slice(1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (val) {
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }
        result[currentKey].push(val);
      }
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex !== -1) {
      const key = line.slice(0, colonIndex).trim();
      const val = line.slice(colonIndex + 1).trim();
      currentKey = key;

      if (val.startsWith("[") && val.endsWith("]")) {
        result[key] = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      } else if (val) {
        result[key] = val.replace(/^["']|["']$/g, "");
      }
    } else {
      currentKey = null;
    }
  }
  return result;
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
