import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SkillRanking } from "@skill-library/domain";
import { LOCALE_STORAGE_KEY, LocaleProvider } from "./i18n/locale.js";
import {
  ContributorsPanel,
  PopularityLine,
  UpvoteButton,
  sortCatalog,
} from "./components/popularity.js";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const ranking = (overrides: Partial<SkillRanking> = {}): SkillRanking => ({
  packageId: "p",
  colleagues: 0,
  upvotes: 0,
  score: 0,
  votedByMe: false,
  authoredByMe: false,
  ...overrides,
});

const skill = (name: string, lastModifiedAt: string, score?: number) => ({
  pkg: { name },
  lastModifiedAt,
  ranking: score === undefined ? undefined : ranking({ score }),
});

describe("popularity", () => {
  it("sorts by score, newest, or name", () => {
    const skills = [
      skill("Bravo", "2026-06-01T00:00:00.000Z", 1),
      skill("Alpha", "2026-06-03T00:00:00.000Z"),
      skill("Charlie", "2026-06-02T00:00:00.000Z", 5),
    ];
    const names = (sorted: typeof skills) => sorted.map((s) => s.pkg.name);

    expect(names(sortCatalog(skills, "popular"))).toEqual([
      "Charlie",
      "Bravo",
      "Alpha",
    ]);
    expect(names(sortCatalog(skills, "newest"))).toEqual([
      "Alpha",
      "Charlie",
      "Bravo",
    ]);
    expect(names(sortCatalog(skills, "name"))).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("says how many colleagues installed a skill in plain words", () => {
    const { rerender } = render(<PopularityLine />);
    expect(
      screen.getByText("No colleagues have installed this yet")
    ).toBeTruthy();

    rerender(<PopularityLine ranking={ranking({ colleagues: 1 })} />);
    expect(screen.getByText("Installed by 1 colleague")).toBeTruthy();

    rerender(
      <PopularityLine ranking={ranking({ colleagues: 7, upvotes: 2 })} />
    );
    expect(screen.getByText("Installed by 7 colleagues")).toBeTruthy();
    expect(screen.getByText("2 found it useful")).toBeTruthy();
  });

  it("toggles an upvote, and never offers one on your own skill", () => {
    const onVote = vi.fn();
    const { rerender } = render(
      <UpvoteButton ranking={ranking({ upvotes: 3 })} onVote={onVote} />
    );

    const button = screen.getByRole("button", { name: /useful/i });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(onVote).toHaveBeenCalledWith(true);

    rerender(
      <UpvoteButton
        ranking={ranking({ upvotes: 4, votedByMe: true })}
        onVote={onVote}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /useful/i }));
    expect(onVote).toHaveBeenLastCalledWith(false);

    rerender(
      <UpvoteButton
        ranking={ranking({ upvotes: 4, authoredByMe: true })}
        onVote={onVote}
      />
    );
    expect(screen.queryByRole("button", { name: /useful/i })).toBeNull();
    expect(screen.getByText(/4 useful/)).toBeTruthy();
  });

  it("lists the top ten contributors and marks you", () => {
    const contributors = Array.from({ length: 12 }, (_, index) => ({
      userId: `u${index}`,
      name: `Person ${index}`,
      image: null,
      skills: 1,
      colleaguesReached: 12 - index,
      upvotes: 0,
      score: 12 - index,
    }));

    render(
      <ContributorsPanel
        contributors={contributors}
        loading={false}
        currentUserId="u1"
      />
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText("(you)")).toBeTruthy();
    expect(screen.queryByText("Person 11")).toBeNull();
  });

  it("speaks Swedish when the Swedish locale is chosen", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "sv");
    render(
      <LocaleProvider>
        <PopularityLine ranking={ranking({ colleagues: 3, upvotes: 2 })} />
        <UpvoteButton ranking={ranking({ upvotes: 2 })} onVote={() => {}} />
        <ContributorsPanel
          contributors={[
            {
              userId: "u1",
              name: "Ada",
              image: null,
              skills: 2,
              colleaguesReached: 1,
              upvotes: 1,
              score: 3,
            },
          ]}
          loading={false}
        />
      </LocaleProvider>
    );

    expect(screen.getByText("Installerad av 3 kollegor")).toBeTruthy();
    expect(screen.getByText("2 tycker att den är användbar")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Användbar/ })).toBeTruthy();
    expect(screen.getByText("Flitigaste bidragsgivarna")).toBeTruthy();
    expect(screen.getByText("kollega nådd")).toBeTruthy();
    expect(screen.getByText("skills")).toBeTruthy();
  });
});
