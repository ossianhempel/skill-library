import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_REGISTRY_BRANDING,
  type SkillPackage,
  type SkillVersion,
} from "@skill-library/domain";
import { SkillLibraryApp, type CatalogSkill, type WebApiClient } from "./ui.js";

afterEach(() => cleanup());

describe("shareable skill URLs", () => {
  it("reflects the selected skill in a shareable URL and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <SkillLibraryApp
        skills={[catalogSkill("review-helper", "Review Helper")]}
        workspaceId="workspace-1"
        branding={testBranding}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Catalog" }));

    await waitFor(() =>
      expect(window.location.pathname).toBe("/s/workspace-1/review-helper")
    );

    fireEvent.click(screen.getByRole("button", { name: /Copy link/i }));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/s/workspace-1/review-helper`
    );
    expect(screen.getByRole("button", { name: /Copied/i })).toBeTruthy();
  });

  it("builds the share URL from the skill's own workspace, not the app's", async () => {
    // Mirrors a mid-switch state: app workspace differs from the selected skill's
    // workspace. The URL must use the skill's workspace, never the stale combo.
    render(
      <SkillLibraryApp
        skills={[catalogSkill("review-helper", "Review Helper")]}
        workspaceId="different-ws"
        branding={testBranding}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Catalog" }));

    await waitFor(() =>
      expect(window.location.pathname).toBe("/s/workspace-1/review-helper")
    );
  });

  it("selects the deep-linked skill from a shared URL on load", async () => {
    window.history.replaceState(null, "", "/s/workspace-1/deploy-helper");

    render(
      <SkillLibraryApp
        skills={[
          catalogSkill("review-helper", "Review Helper"),
          catalogSkill("deploy-helper", "Deploy Helper"),
        ]}
        workspaceId="workspace-1"
        branding={testBranding}
      />
    );

    // Lands on the catalog with the deep-linked skill selected (not the first).
    await waitFor(() =>
      expect(
        screen.getByText(/npx @skill-library\/cli install deploy-helper/)
      ).toBeTruthy()
    );
  });

  it("re-selects the matching skill on back/forward navigation", async () => {
    render(
      <SkillLibraryApp
        skills={[
          catalogSkill("review-helper", "Review Helper"),
          catalogSkill("deploy-helper", "Deploy Helper"),
        ]}
        workspaceId="workspace-1"
        branding={testBranding}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Catalog" }));
    await waitFor(() =>
      expect(window.location.pathname).toBe("/s/workspace-1/review-helper")
    );

    // Navigate to the second skill — this pushes a new history entry.
    fireEvent.click(screen.getByText("Deploy Helper"));
    await waitFor(() =>
      expect(window.location.pathname).toBe("/s/workspace-1/deploy-helper")
    );

    // Simulate the browser back button returning to the first skill.
    window.history.replaceState(null, "", "/s/workspace-1/review-helper");
    fireEvent.popState(window);

    await waitFor(() =>
      expect(
        screen.getByText(/npx @skill-library\/cli install review-helper/)
      ).toBeTruthy()
    );
    // The popstate selection must not push a new entry over the popped URL.
    expect(window.location.pathname).toBe("/s/workspace-1/review-helper");
  });

  it("keeps a same-workspace skill URL reached before the catalog loads", async () => {
    // A controllable catalog load: search stays pending until we resolve it.
    let resolveSearch: (packages: SkillPackage[]) => void = () => {};
    const searchPromise = new Promise<SkillPackage[]>((resolve) => {
      resolveSearch = resolve;
    });
    const version = approvedVersion("pkg-rh");
    const api: WebApiClient = {
      search: vi.fn(() => searchPromise),
      latestApprovedVersion: vi.fn(async () => version),
      packageVersions: vi.fn(async () => [version]),
      workspaceCatalogStats: vi.fn(async () => []),
      workspaceReports: vi.fn(async () => []),
      uploadVersion: vi.fn(),
      importGitVersion: vi.fn(),
      validatePackageTree: vi.fn(),
      transitionVersion: vi.fn(),
    };

    render(
      <SkillLibraryApp
        api={api}
        authToken="test-token"
        workspaceId="workspace-1"
        branding={testBranding}
      />
    );

    // Forward to a valid skill URL while the catalog is still loading.
    window.history.replaceState(null, "", "/s/workspace-1/review-helper");
    fireEvent.popState(window);

    // The link must be preserved (deferred), not discarded as a dead URL.
    expect(window.location.pathname).toBe("/s/workspace-1/review-helper");

    // Once the catalog arrives, the deferred slug resolves and is selected.
    await act(async () => {
      resolveSearch([
        pkgFor("workspace-1", "pkg-rh", "review-helper", "Review Helper"),
      ]);
    });

    await waitFor(() =>
      expect(
        screen.getByText(/npx @skill-library\/cli install review-helper/)
      ).toBeTruthy()
    );
    expect(window.location.pathname).toBe("/s/workspace-1/review-helper");
  });

  it("clears a dead same-workspace skill URL reached via back/forward", async () => {
    render(
      <SkillLibraryApp
        skills={[catalogSkill("review-helper", "Review Helper")]}
        workspaceId="workspace-1"
        branding={testBranding}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Catalog" }));
    await waitFor(() =>
      expect(
        screen.getByText(/npx @skill-library\/cli install review-helper/)
      ).toBeTruthy()
    );

    // Navigate to a skill URL whose slug is absent from this workspace.
    window.history.replaceState(null, "", "/s/workspace-1/ghost");
    fireEvent.popState(window);

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(
      screen.queryByText(/npx @skill-library\/cli install review-helper/)
    ).toBeNull();
  });

  it("resolves a deep link that targets a different workspace", async () => {
    window.history.replaceState(null, "", "/s/ws-b/beta");

    render(
      <SkillLibraryApp
        api={multiWorkspaceApi()}
        authToken="test-token"
        workspaceId="ws-a"
        branding={testBranding}
      />
    );

    // Must switch to ws-b and select its skill, never the same-named ws-a one.
    await waitFor(() =>
      expect(
        screen.getByText(/npx @skill-library\/cli install beta/)
      ).toBeTruthy()
    );
    expect(
      screen.queryByText(/npx @skill-library\/cli install alpha/)
    ).toBeNull();
  });

  it("settles a deep link into an empty workspace instead of hanging", async () => {
    window.history.replaceState(null, "", "/s/ws-empty/ghost");

    render(
      <SkillLibraryApp
        api={multiWorkspaceApi()}
        authToken="test-token"
        workspaceId="ws-a"
        branding={testBranding}
      />
    );

    // The empty workspace has no match, so the pending link is cleared and the
    // URL falls back to "/" rather than staying stuck on the dead path.
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });

  it("clears a dead deep link in a non-empty workspace without snapping to another skill", async () => {
    window.history.replaceState(null, "", "/s/ws-a/ghost");

    render(
      <SkillLibraryApp
        api={multiWorkspaceApi()}
        authToken="test-token"
        workspaceId="ws-a"
        branding={testBranding}
      />
    );

    // The slug is missing, so the URL is cleared and we do NOT land on alpha.
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(
      screen.queryByText(/npx @skill-library\/cli install alpha/)
    ).toBeNull();
  });

  it("drops the skill detail when navigating back to a non-skill URL", async () => {
    render(
      <SkillLibraryApp
        skills={[catalogSkill("review-helper", "Review Helper")]}
        workspaceId="workspace-1"
        branding={testBranding}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Catalog" }));
    await waitFor(() =>
      expect(
        screen.getByText(/npx @skill-library\/cli install review-helper/)
      ).toBeTruthy()
    );

    // Browser back to the initial non-skill entry.
    window.history.replaceState(null, "", "/");
    fireEvent.popState(window);

    await waitFor(() =>
      expect(
        screen.queryByText(/npx @skill-library\/cli install review-helper/)
      ).toBeNull()
    );
    expect(window.location.pathname).toBe("/");
  });
});

function multiWorkspaceApi(): WebApiClient {
  const packagesByWorkspace: Record<string, SkillPackage[]> = {
    "ws-a": [pkgFor("ws-a", "pkg-a", "alpha", "Alpha")],
    "ws-b": [pkgFor("ws-b", "pkg-b", "beta", "Beta")],
  };
  const versionsByPackage: Record<string, SkillVersion> = {
    "pkg-a": approvedVersion("pkg-a"),
    "pkg-b": approvedVersion("pkg-b"),
  };

  return {
    search: vi.fn(async (workspaceId: string) =>
      (packagesByWorkspace[workspaceId] ?? []).slice()
    ),
    latestApprovedVersion: vi.fn(
      async (packageId: string) => versionsByPackage[packageId]
    ),
    packageVersions: vi.fn(async (packageId: string) => {
      const version = versionsByPackage[packageId];
      return version ? [version] : [];
    }),
    workspaceCatalogStats: vi.fn(async () => []),
    workspaceReports: vi.fn(async () => []),
    uploadVersion: vi.fn(),
    importGitVersion: vi.fn(),
    validatePackageTree: vi.fn(),
    transitionVersion: vi.fn(),
  };
}

function pkgFor(
  workspaceId: string,
  id: string,
  slug: string,
  name: string
): SkillPackage {
  return {
    id,
    workspaceId,
    slug,
    name,
    description: `${name} description.`,
    categories: ["review"],
    createdAt: "2026-06-07T12:00:00.000Z",
    updatedAt: "2026-06-07T12:00:00.000Z",
  };
}

function approvedVersion(packageId: string): SkillVersion {
  return {
    id: `version-${packageId}`,
    packageId,
    version: "1.0.0",
    lifecycleState: "approved",
    artifactDigest: "sha256:one",
    validation: { ok: true, files: [], issues: [] },
    provenance: { kind: "upload", importedAt: "2026-06-07T12:00:00.000Z" },
    createdAt: "2026-06-07T12:00:00.000Z",
    approvedAt: "2026-06-07T12:05:00.000Z",
  };
}

const testBranding = {
  ...DEFAULT_REGISTRY_BRANDING,
  registryPublicUrl: "https://skills.example.com",
};

function catalogSkill(slug: string, name: string): CatalogSkill {
  const pkg: SkillPackage = {
    id: `package-${slug}`,
    workspaceId: "workspace-1",
    slug,
    name,
    description: `${name} description.`,
    categories: ["review"],
    createdAt: "2026-06-07T12:00:00.000Z",
    updatedAt: "2026-06-07T12:00:00.000Z",
  };
  const version: SkillVersion = {
    id: `version-${slug}`,
    packageId: pkg.id,
    version: "1.0.0",
    lifecycleState: "approved",
    artifactDigest: "sha256:one",
    validation: {
      ok: true,
      files: [
        { path: "SKILL.md", size: 9, digest: "sha256:file", kind: "file" },
      ],
      issues: [],
    },
    provenance: { kind: "upload", importedAt: "2026-06-07T12:00:00.000Z" },
    createdAt: "2026-06-07T12:00:00.000Z",
    approvedAt: "2026-06-07T12:05:00.000Z",
  };

  return {
    pkg,
    latestApproved: version,
    activeVersion: version,
    validation: { ok: true, files: [], issues: [] },
    files: ["SKILL.md"],
    installs: 1,
    downloads: 1,
    downloadHistory: [],
    lastModifiedAt: "2026-06-07T12:00:00.000Z",
    staleInstalls: 0,
  };
}
