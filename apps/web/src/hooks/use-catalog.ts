import { useEffect, useMemo, useRef, useState } from "react";
import type { LifecycleState } from "@skill-library/domain";
import type {
  AppTab,
  CatalogSkill,
  CatalogSort,
  SessionUser,
  WebApiClient,
} from "../types.js";
import { sortCatalog } from "../components/popularity.js";
import { isLocalDev } from "../lib/browser.js";
import { devSampleSkills } from "../lib/dev-sample-data.js";
import { loadWorkspaceCatalog } from "../api/catalog.js";
import { useI18n } from "../i18n/locale.js";
import {
  catalogCacheKey,
  clearCachedCatalogs,
  readCachedCatalog,
  writeCachedCatalog,
} from "../lib/catalog-cache.js";

export function useCatalog({
  apiClient,
  registryUrl = "",
  workspaceId,
  skills,
  session,
  sessionLoading = false,
  activeTab,
  loading,
  setLoading,
  setNotice,
}: {
  apiClient: WebApiClient;
  registryUrl?: string;
  workspaceId: string;
  skills: CatalogSkill[] | undefined;
  session: SessionUser | null;
  sessionLoading?: boolean;
  activeTab: AppTab;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  setNotice: (notice: string) => void;
}) {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<CatalogSkill[]>(skills ?? []);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    catalog[0]?.pkg.id
  );
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "approved" | "drafts"
  >("all");
  const [sortBy, setSortBy] = useState<CatalogSort>("popular");
  const [votePending, setVotePending] = useState(false);
  const votePendingRef = useRef(false);
  // Tracks whether the initial catalog query has resolved at least once, so the
  // Catalog / My Skills lists can show a spinner instead of an empty-state on
  // first paint (before any data has arrived).
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const detailPaneRef = useRef<HTMLElement>(null);
  // Identifies the in-flight catalog load so a slower request for a previous
  // workspace can't overwrite a newer one's results.
  const loadTokenRef = useRef(0);
  // True once the current workspace's list is on screen (from cache or network),
  // so later refreshes run in the background without the global loading state.
  const shownRef = useRef(false);
  const freshRef = useRef(false);
  // Viewer the last network catalog was served to; undefined until known.
  // Viewer identities are "id|role" (or null when anonymous): a role change
  // alters what the catalog may contain, so it counts as a different viewer.
  const loadedViewerRef = useRef<string | null | undefined>(undefined);
  const sessionIdRef = useRef<string | null | undefined>(undefined);
  // The server treats a session without a role as "user"; match it so cache
  // keys and change detection agree with the viewer the catalog was served to.
  const sessionViewer = session
    ? { id: session.id, role: session.role || "user" }
    : null;
  const sessionId = viewerIdentity(sessionViewer);

  // Select a skill and, on stacked/narrow layouts where the detail pane sits
  // below (or scrolled off from) the list, bring the skill info into view.
  // No-op when the pane is already comfortably visible (e.g. desktop 3-column).
  function handleSelectSkill(id: string) {
    setSelectedId(id);
    if (typeof window === "undefined") {
      return;
    }
    // Wait for the detail pane to mount/update before measuring + scrolling.
    requestAnimationFrame(() => {
      const el = detailPaneRef.current;
      if (!el) {
        return;
      }
      const { top } = el.getBoundingClientRect();
      const offscreen = top < 0 || top > window.innerHeight * 0.4;
      if (offscreen) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  useEffect(() => {
    if (skills) {
      setCatalog(skills);
      setSelectedId(skills[0]?.pkg.id);
      setCatalogLoaded(true);
      return;
    }

    // Switching workspace (or client): the current catalog is not yet loaded.
    shownRef.current = false;
    freshRef.current = false;
    setCatalogLoaded(false);
    void loadCatalog();
  }, [skills, workspaceId, apiClient]);

  // Stale-while-revalidate: the network load starts at mount; as soon as we
  // know who is signed in, show that viewer's last catalog until it lands.
  useEffect(() => {
    if (skills || sessionLoading || freshRef.current) {
      return;
    }

    const cached = readCachedCatalog(
      catalogCacheKey(registryUrl, workspaceId, sessionViewer)
    );

    if (cached) {
      shownRef.current = true;
      applyCatalog(cached);
      setCatalogLoaded(true);
    }
  }, [skills, sessionLoading, sessionId, workspaceId, registryUrl]);

  // A different viewer (sign-in without a reload, sign-out, account or role
  // switch) must not keep seeing the previous viewer's catalog.
  useEffect(() => {
    if (sessionLoading) {
      return;
    }

    const previous = sessionIdRef.current;
    sessionIdRef.current = sessionId;
    const loadedViewer = loadedViewerRef.current;
    const viewerChanged =
      previous !== undefined
        ? previous !== sessionId
        : // First resolution: the mount-time load may have run before a
          // session existed. Token-only clients have no session to compare.
          sessionId !== null &&
          loadedViewer !== undefined &&
          loadedViewer !== sessionId;

    if (skills || !viewerChanged) {
      return;
    }

    if (previous && !sessionId) {
      clearCachedCatalogs();
    }

    // Drop what the previous viewer saw and any load still in flight for them,
    // then load as the new viewer with the normal (foreground) states.
    loadTokenRef.current += 1;
    loadedViewerRef.current = undefined;
    shownRef.current = false;
    freshRef.current = false;
    applyCatalog([]);
    setCatalogLoaded(false);
    void loadCatalog();
  }, [sessionLoading, sessionId]);

  const availableCategories = useMemo(() => {
    const categoriesSet = new Set<string>();
    for (const skill of catalog) {
      if (skill.pkg.categories) {
        for (const cat of skill.pkg.categories) {
          const trimmed = cat.trim();
          if (trimmed) {
            categoriesSet.add(trimmed.toLowerCase());
          }
        }
      }
    }
    const defaults = ["sales", "marketing", "finance"];
    for (const d of defaults) {
      categoriesSet.add(d);
    }
    return Array.from(categoriesSet).sort();
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    return catalog.filter((skill) => {
      // 1. Filter by category
      if (selectedCategory !== "all") {
        const matchesCategory = skill.pkg.categories
          ?.map((c) => c.toLowerCase())
          .includes(selectedCategory);
        if (!matchesCategory) return false;
      }

      // 2. Filter by search query (client-side!)
      if (!matchesQuery(skill, query)) return false;

      return true;
    });
  }, [catalog, selectedCategory, query]);

  const mySkills = useMemo(() => {
    if (!session) return [];
    return catalog.filter((skill) => {
      const activeActorId = skill.activeVersion?.provenance?.actorId;
      const activeActorEmail = skill.activeVersion?.provenance?.actorEmail;
      const activeGitEmail = skill.activeVersion?.provenance?.gitAuthorEmail;
      const approvedActorId = skill.latestApproved?.provenance?.actorId;
      const approvedActorEmail = skill.latestApproved?.provenance?.actorEmail;
      const approvedGitEmail = skill.latestApproved?.provenance?.gitAuthorEmail;
      return (
        activeActorId === session.id ||
        activeActorId === session.email ||
        activeActorEmail === session.email ||
        activeGitEmail === session.email ||
        approvedActorId === session.id ||
        approvedActorId === session.email ||
        approvedActorEmail === session.email ||
        approvedGitEmail === session.email
      );
    });
  }, [catalog, session]);

  const filteredMySkills = useMemo(() => {
    return mySkills.filter((skill) => {
      // 1. Filter by category
      if (selectedCategory !== "all") {
        const matchesCategory = skill.pkg.categories
          ?.map((c) => c.toLowerCase())
          .includes(selectedCategory);
        if (!matchesCategory) return false;
      }

      // 2. Filter by search query (client-side!)
      if (!matchesQuery(skill, query)) return false;

      return true;
    });
  }, [mySkills, selectedCategory, query]);

  const myCategories = useMemo(() => {
    const categoriesSet = new Set<string>();
    for (const skill of mySkills) {
      if (skill.pkg.categories) {
        for (const cat of skill.pkg.categories) {
          const trimmed = cat.trim();
          if (trimmed) {
            categoriesSet.add(trimmed.toLowerCase());
          }
        }
      }
    }
    return Array.from(categoriesSet).sort();
  }, [mySkills]);

  const queryFilteredCatalog = useMemo(() => {
    return catalog.filter((skill) => matchesQuery(skill, query));
  }, [catalog, query]);

  const queryFilteredMySkills = useMemo(() => {
    return mySkills.filter((skill) => matchesQuery(skill, query));
  }, [mySkills, query]);

  const queryAndStatusFilteredCatalog = useMemo(() => {
    return catalog.filter((skill) => {
      if (!matchesQuery(skill, query)) return false;

      const state =
        skill.activeVersion?.lifecycleState ??
        skill.latestApproved?.lifecycleState;
      if (statusFilter === "approved") {
        return state === "approved";
      }
      if (statusFilter === "drafts") {
        return state === "draft" || state === "published";
      }

      return true;
    });
  }, [catalog, query, statusFilter]);

  const queryAndStatusFilteredMySkills = useMemo(() => {
    return mySkills.filter((skill) => {
      if (!matchesQuery(skill, query)) return false;

      const state =
        skill.activeVersion?.lifecycleState ??
        skill.latestApproved?.lifecycleState;
      if (statusFilter === "approved") {
        return state === "approved";
      }
      if (statusFilter === "drafts") {
        return state === "draft" || state === "published";
      }

      return true;
    });
  }, [mySkills, query, statusFilter]);

  const displaySkills = useMemo(() => {
    let base = filteredCatalog;
    if (activeTab === "my-skills") {
      base = filteredMySkills;
    }

    if (statusFilter === "approved") {
      base = base.filter((skill) => {
        const state =
          skill.activeVersion?.lifecycleState ??
          skill.latestApproved?.lifecycleState;
        return state === "approved";
      });
    } else if (statusFilter === "drafts") {
      base = base.filter((skill) => {
        const state =
          skill.activeVersion?.lifecycleState ??
          skill.latestApproved?.lifecycleState;
        return state === "draft" || state === "published";
      });
    }

    return sortCatalog(base, sortBy);
  }, [activeTab, filteredCatalog, filteredMySkills, statusFilter, sortBy]);

  useEffect(() => {
    setSelectedCategory("all");
    setStatusFilter("all");
  }, [activeTab]);

  useEffect(() => {
    if (
      selectedId &&
      !displaySkills.some((skill) => skill.pkg.id === selectedId)
    ) {
      setSelectedId(displaySkills[0]?.pkg.id);
    }
  }, [displaySkills, selectedId]);

  const selected = catalog.find((skill) => skill.pkg.id === selectedId);

  function applyCatalog(next: CatalogSkill[]) {
    setCatalog(next);
    setSelectedId((current) =>
      current && next.some((skill) => skill.pkg.id === current)
        ? current
        : next[0]?.pkg.id
    );
  }

  // The lists behind the Catalog / My Skills filters for whichever tab is open.
  const isMySkills = activeTab === "my-skills";
  const listFilters = {
    statusCatalog: isMySkills ? queryFilteredMySkills : queryFilteredCatalog,
    categories: isMySkills ? myCategories : availableCategories,
    categoryCatalog: isMySkills
      ? queryAndStatusFilteredMySkills
      : queryAndStatusFilteredCatalog,
  };

  async function loadCatalog() {
    const token = ++loadTokenRef.current;
    if (!shownRef.current) {
      setLoading(true);
    }

    try {
      const { skills: next, viewer } = await loadWorkspaceCatalog(
        apiClient,
        workspaceId
      );
      // A newer load (e.g. a workspace switch) started while this was in flight.
      if (token !== loadTokenRef.current) {
        return;
      }
      freshRef.current = true;
      shownRef.current = true;
      applyCatalog(next);
      if (viewer !== undefined) {
        loadedViewerRef.current = viewerIdentity(viewer);
        writeCachedCatalog(
          catalogCacheKey(registryUrl, workspaceId, viewer),
          next
        );
      }
      setNotice(
        next.length > 0 ? t.notices.catalogSynced : t.notices.catalogEmpty
      );
    } catch (error) {
      if (token !== loadTokenRef.current) {
        return;
      }
      const status = (error as { status?: number } | undefined)?.status;
      const denied = status === 401 || status === 403;
      if (denied) {
        // The viewer lost access: drop what the cache put on screen too.
        clearCachedCatalogs();
      }
      // The cache may have been put on screen after this load started.
      if (shownRef.current && !denied) {
        // Keep showing the cached catalog; only say the refresh failed.
        setNotice(
          t.notices.refreshFailed(
            error instanceof Error ? error.message : undefined
          )
        );
        return;
      }
      const fallback = isLocalDev() ? devSampleSkills : [];
      setCatalog(fallback);
      setSelectedId(fallback[0]?.pkg.id);
      setNotice(
        t.notices.apiUnavailable(
          error instanceof Error ? error.message : undefined,
          isLocalDev()
        )
      );
    } finally {
      // Only the newest load settles the state, so it also owns clearing the
      // loading flag a superseded foreground load may have set.
      if (token === loadTokenRef.current) {
        setLoading(false);
        setCatalogLoaded(true);
      }
    }
  }

  async function handleLifecycle(toState: LifecycleState) {
    const versionId = selected?.activeVersion?.id;

    if (!versionId) {
      setNotice(t.notices.noVersion);
      return;
    }

    setLoading(true);

    try {
      const version = await apiClient.transitionVersion(versionId, toState);
      setNotice(
        t.notices.versionMoved(
          version.version,
          t.lifecycle[version.lifecycleState]
        )
      );
      await loadCatalog();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : t.notices.lifecycleFailed
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVote(voted: boolean) {
    const packageId = selected?.pkg.id;

    // One vote request at a time, so a double click can't race itself.
    if (!packageId || !apiClient.setSkillVote || votePendingRef.current) {
      return;
    }

    votePendingRef.current = true;
    setVotePending(true);
    try {
      const ranking = await apiClient.setSkillVote(packageId, voted);
      setCatalog((current) =>
        current.map((skill) =>
          skill.pkg.id === packageId ? { ...skill, ranking } : skill
        )
      );
      setNotice(voted ? t.notices.upvoteSaved : t.notices.upvoteRemoved);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : t.notices.upvoteFailed
      );
    } finally {
      votePendingRef.current = false;
      setVotePending(false);
    }
  }

  return {
    catalog,
    selectedId,
    query,
    setQuery,
    selectedCategory,
    setSelectedCategory,
    statusFilter,
    setStatusFilter,
    catalogLoaded,
    detailPaneRef,
    handleSelectSkill,
    loadCatalog,
    handleLifecycle,
    availableCategories,
    filteredCatalog,
    mySkills,
    filteredMySkills,
    myCategories,
    queryFilteredCatalog,
    queryFilteredMySkills,
    queryAndStatusFilteredCatalog,
    queryAndStatusFilteredMySkills,
    displaySkills,
    selected,
    // Grouped so the page can hand them to CatalogTab / SkillDetailPane as-is.
    sorting: { sortBy, setSortBy },
    voting: { onVote: handleVote, votePending },
    listFilters,
  };
}

// Client-side search over name, description and categories.
function matchesQuery(skill: CatalogSkill, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  return (
    !normalizedQuery ||
    `${skill.pkg.name} ${skill.pkg.description} ${skill.pkg.categories.join(" ")}`
      .toLowerCase()
      .includes(normalizedQuery)
  );
}

function viewerIdentity(
  viewer: { id: string; role: string } | null | undefined
): string | null {
  return viewer ? `${viewer.id}|${viewer.role}` : null;
}
