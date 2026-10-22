import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceCatalogResponse } from "@skill-library/domain";
import { createWebApiClient, SkillLibraryApp } from "./ui.js";
import { loadWorkspaceCatalog } from "./api/catalog.js";
import {
  catalogCacheKey,
  clearCachedCatalogs,
  readCachedCatalog,
  writeCachedCatalog,
} from "./lib/catalog-cache.js";
import {
  fakeApi,
  latestApproved,
  pkg,
  report,
  skill,
  testBranding,
} from "./ui-test-fixtures.js";

const viewer = { id: "user-1", role: "user" };

const sessionUser = {
  id: "user-1",
  name: "User",
  email: "user@example.com",
  image: null,
  role: "user",
};

function catalogResponse(
  name: string,
  role: "user" | "maintainer" = "user"
): WorkspaceCatalogResponse {
  return {
    viewer: { id: "user-1", role },
    packages: [
      {
        package: { ...pkg, name },
        latestApproved,
        activeVersion: latestApproved,
        stats: {
          packageId: pkg.id,
          downloads: 9,
          downloadHistory: report.downloadHistory,
          lastModifiedAt: report.lastModifiedAt,
        },
      },
    ],
  };
}

function stubSession(role = "user") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("/api/auth/get-session")
        ? new Response(JSON.stringify({ user: { ...sessionUser, role } }))
        : new Response(JSON.stringify({}))
    )
  );
}

beforeEach(() => clearCachedCatalogs());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("catalog loading", () => {
  it("loads the whole catalog in one request when the registry serves it", async () => {
    const api = fakeApi();
    api.workspaceCatalog = vi.fn(async () => catalogResponse("Review Helper"));

    const loaded = await loadWorkspaceCatalog(api, "workspace-1");

    expect(loaded.viewer).toEqual(viewer);
    expect(loaded.skills).toEqual([
      expect.objectContaining({
        pkg: expect.objectContaining({ id: "package-1" }),
        activeVersion: latestApproved,
        files: ["SKILL.md"],
        downloads: 9,
      }),
    ]);
    expect(api.latestApprovedVersion).not.toHaveBeenCalled();
    expect(api.packageVersions).not.toHaveBeenCalled();
  });

  it("falls back to per-package requests on a registry without /catalog", async () => {
    const request = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/catalog")) {
        return new Response(JSON.stringify({ error: "Not Found" }), {
          status: 404,
        });
      }
      if (url.includes("/packages?") || url.endsWith("/packages")) {
        return new Response(JSON.stringify({ packages: [pkg] }));
      }
      if (url.endsWith("/latest-approved")) {
        return new Response(JSON.stringify({ version: latestApproved }));
      }
      if (url.endsWith("/versions")) {
        return new Response(JSON.stringify({ versions: [latestApproved] }));
      }
      if (url.endsWith("/reports")) {
        return new Response(JSON.stringify({ reports: [report] }));
      }
      return new Response(JSON.stringify({ stats: [] }));
    });
    const api = createWebApiClient({ request: request as typeof fetch });

    const loaded = await loadWorkspaceCatalog(api, "workspace-1");

    expect(loaded.viewer).toBeUndefined();
    expect(loaded.skills).toEqual([
      expect.objectContaining({ activeVersion: latestApproved, report }),
    ]);
  });
});

