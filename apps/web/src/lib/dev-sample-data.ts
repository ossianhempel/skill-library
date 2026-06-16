import type {
  DownloadHistoryPoint,
  LifecycleState,
  PackageReport,
  SkillPackage,
  SkillVersion,
} from "@skill-library/domain";
import type { CatalogSkill } from "../types.js";
import { emptyDownloadHistory } from "./format.js";

function packageData(
  id: string,
  slug: string,
  name: string,
  description: string,
  categories: string[]
): SkillPackage {
  return {
    id,
    workspaceId: "workspace-1",
    slug,
    name,
    description,
    categories,
    createdAt: "2026-06-07T10:00:00.000Z",
    updatedAt: "2026-06-07T12:00:00.000Z",
  };
}

function version(
  id: string,
  packageId: string,
  semver: string,
  lifecycleState: LifecycleState
): SkillVersion {
  return {
    id,
    packageId,
    version: semver,
    lifecycleState,
    artifactDigest: `sha256:${id}`,
    validation: { ok: true, files: [], issues: [] },
    provenance: { kind: "upload", importedAt: "2026-06-07T12:00:00.000Z" },
    createdAt: "2026-06-07T12:00:00.000Z",
    approvedAt:
      lifecycleState === "approved" ? "2026-06-07T12:05:00.000Z" : undefined,
  };
}

function demoDownloadHistory(counts: number[]): DownloadHistoryPoint[] {
  const history = emptyDownloadHistory();

  return history.map((point, index) => ({
    ...point,
    count: counts[index] ?? 0,
  }));
}

function packageReport(
  packageId: string,
  versionCount: number,
  installs: number,
  downloads: number,
  current: number,
  stale: number
): PackageReport {
  return {
    packageId,
    workspaceId: "workspace-1",
    versionCount,
    latestApprovedVersionId: `version-${packageId}`,
    views: downloads * 2,
    downloads,
    downloadHistory: demoDownloadHistory([
      1, 2, 3, 2, 4, 3, 5, 4, 6, 5, 4, 3, 5, 4,
    ]),
    lastModifiedAt: "2026-06-07T12:00:00.000Z",
    installs: {
      total: installs,
      byState: {
        current,
        stale,
        deprecated: 0,
        hidden: 0,
        "unknown-registry": 0,
        "missing-metadata": 0,
        "modified-local-content": 0,
      },
    },
  };
}

// Local-dev demo catalog only. Production must never show placeholder skills.
export const devSampleSkills: CatalogSkill[] = [
  {
    pkg: packageData(
      "workspace-1-review-helper",
      "review-helper",
      "Review Helper",
      "Turns repository diffs into a focused code-review checklist for internal agents.",
      ["review", "quality"]
    ),
    latestApproved: version(
      "version-review-2",
      "workspace-1-review-helper",
      "1.2.0",
      "approved"
    ),
    validation: { ok: true, files: [], issues: [] },
    files: ["SKILL.md", "scripts/review.ts", "references/checklist.md"],
    installs: 43,
    downloads: 118,
    downloadHistory: demoDownloadHistory([
      4, 6, 8, 5, 9, 7, 11, 10, 12, 8, 14, 9, 13, 12,
    ]),
    lastModifiedAt: "2026-06-07T12:00:00.000Z",
    staleInstalls: 6,
    report: packageReport("workspace-1-review-helper", 2, 43, 118, 37, 6),
  },
  {
    pkg: packageData(
      "workspace-1-release-notes",
      "release-notes",
      "Release Notes",
      "Builds release notes from merged commits, issue links, and deployment metadata.",
      ["release", "writing"]
    ),
    latestApproved: version(
      "version-release-1",
      "workspace-1-release-notes",
      "1.0.0",
      "approved"
    ),
    validation: { ok: true, files: [], issues: [] },
    files: ["SKILL.md", "templates/release.md"],
    installs: 17,
    downloads: 52,
    downloadHistory: demoDownloadHistory([
      2, 3, 4, 3, 5, 4, 6, 5, 4, 3, 5, 4, 6, 4,
    ]),
    lastModifiedAt: "2026-06-07T12:00:00.000Z",
    staleInstalls: 0,
    report: packageReport("workspace-1-release-notes", 1, 17, 52, 17, 0),
  },
  {
    pkg: packageData(
      "workspace-1-git-importer",
      "git-importer",
      "Git Importer",
      "Imports accessible Git-hosted skill directories with ref and commit provenance.",
      ["publishing", "git"]
    ),
    latestApproved: version(
      "version-git-1",
      "workspace-1-git-importer",
      "0.4.0",
      "published"
    ),
    validation: { ok: true, files: [], issues: [] },
    files: ["SKILL.md", "scripts/import.ts", "references/provenance.md"],
    installs: 8,
    downloads: 21,
    downloadHistory: demoDownloadHistory([
      1, 1, 2, 1, 2, 2, 3, 1, 2, 1, 2, 1, 1, 1,
    ]),
    lastModifiedAt: "2026-06-07T12:00:00.000Z",
    staleInstalls: 3,
    report: packageReport("workspace-1-git-importer", 1, 8, 21, 5, 3),
  },
];
