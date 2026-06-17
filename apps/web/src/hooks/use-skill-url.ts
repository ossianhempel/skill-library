import { useCallback, useEffect, useRef, useState } from "react";
import type { AppTab, CatalogSkill } from "../types.js";
import {
  buildSkillPath,
  buildSkillUrl,
  parseSkillPath,
} from "../lib/skill-url.js";

const CATALOG_TABS: AppTab[] = ["catalog", "my-skills"];

/**
 * Syncs the browser URL with the selected skill so links are shareable.
 *
 * - On mount, a `/s/<workspace>/<slug>` deep link selects the workspace, opens
 *   the catalog, and selects the matching skill once its catalog has loaded.
 * - Selecting a skill in a catalog view pushes its `/s/...` path so back/forward
 *   navigate between skills (popstate-driven selection does not push again).
 * - Exposes `copyShareLink` / `copiedLink` for the detail pane's "Copy link".
 */
export function useSkillUrl({
  activeTab,
  setActiveTab,
  workspaceId,
  setSelectedWorkspaceId,
  catalog,
  selected,
  handleSelectSkill,
  setNotice,
}: {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  workspaceId: string;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  catalog: CatalogSkill[];
  selected: CatalogSkill | undefined;
  handleSelectSkill: (id: string) => void;
  setNotice: (notice: string) => void;
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  // A skill awaiting resolution once its workspace's catalog has loaded. Tracks
  // the target workspace so a cross-workspace link is never resolved against the
  // previous workspace's (stale) catalog.
  const pendingRef = useRef<{ workspaceId: string; slug: string } | null>(null);
  // Set when a selection originates from a back/forward navigation, so the URL
  // sync does not push a duplicate history entry over it.
  const skipNextPushRef = useRef(false);

  // Adopt a deep link on first mount.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const parts = parseSkillPath(window.location.pathname);
    if (!parts) {
      return;
    }

    pendingRef.current = { workspaceId: parts.workspaceId, slug: parts.slug };
    if (parts.workspaceId !== workspaceId) {
      setSelectedWorkspaceId(parts.workspaceId);
    }
    setActiveTab("catalog");
    // Mount-only: workspaceId/setters are stable enough for an initial read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve a pending deep-link slug against the loaded catalog. Selection is
  // applied here; pendingRef is cleared by the URL-sync effect once the
  // selection lands, so the URL sync uses replaceState (no duplicate entry).
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) {
      return;
    }

    // Wait until the app has switched to the target workspace and its catalog
    // has actually loaded — resolving earlier would search stale data.
    if (workspaceId !== pending.workspaceId || catalog.length === 0) {
      return;
    }
    if (catalog[0]?.pkg.workspaceId !== pending.workspaceId) {
      return;
    }

    const match = catalog.find((skill) => skill.pkg.slug === pending.slug);
    if (match) {
      handleSelectSkill(match.pkg.id);
    } else {
      pendingRef.current = null;
      setNotice(`Skill "${pending.slug}" was not found in this workspace.`);
    }
  }, [catalog, workspaceId, handleSelectSkill, setNotice]);

  // Keep the URL in sync with the current selection.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const current = window.location.pathname;

    // A deep link is still resolving: adopt the URL without a new history entry
    // once the selection it points at has actually landed.
    if (pendingRef.current) {
      if (
        selected &&
        selected.pkg.workspaceId === pendingRef.current.workspaceId &&
        selected.pkg.slug === pendingRef.current.slug
      ) {
        pendingRef.current = null;
        skipNextPushRef.current = false;
        const next = buildSkillPath(workspaceId, selected.pkg.slug);
        if (current !== next) {
          window.history.replaceState(null, "", next);
        }
      }
      return;
    }

    // The selection came from back/forward — the URL already matches it.
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }

    const onCatalog = CATALOG_TABS.includes(activeTab);

    if (onCatalog && selected) {
      const next = buildSkillPath(workspaceId, selected.pkg.slug);
      if (current !== next) {
        window.history.pushState(null, "", next);
      }
    } else if (parseSkillPath(current)) {
      // Left the catalog views — drop the skill path so the URL stays honest.
      window.history.replaceState(null, "", "/");
    }
  }, [activeTab, selected, workspaceId]);

  // Reset the "copied" affordance whenever the selection changes.
  useEffect(() => {
    setCopiedLink(false);
  }, [selected?.pkg.id]);

  // Back/forward between shared skill links.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function onPopState() {
      const parts = parseSkillPath(window.location.pathname);
      if (!parts) {
        return;
      }

      setActiveTab("catalog");

      // Cross-workspace: switch and defer to the resolution effect, which waits
      // for the target workspace's catalog before matching the slug.
      if (parts.workspaceId !== workspaceId) {
        setSelectedWorkspaceId(parts.workspaceId);
        pendingRef.current = {
          workspaceId: parts.workspaceId,
          slug: parts.slug,
        };
        return;
      }

      const match = catalog.find((skill) => skill.pkg.slug === parts.slug);
      if (match) {
        skipNextPushRef.current = true;
        handleSelectSkill(match.pkg.id);
      } else {
        // Catalog for this workspace is loaded; resolve against it.
        pendingRef.current = { workspaceId, slug: parts.slug };
      }
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [
    catalog,
    workspaceId,
    handleSelectSkill,
    setActiveTab,
    setSelectedWorkspaceId,
  ]);

  const copyShareLink = useCallback(() => {
    if (typeof window === "undefined" || !selected) {
      return;
    }

    const url = buildSkillUrl(
      window.location.origin,
      workspaceId,
      selected.pkg.slug
    );
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    setCopiedLink(true);
    setNotice("Link copied — share it with your team");
    window.setTimeout(() => setCopiedLink(false), 2500);
  }, [selected, workspaceId, setNotice]);

  return { copiedLink, copyShareLink };
}
