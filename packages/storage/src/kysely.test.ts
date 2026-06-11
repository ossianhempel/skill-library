import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { buildTediousConfig, createKyselyInstance, resolveDatabaseEngine } from "./kysely.js";

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

describe("buildTediousConfig (Azure SQL Server)", () => {
  it("enables encryption by default and parses host/port/database/credentials", () => {
    const config = buildTediousConfig("sqlserver://app_user:s3cret@my-server.database.windows.net:1433/skill_library");

    expect(config.server).toBe("my-server.database.windows.net");
    expect(config.options?.port).toBe(1433);
    expect(config.options?.database).toBe("skill_library");
    expect(config.options?.encrypt).toBe(true);
    expect(config.options?.trustServerCertificate).toBe(false);
    expect(config.authentication?.options).toMatchObject({ userName: "app_user", password: "s3cret" });
  });

  it("honors ?encrypt=false and ?trustServerCertificate=true overrides", () => {
    const config = buildTediousConfig(
      "sqlserver://u:p@localhost:14333/db?encrypt=false&trustServerCertificate=true"
    );

    expect(config.options?.encrypt).toBe(false);
    expect(config.options?.trustServerCertificate).toBe(true);
  });

  it("defaults the port to 1433 when the URL omits it", () => {
    const config = buildTediousConfig("sqlserver://u:p@host/db");
    expect(config.options?.port).toBe(1433);
  });

  it("throws a clear error when no connection string is given", () => {
    expect(() => buildTediousConfig(undefined)).toThrow(/sqlserver:\/\//);
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
