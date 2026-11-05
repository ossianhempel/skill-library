import type { Hono } from "hono";
import type { Actor } from "@skill-library/domain";
import type { RegistryApi } from "./index.js";
import { hasRole } from "./auth.js";
import { parseLifecycleState } from "./request-parsers.js";
import { mayDecide, versionWithSiblings } from "./proposals.js";

/**
 * Moves a version to another lifecycle state. Maintainers decide on any
 * version; a skill's owner decides on proposals others made to their skill.
 */
export function registerLifecycleRoute(
  app: Hono,
  api: RegistryApi,
  resolveActor: (headers: Headers) => Promise<Actor | undefined>
) {
  app.post("/api/versions/:versionId/lifecycle", async (context) => {
    const actor = await resolveActor(context.req.raw.headers);

    if (!hasRole(actor, "user")) {
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

    const target = await versionWithSiblings(
      api,
      context.req.param("versionId")
    );
    const maintainer = hasRole(actor, "maintainer");

    if (target && !mayDecide(actor, target.version, target.versions, toState)) {
      return context.json(
        {
          error:
            "Maintainer role, or the skill's owner for a proposal, required",
        },
        403
      );
    }

    let version;

    try {
      version = await api.transitionVersion({
        versionId: context.req.param("versionId"),
        toState,
        actorId: (maintainer && body.actorId) || actor?.id,
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
}
