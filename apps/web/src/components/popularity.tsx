import { Loader2, ThumbsUp, Trophy, User, Users } from "lucide-react";
import type { ContributorRanking, SkillRanking } from "@skill-library/domain";
import type { CatalogSort } from "../types.js";

export function colleaguesLabel(count: number) {
  if (count === 0) return "No colleagues have installed this yet";
  return `Installed by ${count} ${count === 1 ? "colleague" : "colleagues"}`;
}

/** One plain line: how many colleagues use the skill, and how many found it useful. */
export function PopularityLine({ ranking }: { ranking?: SkillRanking }) {
  const colleagues = ranking?.colleagues ?? 0;
  const upvotes = ranking?.upvotes ?? 0;

  return (
    <p className="popularity-line">
      <Users size={14} aria-hidden="true" />
      <span>{colleaguesLabel(colleagues)}</span>
      {upvotes > 0 && (
        <>
          <ThumbsUp size={13} aria-hidden="true" />
          <span>{upvotes} found it useful</span>
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

  if (ranking?.authoredByMe) {
    return (
      <span className="upvote-button upvote-button--own" title="Your skill">
        <ThumbsUp size={15} aria-hidden="true" />
        {upvotes} useful
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`upvote-button ${voted ? "active" : ""}`}
      aria-pressed={voted}
      disabled={disabled}
      title={voted ? "Remove your upvote" : "Upvote if this skill helped you"}
      onClick={() => onVote(!voted)}
    >
      <ThumbsUp size={15} aria-hidden="true" />
      Useful <span className="count">{upvotes}</span>
    </button>
  );
}

const SORT_OPTIONS: { id: CatalogSort; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "newest", label: "Newest" },
  { id: "name", label: "A–Z" },
];

export function SortControl({
  value,
  onChange,
}: {
  value: CatalogSort;
  onChange: (sort: CatalogSort) => void;
}) {
  return (
    <div className="sort-control" role="group" aria-label="Sort skills">
      <span className="sort-control-label">Sort</span>
      {SORT_OPTIONS.map((option) => (
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

  return (
    <section
      className="admin-panel contributors-panel"
      aria-label="Top contributors"
    >
      <div className="admin-header">
        <div>
          <div className="panel-title">
            <Trophy size={17} />
            Top contributors
          </div>
          <p className="contributors-intro">
            Colleagues whose skills others install and find useful. Recent
            installs count most.
          </p>
        </div>
      </div>

      {loading && !contributors ? (
        <div className="skill-list-loading" role="status" aria-live="polite">
          <Loader2 size={22} className="spin" aria-hidden="true" />
          <p>Loading contributors…</p>
        </div>
      ) : top.length === 0 ? (
        <p className="empty-catalog-copy">
          No approved skills yet. Publish one and you could be first here.
        </p>
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
                  <em className="contributor-you"> (you)</em>
                )}
              </span>
              <span className="contributor-stats">
                <span>
                  <strong>{contributor.skills}</strong>{" "}
                  {contributor.skills === 1 ? "skill" : "skills"}
                </span>
                <span>
                  <strong>{contributor.colleaguesReached}</strong>{" "}
                  {contributor.colleaguesReached === 1
                    ? "colleague reached"
                    : "colleagues reached"}
                </span>
                <span>
                  <strong>{contributor.upvotes}</strong>{" "}
                  {contributor.upvotes === 1 ? "upvote" : "upvotes"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
