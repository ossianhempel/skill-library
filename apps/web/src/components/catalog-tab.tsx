import type { CatalogSkill, CatalogSort } from "../types.js";
import { CategoryFilter, SkillList, StatusFilter } from "./catalog-list.js";
import { SortControl } from "./popularity.js";

type StatusFilterValue = "all" | "approved" | "drafts";

const EMPTY_MESSAGES = {
  catalog: {
    drafts: "No draft or pending skills in this category match your search.",
    approved: "No approved skills in this category match your search.",
    all: "No skills in this category match your search.",
  },
  "my-skills": {
    drafts:
      "You haven't uploaded any draft or pending skills in this category yet.",
    approved: "You haven't uploaded any approved skills in this category yet.",
    all: "You haven't uploaded any skills in this category yet.",
  },
} as const;

/** The Catalog and My Skills lists: filters, sort, and the skill rows. */
export function CatalogTab({
  view,
  statusFilter,
  setStatusFilter,
  statusCatalog,
  categories,
  selectedCategory,
  setSelectedCategory,
  categoryCatalog,
  sortBy,
  setSortBy,
  displaySkills,
  selectedId,
  onSelect,
  loading,
}: {
  view: "catalog" | "my-skills";
  statusFilter: StatusFilterValue;
  setStatusFilter: (status: StatusFilterValue) => void;
  statusCatalog: CatalogSkill[];
  categories: string[];
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  categoryCatalog: CatalogSkill[];
  sortBy: CatalogSort;
  setSortBy: (sort: CatalogSort) => void;
  displaySkills: CatalogSkill[];
  selectedId?: string;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  return (
    <>
      <StatusFilter
        selectedStatus={statusFilter}
        onSelectStatus={setStatusFilter}
        catalog={statusCatalog}
      />
      <CategoryFilter
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        catalog={categoryCatalog}
      />
      <SortControl value={sortBy} onChange={setSortBy} />
      <SkillList
        catalog={displaySkills}
        selectedId={selectedId}
        onSelect={onSelect}
        loading={loading}
        emptyMessage={
          displaySkills.length === 0
            ? EMPTY_MESSAGES[view][statusFilter]
            : undefined
        }
      />
    </>
  );
}
