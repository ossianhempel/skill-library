import type { SkillPackageId } from "./index.js";

/**
 * Raw, per-person signals the ranking is computed from. Every entry names a signed-in
 * user, so the ranking counts people rather than raw events: one colleague
 * downloading a skill ten times counts once.
 */
export interface RankingSignals {
  /** One row per (skill, person) who downloaded it, with their latest download. */
  installs: { packageId: SkillPackageId; userId: string; lastAt: string }[];
  /** One row per upvote; a person can upvote a skill at most once. */
  votes: { packageId: SkillPackageId; userId: string }[];
  /** People who published a version of a skill, resolved to user accounts. */
  authors: {
    packageId: SkillPackageId;
    userId: string;
    /** Null when no user account matches, such as a static API key. */
    name: string | null;
    image: string | null;
    approved: boolean;
  }[];
}

export interface SkillRanking {
  packageId: SkillPackageId;
  /** Distinct colleagues (never the skill's own authors) who installed it. */
  colleagues: number;
  upvotes: number;
  score: number;
  votedByMe: boolean;
  authoredByMe: boolean;
}

export interface ContributorRanking {
  userId: string;
  name: string;
  image: string | null;
  /** Approved skills this person published. */
  skills: number;
  /** Distinct colleagues who installed any of their approved skills. */
  colleaguesReached: number;
  upvotes: number;
  score: number;
}

export interface WorkspaceRanking {
  skills: SkillRanking[];
  contributors: ContributorRanking[];
}

/** A colleague's install loses half its weight every this many days. */
export const RANKING_HALF_LIFE_DAYS = 30;
/** One upvote counts as much as this many fresh installs. */
export const RANKING_UPVOTE_WEIGHT = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Score skills and their authors. A skill's score is the sum, over distinct
 * colleagues who installed it, of a weight that halves every
 * RANKING_HALF_LIFE_DAYS since their latest download, plus RANKING_UPVOTE_WEIGHT
 * per upvote. Authors' own installs and votes never count. An author's score is
 * the sum of their approved skills' scores.
 */
export function rankWorkspace(
  signals: RankingSignals,
  options: { now: Date; viewerId?: string }
): WorkspaceRanking {
  const authorsByPackage = new Map<string, Set<string>>();
  for (const author of signals.authors) {
    const set = authorsByPackage.get(author.packageId) ?? new Set<string>();
    set.add(author.userId);
    authorsByPackage.set(author.packageId, set);
  }
  const isAuthor = (packageId: string, userId: string) =>
    authorsByPackage.get(packageId)?.has(userId) ?? false;

  const skills = new Map<string, SkillRanking & { installers: Set<string> }>();
  const skillFor = (packageId: string) => {
    let skill = skills.get(packageId);
    if (!skill) {
      skill = {
        packageId,
        colleagues: 0,
        upvotes: 0,
        score: 0,
        votedByMe: false,
        authoredByMe:
          options.viewerId !== undefined &&
          isAuthor(packageId, options.viewerId),
        installers: new Set(),
      };
      skills.set(packageId, skill);
    }
    return skill;
  };

  for (const packageId of authorsByPackage.keys()) {
    skillFor(packageId);
  }

  for (const install of signals.installs) {
    if (isAuthor(install.packageId, install.userId)) continue;
    const skill = skillFor(install.packageId);
    if (skill.installers.has(install.userId)) continue;
    skill.installers.add(install.userId);
    const ageDays = Math.max(
      0,
      (options.now.getTime() - Date.parse(install.lastAt)) / DAY_MS
    );
    skill.colleagues += 1;
    skill.score += Math.pow(0.5, ageDays / RANKING_HALF_LIFE_DAYS);
  }

  const voters = new Set<string>();
  for (const vote of signals.votes) {
    const key = `${vote.packageId}\u0000${vote.userId}`;
    if (voters.has(key) || isAuthor(vote.packageId, vote.userId)) continue;
    voters.add(key);
    const skill = skillFor(vote.packageId);
    skill.upvotes += 1;
    skill.score += RANKING_UPVOTE_WEIGHT;
    if (vote.userId === options.viewerId) skill.votedByMe = true;
  }

  const contributors = new Map<
    string,
    ContributorRanking & { reached: Set<string>; packages: Set<string> }
  >();
  for (const author of signals.authors) {
    if (!author.approved || author.name === null) continue;
    let contributor = contributors.get(author.userId);
    if (!contributor) {
      contributor = {
        userId: author.userId,
        name: author.name,
        image: author.image,
        skills: 0,
        colleaguesReached: 0,
        upvotes: 0,
        score: 0,
        reached: new Set(),
        packages: new Set(),
      };
      contributors.set(author.userId, contributor);
    }
    if (contributor.packages.has(author.packageId)) continue;
    contributor.packages.add(author.packageId);
    const skill = skillFor(author.packageId);
    contributor.skills += 1;
    contributor.upvotes += skill.upvotes;
    contributor.score += skill.score;
    for (const installer of skill.installers) {
      if (installer !== author.userId) contributor.reached.add(installer);
    }
  }

  return {
    skills: [...skills.values()]
      .map(({ installers: _installers, ...skill }) => ({
        ...skill,
        score: round(skill.score),
      }))
      .sort(
        (left, right) =>
          right.score - left.score || right.colleagues - left.colleagues
      ),
    contributors: [...contributors.values()]
      .map(({ reached, packages: _packages, ...contributor }) => ({
        ...contributor,
        colleaguesReached: reached.size,
        score: round(contributor.score),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.colleaguesReached - left.colleaguesReached ||
          left.name.localeCompare(right.name)
      ),
  };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
