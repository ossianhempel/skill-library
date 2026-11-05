import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SkillMeta, formatSkillDate } from "./skill-stats.js";

afterEach(() => cleanup());

describe("skill stats", () => {
  it("formats skill dates for display", () => {
    expect(formatSkillDate("2026-06-07T12:00:00.000Z")).toBe("Jun 7, 2026");
    expect(formatSkillDate(new Date(0).toISOString())).toBe("—");
  });

  it("shows author, usage and categories on one line", () => {
    render(
      <SkillMeta
        author="Alice"
        categories={["sales"]}
        ranking={{
          packageId: "p",
          score: 1,
          colleagues: 3,
          upvotes: 2,
          votedByMe: false,
          authoredByMe: false,
        }}
      />
    );

    expect(screen.getByText("by Alice")).toBeTruthy();
    expect(screen.getByText("Installed by 3 colleagues")).toBeTruthy();
    expect(screen.getByText("2 found it useful")).toBeTruthy();
    expect(screen.getByText("Sales")).toBeTruthy();
    expect(screen.queryByText(/Version/)).toBeNull();
  });

  it("adds version and last change in the detail view", () => {
    render(
      <SkillMeta
        author="Alice"
        version="1.2.0"
        updatedAt="2026-06-07T12:00:00.000Z"
      />
    );

    expect(screen.getByText("Version 1.2.0")).toBeTruthy();
    expect(screen.getByText("Updated Jun 7, 2026")).toBeTruthy();
  });
});
