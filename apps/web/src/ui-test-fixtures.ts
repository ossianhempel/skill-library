import { vi } from "vitest";
import {
  DEFAULT_REGISTRY_BRANDING,
  type PackageReport,
  type SkillPackage,
  type SkillVersion,
  type Workspace,
} from "@skill-library/domain";
import type { WebApiClient } from "./ui.js";

export const pkg: SkillPackage = {
  id: "package-1",
  workspaceId: "workspace-1",
  slug: "review-helper",
  name: "Review Helper",
  description: "Review local changes.",
  categories: ["review"],
  createdAt: "2026-06-07T12:00:00.000Z",
  updatedAt: "2026-06-07T12:00:00.000Z",
};

export const latestApproved: SkillVersion = {
  id: "version-1",
  packageId: "package-1",
  version: "1.0.0",
  lifecycleState: "approved",
  artifactDigest: "sha256:one",
  validation: {
    ok: true,
    files: [{ path: "SKILL.md", size: 9, digest: "sha256:file", kind: "file" }],
    issues: [],
  },
  provenance: { kind: "upload", importedAt: "2026-06-07T12:00:00.000Z" },
  createdAt: "2026-06-07T12:00:00.000Z",
  approvedAt: "2026-06-07T12:05:00.000Z",
};

export const report: PackageReport = {
  packageId: "package-1",
  workspaceId: "workspace-1",
  versionCount: 1,
  latestApprovedVersionId: "version-1",
  views: 12,
  downloads: 9,
  downloadHistory: Array.from({ length: 14 }, (_, index) => ({
    date: `2026-06-${String(index + 1).padStart(2, "0")}`,
    count: index + 1,
  })),
  lastModifiedAt: "2026-06-07T12:00:00.000Z",
  installs: {
    total: 4,
    byState: {
      current: 3,
      stale: 1,
      deprecated: 0,
      hidden: 0,
      "unknown-registry": 0,
      "missing-metadata": 0,
      "modified-local-content": 0,
    },
  },
};

export const testBranding = {
  ...DEFAULT_REGISTRY_BRANDING,
  registryTagline: "Rebtech skill registry",
  companyName: "Rebtech",
  registryPublicUrl: "https://skills.rebtech.se",
};

export const workspace: Workspace = {
  id: "workspace-1",
  slug: "workspace-1",
  name: "Workspace 1",
  reportingPolicy: "opt-in",
  visibility: "public",
  logoUrl: "https://cdn.example.com/acme.svg",
};

export const skill = {
  pkg,
  latestApproved,
  activeVersion: latestApproved,
  validation: { ok: true, files: [], issues: [] },
  files: ["SKILL.md"],
  installs: 3,
  downloads: 9,
  downloadHistory: report.downloadHistory,
  lastModifiedAt: report.lastModifiedAt,
  staleInstalls: 1,
  report,
};

export function fakeApi(): WebApiClient {
  return {
    workspaceDetail: vi.fn(async () => workspace),
    updateWorkspace: vi.fn(async (_workspaceId, input) => ({
      ...workspace,
      logoUrl: input.logoUrl || undefined,
    })),
    search: vi.fn(async () => [pkg]),
    latestApprovedVersion: vi.fn(async () => latestApproved),
    packageVersions: vi.fn(async () => [latestApproved]),
    workspaceCatalogStats: vi.fn(async () => [
      {
        packageId: "package-1",
        downloads: 9,
        downloadHistory: report.downloadHistory,
        lastModifiedAt: report.lastModifiedAt,
      },
    ]),
    workspaceReports: vi.fn(async () => [report]),
    validatePackageTree: vi.fn(async () => ({
      ok: true,
      files: [],
      issues: [],
    })),
    uploadVersion: vi.fn(async () => latestApproved),
    importGitVersion: vi.fn(async () => latestApproved),
    transitionVersion: vi.fn(async (_versionId, toState) => ({
      ...latestApproved,
      lifecycleState: toState,
    })),
  };
}
