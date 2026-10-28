import type { CatalogSkill, CatalogSort } from "../types.js";
import {
  CategoryFilter,
  emptyListMessage,
  SkillList,
  StatusFilter,
} from "./catalog-list.js";
import { useI18n } from "../i18n/locale.js";
import { SortControl } from "./popularity.js";

type StatusFilterValue = "all" | "approved" | "drafts";

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
  const { t } = useI18n();

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
        emptyMessage={emptyListMessage(t, view === "my-skills", statusFilter)}
      />
    </>
  );
}
