import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_REGISTRY_BRANDING,
  type SkillPackage,
  type SkillVersion,
} from "@skill-library/domain";
import { SkillLibraryApp, type CatalogSkill } from "./ui.js";

afterEach(() => cleanup());

const branding = {
  ...DEFAULT_REGISTRY_BRANDING,
  registryPublicUrl: "https://skills.example.com",
};

function approvedSkill(): CatalogSkill {
  const pkg: SkillPackage = {
    id: "package-review-helper",
    workspaceId: "workspace-1",
    slug: "review-helper",
    name: "Review Helper",
    description: "Reviews code.",
    categories: [],
    createdAt: "2026-06-07T12:00:00.000Z",
    updatedAt: "2026-06-07T12:00:00.000Z",
  };
  const version: SkillVersion = {
    id: "version-1",
    packageId: pkg.id,
    version: "1.0.0",
    lifecycleState: "approved",
    artifactDigest: "sha256:one",
    validation: { ok: true, files: [], issues: [] },
    provenance: { kind: "upload", importedAt: "2026-06-07T12:00:00.000Z" },
    createdAt: "2026-06-07T12:00:00.000Z",
  };

  return {
    pkg,
    latestApproved: version,
    activeVersion: version,
    files: ["SKILL.md"],
    installs: 0,
    downloads: 0,
    downloadHistory: [],
    lastModifiedAt: "2026-06-07T12:00:00.000Z",
    staleInstalls: 0,
  };
}

describe("non-technical install path", () => {
  it("explains the three steps on the overview, with developer setup tucked away", () => {
    render(<SkillLibraryApp skills={[approvedSkill()]} branding={branding} />);

    expect(screen.getByText("How it works")).toBeTruthy();
    expect(screen.getByText("Add it to Claude")).toBeTruthy();
    expect(
      screen.getByText(/For developers: connect Claude Code/).closest("details")
        ?.open
    ).toBe(false);
  });

  it("leads the skill detail with Claude app steps and a Claude-ready download", () => {
    render(<SkillLibraryApp skills={[approvedSkill()]} branding={branding} />);
    fireEvent.click(screen.getByRole("button", { name: "Catalog" }));

    expect(screen.getByText("Add this skill to Claude")).toBeTruthy();
    expect(screen.getByText("review-helper.zip")).toBeTruthy();
    const download = screen.getByRole("link", { name: /Download for Claude/ });
    const url = new URL(download.getAttribute("href") ?? "");
    expect(url.pathname).toBe("/api/artifacts/sha256%3Aone/download");
    expect(url.searchParams.get("layout")).toBe("claude-app");
    expect(
      screen.getByText(/Install with a prompt instead/).closest("details")?.open
    ).toBe(false);
  });
});
