import { describe, expect, it } from "vitest";
import { rankWorkspace, type RankingSignals } from "./ranking.js";

const now = new Date("2026-06-07T12:00:00.000Z");
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

function signals(overrides: Partial<RankingSignals> = {}): RankingSignals {
  return {
    installs: [],
    votes: [],
    authors: [
      author("skill-a", "ada"),
      author("skill-b", "bo"),
      author("draft-c", "ada", false),
    ],
    ...overrides,
  };
}

function author(packageId: string, userId: string, approved = true) {
  return {
    packageId,
    userId,
    name: userId.toUpperCase(),
    image: null,
    approved,
  };
}

describe("rankWorkspace", () => {
  it("counts distinct colleagues, not repeated downloads", () => {
    const ranking = rankWorkspace(
      signals({
        installs: [
          { packageId: "skill-a", userId: "u1", lastAt: daysAgo(0) },
          { packageId: "skill-a", userId: "u1", lastAt: daysAgo(0) },
          { packageId: "skill-a", userId: "u2", lastAt: daysAgo(0) },
        ],
      }),
      { now }
    );

    expect(ranking.skills.find((s) => s.packageId === "skill-a")).toMatchObject(
      { colleagues: 2, score: 2 }
    );
  });

  it("ignores an author's own installs and upvotes", () => {
    const ranking = rankWorkspace(
      signals({
        installs: [{ packageId: "skill-a", userId: "ada", lastAt: daysAgo(0) }],
        votes: [{ packageId: "skill-a", userId: "ada" }],
      }),
      { now, viewerId: "ada" }
    );

    expect(ranking.skills.find((s) => s.packageId === "skill-a")).toMatchObject(
      { colleagues: 0, upvotes: 0, score: 0, authoredByMe: true }
    );
  });

  it("ranks recent installs above old ones and weighs upvotes", () => {
    const ranking = rankWorkspace(
      signals({
        installs: [
          { packageId: "skill-a", userId: "u1", lastAt: daysAgo(60) },
          { packageId: "skill-a", userId: "u2", lastAt: daysAgo(60) },
          { packageId: "skill-b", userId: "u3", lastAt: daysAgo(1) },
        ],
        votes: [{ packageId: "skill-b", userId: "u1" }],
      }),
      { now, viewerId: "u1" }
    );

    const [first, second] = ranking.skills;
    expect(first).toMatchObject({
      packageId: "skill-b",
      upvotes: 1,
      votedByMe: true,
    });
    // Two installs at two half-lives each weigh a quarter.
    expect(second).toMatchObject({ packageId: "skill-a", score: 0.5 });
  });

  it("credits authors with their approved skills only", () => {
    const ranking = rankWorkspace(
      signals({
        installs: [
          { packageId: "skill-a", userId: "bo", lastAt: daysAgo(0) },
          { packageId: "skill-a", userId: "u1", lastAt: daysAgo(0) },
          { packageId: "skill-b", userId: "u1", lastAt: daysAgo(0) },
          { packageId: "draft-c", userId: "u2", lastAt: daysAgo(0) },
        ],
        votes: [{ packageId: "skill-a", userId: "u1" }],
      }),
      { now }
    );

    expect(ranking.contributors).toEqual([
      {
        userId: "ada",
        name: "ADA",
        image: null,
        skills: 1,
        colleaguesReached: 2,
        upvotes: 1,
        score: 4,
      },
      {
        userId: "bo",
        name: "BO",
        image: null,
        skills: 1,
        colleaguesReached: 1,
        upvotes: 0,
        score: 1,
      },
    ]);
  });

  it("excludes an author without a profile but keeps them off the leaderboard", () => {
    const ranking = rankWorkspace(
      signals({
        authors: [{ ...author("skill-a", "ci-key"), name: null }],
        installs: [
          { packageId: "skill-a", userId: "ci-key", lastAt: daysAgo(0) },
          { packageId: "skill-a", userId: "u1", lastAt: daysAgo(0) },
        ],
      }),
      { now, viewerId: "ci-key" }
    );

    expect(ranking.skills[0]).toMatchObject({
      packageId: "skill-a",
      colleagues: 1,
      authoredByMe: true,
    });
    expect(ranking.contributors).toEqual([]);
  });
});
