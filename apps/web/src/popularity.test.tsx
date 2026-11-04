import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SkillRanking } from "@skill-library/domain";
import { LOCALE_STORAGE_KEY, LocaleProvider } from "./i18n/locale.js";
import type { CatalogSkill } from "./types.js";
import {
  LeaderboardTab,
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

const catalogSkill = (
  name: string,
  overrides: Partial<SkillRanking>
): CatalogSkill =>
  ({
    pkg: { id: `id-${name}`, name },
    latestApproved: { author: `Author of ${name}` },
    downloads: 3,
    lastModifiedAt: "2026-06-01T00:00:00.000Z",
    ranking: ranking({ packageId: `id-${name}`, ...overrides }),
  }) as unknown as CatalogSkill;

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

  it("ranks approved skills by colleagues and upvotes and names their author", () => {
    const onOpen = vi.fn();
    const catalog = [
      catalogSkill("quiet", { colleagues: 1, score: 1 }),
      catalogSkill("loved", { colleagues: 1, upvotes: 2, score: 5 }),
      catalogSkill("mine", { colleagues: 2, score: 2, authoredByMe: true }),
      catalogSkill("unused", {}),
      {
        ...catalogSkill("draft", { colleagues: 9, score: 9 }),
        latestApproved: undefined,
      },
      ...Array.from({ length: 10 }, (_, index) =>
        catalogSkill(`extra-${index}`, { colleagues: 1, score: 0.5 })
      ),
    ];

    render(
      <LeaderboardTab catalog={catalog} loading={false} onOpen={onOpen} />
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(10);
    expect(
      rows.map((row) => row.querySelector("button")?.textContent).slice(0, 3)
    ).toEqual(["loved", "mine", "quiet"]);
    expect(screen.queryByText("unused")).toBeNull();
    expect(screen.queryByText("draft")).toBeNull();
    expect(rows[0]?.textContent).toContain("by Author of loved");
    expect(rows[0]?.textContent).toContain("2 upvotes");
    expect(rows[1]?.textContent).toContain("(yours)");

    fireEvent.click(screen.getByRole("button", { name: "loved" }));
    expect(onOpen).toHaveBeenCalledWith("id-loved");
  });

  it("speaks Swedish when the Swedish locale is chosen", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "sv");
    render(
      <LocaleProvider>
        <PopularityLine ranking={ranking({ colleagues: 3, upvotes: 2 })} />
        <UpvoteButton ranking={ranking({ upvotes: 2 })} onVote={() => {}} />
        <LeaderboardTab
          catalog={[
            catalogSkill("Ada", { colleagues: 1, upvotes: 1, score: 3 }),
          ]}
          loading={false}
          onOpen={() => {}}
        />
      </LocaleProvider>
    );

    expect(screen.getByText("Installerad av 3 kollegor")).toBeTruthy();
    expect(screen.getByText("2 tycker att den är användbar")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Användbar/ })).toBeTruthy();
    expect(screen.getByText("Populäraste skills")).toBeTruthy();
    expect(screen.getByText("kollega använder den")).toBeTruthy();
    expect(screen.getByText("av Author of Ada")).toBeTruthy();
  });
});
