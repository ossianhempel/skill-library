import type {
  CatalogPackageStats,
  DownloadHistoryPoint,
  InstallReport,
  InstalledSkillState,
  PackageReport,
  SkillPackage,
  SkillVersion,
} from "@skill-library/domain";

/**
 * Everything the catalog needs for one workspace, read in a fixed number of
 * queries rather than several per package. Versions are newest first.
 */
export interface WorkspaceCatalogSnapshot {
  packages: SkillPackage[];
  versionsByPackage: Map<string, SkillVersion[]>;
  latestApprovedByPackage: Map<string, SkillVersion>;
  stats: CatalogPackageStats[];
  reports: PackageReport[];
}

/** Workspace-wide rows a store reads in bulk; assembled per package below. */
export interface WorkspaceCatalogRows {
  packages: SkillPackage[];
  versions: SkillVersion[];
  usageCounts: { packageId: string; eventType: string; count: number }[];
  downloadHistory: { packageId: string; date: string; count: number }[];
  installReports: (Pick<InstallReport, "installId" | "state" | "reportedAt"> & {
    packageId: string;
  })[];
}

export function assembleWorkspaceCatalog(
  rows: WorkspaceCatalogRows,
  days: number,
  now: () => Date
): WorkspaceCatalogSnapshot {
  const versionsByPackage = groupBy(rows.versions, (v) => v.packageId);
  const historyByPackage = groupBy(rows.downloadHistory, (p) => p.packageId);
  const installsByPackage = groupBy(rows.installReports, (r) => r.packageId);
  const usage = new Map(
    rows.usageCounts.map((row) => [
      `${row.packageId}\u0000${row.eventType}`,
      row.count,
    ])
  );
  const latestApprovedByPackage = new Map<string, SkillVersion>();
  const stats: CatalogPackageStats[] = [];
  const reports: PackageReport[] = [];

  for (const versions of versionsByPackage.values()) {
    versions.sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
  }

  for (const pkg of rows.packages) {
    const versions = versionsByPackage.get(pkg.id) ?? [];
    versionsByPackage.set(pkg.id, versions);
    const latestApproved = pickLatestApproved(versions);
    if (latestApproved) {
      latestApprovedByPackage.set(pkg.id, latestApproved);
    }
    const downloads = usage.get(`${pkg.id}\u0000download`) ?? 0;
    const downloadHistory = fillDownloadHistory(
      (historyByPackage.get(pkg.id) ?? []).map(({ date, count }) => ({
        date,
        count,
      })),
      days,
      now
    );
    const lastModifiedAt = resolveLastModifiedAt(versions);

    stats.push({
      packageId: pkg.id,
      downloads,
      downloadHistory,
      lastModifiedAt,
    });
    reports.push(
      buildPackageReport({
        packageId: pkg.id,
        workspaceId: pkg.workspaceId,
        versionCount: versions.length,
        latestApprovedVersionId: latestApproved?.id,
        views: usage.get(`${pkg.id}\u0000view`) ?? 0,
        downloads,
        downloadHistory,
        lastModifiedAt,
        reports: installsByPackage.get(pkg.id) ?? [],
      })
    );
  }

  return {
    packages: rows.packages,
    versionsByPackage,
    latestApprovedByPackage,
    stats,
    reports,
  };
}

/**
 * Same order as the SQL getLatestApprovedVersion: approved_at desc with nulls
 * last, then created_at desc.
 */
function pickLatestApproved(
  versions: SkillVersion[]
): SkillVersion | undefined {
  return versions
    .filter((version) => version.lifecycleState === "approved")
    .sort((left, right) => {
      if (left.approvedAt !== right.approvedAt) {
        if (!left.approvedAt) return 1;
        if (!right.approvedAt) return -1;
        return right.approvedAt.localeCompare(left.approvedAt);
      }
      return right.createdAt.localeCompare(left.createdAt);
    })[0];
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) {
      group.push(item);
    } else {
      groups.set(key(item), [item]);
    }
  }
  return groups;
}

const installStates: InstalledSkillState[] = [
  "current",
  "stale",
  "deprecated",
  "hidden",
  "unknown-registry",
  "missing-metadata",
  "modified-local-content",
];

export interface ReportInput {
  packageId: string;
  workspaceId: string;
  versionCount: number;
  latestApprovedVersionId?: string;
  views: number;
  downloads: number;
  downloadHistory: DownloadHistoryPoint[];
  lastModifiedAt: string;
  reports: Pick<InstallReport, "installId" | "state" | "reportedAt">[];
}

export function buildPackageReport(input: ReportInput): PackageReport {
  const latestByInstall = new Map<
    string,
    Pick<InstallReport, "installId" | "state" | "reportedAt">
  >();

  for (const report of input.reports) {
    const current = latestByInstall.get(report.installId);

    if (!current || report.reportedAt > current.reportedAt) {
      latestByInstall.set(report.installId, report);
    }
  }

  const byState = Object.fromEntries(
    installStates.map((state) => [state, 0])
  ) as PackageReport["installs"]["byState"];

  for (const report of latestByInstall.values()) {
    byState[report.state] += 1;
  }

  return {
    packageId: input.packageId,
    workspaceId: input.workspaceId,
    versionCount: input.versionCount,
    latestApprovedVersionId: input.latestApprovedVersionId,
    views: input.views,
    downloads: input.downloads,
    downloadHistory: input.downloadHistory,
    lastModifiedAt: input.lastModifiedAt,
    installs: {
      total: latestByInstall.size,
      byState,
    },
  };
}

/** Versions are expected newest first. */
export function resolveLastModifiedAt(versions: SkillVersion[]): string {
  const newest = versions[0];

  return newest?.createdAt ?? new Date(0).toISOString();
}

export function downloadHistoryStartIso(days: number, now: () => Date): string {
  // Copy: the cursor below is mutated, and a Clock is allowed to hand back a
  // shared Date instance (e.g. `() => fixedDate` in a test).
  const start = new Date(now().getTime());
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return start.toISOString();
}

export function fillDownloadHistory(
  points: DownloadHistoryPoint[],
  days: number,
  now: () => Date
): DownloadHistoryPoint[] {
  const counts = new Map(points.map((point) => [point.date, point.count]));
  const filled: DownloadHistoryPoint[] = [];
  const cursor = new Date(now().getTime());
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() - (days - 1));

  for (let index = 0; index < days; index += 1) {
    const date = cursor.toISOString().slice(0, 10);
    filled.push({ date, count: counts.get(date) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return filled;
}
