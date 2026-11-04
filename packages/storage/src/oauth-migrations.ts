import type { Kysely } from "kysely";
import type { DatabaseSchema } from "./kysely.js";
import type { engineColumnTypes } from "./migrations.js";

/**
 * Tables for Better Auth's MCP plugin (an OAuth 2.1 authorization server with
 * dynamic client registration), which lets remote MCP clients such as Claude
 * sign users in with the registry's existing SSO. Column names follow the
 * plugin's field names, so no field mapping is needed.
 *
 * The user id columns carry no foreign key: SQL Server refuses a second cascade
 * path from `user` to `oauthAccessToken` (user -> application -> token and
 * user -> token). The MCP route checks that a token's user still exists, so an
 * orphan token left by a deleted user signs nobody in.
 */
export async function runOAuthMigrations(
  db: Kysely<DatabaseSchema>,
  t: ReturnType<typeof engineColumnTypes>,
  existing: Set<string>
): Promise<void> {
  if (!existing.has("oauthApplication")) {
    await db.schema
      .createTable("oauthApplication")
      .addColumn("id", t.keyText, (c) => c.primaryKey())
      .addColumn("name", t.freeText)
      .addColumn("icon", t.freeText)
      .addColumn("metadata", t.freeText)
      .addColumn("clientId", t.keyText, (c) => c.notNull().unique())
      .addColumn("clientSecret", t.freeText)
      .addColumn("redirectUrls", t.freeText, (c) => c.notNull())
      .addColumn("type", t.keyText, (c) => c.notNull())
      .addColumn("disabled", t.bool, (c) => c.defaultTo(t.falseDefault))
      .addColumn("userId", t.keyText)
      .addColumn("createdAt", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .addColumn("updatedAt", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .execute();
  }

  if (!existing.has("oauthAccessToken")) {
    await db.schema
      .createTable("oauthAccessToken")
      .addColumn("id", t.keyText, (c) => c.primaryKey())
      .addColumn("accessToken", t.keyText, (c) => c.notNull().unique())
      .addColumn("refreshToken", t.keyText, (c) => c.notNull().unique())
      .addColumn("accessTokenExpiresAt", t.timestamp, (c) => c.notNull())
      .addColumn("refreshTokenExpiresAt", t.timestamp, (c) => c.notNull())
      .addColumn("clientId", t.keyText, (c) =>
        c.notNull().references("oauthApplication.clientId").onDelete("cascade")
      )
      .addColumn("userId", t.keyText)
      .addColumn("scopes", t.freeText, (c) => c.notNull())
      .addColumn("createdAt", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .addColumn("updatedAt", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .execute();
  }

  if (!existing.has("oauthConsent")) {
    await db.schema
      .createTable("oauthConsent")
      .addColumn("id", t.keyText, (c) => c.primaryKey())
      .addColumn("clientId", t.keyText, (c) =>
        c.notNull().references("oauthApplication.clientId").onDelete("cascade")
      )
      .addColumn("userId", t.keyText, (c) => c.notNull())
      .addColumn("scopes", t.freeText, (c) => c.notNull())
      .addColumn("consentGiven", t.bool, (c) => c.notNull())
      .addColumn("createdAt", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .addColumn("updatedAt", t.timestamp, (c) => c.notNull().defaultTo(t.now))
      .execute();
  }
}
