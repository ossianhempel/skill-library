import type { CatalogSkill } from "../types.js";

// Last catalog each viewer saw per registry and workspace, so reopening the app
// shows it at once while a fresh copy loads in the background. Kept in memory
// for workspace switches and in localStorage for reloads; storage can be full,
// disabled or throw in private windows, so every access is best effort.
const STORAGE_PREFIX = "skill-library-catalog:v1:";
const memory = new Map<string, CatalogSkill[]>();

export function catalogCacheKey(
  registryUrl: string,
  workspaceId: string,
  viewer: { id: string; role: string } | null | undefined
): string {
  // The role is part of the key: maintainers see drafts and install reports, so
  // a demoted account must not get its maintainer-era catalog back.
  const who = viewer ? `${viewer.id}|${viewer.role}` : "anonymous";
  return `${registryUrl.replace(/\/$/, "")}|${workspaceId}|${who}`;
}

export function readCachedCatalog(key: string): CatalogSkill[] | undefined {
  const cached = memory.get(key);

  if (cached) {
    return cached;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    const skills = raw ? (JSON.parse(raw) as CatalogSkill[]) : undefined;

    if (Array.isArray(skills)) {
      memory.set(key, skills);
      return skills;
    }
  } catch {
    // Unreadable or unavailable storage: behave as a cache miss.
  }

  return undefined;
}

export function writeCachedCatalog(key: string, skills: CatalogSkill[]) {
  memory.set(key, skills);

  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(skills));
  } catch {
    // Quota or disabled storage: the in-memory copy still serves this tab.
  }
}

/** Forget every cached catalog, e.g. on sign-out. */
export function clearCachedCatalogs() {
  memory.clear();

  try {
    const storage = window.localStorage;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
