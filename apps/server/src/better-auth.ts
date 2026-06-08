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

export function getBetterAuthInstance(store: RegistryStore) {
  return betterAuth({
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
