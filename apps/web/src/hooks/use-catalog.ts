import { useEffect, useMemo, useRef, useState } from "react";
import type { LifecycleState } from "@skill-library/domain";
import type {
  AppTab,
  CatalogSkill,
  SessionUser,
  WebApiClient,
} from "../types.js";
import { isLocalDev } from "../lib/browser.js";
import { devSampleSkills } from "../lib/dev-sample-data.js";
import { loadCatalogSkills } from "../api/catalog.js";

export function useCatalog({
  apiClient,
  workspaceId,
  skills,
  session,
  activeTab,
  loading,
  setLoading,
  setNotice,
}: {
  apiClient: WebApiClient;
  workspaceId: string;
  skills: CatalogSkill[] | undefined;
  session: SessionUser | null;
  activeTab: AppTab;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  setNotice: (notice: string) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogSkill[]>(skills ?? []);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    catalog[0]?.pkg.id
  );
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "approved" | "drafts"
  >("all");
  // Tracks whether the initial catalog query has resolved at least once, so the
  // Catalog / My Skills lists can show a spinner instead of an empty-state on
  // first paint (before any data has arrived).
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const detailPaneRef = useRef<HTMLElement>(null);
  // Identifies the in-flight catalog load so a slower request for a previous
  // workspace can't overwrite a newer one's results.
  const loadTokenRef = useRef(0);

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
    setCatalogLoaded(false);
    void loadCatalog();
  }, [skills, workspaceId, apiClient]);

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
      const normalizedQuery = query.trim().toLowerCase();
      if (normalizedQuery) {
        const matchText =
          `${skill.pkg.name} ${skill.pkg.description} ${skill.pkg.categories.join(" ")}`.toLowerCase();
        if (!matchText.includes(normalizedQuery)) return false;
      }

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
      const normalizedQuery = query.trim().toLowerCase();
      if (normalizedQuery) {
        const matchText =
          `${skill.pkg.name} ${skill.pkg.description} ${skill.pkg.categories.join(" ")}`.toLowerCase();
        if (!matchText.includes(normalizedQuery)) return false;
      }

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
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return catalog;
    return catalog.filter((skill) => {
      const matchText =
        `${skill.pkg.name} ${skill.pkg.description} ${skill.pkg.categories.join(" ")}`.toLowerCase();
      return matchText.includes(normalizedQuery);
    });
  }, [catalog, query]);

  const queryFilteredMySkills = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return mySkills;
    return mySkills.filter((skill) => {
      const matchText =
        `${skill.pkg.name} ${skill.pkg.description} ${skill.pkg.categories.join(" ")}`.toLowerCase();
      return matchText.includes(normalizedQuery);
    });
  }, [mySkills, query]);

  const queryAndStatusFilteredCatalog = useMemo(() => {
    return catalog.filter((skill) => {
      const normalizedQuery = query.trim().toLowerCase();
      if (normalizedQuery) {
        const matchText =
          `${skill.pkg.name} ${skill.pkg.description} ${skill.pkg.categories.join(" ")}`.toLowerCase();
        if (!matchText.includes(normalizedQuery)) return false;
      }

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
      const normalizedQuery = query.trim().toLowerCase();
      if (normalizedQuery) {
        const matchText =
          `${skill.pkg.name} ${skill.pkg.description} ${skill.pkg.categories.join(" ")}`.toLowerCase();
        if (!matchText.includes(normalizedQuery)) return false;
      }

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

    return base;
  }, [activeTab, filteredCatalog, filteredMySkills, statusFilter]);

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

  async function loadCatalog() {
    const token = ++loadTokenRef.current;
    setLoading(true);

    try {
      const next = await loadCatalogSkills(apiClient, workspaceId);
      // A newer load (e.g. a workspace switch) started while this was in flight.
      if (token !== loadTokenRef.current) {
        return;
      }
      setCatalog(next);
      setSelectedId((current) =>
        current && next.some((skill) => skill.pkg.id === current)
          ? current
          : next[0]?.pkg.id
      );
      setNotice(
        next.length > 0
          ? "Catalog synced"
          : "Catalog is empty. Publish a skill to get started."
      );
    } catch (error) {
      if (token !== loadTokenRef.current) {
        return;
      }
      const fallback = isLocalDev() ? devSampleSkills : [];
      setCatalog(fallback);
      setSelectedId(fallback[0]?.pkg.id);
      setNotice(
        error instanceof Error
          ? isLocalDev()
            ? `API unavailable: ${error.message}; showing local demo data`
            : `API unavailable: ${error.message}`
          : isLocalDev()
            ? "API unavailable; showing local demo data"
            : "API unavailable"
      );
    } finally {
      if (token === loadTokenRef.current) {
        setLoading(false);
        setCatalogLoaded(true);
      }
    }
  }

  async function handleLifecycle(toState: LifecycleState) {
    const versionId = selected?.activeVersion?.id;

    if (!versionId) {
      setNotice("No selected version to transition.");
      return;
    }

    setLoading(true);

    try {
      const version = await apiClient.transitionVersion(versionId, toState);
      setNotice(
        `Version ${version.version} moved to ${version.lifecycleState}`
      );
      await loadCatalog();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Lifecycle transition failed"
      );
    } finally {
      setLoading(false);
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
  };
}
