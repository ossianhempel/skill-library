import { Tag, User } from "lucide-react";
import type { SkillRanking } from "@skill-library/domain";
import { useI18n } from "./i18n/locale.js";
import { PopularityLine } from "./components/popularity.js";
import { titleize } from "./lib/format.js";

export function formatSkillDate(iso: string, locale = "en-US"): string {
  if (!iso || iso === new Date(0).toISOString()) {
    return "—";
  }

  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The one line of facts under a skill's name: who made it, how many colleagues
 * use it and found it useful, and its categories. The detail view adds the
 * version and when it last changed.
 */
export function SkillMeta({
  author,
  ranking,
  categories = [],
  version,
  updatedAt,
}: {
  author?: string;
  ranking?: SkillRanking;
  categories?: string[];
  version?: string;
  updatedAt?: string;
}) {
  const { t, dateLocale } = useI18n();
  return (
    <div className="skill-meta">
      {author && (
        <span>
          <User size={13} aria-hidden="true" />
          {t.stats.by(author)}
        </span>
      )}
      {version && <span>{t.stats.versionValue(version)}</span>}
      {updatedAt && (
        <span>{t.stats.updated(formatSkillDate(updatedAt, dateLocale))}</span>
      )}
      <PopularityLine ranking={ranking} />
      {categories.length > 0 && (
        <span>
          <Tag size={13} aria-hidden="true" />
          {categories.map(titleize).join(", ")}
        </span>
      )}
    </div>
  );
}
