import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { createKyselyInstance } from "./kysely.js";
import { engineColumnTypes, runRegistryMigrations } from "./migrations.js";

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.map((c) => c()));
  closers.length = 0;
});

describe("runRegistryMigrations on PGlite", () => {
  it("creates the registry tables and is idempotent", async () => {
    const { db } = createKyselyInstance({});
    closers.push(() => db.destroy());

    await runRegistryMigrations(db, "pglite");
    // Re-running is a safe no-op (tables created if-not-exists).
    await runRegistryMigrations(db, "pglite");

    // A workspace row inserts and reads back, proving the table + columns exist.
    await db
      .insertInto("workspaces")
      .values({ id: "w1", slug: "team", name: "Team", reporting_policy: "opt-in", visibility: "private" })
      .execute();

    const row = await db
      .selectFrom("workspaces")
      .selectAll()
      .where("id", "=", "w1")
      .executeTakeFirstOrThrow();

    expect(row.slug).toBe("team");
  });

  it("applies the empty-array JSON default to categories", async () => {
    const { db } = createKyselyInstance({});
    closers.push(() => db.destroy());
    await runRegistryMigrations(db, "pglite");

    await db.insertInto("workspaces").values({ id: "w1", slug: "t", name: "T", reporting_policy: "disabled", visibility: "private" }).execute();
    await db
      .insertInto("skill_packages")
      .values({ id: "p1", workspace_id: "w1", slug: "pkg", name: "Pkg", description: "d", created_at: new Date(), updated_at: new Date() })
      .execute();

    const row = await db.selectFrom("skill_packages").select("categories").where("id", "=", "p1").executeTakeFirstOrThrow();
    // jsonb is returned pre-parsed by pg/pglite; mssql would return a raw string. Normalize.
    const categories = typeof row.categories === "string" ? JSON.parse(row.categories || "[]") : row.categories;
    expect(categories).toEqual([]);
  });
});

describe("engine column-type mapping", () => {
  it("maps SQL Server types: bounded key text, nvarchar(max) free/json, datetimeoffset", () => {
    const { db } = createKyselyInstance({ databaseEngine: "mssql", databaseUrl: "sqlserver://u:p@host:1433/db" });
    closers.push(() => db.destroy());
    const t = engineColumnTypes("mssql");

    expect(sql`${t.keyText}`.compile(db).sql).toContain("nvarchar(450)");
    expect(sql`${t.freeText}`.compile(db).sql).toContain("nvarchar(max)");
    expect(sql`${t.json}`.compile(db).sql).toContain("nvarchar(max)");
    expect(sql`${t.timestamp}`.compile(db).sql).toContain("datetimeoffset");
    expect(sql`${t.now}`.compile(db).sql).toContain("sysdatetimeoffset()");
  });

  it("maps Postgres/PGlite types: text, jsonb, timestamptz", () => {
    const { db } = createKyselyInstance({});
    closers.push(() => db.destroy());
    const t = engineColumnTypes("pglite");

    expect(sql`${t.json}`.compile(db).sql).toContain("jsonb");
    expect(sql`${t.timestamp}`.compile(db).sql).toContain("timestamptz");
    expect(sql`${t.now}`.compile(db).sql).toContain("now()");
  });
});
