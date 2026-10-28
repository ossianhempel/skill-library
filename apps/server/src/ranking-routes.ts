import type { Hono } from "hono";
import type { Actor, SkillRanking, Workspace } from "@skill-library/domain";
import type { RegistryApi } from "./index.js";
import { hasRole } from "./auth.js";
import { visibleWorkspaceCatalog } from "./workspace-catalog.js";

/**
 * Popularity ranking and upvotes. Ranks count distinct signed-in colleagues, so
 * every write here needs a real user identity, and authors can never upvote
 * their own skills.
 */
export function registerRankingRoutes(
  app: Hono,
  deps: {
    api: RegistryApi;
    resolveActor: (headers: Headers) => Promise<Actor | undefined>;
    canAccessWorkspace: (
      headers: Headers,
      workspace: Workspace
    ) => Promise<boolean>;
  }
) {
  const { api, resolveActor, canAccessWorkspace } = deps;

  app.get("/api/workspaces/:workspaceId/ranking", async (context) => {
    const workspaceId = context.req.param("workspaceId");
    const workspace = await api.workspaceDetail(workspaceId);

    if (
      workspace &&
      !(await canAccessWorkspace(context.req.raw.headers, workspace))
    ) {
      return context.json({ error: "User role required" }, 403);
    }

    const actor = await resolveActor(context.req.raw.headers);
    const [ranking, snapshot] = await Promise.all([
      api.workspaceRanking(workspaceId, actor?.id),
      api.workspaceCatalog(workspaceId),
    ]);
    // Same visibility as the catalog: no counts for drafts a viewer can't see.
    const visible = new Set(
      visibleWorkspaceCatalog(snapshot, actor).map((entry) => entry.package.id)
    );
    return context.json({
      ranking: {
        ...ranking,
        skills: ranking.skills.filter((skill) => visible.has(skill.packageId)),
      },
    });
  });

  app.put("/api/packages/:packageId/vote", async (context) => {
    const actor = await resolveActor(context.req.raw.headers);

    if (!hasRole(actor, "user") || !actor) {
      return context.json({ error: "Sign in to upvote skills" }, 403);
    }

    const packageId = context.req.param("packageId");
    const pkg = await api.packageDetail(packageId);
    const workspace = pkg && (await api.workspaceDetail(pkg.workspaceId));

    if (!pkg || !workspace) {
      return context.json({ error: "Package not found" }, 404);
    }

    if (!(await canAccessWorkspace(context.req.raw.headers, workspace))) {
      return context.json({ error: "User role required" }, 403);
    }

    const body = (await context.req.json().catch(() => ({}))) as {
      voted?: unknown;
    };

    if (typeof body.voted !== "boolean") {
      return context.json({ error: "Request body must include voted." }, 400);
    }

    // Withdrawing stays possible after a skill loses its approved version.
    if (body.voted && !(await api.latestApprovedVersion(packageId))) {
      return context.json(
        { error: "Only approved skills can be upvoted" },
        409
      );
    }

    const [before, snapshot] = await Promise.all([
      api.workspaceRanking(pkg.workspaceId, actor.id),
      api.workspaceCatalog(pkg.workspaceId),
    ]);
    const mine = before.skills.find((skill) => skill.packageId === packageId);
    const visible = visibleWorkspaceCatalog(snapshot, actor).some(
      (entry) => entry.package.id === packageId
    );

    // A skill the caller can't see in the catalog stays invisible here too,
    // except to withdraw a vote they already cast before it was deprecated.
    if (!visible && !mine?.votedByMe) {
      return context.json({ error: "Package not found" }, 404);
    }

    if (mine?.authoredByMe) {
      return context.json({ error: "You can't upvote your own skill" }, 403);
    }

    await api.setSkillVote({ packageId, userId: actor.id, voted: body.voted });
    const after = await api.workspaceRanking(pkg.workspaceId, actor.id);
    // A skill with no remaining signals drops out of the ranking; report zeros.
    const skill: SkillRanking = after.skills.find(
      (entry) => entry.packageId === packageId
    ) ?? {
      packageId,
      colleagues: 0,
      upvotes: 0,
      score: 0,
      votedByMe: false,
      authoredByMe: false,
    };
    return context.json({ skill });
  });
}