describe("catalog cache", () => {
  it("keeps catalogs apart per registry, workspace and viewer", () => {
    const mine = catalogCacheKey("https://a/", "workspace-1", viewer);
    writeCachedCatalog(mine, [skill]);

    expect(readCachedCatalog(mine)).toEqual([skill]);
    expect(
      readCachedCatalog(
        catalogCacheKey("https://a", "workspace-1", {
          id: "user-2",
          role: "user",
        })
      )
    ).toBeUndefined();
    expect(
      readCachedCatalog(catalogCacheKey("https://a", "workspace-2", viewer))
    ).toBeUndefined();

    expect(
      readCachedCatalog(
        catalogCacheKey("https://a", "workspace-1", {
          id: "user-1",
          role: "maintainer",
        })
      )
    ).toBeUndefined();

    clearCachedCatalogs();
    expect(readCachedCatalog(mine)).toBeUndefined();
  });

  it("still works in memory when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const key = catalogCacheKey("", "workspace-1", viewer);

    expect(() => writeCachedCatalog(key, [skill])).not.toThrow();
    expect(readCachedCatalog(key)).toEqual([skill]);
  });

  it("shows the viewer's cached catalog at once and swaps in the fresh one", async () => {
    writeCachedCatalog(catalogCacheKey("", "workspace-1", viewer), [
      { ...skill, pkg: { ...pkg, name: "Cached Helper" } },
    ]);
    stubSession();
    let resolveCatalog: (value: WorkspaceCatalogResponse) => void = () => {};
    const api = fakeApi();
    api.workspaceCatalog = vi.fn(
      () =>
        new Promise<WorkspaceCatalogResponse>((resolve) => {
          resolveCatalog = resolve;
        })
    );

    render(
      <SkillLibraryApp
        api={api}
        branding={testBranding}
        workspaceId="workspace-1"
      />
    );
    fireEvent.click(await screen.findByRole("button", { name: "Catalog" }));

    expect(
      (await screen.findAllByText("Cached Helper")).length
    ).toBeGreaterThan(0);

    resolveCatalog(catalogResponse("Fresh Helper"));

    expect((await screen.findAllByText("Fresh Helper")).length).toBeGreaterThan(
      0
    );
    expect(screen.queryByText("Cached Helper")).toBeNull();
    expect(
      readCachedCatalog(catalogCacheKey("", "workspace-1", viewer))?.[0]?.pkg
        .name
    ).toBe("Fresh Helper");
  });

  it("refreshes the catalog and its cache after a lifecycle change", async () => {
    stubSession("maintainer");
    const api = fakeApi();
    api.workspaceCatalog = vi
      .fn()
      .mockResolvedValueOnce(catalogResponse("Before Helper", "maintainer"))
      .mockResolvedValue(catalogResponse("After Helper", "maintainer"));

    render(
      <SkillLibraryApp
        api={api}
        branding={testBranding}
        workspaceId="workspace-1"
      />
    );
    fireEvent.click(await screen.findByRole("button", { name: "Catalog" }));
    await screen.findAllByText("Before Helper");

    fireEvent.click(await screen.findByRole("button", { name: /deprecate/i }));

    expect((await screen.findAllByText("After Helper")).length).toBeGreaterThan(
      0
    );
    expect(api.workspaceCatalog).toHaveBeenCalledTimes(2);
    expect(
      readCachedCatalog(
        catalogCacheKey("", "workspace-1", { ...viewer, role: "maintainer" })
      )?.[0]?.pkg.name
    ).toBe("After Helper");
  });

  it("keeps the cached catalog when the first refresh fails", async () => {
    writeCachedCatalog(catalogCacheKey("", "workspace-1", viewer), [
      { ...skill, pkg: { ...pkg, name: "Cached Helper" } },
    ]);
    stubSession();
    let rejectCatalog: (error: Error) => void = () => {};
    const api = fakeApi();
    api.workspaceCatalog = vi.fn(
      () =>
        new Promise<WorkspaceCatalogResponse>((_resolve, reject) => {
          rejectCatalog = reject;
        })
    );

    render(
      <SkillLibraryApp
        api={api}
        branding={testBranding}
        workspaceId="workspace-1"
      />
    );
    fireEvent.click(await screen.findByRole("button", { name: "Catalog" }));
    await screen.findAllByText("Cached Helper");

    await act(async () => {
      rejectCatalog(new Error("offline"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getAllByText("Cached Helper").length).toBeGreaterThan(0);
  });

  it("drops the previous viewer's catalog on sign-out", async () => {
    stubSession();
    const api = fakeApi();
    api.workspaceCatalog = vi
      .fn()
      .mockResolvedValueOnce(catalogResponse("Private Helper"))
      .mockImplementation(() => new Promise(() => {}));

    render(
      <SkillLibraryApp
        api={api}
        branding={testBranding}
        workspaceId="workspace-1"
      />
    );
    fireEvent.click(await screen.findByRole("button", { name: "Catalog" }));
    await screen.findAllByText("Private Helper");

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(api.workspaceCatalog).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("button", { name: "Catalog" }));
    expect(screen.queryByText("Private Helper")).toBeNull();
    expect(
      readCachedCatalog(catalogCacheKey("", "workspace-1", viewer))
    ).toBeUndefined();
  });

  it("drops the cached catalog when the registry denies access", async () => {
    writeCachedCatalog(catalogCacheKey("", "workspace-1", viewer), [
      { ...skill, pkg: { ...pkg, name: "Cached Helper" } },
    ]);
    stubSession();
    let rejectCatalog: (error: Error) => void = () => {};
    const api = fakeApi();
    api.workspaceCatalog = vi.fn(
      () =>
        new Promise<WorkspaceCatalogResponse>((_resolve, reject) => {
          rejectCatalog = reject;
        })
    );

    render(
      <SkillLibraryApp
        api={api}
        branding={testBranding}
        workspaceId="workspace-1"
      />
    );
    fireEvent.click(await screen.findByRole("button", { name: "Catalog" }));
    await screen.findAllByText("Cached Helper");

    await act(async () => {
      rejectCatalog(
        Object.assign(new Error("User role required"), { status: 403 })
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByText("Cached Helper")).toBeNull();
    expect(
      readCachedCatalog(catalogCacheKey("", "workspace-1", viewer))
    ).toBeUndefined();
  });
});
