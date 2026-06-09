import type { Actor, WorkspaceRole } from "@skill-library/domain";
import type { BetterAuthInstance } from "./better-auth.js";

export async function actorFromHeaders(headers: Headers, auth?: BetterAuthInstance): Promise<Actor | undefined> {
  const tokenActor = actorFromBearerToken(headers.get("authorization"));

  if (tokenActor) {
    return tokenActor;
  }

  if (auth) {
    try {
      const session = await auth.api.getSession({ headers });
      if (session && session.user) {
        const user = session.user as typeof session.user & { role?: string };
        const role = parseRole(user.role ?? null);
        return {
          id: session.user.id,
          role: role ?? "user"
        };
      }
    } catch (error) {
      console.error("Better Auth session lookup failed:", error);
    }
  }

  if (!devHeaderAuthEnabled()) {
    return undefined;
  }

  const role = parseRole(headers.get("x-skill-library-role"));
  const id = headers.get("x-skill-library-actor") ?? "anonymous";

  return role ? { id, role } : undefined;
}

export function devHeaderAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function hasRole(actor: Actor | undefined, minimumRole: WorkspaceRole) {
  if (!actor) {
    return false;
  }

  return roleRank(actor.role) >= roleRank(minimumRole);
}

export function parseRole(value: string | null): WorkspaceRole | undefined {
  if (value === "user" || value === "maintainer" || value === "admin") {
    return value;
  }

  return undefined;
}

export function actorFromBearerToken(authorization: string | null): Actor | undefined {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return undefined;
  }

  return configuredApiKeys().get(token);
}

export function configuredApiKeys(): Map<string, Actor> {
  const entries = process.env.SKILL_LIBRARY_API_KEYS?.split(",") ?? [];
  const keys = new Map<string, Actor>();

  for (const entry of entries) {
    const [token, roleValue, idValue] = entry.split(":");
    const role = parseRole(roleValue ?? null);

    if (!token || !role) {
      continue;
    }

    keys.set(token, {
      role,
      id: idValue || role
    });
  }

  return keys;
}

function roleRank(role: WorkspaceRole) {
  return role === "admin" ? 3 : role === "maintainer" ? 2 : 1;
}
