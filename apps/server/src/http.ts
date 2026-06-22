import { Hono } from "hono";
import { createRegistryApi, type RegistryApi } from "./index.js";
import type { RegistryStore, TeamMemberRecord } from "@skill-library/storage";
import type { PackageTreeEntry } from "@skill-library/validation";
import { normalizeLogoUrlInput } from "@skill-library/domain";
import type {
  LifecycleState,
  RegistryBrandingConfig,
  Workspace,
} from "@skill-library/domain";
import {
  actorFromHeaders,
  devHeaderAuthEnabled,
  hasRole,
  parseRole,
} from "./auth.js";
import {
  getBetterAuthInstance,
  type BetterAuthInstance,
} from "./better-auth.js";
import { getOrCreateAgentToken } from "./agent-token.js";

export function createHttpApp(
  store: RegistryStore,
  branding: RegistryBrandingConfig
) {
  const api = createRegistryApi(store);
  const auth = getBetterAuthInstance(store);
  const app = new Hono();
  const resolveActor = (headers: Headers) =>
    actorFromHeaders(headers, auth, store);

  async function canAccessWorkspace(
    headers: Headers,
    workspace: Workspace
  ): Promise<boolean> {
    const actor = await resolveActor(headers);
    return workspace.visibility === "public" || hasRole(actor, "user");
  }

  async function canAccessPackage(
    headers: Headers,
    packageId: string
  ): Promise<boolean> {
    const pkg = await api.packageDetail(packageId);

    if (!pkg) {
      return true;
    }

    const workspace = await api.workspaceDetail(pkg.workspaceId);
    return !workspace || (await canAccessWorkspace(headers, workspace));
  }

  app.on(["POST", "GET"], "/api/auth/*", (context) =>
    auth.handler(context.req.raw)
  );

  app.get("/health", (context) => context.json({ ok: true, mode: store.mode }));

  app.get("/api/config", (context) => context.json({ branding }));

  app.get("/api/workspaces/:workspaceId", async (context) => {
    const workspace = await api.workspaceDetail(
      context.req.param("workspaceId")
    );

    if (!workspace) {
      return context.json({ error: "Workspace not found" }, 404);
    }

    if (!(await canAccessWorkspace(context.req.raw.headers, workspace))) {
      return context.json({ error: "User role required" }, 403);
    }

    return context.json({ workspace });
  });

  app.patch("/api/workspaces/:workspaceId", async (context) => {
    const actor = await resolveActor(context.req.raw.headers);

    if (!hasRole(actor, "admin")) {
      return context.json({ error: "Admin role required" }, 403);
    }

    const body = (await context.req.json()) as {
      reportingPolicy?: string;
      visibility?: string;
      logoUrl?: unknown;
    };
    const reportingPolicy = parseReportingPolicy(body.reportingPolicy);
    const visibility = parseVisibility(body.visibility);
    const logo = normalizeLogoUrlInput(body.logoUrl);

    if (
      (body.reportingPolicy && !reportingPolicy) ||
      (body.visibility && !visibility) ||
      !logo.ok
    ) {
      return context.json(
        {
          error: logo.ok
            ? "Request body includes invalid workspace settings."
            : logo.error,
        },
        400
      );
    }

    const workspace = await api.updateWorkspace({
      workspaceId: context.req.param("workspaceId"),
      reportingPolicy,
      visibility,
      logoUrl: logo.value,
    });

    if (!workspace) {
      return context.json({ error: "Workspace not found" }, 404);
    }

    return context.json({ workspace });
  });

  app.get("/api/workspaces/:workspaceId/packages", async (context) => {
    const workspaceId = context.req.param("workspaceId");
    const workspace = await api.workspaceDetail(workspaceId);

    if (
      workspace &&
      !(await canAccessWorkspace(context.req.raw.headers, workspace))
    ) {
      return context.json({ error: "User role required" }, 403);
    }

    const actor = await resolveActor(context.req.raw.headers);
    const packages = await api.search(workspaceId, context.req.query("q"));

    if (hasRole(actor, "maintainer")) {
      return context.json({ packages });
    }

    const installablePackages = [];

    for (const pkg of packages) {
      if (await api.latestApprovedVersion(pkg.id)) {
        installablePackages.push(pkg);
      } else if (actor) {
        const versions = await api.packageVersions(pkg.id);
        const hasUserVersion = versions.some(
          (v) => v.provenance.actorId === actor.id
        );
        if (hasUserVersion) {
          installablePackages.push(pkg);
        }
      }
    }

    return context.json({ packages: installablePackages });
  });

  app.get("/api/packages/:packageId", async (context) => {
    const packageId = context.req.param("packageId");
    const packageDetail = await api.packageDetail(packageId);

    if (!packageDetail) {
      return context.json({ error: "Package not found" }, 404);
    }

    if (!(await canAccessPackage(context.req.raw.headers, packageDetail.id))) {
      return context.json({ error: "User role required" }, 403);
    }

    await api.recordPackageView(packageId);

    return context.json({ package: packageDetail });
  });

  app.get("/api/packages/:packageId/latest-approved", async (context) => {
    if (
      !(await canAccessPackage(
        context.req.raw.headers,
        context.req.param("packageId")
      ))
    ) {
      return context.json({ error: "User role required" }, 403);
    }

    const version = await api.latestApprovedVersion(
      context.req.param("packageId")
    );

    if (!version) {
      return context.json({ error: "Approved version not found" }, 404);
    }

    return context.json({ version });
  });

  app.get("/api/packages/:packageId/report", async (context) => {
    const actor = await resolveActor(context.req.raw.headers);

    if (!hasRole(actor, "maintainer")) {
      return context.json({ error: "Maintainer role required" }, 403);
    }

    const report = await api.packageReport(context.req.param("packageId"));

    if (!report) {
      return context.json({ error: "Package not found" }, 404);
    }

    return context.json({ report });
  });

  app.get("/api/packages/:packageId/versions", async (context) => {
    if (
      !(await canAccessPackage(
        context.req.raw.headers,
        context.req.param("packageId")
      ))
    ) {
      return context.json({ error: "User role required" }, 403);
    }

    const actor = await resolveActor(context.req.raw.headers);
    const versions = await api.packageVersions(context.req.param("packageId"));

    if (!hasRole(actor, "maintainer")) {
      return context.json({
        versions: versions.filter(
          (entry) => entry.lifecycleState === "approved"
        ),
      });
    }

    return context.json({ versions });
  });

  app.get("/api/versions/:versionId", async (context) => {
    const version = await api.versionDetail(context.req.param("versionId"));

    if (!version) {
      return context.json({ error: "Version not found" }, 404);
    }

    if (!(await canAccessPackage(context.req.raw.headers, version.packageId))) {
      return context.json({ error: "User role required" }, 403);
    }

    const actor = await resolveActor(context.req.raw.headers);

    if (
      !hasRole(actor, "maintainer") &&
      version.lifecycleState !== "approved"
    ) {
      return context.json({ error: "Approved version required" }, 403);
    }

    return context.json({ version });
  });

  app.post("/api/validation/package-tree", async (context) => {
    const body = await parsePackageTreeBody(context.req.raw);
    return context.json({ validation: api.validate(body.entries) });
  });

  app.post("/api/artifacts/ingest", async (context) => {
    const actor = await resolveActor(context.req.raw.headers);

    if (!hasRole(actor, "maintainer")) {
      return context.json({ error: "Maintainer role required" }, 403);
    }

    const body = await parsePackageTreeBody(context.req.raw);

    try {
      return context.json(await api.ingestArtifact(body.entries), 201);
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : "Invalid artifact" },
        422
      );
    }
  });

  app.post("/api/workspaces/:workspaceId/packages/upload", async (context) => {
    const actor = await resolveActor(context.req.raw.headers);

    if (!hasRole(actor, "user")) {
      return context.json({ error: "Sign-in required" }, 403);
    }

    const body = (await context.req.json()) as {
      packageSlug?: string;
      packageName?: string;
      description?: string;
      categories?: string[];
      version?: string;
      entries?: PackageTreeEntry[];
      actorId?: string;
      actorName?: string;
      actorEmail?: string;
    };

    if (
      !body.packageSlug ||
      !body.packageName ||
      !body.description ||
      !body.version ||
      !Array.isArray(body.entries)
    ) {
      return context.json(
        {
          error:
            "Request body must include packageSlug, packageName, description, version, and entries.",
        },
        400
      );
    }

    let actorName = body.actorName;
    let actorEmail = body.actorEmail;

    if (actor && actor.id && (!actorName || !actorEmail)) {
      const userRow = await store.kysely
        ?.selectFrom("user")
        .select(["name", "email"])
        .where("id", "=", actor.id)
        .executeTakeFirst();
      if (userRow) {
        if (!actorName) actorName = userRow.name;
        if (!actorEmail) actorEmail = userRow.email;
      }
    }

    try {
      const version = await api.createUploadedVersion({
        workspaceId: context.req.param("workspaceId"),
        packageSlug: body.packageSlug,
        packageName: body.packageName,
        description: body.description,
        categories: body.categories,
        version: body.version,
        entries: body.entries,
        actorId: body.actorId ?? actor?.id,
        actorName,
        actorEmail,
      });

      return context.json({ version }, 201);
    } catch (error) {
      return context.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to publish uploaded package.",
        },
        422
      );
    }
  });

  app.post(
    "/api/workspaces/:workspaceId/packages/import-git",
    async (context) => {
      const actor = await resolveActor(context.req.raw.headers);

      if (!hasRole(actor, "user")) {
        return context.json({ error: "Sign-in required" }, 403);
      }

      const body = (await context.req.json()) as {
        packageSlug?: string;
        packageName?: string;
        description?: string;
        categories?: string[];
        version?: string;
        repositoryPath?: string;
        ref?: string;
        subdirectory?: string;
        actorId?: string;
        actorName?: string;
        actorEmail?: string;
      };

      if (
        !body.packageSlug ||
        !body.packageName ||
        !body.description ||
        !body.version ||
        !body.repositoryPath
      ) {
        return context.json(
          {
            error:
              "Request body must include packageSlug, packageName, description, version, and repositoryPath.",
          },
          400
        );
      }

      let actorName = body.actorName;
      let actorEmail = body.actorEmail;

      if (actor && actor.id && (!actorName || !actorEmail)) {
        const userRow = await store.kysely
          ?.selectFrom("user")
          .select(["name", "email"])
          .where("id", "=", actor.id)
          .executeTakeFirst();
        if (userRow) {
          if (!actorName) actorName = userRow.name;
          if (!actorEmail) actorEmail = userRow.email;
        }
      }

      try {
        const version = await api.createGitImportedVersion({
          workspaceId: context.req.param("workspaceId"),
          packageSlug: body.packageSlug,
          packageName: body.packageName,
          description: body.description,
          categories: body.categories,
          version: body.version,
          git: {
            repositoryPath: body.repositoryPath,
            ref: body.ref,
            subdirectory: body.subdirectory,
          },
          actorId: body.actorId ?? actor?.id,
          actorName,
          actorEmail,
        });

        return context.json({ version }, 201);
      } catch (error) {
        return context.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Unable to import Git package.",
          },
          422
        );
      }
    }
  );

  app.post("/api/versions/:versionId/lifecycle", async (context) => {
    const actor = await resolveActor(context.req.raw.headers);

    if (!hasRole(actor, "maintainer")) {
      return context.json({ error: "Maintainer role required" }, 403);
    }

    const body = (await context.req.json()) as {
      toState?: string;
      actorId?: string;
      replacementVersionId?: string;
    };
    const toState = parseLifecycleState(body.toState);

    if (!toState) {
      return context.json(
        { error: "Request body must include a valid toState." },
        400
      );
    }

    let version;

    try {
      version = await api.transitionVersion({
        versionId: context.req.param("versionId"),
        toState,
        actorId: body.actorId ?? actor?.id,
        replacementVersionId: body.replacementVersionId,
      });
    } catch (error) {
      return context.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to transition version.",
        },
        422
      );
    }

    if (!version) {
      return context.json({ error: "Version not found" }, 404);
    }

    return context.json({ version });
  });

  app.get("/api/artifacts/:digest/download", async (context) => {
    const packageId = context.req.query("packageId");
    const versionId = context.req.query("versionId");

    if (!packageId || !versionId) {
      return context.json(
        { error: "packageId and versionId query parameters are required." },
        400
      );
    }

    const version = await api.versionDetail(versionId);

    if (!version || version.packageId !== packageId) {
      return context.json({ error: "Version not found" }, 404);
    }

    if (version.artifactDigest !== context.req.param("digest")) {
      return context.json({ error: "Artifact digest mismatch" }, 404);
    }

    if (!(await canAccessPackage(context.req.raw.headers, packageId))) {
      return context.json({ error: "User role required" }, 403);
    }

    const actor = await resolveActor(context.req.raw.headers);

    if (
      !hasRole(actor, "maintainer") &&
      version.lifecycleState !== "approved"
    ) {
      return context.json({ error: "Approved version required" }, 403);
    }

    const download = await api.artifactDownload(context.req.param("digest"));

    if (!download) {
      return context.json({ error: "Artifact not found" }, 404);
    }

    await api.recordArtifactDownload(packageId, versionId);

    return new Response(new Uint8Array(download.content), {
      headers: {
        "content-disposition": `attachment; filename="${download.artifact.digest.replace(":", "-")}.zip"`,
        "content-type": "application/zip",
      },
    });
  });

  app.get("/api/workspaces/:workspaceId/usage-counts", async (context) => {
    const actor = await resolveActor(context.req.raw.headers);

    if (!hasRole(actor, "maintainer")) {
      return context.json({ error: "Maintainer role required" }, 403);
    }

    const count = await api.usageCount({
      workspaceId: context.req.param("workspaceId"),
      eventType: parseUsageEventType(context.req.query("eventType")),
      packageId: context.req.query("packageId"),
      versionId: context.req.query("versionId"),
    });

    return context.json({ count });
  });

  app.get("/api/workspaces/:workspaceId/reports", async (context) => {
    const actor = await resolveActor(context.req.raw.headers);

    if (!hasRole(actor, "maintainer")) {
      return context.json({ error: "Maintainer role required" }, 403);
    }

    const reports = await api.workspaceReports(
      context.req.param("workspaceId")
    );
    return context.json({ reports });
  });

  app.get("/api/workspaces/:workspaceId/catalog-stats", async (context) => {
    const workspaceId = context.req.param("workspaceId");
    const workspace = await api.workspaceDetail(workspaceId);

    if (
      workspace &&
      !(await canAccessWorkspace(context.req.raw.headers, workspace))
    ) {
      return context.json({ error: "User role required" }, 403);
    }

    const stats = await api.workspaceCatalogStats(workspaceId);
    return context.json({ stats });
  });

  app.post("/api/install-reports", async (context) => {
    const actor = await resolveActor(context.req.raw.headers);

    if (!hasRole(actor, "user")) {
      return context.json({ error: "User role required" }, 403);
    }

    const body = (await context.req.json()) as Parameters<
      RegistryApi["recordInstallReport"]
    >[0];

    if (
      !body.installId ||
      !body.packageId ||
      !body.versionId ||
      !body.state ||
      !body.reportedAt ||
      !body.targetKind
    ) {
      return context.json(
        { error: "Request body must include install report fields." },
        400
      );
    }

    await api.recordInstallReport(body);
    return context.json({ accepted: true }, 201);
  });

  app.get("/api/me/agent-token", async (context) => {
    const headers = context.req.raw.headers;

    if (auth) {
      try {
        const session = await auth.api.getSession({ headers });

        if (session?.user) {
          const user = session.user as typeof session.user & { role?: string };
          const token = await getOrCreateAgentToken(store, session.user.id);

          if (!token) {
            return context.json(
              { error: "Could not create agent token." },
              500
            );
          }

          return context.json({
            token,
            role: parseRole(user.role ?? null) ?? "user",
            actorId: session.user.id,
          });
        }
      } catch (error) {
        console.error("Agent token session lookup failed:", error);
      }
    }

    const actor = await resolveActor(headers);

    if (actor && devHeaderAuthEnabled()) {
      const token = await getOrCreateAgentToken(store, actor.id);

      if (!token) {
        return context.json({ error: "Sign-in required." }, 403);
      }

      return context.json({
        token,
        role: actor.role,
        actorId: actor.id,
      });
    }

    return context.json({ error: "Sign-in required." }, 403);
  });

  // Team roster — visible to any signed-in user.
  app.get("/api/team/members", async (context) => {
    const actor = await resolveActor(context.req.raw.headers);

    if (!hasRole(actor, "user")) {
      return context.json({ error: "Sign-in required" }, 403);
    }

    const members = await store.listTeamMembers();

    return context.json({ members: members.map(mapTeamMemberRow) });
  });

  // Admin user management routes
  app.get("/api/admin/users", async (context) => {
    const actor = await resolveActor(context.req.raw.headers);

    if (!hasRole(actor, "admin")) {
      return context.json({ error: "Admin role required" }, 403);
    }

    const members = await store.listTeamMembers();

    return context.json({ users: members.map(mapTeamMemberRow) });
  });

  app.patch("/api/admin/users/:userId", async (context) => {
    const actor = await resolveActor(context.req.raw.headers);

    if (!hasRole(actor, "admin")) {
      return context.json({ error: "Admin role required" }, 403);
    }

    const userId = context.req.param("userId");
    const body = (await context.req.json()) as { role?: string };
    const role = parseAdminRole(body.role);

    if (!role) {
      return context.json(
        {
          error:
            "Request body must include a valid role (user, maintainer, or admin).",
        },
        400
      );
    }

    const user = await store.updateUserRole(userId, role);

    if (!user) {
      return context.json({ error: "User not found" }, 404);
    }

    return context.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.createdAt,
        image: user.image,
      },
    });
  });

  app.delete("/api/admin/users/:userId", async (context) => {
    const actor = await resolveActor(context.req.raw.headers);

    if (!hasRole(actor, "admin")) {
      return context.json({ error: "Admin role required" }, 403);
    }

    const userId = context.req.param("userId");
    await store.deleteUser(userId);
    return context.json({ deleted: true });
  });

  return app;
}

