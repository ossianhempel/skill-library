import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { createKyselyInstance } from "@skill-library/storage";
import { cleanup, connect, setup, signIn } from "./mcp-test-helpers.js";

/**
 * The OAuth sign-in Claude runs, against a live SQL Server. Skipped unless
 * MSSQL_TEST_URL points at one (admin connection, no database in the path),
 * as for packages/storage/src/mssql.integration.test.ts.
 *
 * Sign-in consumes one-time values (the authorization code) through Better
 * Auth's Kysely adapter, whose SQL differs per dialect; PGlite cannot catch a
 * query that only SQL Server rejects.
 */
const ADMIN_URL = process.env.MSSQL_TEST_URL;
const DB_NAME = "skilltest_mcp";

afterAll(cleanup);

describe.skipIf(!ADMIN_URL)("remote MCP on SQL Server (live)", () => {
  it("signs a person in with OAuth and serves tools", async () => {
    const { db: admin } = createKyselyInstance({
      databaseUrl: `${ADMIN_URL}?trustServerCertificate=true`,
      databaseEngine: "mssql",
    });
    await sql`drop database if exists ${sql.ref(DB_NAME)}`.execute(admin);
    await sql`create database ${sql.ref(DB_NAME)}`.execute(admin);
    await admin.destroy();

    const { app, store } = await setup(
      `${ADMIN_URL}/${DB_NAME}?trustServerCertificate=true`
    );
    const token = await signIn(app, store, "colleague", "user");
    const client = await connect(app, token);
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    expect(tools).toContain("skills_search");
    await client.close();
  }, 120000);
});
