import { betterAuth } from "better-auth";
import { createBetterAuthAdapter } from "./better-auth-adapter.js";
import type { RegistryStore } from "@skill-library/storage";

const developmentAuthSecret = "fallback-development-secret-key-must-be-changed-in-production";

export function resolveBetterAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is required when NODE_ENV=production.");
  }

  return developmentAuthSecret;
}

function resolveTrustedOrigins(): string[] {
  const origins = new Set<string>();

  if (process.env.BETTER_AUTH_URL?.trim()) {
    origins.add(process.env.BETTER_AUTH_URL.trim());
  }

  for (const entry of process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? []) {
    const trimmed = entry.trim();

    if (trimmed) {
      origins.add(trimmed);
    }
  }

  return [...origins];
}

export function getBetterAuthInstance(store: RegistryStore) {
  const trustedOrigins = resolveTrustedOrigins();

  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: trustedOrigins.length > 0 ? trustedOrigins : undefined,
    database: createBetterAuthAdapter(store) as any,
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "user",
          input: false
        }
      }
    },
    socialProviders: {
      microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID || "mock-client-id",
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "mock-client-secret",
        tenantId: process.env.MICROSOFT_TENANT_ID || "common",
      }
    },
    secret: resolveBetterAuthSecret(),
    databaseHooks: {
      user: {
        create: {
          before: async (user: Record<string, any>) => {
            const result = await store.query<{ count: number }>('select count(*) as count from "user"');
            const count = Number(result.rows[0]?.count ?? 0);

            if (count === 0) {
              return { data: { ...user, role: "admin" } };
            }

            return { data: user };
          }
        }
      }
    }
  });
}

export type BetterAuthInstance = ReturnType<typeof getBetterAuthInstance>;