function parseAdminRole(
  value: string | undefined
): "user" | "maintainer" | "admin" | undefined {
  if (value === "user" || value === "maintainer" || value === "admin") {
    return value;
  }
  return undefined;
}

function mapTeamMemberRow(member: TeamMemberRecord) {
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    created_at: member.createdAt,
    image: member.image,
    skillsSubmitted: member.skillsSubmitted,
  };
}

function parseUsageEventType(value: string | undefined) {
  return value === "view" || value === "download" ? value : undefined;
}

function parseLifecycleState(
  value: string | undefined
): LifecycleState | undefined {
  if (
    value === "draft" ||
    value === "published" ||
    value === "approved" ||
    value === "hidden" ||
    value === "deprecated"
  ) {
    return value;
  }

  return undefined;
}

function parseReportingPolicy(
  value: string | undefined
): Workspace["reportingPolicy"] | undefined {
  if (value === "disabled" || value === "opt-in" || value === "required") {
    return value;
  }

  return undefined;
}

function parseVisibility(
  value: string | undefined
): Workspace["visibility"] | undefined {
  if (value === "public" || value === "private") {
    return value;
  }

  return undefined;
}

async function parsePackageTreeBody(
  request: Request
): Promise<{ entries: PackageTreeEntry[] }> {
  const body = (await request.json()) as { entries?: PackageTreeEntry[] };

  if (!Array.isArray(body.entries)) {
    throw new Error("Request body must include entries.");
  }

  return { entries: body.entries };
}
