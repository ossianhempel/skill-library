import type { InstallReport, InstallTargetKind, SkillPackage, SkillVersion, ValidationResult } from "@skill-library/domain";
import { renderInstallCommand } from "@skill-library/cli";
import { validatePackageTree, type PackageTreeEntry } from "@skill-library/validation";

export interface InstallPlan {
  command: string;
  metadataBehavior: string;
}

export interface McpRegistryApi {
  search(workspaceId: string, query?: string): Promise<SkillPackage[]>;
  packageDetail(packageId: string): Promise<SkillPackage | undefined>;
  latestApprovedVersion(packageId: string): Promise<SkillVersion | undefined>;
  validate(entries: PackageTreeEntry[]): ValidationResult;
  recordInstallReport?(report: InstallReport): Promise<void>;
}

export interface RegistryMcpTools {
  search(input: { workspaceId: string; query?: string }): Promise<{ packages: SkillPackage[] }>;
  packageDetail(input: { packageId: string }): Promise<{ package?: SkillPackage; latestApproved?: SkillVersion }>;
  validatePackage(input: { entries: PackageTreeEntry[] }): Promise<{ validation: ValidationResult }>;
  installPlan(input: { packageSlug: string; target?: InstallTargetKind }): Promise<InstallPlan>;
  submitStatusReport(input: { report: InstallReport }): Promise<{ accepted: boolean }>;
}

export interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface McpToolDescription {
  name: keyof RegistryMcpTools;
  description: string;
}

export interface HttpMcpApiConfig {
  registryUrl: string;
  fetch?: typeof fetch;
  apiToken?: string;
  role?: "user" | "maintainer" | "admin";
  actorId?: string;
}

export const toolDescriptions: McpToolDescription[] = [
  { name: "search", description: "Search skill packages in a workspace." },
  { name: "packageDetail", description: "Fetch package detail and latest approved version." },
  { name: "validatePackage", description: "Validate normalized package-tree entries." },
  { name: "installPlan", description: "Return a CLI-backed install plan." },
  { name: "submitStatusReport", description: "Submit an install/status report." }
];

export function createInstallPlan(packageSlug: string, target: InstallTargetKind = "codex-global"): InstallPlan {
  return {
    command: renderInstallCommand(packageSlug, target),
    metadataBehavior: "Installer writes generated registry metadata after verifying the artifact digest."
  };
}

export function createHttpMcpApi(config: HttpMcpApiConfig): McpRegistryApi {
  const request = config.fetch ?? fetch;
  const baseUrl = config.registryUrl.replace(/\/$/, "");

  return {
    async search(workspaceId, query) {
      const url = new URL(`${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/packages`);

      if (query) {
        url.searchParams.set("q", query);
      }

      return (await jsonRequest<{ packages: SkillPackage[] }>(request, url, authHeaders(config))).packages;
    },
    async packageDetail(packageId) {
      return (await jsonRequest<{ package: SkillPackage }>(request, `${baseUrl}/api/packages/${encodeURIComponent(packageId)}`, authHeaders(config))).package;
    },
    async latestApprovedVersion(packageId) {
      return (await jsonRequest<{ version: SkillVersion }>(request, `${baseUrl}/api/packages/${encodeURIComponent(packageId)}/latest-approved`, authHeaders(config))).version;
    },
    validate(entries) {
      return validatePackageTree(entries);
    },
    async recordInstallReport(report) {
      await jsonRequest(request, `${baseUrl}/api/install-reports`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(config)
        },
        body: JSON.stringify(report)
      });
    }
  };
}

export function createRegistryMcpTools(api: McpRegistryApi): RegistryMcpTools {
  return {
    async search(input) {
      return { packages: await api.search(input.workspaceId, input.query) };
    },
    async packageDetail(input) {
      const pkg = await api.packageDetail(input.packageId);
      const latestApproved = await api.latestApprovedVersion(input.packageId);

      return {
        package: pkg,
        latestApproved
      };
    },
    async validatePackage(input) {
      return {
        validation: api.validate ? api.validate(input.entries) : validatePackageTree(input.entries)
      };
    },
    async installPlan(input) {
      return createInstallPlan(input.packageSlug, input.target);
    },
    async submitStatusReport(input) {
      if (!api.recordInstallReport) {
        return { accepted: false };
      }

      await api.recordInstallReport(input.report);
      return { accepted: true };
    }
  };
}

export async function handleMcpJsonRpc(tools: RegistryMcpTools, request: JsonRpcRequest) {
  try {
    if (request.method === "tools/list") {
      return rpcResult(request.id, { tools: toolDescriptions });
    }

    if (request.method === "tools/call") {
      const params = request.params as { name?: keyof RegistryMcpTools; arguments?: unknown } | undefined;

      if (!params?.name || !(params.name in tools)) {
        return rpcError(request.id, -32602, "Unknown tool.");
      }

      const result = await tools[params.name](params.arguments as never);
      return rpcResult(request.id, result);
    }

    return rpcError(request.id, -32601, "Method not found.");
  } catch (error) {
    return rpcError(request.id, -32000, error instanceof Error ? error.message : String(error));
  }
}

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function jsonRequest<T>(request: typeof fetch, input: string | URL, init?: RequestInit | HeadersInit): Promise<T> {
  const requestInit = toRequestInit(init);
  const response = await request(input, requestInit);

  if (!response.ok) {
    throw new Error(`Registry request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function authHeaders(config: HttpMcpApiConfig): HeadersInit {
  const apiToken = config.apiToken?.trim();

  if (apiToken) {
    return {
      authorization: `Bearer ${apiToken}`
    };
  }

  return {
    "x-skill-library-role": config.role ?? "user",
    "x-skill-library-actor": config.actorId ?? "mcp"
  };
}

function toRequestInit(init: RequestInit | HeadersInit | undefined): RequestInit | undefined {
  if (!init) {
    return undefined;
  }

  if (init instanceof Headers || Array.isArray(init) || !("headers" in init || "method" in init || "body" in init)) {
    return { headers: init as HeadersInit };
  }

  return init as RequestInit;
}
