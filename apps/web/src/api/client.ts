import type {
  CatalogPackageStats,
  PackageReport,
  SkillPackage,
  SkillRanking,
  SkillVersion,
  ValidationResult,
  Workspace,
  WorkspaceCatalogResponse,
  WorkspaceRanking,
} from "@skill-library/domain";
import type { WebApiClient } from "../types.js";

export function createWebApiClient({
  registryUrl = "",
  token,
  request = fetch,
}: {
  registryUrl?: string;
  token?: string;
  request?: typeof fetch;
} = {}): WebApiClient {
  const baseUrl = registryUrl.replace(/\/$/, "");

  return {
    async workspaceDetail(workspaceId) {
      try {
        return (
          await jsonRequest<{ workspace: Workspace }>(
            request,
            `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}`,
            authHeaders(token)
          )
        ).workspace;
      } catch {
        return undefined;
      }
    },
    async updateWorkspace(workspaceId, input) {
      return (
        await jsonRequest<{ workspace: Workspace }>(
          request,
          `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}`,
          jsonInit(input, token, "PATCH")
        )
      ).workspace;
    },
    async search(workspaceId, query) {
      const url = new URL(
        `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/packages`,
        window.location.origin
      );

      if (query) {
        url.searchParams.set("q", query);
      }

      return (
        await jsonRequest<{ packages: SkillPackage[] }>(
          request,
          url,
          authHeaders(token)
        )
      ).packages;
    },
    async latestApprovedVersion(packageId) {
      return (
        await jsonRequest<{ version: SkillVersion }>(
          request,
          `${baseUrl}/api/packages/${encodeURIComponent(packageId)}/latest-approved`,
          authHeaders(token)
        )
      ).version;
    },
    async packageVersions(packageId) {
      return (
        await jsonRequest<{ versions: SkillVersion[] }>(
          request,
          `${baseUrl}/api/packages/${encodeURIComponent(packageId)}/versions`,
          authHeaders(token)
        )
      ).versions;
    },
    async workspaceCatalogStats(workspaceId) {
      return (
        await jsonRequest<{ stats: CatalogPackageStats[] }>(
          request,
          `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/catalog-stats`,
          authHeaders(token)
        )
      ).stats;
    },
    async workspaceReports(workspaceId) {
      return (
        await jsonRequest<{ reports: PackageReport[] }>(
          request,
          `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/reports`,
          authHeaders(token)
        )
      ).reports;
    },
    async workspaceCatalog(workspaceId) {
      const response = await request(
        `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/catalog`,
        { headers: authHeaders(token), credentials: "include" }
      );

      if (response.status === 404) {
        return undefined;
      }

      if (!response.ok) {
        // status lets the caller tell an access denial from a transient failure.
        throw Object.assign(
          new Error(
            (await response.text().catch(() => "")) ||
              `Registry request failed: ${response.status} ${response.statusText}`
          ),
          { status: response.status }
        );
      }

      return (await response.json()) as WorkspaceCatalogResponse;
    },
    async uploadVersion(workspaceId, input) {
      return (
        await jsonRequest<{ version: SkillVersion }>(
          request,
          `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/packages/upload`,
          jsonInit(input, token)
        )
      ).version;
    },
    async importGitVersion(workspaceId, input) {
      return (
        await jsonRequest<{ version: SkillVersion }>(
          request,
          `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/packages/import-git`,
          jsonInit(input, token)
        )
      ).version;
    },
    async validatePackageTree(entries) {
      return (
        await jsonRequest<{ validation: ValidationResult }>(
          request,
          `${baseUrl}/api/validation/package-tree`,
          jsonInit({ entries }, token)
        )
      ).validation;
    },
    async transitionVersion(versionId, toState) {
      return (
        await jsonRequest<{ version: SkillVersion }>(
          request,
          `${baseUrl}/api/versions/${encodeURIComponent(versionId)}/lifecycle`,
          jsonInit({ toState }, token)
        )
      ).version;
    },
    async workspaceRanking(workspaceId) {
      return (
        await jsonRequest<{ ranking: WorkspaceRanking }>(
          request,
          `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/ranking`,
          authHeaders(token)
        )
      ).ranking;
    },
    async setSkillVote(packageId, voted) {
      return (
        await jsonRequest<{ skill: SkillRanking }>(
          request,
          `${baseUrl}/api/packages/${encodeURIComponent(packageId)}/vote`,
          jsonInit({ voted }, token, "PUT")
        )
      ).skill;
    },
  };
}

async function jsonRequest<T>(
  request: typeof fetch,
  input: string | URL,
  init?: RequestInit | HeadersInit
): Promise<T> {
  const requestInit = toRequestInit(init);
  const response = await request(input, {
    ...requestInit,
    credentials: "include",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      body ||
        `Registry request failed: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as T;
}

function authHeaders(token: string | undefined): HeadersInit {
  return token ? { authorization: `Bearer ${token}` } : {};
}

function toRequestInit(
  init: RequestInit | HeadersInit | undefined
): RequestInit | undefined {
  if (!init) {
    return undefined;
  }

  if (
    init instanceof Headers ||
    Array.isArray(init) ||
    !("headers" in init || "method" in init || "body" in init)
  ) {
    return { headers: init as HeadersInit };
  }

  return init as RequestInit;
}

function jsonInit(
  body: unknown,
  token: string | undefined,
  method = "POST"
): RequestInit {
  return {
    method,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(body),
  };
}
