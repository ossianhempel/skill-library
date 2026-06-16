import type { PackageReport, SkillVersion } from "@skill-library/domain";
import type {
  CatalogSkill,
  UploadVersionInput,
  WebApiClient,
} from "../types.js";
import { emptyDownloadHistory } from "../lib/format.js";

export function pickActiveVersion(
  latestApproved: SkillVersion | undefined,
  versions: SkillVersion[]
): SkillVersion | undefined {
  if (versions.length === 0) {
    return latestApproved;
  }

  const sorted = [...versions].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
  );
  const newest = sorted[0];

  if (!newest) {
    return latestApproved;
  }

  if (!latestApproved) {
    return newest;
  }

  if (newest.id !== latestApproved.id) {
    return newest;
  }

  return latestApproved;
}

export async function loadCatalogSkills(
  api: WebApiClient,
  workspaceId: string,
  query?: string
): Promise<CatalogSkill[]> {
  const [packages, reports, catalogStats] = await Promise.all([
    api.search(workspaceId, query),
    api.workspaceReports(workspaceId).catch(() => []),
    api.workspaceCatalogStats(workspaceId).catch(() => []),
  ]);
  const reportsByPackage = new Map(
    reports.map((report) => [report.packageId, report])
  );
  const statsByPackage = new Map(
    catalogStats.map((stats) => [stats.packageId, stats])
  );

  return Promise.all(
    packages.map(async (pkg) => {
      const latestApproved = await api
        .latestApprovedVersion(pkg.id)
        .catch(() => undefined);
      const versions = await api.packageVersions(pkg.id).catch(() => []);
      const activeVersion = pickActiveVersion(latestApproved, versions);
      const report = reportsByPackage.get(pkg.id);
      const stats = statsByPackage.get(pkg.id);
      const validation = activeVersion?.validation;

      return {
        pkg,
        latestApproved,
        activeVersion,
        validation,
        files: validation?.files.map((file) => file.path) ?? [],
        installs: report?.installs.total ?? 0,
        downloads: stats?.downloads ?? report?.downloads ?? 0,
        downloadHistory:
          stats?.downloadHistory ??
          report?.downloadHistory ??
          emptyDownloadHistory(),
        lastModifiedAt:
          stats?.lastModifiedAt ??
          report?.lastModifiedAt ??
          resolveLastModifiedAt(versions),
        staleInstalls:
          (report?.installs.byState.stale ?? 0) +
          (report?.installs.byState["modified-local-content"] ?? 0),
        report,
      };
    })
  );
}

export function summarizeReports(reports: PackageReport[]) {
  return reports.reduce(
    (summary, report) => ({
      packages: summary.packages + 1,
      installs: summary.installs + report.installs.total,
      currentInstalls:
        summary.currentInstalls + report.installs.byState.current,
      staleInstalls:
        summary.staleInstalls +
        report.installs.byState.stale +
        report.installs.byState["modified-local-content"],
    }),
    { packages: 0, installs: 0, currentInstalls: 0, staleInstalls: 0 }
  );
}

export function artifactDownloadUrl(registryUrl: string, skill: CatalogSkill) {
  const version = skill.latestApproved;

  if (!version) {
    return "#";
  }

  const baseUrl = registryUrl.replace(/\/$/, "");
  const url = new URL(
    `${baseUrl}/api/artifacts/${encodeURIComponent(version.artifactDigest)}/download`,
    window.location.origin
  );
  url.searchParams.set("packageId", skill.pkg.id);
  url.searchParams.set("versionId", version.id);
  return url.toString();
}

export function resolveLastModifiedAt(versions: SkillVersion[]): string {
  const sorted = [...versions].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
  );

  return sorted[0]?.createdAt ?? new Date(0).toISOString();
}

export async function filesToPackageEntries(
  files: File[]
): Promise<UploadVersionInput["entries"]> {
  return Promise.all(
    files.map(async (file) => {
      const browserFile = file as File & { webkitRelativePath?: string };
      const path = browserFile.webkitRelativePath || file.name;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = decodeUtf8Text(bytes);

      // Text files keep the original {path, content} shape; binary assets (images,
      // .pptx, fonts, ...) are base64-encoded so they round-trip byte-for-byte.
      return text === null
        ? { path, content: base64FromBytes(bytes), encoding: "base64" as const }
        : { path, content: text };
    })
  );
}

/** Decode bytes as UTF-8 text, or return null when the file is binary. */
export function decodeUtf8Text(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) {
    return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
