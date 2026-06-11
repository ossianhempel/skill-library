import { randomBytes } from "node:crypto";
import type { Actor } from "@skill-library/domain";
import type { RegistryStore } from "@skill-library/storage";
import { parseRole } from "./auth.js";

export async function getOrCreateAgentToken(store: RegistryStore, userId: string): Promise<string | undefined> {
  const existing = await store.getAgentToken(userId);

  if (existing) {
    return existing;
  }

  const token = `sl_${randomBytes(24).toString("hex")}`;
  return store.setAgentToken(userId, token);
}

export async function actorFromUserAgentToken(store: RegistryStore, authorization: string | null): Promise<Actor | undefined> {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return undefined;
  }

  const row = await store.findUserByAgentToken(token);

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
