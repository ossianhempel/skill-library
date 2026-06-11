import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { createKyselyInstance, resolveDatabaseEngine } from "./kysely.js";

describe("resolveDatabaseEngine", () => {
  it("defaults to pglite when no connection string is given", () => {
    expect(resolveDatabaseEngine({})).toBe("pglite");
  });

  it("infers postgres from postgres:// and postgresql:// schemes", () => {
    expect(resolveDatabaseEngine({ databaseUrl: "postgres://u:p@host:5432/db" })).toBe("postgres");
    expect(resolveDatabaseEngine({ databaseUrl: "postgresql://u:p@host:5432/db" })).toBe("postgres");
  });

  it("infers mssql from sqlserver:// and mssql:// schemes", () => {
    expect(resolveDatabaseEngine({ databaseUrl: "sqlserver://u:p@host:1433/db" })).toBe("mssql");
    expect(resolveDatabaseEngine({ databaseUrl: "mssql://u:p@host:1433/db" })).toBe("mssql");
  });

  it("honors an explicit databaseEngine over the connection scheme", () => {
    expect(resolveDatabaseEngine({ databaseUrl: "postgres://u:p@host/db", databaseEngine: "mssql" })).toBe(
      "mssql"
    );
  });

  it("throws on an unrecognized explicit engine, naming the supported engines", () => {
    expect(() => resolveDatabaseEngine({ databaseEngine: "oracle" as never })).toThrow(/pglite, postgres, mssql/);
  });

  it("throws on an unknown connection scheme", () => {
    expect(() => resolveDatabaseEngine({ databaseUrl: "mysql://u:p@host/db" })).toThrow(/could not infer/i);
  });
});

describe("createKyselyInstance", () => {
  const instances: Array<{ destroy: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(instances.map((db) => db.destroy()));
    instances.length = 0;
  });

  it("returns a working in-memory PGlite instance for the default engine", async () => {
    const { db, engine } = createKyselyInstance({});
    instances.push(db);

    expect(engine).toBe("pglite");

    const result = await sql<{ one: number }>`select 1 as one`.execute(db);
    expect(Number(result.rows[0]?.one)).toBe(1);
  });
});
