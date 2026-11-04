import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { mcp } from "better-auth/plugins";
import type { RegistryStore } from "@skill-library/storage";

const developmentAuthSecret =
  "fallback-development-secret-key-must-be-changed-in-production";

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

  for (const entry of process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ??
    []) {
    const trimmed = entry.trim();

    if (trimmed) {
      origins.add(trimmed);
    }
  }

  return [...origins];
}

export function getBetterAuthInstance(store: RegistryStore) {
  const trustedOrigins = resolveTrustedOrigins();

  if (!store.kysely || !store.engine) {
    throw new Error(
      "Better Auth requires a SQL-backed RegistryStore (Kysely instance unavailable)."
    );
  }

  // Better Auth's native Kysely adapter shares the store's single Kysely instance; `type`
  // drives its dialect-specific handling (mssql OUTPUT clause, bit booleans, etc.).
  const databaseType = store.engine === "mssql" ? "mssql" : "postgres";

  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: trustedOrigins.length > 0 ? trustedOrigins : undefined,
    database: { db: store.kysely, type: databaseType } as any,
    account: {
      // Map the snake_case timestamp columns the existing schema uses (Better Auth defaults
      // to camelCase). This replaces the retired custom adapter's hand-written column mapping.
      fields: { createdAt: "created_at", updatedAt: "updated_at" },
      accountLinking: {
        enabled: true,
        trustedProviders: ["microsoft"],
        // Entra ID verifies email; allow linking after a partial failed signup left user rows behind.
        requireLocalEmailVerified: false,
      },
    },
    user: {
      fields: { createdAt: "created_at", updatedAt: "updated_at" },
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "user",
          input: false,
        },
        agent_api_token: {
          type: "string",
          required: false,
          input: false,
        },
      },
    },
    verification: {
      fields: { createdAt: "created_at", updatedAt: "updated_at" },
    },
    session: {
      fields: {
        createdAt: "created_at",
        updatedAt: "updated_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
      },
    },
    socialProviders: {
      microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID || "mock-client-id",
        clientSecret:
          process.env.MICROSOFT_CLIENT_SECRET || "mock-client-secret",
        tenantId: process.env.MICROSOFT_TENANT_ID || "common",
      },
    },
    secret: resolveBetterAuthSecret(),
    // OAuth 2.1 authorization server (with dynamic client registration) for the
    // remote MCP endpoint at /mcp. Sign-in reuses the Microsoft SSO above.
    // Cast keeps the plugin's endpoint types (which reference unexported zod
    // types) out of this module's emitted declarations; see mcp/oauth.ts.
    plugins: [mcp(mcpOAuthOptions()) as BetterAuthPlugin],
    databaseHooks: {
      user: {
        create: {
          before: async (user: Record<string, any>) => {
            const count = await store.countUsers();

            if (count === 0) {
              return { data: { ...user, role: "admin" } };
            }

            return { data: user };
          },
        },
      },
    },
  });
}

export const MCP_SIGN_IN_PATH = "/api/mcp/sign-in";

function mcpOAuthOptions() {
  const baseUrl = process.env.BETTER_AUTH_URL?.trim().replace(/\/$/, "");

  return {
    loginPage: MCP_SIGN_IN_PATH,
    resource: baseUrl ? `${baseUrl}/mcp` : undefined,
    oidcConfig: {
      loginPage: MCP_SIGN_IN_PATH,
      consentPage: "/api/mcp/consent",
      requirePKCE: true,
      // One hour per access token; clients that asked for offline_access refresh
      // for 30 days before the colleague has to sign in again.
      accessTokenExpiresIn: 60 * 60,
      refreshTokenExpiresIn: 30 * 24 * 60 * 60,
    },
  };
}

export type BetterAuthInstance = ReturnType<typeof getBetterAuthInstance>;
