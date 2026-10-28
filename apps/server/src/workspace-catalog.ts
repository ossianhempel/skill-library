import type { Hono } from "hono";
import type {
  Actor,
  SkillRanking,
  WorkspaceCatalogEntry,
  WorkspaceCatalogResponse,
} from "@skill-library/domain";
import type { WorkspaceCatalogSnapshot } from "@skill-library/storage";
import type { RegistryApi } from "./index.js";
import { hasRole } from "./auth.js";

/**
 * The catalog a given actor may see, with the same rules as the per-package
 * endpoints: non-maintainers get only installable packages or ones they
 * authored, only approved versions, and no install reports.
 */
export function visibleWorkspaceCatalog(
  snapshot: WorkspaceCatalogSnapshot,
  actor: Actor | undefined,
  rankings: SkillRanking[] = []
): WorkspaceCatalogEntry[] {
  const rankingByPackage = new Map(rankings.map((r) => [r.packageId, r]));
  const maintainer = hasRole(actor, "maintainer");
  const statsByPackage = new Map(snapshot.stats.map((s) => [s.packageId, s]));
  const reportsByPackage = new Map(
    snapshot.reports.map((report) => [report.packageId, report])
  );

  return snapshot.packages.flatMap((pkg) => {
    const versions = snapshot.versionsByPackage.get(pkg.id) ?? [];
    const latestApproved = snapshot.latestApprovedByPackage.get(pkg.id);
    const authored =
      actor !== undefined &&
      versions.some((version) => version.provenance.actorId === actor.id);

    if (!maintainer && !latestApproved && !authored) {
      return [];
    }

    const visibleVersions = maintainer
      ? versions
      : versions.filter((version) => version.lifecycleState === "approved");
    const stats = statsByPackage.get(pkg.id);

    return [
      {
        package: pkg,
        latestApproved,
        activeVersion: visibleVersions[0] ?? latestApproved,
        stats: stats ?? {
          packageId: pkg.id,
          downloads: 0,
          downloadHistory: [],
          lastModifiedAt: new Date(0).toISOString(),
        },
        report: maintainer ? reportsByPackage.get(pkg.id) : undefined,
        ranking: rankingByPackage.get(pkg.id),
      },
    ];
  });
}

export function registerWorkspaceCatalogRoute(
  app: Hono,
  api: RegistryApi,
  resolveActor: (headers: Headers) => Promise<Actor | undefined>
) {
  // Everything the web catalog needs in one request, so opening the app costs
  // one round trip instead of two per package.
  app.get("/api/workspaces/:workspaceId/catalog", async (context) => {
    const workspaceId = context.req.param("workspaceId");
    const [workspace, actor] = await Promise.all([
      api.workspaceDetail(workspaceId),
      resolveActor(context.req.raw.headers),
    ]);

    if (
      workspace &&
      workspace.visibility !== "public" &&
      !hasRole(actor, "user")
    ) {
      return context.json({ error: "User role required" }, 403);
    }

    const [snapshot, ranking] = await Promise.all([
      api.workspaceCatalog(workspaceId),
      api.workspaceRanking(workspaceId, actor?.id),
    ]);
    const body: WorkspaceCatalogResponse = {
      viewer: actor ?? null,
      packages: visibleWorkspaceCatalog(snapshot, actor, ranking.skills),
    };

    return context.json(body);
  });
}
