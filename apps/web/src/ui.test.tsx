import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REGISTRY_BRANDING, type PackageReport, type SkillPackage, type SkillVersion } from "@skill-library/domain";
import {
  buildInstallPrompt,
  buildUploadRequest,
  resolvePublishInput,
  filesToPackageEntries,
  loadCatalogSkills,
  pickActiveVersion,
  renderCatalogTitle,
  renderLifecycleBadge,
  SkillLibraryApp,
  summarizeReports,
  type WebApiClient
} from "./ui.js";

afterEach(() => cleanup());

describe("SkillLibraryApp", () => {
  it("renders a focused overview and opens the main sections through navigation", () => {
    render(<SkillLibraryApp skills={[skill]} branding={testBranding} />);

    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByText("Rebtech skill registry")).toBeTruthy();
    expect(screen.getByText("Start here")).toBeTruthy();
    expect(screen.getByText("Find an approved skill or publish a new draft.")).toBeTruthy();
    
    // In simplified UI, detail pane is hidden on Overview tab
    expect(screen.queryByText("SKILL.md")).toBeNull();
    expect(screen.queryByText(/skill-library install review-helper/)).toBeNull();

    expect(screen.queryByText("Publish local folder")).toBeNull();
    expect(screen.queryByText("Adoption report")).toBeNull();

    // Catalog view shows the list, details, and installation prompt
    fireEvent.click(screen.getByRole("button", { name: "Catalog" }));
    expect(screen.getAllByText("Review Helper").length).toBeGreaterThan(0);
    expect(screen.getByText("SKILL.md")).toBeTruthy();
    expect(screen.getByText(/skill-library install review-helper/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.getByText("Publish local folder")).toBeTruthy();
    expect(screen.queryByText("SKILL.md")).toBeNull(); // Hidden in publish tab

    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    expect(screen.getByText("Adoption report")).toBeTruthy();
    expect(screen.queryByText("SKILL.md")).toBeNull(); // Hidden in reports tab
  });

  it("keeps existing formatter helpers", () => {
    expect(renderCatalogTitle([skill.pkg])).toBe("Skill Library (1)");
    expect(renderLifecycleBadge(skill.latestApproved!)).toBe("APPROVED");
    expect(buildInstallPrompt("review-helper", "workspace-1", "https://skills.example.com", "project")).toContain("--target project");
    expect(buildUploadRequest("review-helper", "1.2.0")).toEqual(expect.objectContaining({ packageName: "Review Helper", version: "1.2.0" }));
    expect(resolvePublishInput({ packageSlug: "review-helper", packageName: "", description: "", version: "1.2.0" })).toEqual({
      packageSlug: "review-helper",
      packageName: "Review Helper",
      description: "Internal review-helper skill package.",
      version: "1.2.0"
    });
    expect(() => resolvePublishInput({ packageSlug: "", packageName: "", description: "", version: "" })).toThrow("Skill slug is required.");
    expect(summarizeReports([report])).toEqual({ packages: 1, installs: 4, currentInstalls: 3, staleInstalls: 1 });
  });

  it("prefers the newest pending version over an older approved version", () => {
    const approved = { ...latestApproved, id: "version-approved", createdAt: "2026-06-07T10:00:00.000Z" };
    const draft = {
      ...latestApproved,
      id: "version-draft",
      version: "1.3.0",
      lifecycleState: "draft" as const,
      createdAt: "2026-06-07T11:00:00.000Z"
    };

    expect(pickActiveVersion(approved, [approved, draft])).toEqual(draft);
  });

  it("loads catalog skills and reports from the API client", async () => {
    await expect(loadCatalogSkills(fakeApi(), "workspace-1", "review")).resolves.toEqual([
      expect.objectContaining({
        pkg,
        latestApproved,
        files: ["SKILL.md"],
        installs: 4,
        downloads: 9,
        staleInstalls: 1
      })
    ]);
  });

  it("runs upload, Git import, and lifecycle actions through the API client", async () => {
    const api = fakeApi();
    const { container } = render(<SkillLibraryApp api={api} authToken="test-token" workspaceId="workspace-1" />);

    await waitFor(() => expect(api.search).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    fireEvent.change(screen.getAllByPlaceholderText("my-skill")[0], { target: { value: "review-helper" } });
    fireEvent.change(screen.getByPlaceholderText("1.0.0"), { target: { value: "1.0.0" } });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["# Review\n"], "SKILL.md", { type: "text/markdown" })] } });
    await screen.findByText(/1 files staged for upload/);

    fireEvent.click(screen.getByRole("button", { name: /Upload skill/ }));
    await waitFor(() => expect(api.uploadVersion).toHaveBeenCalledWith("workspace-1", expect.objectContaining({ entries: [{ path: "SKILL.md", content: "# Review\n" }] })));

    fireEvent.change(screen.getByPlaceholderText("https://github.com/org/skills.git"), { target: { value: "/path/to/skills.git" } });
    fireEvent.change(screen.getAllByPlaceholderText("main")[0], { target: { value: "main" } });
    fireEvent.change(screen.getAllByPlaceholderText("my-skill")[1], { target: { value: "review-helper" } });
    fireEvent.click(screen.getByText("Import"));
    await waitFor(() => expect(api.importGitVersion).toHaveBeenCalled());

    // Switch to Catalog to manage lifecycle controls
    fireEvent.click(screen.getByRole("button", { name: "Catalog" }));
    fireEvent.click(screen.getByText("Hide"));
    await waitFor(() => expect(api.transitionVersion).toHaveBeenCalledWith("version-1", "hidden"));
  });

  it("converts selected browser files to package-tree entries", async () => {
    await expect(filesToPackageEntries([new File(["# Demo\n"], "SKILL.md")])).resolves.toEqual([{ path: "SKILL.md", content: "# Demo\n" }]);
  });
});

