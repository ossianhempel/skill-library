import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DownloadSparkline,
  SkillStatsMeta,
  formatSkillDate,
} from "./skill-stats.js";

afterEach(() => cleanup());

describe("skill stats", () => {
  it("formats skill dates for display", () => {
    expect(formatSkillDate("2026-06-07T12:00:00.000Z")).toBe("Jun 7, 2026");
    expect(formatSkillDate(new Date(0).toISOString())).toBe("—");
  });

  it("renders version, author, downloads, sparkline, and date metadata", () => {
    const { rerender } = render(
      <SkillStatsMeta
        version="1.2.0"
        author="Alice"
        downloads={42}
        downloadHistory={[
          { date: "2026-06-01", count: 1 },
          { date: "2026-06-02", count: 3 },
          { date: "2026-06-03", count: 2 },
        ]}
        uploadedAt="2026-06-07T10:00:00.000Z"
        lastModifiedAt="2026-06-07T12:00:00.000Z"
      />
    );

    expect(screen.getByText("1.2.0")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("Uploaded")).toBeTruthy();
    expect(screen.getByText("Last modified")).toBeTruthy();
    expect(screen.getByLabelText("Download trend")).toBeTruthy();

    // Rerender in compact mode to ensure "Uploaded" label is hidden
    rerender(
      <SkillStatsMeta
        version="1.2.0"
        author="Alice"
        downloads={42}
        downloadHistory={[
          { date: "2026-06-01", count: 1 },
          { date: "2026-06-02", count: 3 },
          { date: "2026-06-03", count: 2 },
        ]}
        uploadedAt="2026-06-07T10:00:00.000Z"
        lastModifiedAt="2026-06-07T12:00:00.000Z"
        compact
      />
    );

    expect(screen.queryByText("Uploaded")).toBeNull();
    expect(screen.getByText("Last modified")).toBeTruthy();
  });

  it("renders a sparkline svg", () => {
    const { container } = render(
      <DownloadSparkline
        history={[
          { date: "2026-06-01", count: 0 },
          { date: "2026-06-02", count: 4 },
          { date: "2026-06-03", count: 2 },
        ]}
      />
    );

    expect(container.querySelector("polyline")).toBeTruthy();
  });
});
