import { Loader2, ThumbsUp, Trophy, User, Users } from "lucide-react";
import type { ContributorRanking, SkillRanking } from "@skill-library/domain";
import type { CatalogSort, WebApiClient } from "../types.js";
import { useContributors } from "../hooks/use-contributors.js";
import { useI18n } from "../i18n/locale.js";

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

export function ContributorsPanel({
  contributors,
  loading,
  currentUserId,
}: {
  contributors: ContributorRanking[] | undefined;
  loading: boolean;
  currentUserId?: string;
}) {
  const top = (contributors ?? []).slice(0, LEADERBOARD_SIZE);
  const { t } = useI18n();

  return (
    <section
      className="admin-panel contributors-panel"
      aria-label={t.leaderboard.title}
    >
      <div className="admin-header">
        <div>
          <div className="panel-title">
            <Trophy size={17} />
            {t.leaderboard.title}
          </div>
          <p className="contributors-intro">{t.leaderboard.intro}</p>
        </div>
      </div>

      {loading && !contributors ? (
        <div className="skill-list-loading" role="status" aria-live="polite">
          <Loader2 size={22} className="spin" aria-hidden="true" />
          <p>{t.leaderboard.loading}</p>
        </div>
      ) : top.length === 0 ? (
        <p className="empty-catalog-copy">{t.leaderboard.empty}</p>
      ) : (
        <ol className="contributors-list">
          {top.map((contributor, index) => (
            <li
              key={contributor.userId}
              className={
                contributor.userId === currentUserId
                  ? "contributor-row contributor-row--me"
                  : "contributor-row"
              }
            >
              <span className="contributor-rank">{index + 1}</span>
              <span className="session-avatar" aria-hidden="true">
                {contributor.image ? (
                  <img src={contributor.image} alt="" />
                ) : (
                  <User size={16} />
                )}
              </span>
              <span className="contributor-name">
                {contributor.name}
                {contributor.userId === currentUserId && (
                  <em className="contributor-you">{t.leaderboard.you}</em>
                )}
              </span>
              <span className="contributor-stats">
                <span>
                  <strong>{contributor.skills}</strong>{" "}
                  {t.leaderboard.skills(contributor.skills)}
                </span>
                <span>
                  <strong>{contributor.colleaguesReached}</strong>{" "}
                  {t.leaderboard.colleaguesReached(
                    contributor.colleaguesReached
                  )}
                </span>
                <span>
                  <strong>{contributor.upvotes}</strong>{" "}
                  {t.leaderboard.upvotes(contributor.upvotes)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** The Leaderboard tab: loads the ranking each time it is opened. */
export function LeaderboardTab({
  apiClient,
  workspaceId,
  currentUserId,
}: {
  apiClient: WebApiClient;
  workspaceId: string;
  currentUserId?: string;
}) {
  const { contributors, loading } = useContributors({
    apiClient,
    workspaceId,
    active: true,
  });

  return (
    <ContributorsPanel
      contributors={contributors}
      loading={loading}
      currentUserId={currentUserId}
    />
  );
}
