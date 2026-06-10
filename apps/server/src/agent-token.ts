import { randomBytes } from "node:crypto";
import type { Actor } from "@skill-library/domain";
import type { RegistryStore } from "@skill-library/storage";
import { parseRole } from "./auth.js";

export async function getOrCreateAgentToken(store: RegistryStore, userId: string): Promise<string | undefined> {
  const existing = await store.query<{ agent_api_token: string | null }>(
    'select agent_api_token from "user" where id = $1',
    [userId]
  );

  if (existing.rows[0]?.agent_api_token) {
    return existing.rows[0].agent_api_token;
  }

  const token = `sl_${randomBytes(24).toString("hex")}`;
  const updated = await store.query<{ agent_api_token: string }>(
    'update "user" set agent_api_token = $1, updated_at = now() where id = $2 returning agent_api_token',
    [token, userId]
  );

  return updated.rows[0]?.agent_api_token;
}

export async function actorFromUserAgentToken(store: RegistryStore, authorization: string | null): Promise<Actor | undefined> {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return undefined;
  }

  const result = await store.query<{ id: string; role: string }>(
    'select id, role from "user" where agent_api_token = $1',
    [token]
  );
  const row = result.rows[0];

  if (!row) {
    return undefined;
  }

  const role = parseRole(row.role);

  if (!role) {
    return undefined;
  }

  return {
    id: row.id,
    role
  };
}
