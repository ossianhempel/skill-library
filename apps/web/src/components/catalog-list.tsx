import { Loader2 } from "lucide-react";
import type { CatalogSkill } from "../types.js";
import { titleize } from "../lib/format.js";
import { SkillStatsMeta } from "../skill-stats.js";
import { LifecycleBadge } from "./chrome.js";

export function StatusFilter({
  selectedStatus,
  onSelectStatus,
  catalog,
}: {
  selectedStatus: "all" | "approved" | "drafts";
  onSelectStatus: (status: "all" | "approved" | "drafts") => void;
  catalog: CatalogSkill[];
}) {
  const allCount = catalog.length;
  const approvedCount = catalog.filter((skill) => {
    const state =
      skill.activeVersion?.lifecycleState ??
      skill.latestApproved?.lifecycleState;
    return state === "approved";
  }).length;
  const draftsCount = catalog.filter((skill) => {
    const state =
      skill.activeVersion?.lifecycleState ??
      skill.latestApproved?.lifecycleState;
    return state === "draft" || state === "published";
  }).length;

  return (
    <div
      className="status-filter-bar"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--space-8)",
        marginBottom: "var(--space-12)",
      }}
    >
      <button
        type="button"
        className={`category-pill ${selectedStatus === "all" ? "active" : ""}`}
        onClick={() => onSelectStatus("all")}
      >
        All Statuses <span className="count">({allCount})</span>
      </button>
      <button
        type="button"
        className={`category-pill ${selectedStatus === "approved" ? "active" : ""}`}
        onClick={() => onSelectStatus("approved")}
      >
        Approved <span className="count">({approvedCount})</span>
      </button>
      <button
        type="button"
        className={`category-pill ${selectedStatus === "drafts" ? "active" : ""}`}
        onClick={() => onSelectStatus("drafts")}
      >
        Drafts & Pending <span className="count">({draftsCount})</span>
      </button>
    </div>
  );
}

export function CategoryFilter({
  categories,
  selectedCategory,
  onSelectCategory,
  catalog,
}: {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  catalog: CatalogSkill[];
}) {
  return (
    <div className="category-filter-bar">
      <button
        type="button"
        className={`category-pill ${selectedCategory === "all" ? "active" : ""}`}
        onClick={() => onSelectCategory("all")}
      >
        All <span className="count">({catalog.length})</span>
      </button>
      {categories.map((cat) => {
        const count = catalog.filter((skill) =>
          skill.pkg.categories
            ?.map((c) => c.toLowerCase())
            .includes(cat.toLowerCase())
        ).length;
        return (
          <button
            key={cat}
            type="button"
            className={`category-pill ${selectedCategory === cat.toLowerCase() ? "active" : ""}`}
            onClick={() => onSelectCategory(cat.toLowerCase())}
          >
            {titleize(cat)} <span className="count">({count})</span>
          </button>
        );
      })}
    </div>
  );
}

export function SkillList({
  catalog,
  selectedId,
  onSelect,
  emptyMessage,
  loading = false,
}: {
  catalog: CatalogSkill[];
  selectedId?: string;
  onSelect: (id: string) => void;
  emptyMessage?: string;
  loading?: boolean;
}) {
  // Show a spinner while the initial query is still in flight so an empty list
  // isn't mistaken for "no skills found".
  if (loading && catalog.length === 0) {
    return (
      <div className="skill-list-loading" role="status" aria-live="polite">
        <Loader2 size={22} className="spin" aria-hidden="true" />
        <p>Loading skills…</p>
      </div>
    );
  }

  if (catalog.length === 0) {
    return (
      <p className="empty-catalog-copy">
        {emptyMessage ?? "No skills in the catalog yet."}
      </p>
    );
  }

  return (
    <div className="list">
      {catalog.map((skill) => (
        <SkillRow
          key={skill.pkg.id}
          skill={skill}
          active={skill.pkg.id === selectedId}
          onSelect={() => onSelect(skill.pkg.id)}
        />
      ))}
    </div>
  );
}

export function SkillRow({
  skill,
  active,
  onSelect,
}: {
  skill: CatalogSkill;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={active ? "skill-row active" : "skill-row"}
      onClick={onSelect}
    >
      <div className="skill-row-main">
        <div className="skill-row-copy">
          <h2>{skill.pkg.name}</h2>
          <p>{skill.pkg.description}</p>
          <div className="tags">
            {skill.pkg.categories.map((category) => (
              <span key={category}>{category}</span>
            ))}
          </div>
        </div>
        <SkillStatsMeta
          compact
          version={
            skill.latestApproved?.version ?? skill.activeVersion?.version
          }
          author={skill.activeVersion?.author ?? skill.latestApproved?.author}
          downloads={skill.downloads}
          downloadHistory={skill.downloadHistory}
          uploadedAt={skill.activeVersion?.createdAt ?? skill.pkg.createdAt}
          lastModifiedAt={skill.lastModifiedAt}
        />
      </div>
      <LifecycleBadge
        state={
          skill.activeVersion?.lifecycleState ??
          skill.latestApproved?.lifecycleState ??
          "draft"
        }
      />
    </article>
  );
}

export function FeaturedSkill({
  skill,
  onOpen,
}: {
  skill: CatalogSkill;
  onOpen: () => void;
}) {
  return (
    <article className="featured-skill">
      <div>
        <p className="kicker">Featured approved skill</p>
        <h2>{skill.pkg.name}</h2>
        <p>{skill.pkg.description}</p>
        <SkillStatsMeta
          compact
          version={
            skill.latestApproved?.version ?? skill.activeVersion?.version
          }
          author={skill.activeVersion?.author ?? skill.latestApproved?.author}
          downloads={skill.downloads}
          downloadHistory={skill.downloadHistory}
          uploadedAt={skill.activeVersion?.createdAt ?? skill.pkg.createdAt}
          lastModifiedAt={skill.lastModifiedAt}
        />
      </div>
      <button onClick={onOpen}>Open catalog</button>
    </article>
  );
}
