import { Download, Loader2, ThumbsUp, Trophy, User, Users } from "lucide-react";
import type { SkillRanking } from "@skill-library/domain";
import type { CatalogSkill, CatalogSort } from "../types.js";
import { useI18n } from "../i18n/locale.js";
import { InfoTip } from "./chrome.js";

/** One plain line: how many colleagues use the skill, and how many found it useful. */
export function PopularityLine({ ranking }: { ranking?: SkillRanking }) {
  const colleagues = ranking?.colleagues ?? 0;
  const upvotes = ranking?.upvotes ?? 0;
  const { t } = useI18n();

  return (
    <p className="popularity-line">
      <Users size={14} aria-hidden="true" />
      <span>
        {colleagues === 0
          ? t.popularity.noColleagues
          : t.popularity.installedBy(colleagues)}
      </span>
      {upvotes > 0 && (
        <>
          <ThumbsUp size={13} aria-hidden="true" />
          <span>{t.popularity.foundUseful(upvotes)}</span>
        </>
      )}
    </p>
  );
}

export function UpvoteButton({
  ranking,
  disabled,
  onVote,
}: {
  ranking?: SkillRanking;
  disabled?: boolean;
  onVote: (voted: boolean) => void;
}) {
  const voted = ranking?.votedByMe ?? false;
  const upvotes = ranking?.upvotes ?? 0;
  const { t } = useI18n();

  if (ranking?.authoredByMe) {
    return (
      <span
        className="upvote-button upvote-button--own"
        title={t.popularity.yourSkill}
      >
        <ThumbsUp size={15} aria-hidden="true" />
        {t.popularity.ownUseful(upvotes)}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`upvote-button ${voted ? "active" : ""}`}
      aria-pressed={voted}
      disabled={disabled}
      title={voted ? t.popularity.removeUpvote : t.popularity.upvoteHint}
      onClick={() => onVote(!voted)}
    >
      <ThumbsUp size={15} aria-hidden="true" />
      {t.popularity.useful} <span className="count">{upvotes}</span>
    </button>
  );
}

export function SortControl({
  value,
  onChange,
}: {
  value: CatalogSort;
  onChange: (sort: CatalogSort) => void;
}) {
  const { t } = useI18n();
  const options: { id: CatalogSort; label: string }[] = [
    { id: "popular", label: t.popularity.sortPopular },
    { id: "newest", label: t.popularity.sortNewest },
    { id: "name", label: t.popularity.sortName },
  ];

  return (
    <div
      className="sort-control"
      role="group"
      aria-label={t.popularity.sortAria}
    >
      <span className="sort-control-label">{t.popularity.sortLabel}</span>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`category-pill ${value === option.id ? "active" : ""}`}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function sortCatalog<
  T extends {
    pkg: { name: string };
    lastModifiedAt: string;
    ranking?: SkillRanking;
  },
>(skills: T[], sort: CatalogSort): T[] {
  const byName = (left: T, right: T) =>
    left.pkg.name.localeCompare(right.pkg.name);

  return [...skills].sort((left, right) => {
    if (sort === "name") return byName(left, right);
    if (sort === "newest") {
      return (
        Date.parse(right.lastModifiedAt) - Date.parse(left.lastModifiedAt) ||
        byName(left, right)
      );
    }
    return (
      (right.ranking?.score ?? 0) - (left.ranking?.score ?? 0) ||
      (right.ranking?.colleagues ?? 0) - (left.ranking?.colleagues ?? 0) ||
      byName(left, right)
    );
  });
}

const LEADERBOARD_SIZE = 10;

/**
 * Approved skills that at least one colleague installed or upvoted, ranked the
 * same way as the catalog's "Popular" sort. People are never ranked; each skill
 * names who made it.
 */
export function topSkills(catalog: CatalogSkill[]): CatalogSkill[] {
  return sortCatalog(
    catalog.filter(
      (skill) =>
        skill.latestApproved &&
        ((skill.ranking?.colleagues ?? 0) > 0 ||
          (skill.ranking?.upvotes ?? 0) > 0)
    ),
    "popular"
  ).slice(0, LEADERBOARD_SIZE);
}

/** The Leaderboard tab: the most popular skills, by colleagues and upvotes. */
export function LeaderboardTab({
  catalog,
  loading,
  onOpen,
}: {
  catalog: CatalogSkill[];
  loading: boolean;
  onOpen: (packageId: string) => void;
}) {
  const top = topSkills(catalog);
  const { t } = useI18n();

  return (
    <section
      className="admin-panel leaderboard-panel"
      aria-label={t.leaderboard.title}
    >
      <div className="admin-header">
        <div>
          <div className="panel-title">
            <Trophy size={17} />
            {t.leaderboard.title}
            <InfoTip text={t.leaderboard.intro} />
          </div>
        </div>
      </div>

      {loading && top.length === 0 ? (
        <div className="skill-list-loading" role="status" aria-live="polite">
          <Loader2 size={22} className="spin" aria-hidden="true" />
          <p>{t.leaderboard.loading}</p>
        </div>
      ) : top.length === 0 ? (
        <p className="empty-catalog-copy">{t.leaderboard.empty}</p>
      ) : (
        <ol className="leaderboard-list">
          {top.map((skill, index) => {
            const author =
              skill.latestApproved?.author ?? skill.activeVersion?.author;
            const mine = skill.ranking?.authoredByMe ?? false;
            return (
              <li
                key={skill.pkg.id}
                className={
                  mine
                    ? "leaderboard-row leaderboard-row--mine"
                    : "leaderboard-row"
                }
              >
                <span className="leaderboard-rank">{index + 1}</span>
                <span className="leaderboard-skill">
                  <button
                    type="button"
                    className="leaderboard-name"
                    onClick={() => onOpen(skill.pkg.id)}
                  >
                    {skill.pkg.name}
                  </button>
                  {author && (
                    <span className="leaderboard-author">
                      <User size={12} aria-hidden="true" />
                      {t.leaderboard.by(author)}
                      {mine && (
                        <em className="leaderboard-you">{t.leaderboard.you}</em>
                      )}
                    </span>
                  )}
                </span>
                <span className="leaderboard-stats">
                  <span>
                    <Users size={13} aria-hidden="true" />
                    <strong>{skill.ranking?.colleagues ?? 0}</strong>{" "}
                    {t.leaderboard.colleagues(skill.ranking?.colleagues ?? 0)}
                  </span>
                  <span>
                    <ThumbsUp size={13} aria-hidden="true" />
                    <strong>{skill.ranking?.upvotes ?? 0}</strong>{" "}
                    {t.leaderboard.upvotes(skill.ranking?.upvotes ?? 0)}
                  </span>
                  <span>
                    <Download size={13} aria-hidden="true" />
                    <strong>{skill.downloads}</strong>{" "}
                    {t.leaderboard.downloads(skill.downloads)}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