const pkg: SkillPackage = {
  id: "package-1",
  workspaceId: "workspace-1",
  slug: "review-helper",
  name: "Review Helper",
  description: "Review local changes.",
  categories: ["review"],
  createdAt: "2026-06-07T12:00:00.000Z",
  updatedAt: "2026-06-07T12:00:00.000Z"
};

const latestApproved: SkillVersion = {
  id: "version-1",
  packageId: "package-1",
  version: "1.0.0",
  lifecycleState: "approved",
  artifactDigest: "sha256:one",
  validation: { ok: true, files: [{ path: "SKILL.md", size: 9, digest: "sha256:file", kind: "file" }], issues: [] },
  provenance: { kind: "upload", importedAt: "2026-06-07T12:00:00.000Z" },
  createdAt: "2026-06-07T12:00:00.000Z",
  approvedAt: "2026-06-07T12:05:00.000Z"
};

const report: PackageReport = {
  packageId: "package-1",
  workspaceId: "workspace-1",
  versionCount: 1,
  latestApprovedVersionId: "version-1",
  views: 12,
  downloads: 9,
  installs: {
    total: 4,
    byState: {
      current: 3,
      stale: 1,
      deprecated: 0,
      hidden: 0,
      "unknown-registry": 0,
      "missing-metadata": 0,
      "modified-local-content": 0
    }
  }
};

const testBranding = {
  ...DEFAULT_REGISTRY_BRANDING,
  registryTagline: "Rebtech skill registry",
  companyName: "Rebtech",
  registryPublicUrl: "https://skills.rebtech.se"
};

const skill = {
  pkg,
  latestApproved,
  activeVersion: latestApproved,
  validation: { ok: true, files: [], issues: [] },
  files: ["SKILL.md"],
  installs: 3,
  downloads: 9,
  staleInstalls: 1,
  report
};

function fakeApi(): WebApiClient {
  return {
    search: vi.fn(async () => [pkg]),
    latestApprovedVersion: vi.fn(async () => latestApproved),
    packageVersions: vi.fn(async () => [latestApproved]),
    workspaceReports: vi.fn(async () => [report]),
    uploadVersion: vi.fn(async () => latestApproved),
    importGitVersion: vi.fn(async () => latestApproved),
    transitionVersion: vi.fn(async (_versionId, toState) => ({ ...latestApproved, lifecycleState: toState }))
  };
}
