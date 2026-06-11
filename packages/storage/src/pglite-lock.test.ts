import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquirePgliteWriterLock,
  PgliteWriterLockError,
  pgliteWriterLockPath,
  PGLITE_WRITER_LOCK_FILE
} from "./pglite-lock.js";
import { createRegistryStore } from "./index.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tmpDirs.length = 0;
});

describe("PGlite writer lock", () => {
  it("creates a lock file on first startup", async () => {
    const dataDir = await makeTmpDir();
    const release = await acquirePgliteWriterLock(dataDir);

    try {
      const lockPath = pgliteWriterLockPath(dataDir);
      const payload = JSON.parse(await readFile(lockPath, "utf8")) as {
        pid: number;
        hostname: string;
        startedAt: string;
        lastHeartbeat: string;
      };

      expect(payload.pid).toBe(process.pid);
      expect(payload.hostname).toBe(hostname());
      expect(payload.startedAt).toBe(payload.lastHeartbeat);
    } finally {
      await release();
    }
  });

  it("rejects a second concurrent startup against the same data directory", async () => {
    const dataDir = await makeTmpDir();
    const release = await acquirePgliteWriterLock(dataDir, { staleMs: 60_000 });

    try {
      await expect(acquirePgliteWriterLock(dataDir, { staleMs: 60_000 })).rejects.toMatchObject({
        name: "PgliteWriterLockError",
        message: expect.stringContaining("PGlite single-writer lock is already held")
      });
    } finally {
      await release();
    }
  });

  it("allows takeover when the existing lock is stale", async () => {
    const dataDir = await makeTmpDir();
    const lockPath = pgliteWriterLockPath(dataDir);
    const staleHeartbeat = new Date(Date.now() - 120_000).toISOString();

    await writeFile(
      lockPath,
      `${JSON.stringify(
        {
          pid: 99999,
          hostname: "stale-host",
          startedAt: staleHeartbeat,
          lastHeartbeat: staleHeartbeat
        },
        null,
        2
      )}\n`
    );

    const release = await acquirePgliteWriterLock(dataDir, {
      staleMs: 60_000,
      now: () => Date.now()
    });

    try {
      const payload = JSON.parse(await readFile(lockPath, "utf8")) as { pid: number; hostname: string };
      expect(payload.pid).toBe(process.pid);
      expect(payload.hostname).toBe(hostname());
    } finally {
      await release();
    }
  });

  it("releases the lock on shutdown", async () => {
    const dataDir = await makeTmpDir();
    const release = await acquirePgliteWriterLock(dataDir);

    await release();
    await expect(acquirePgliteWriterLock(dataDir)).resolves.toEqual(expect.any(Function));
  });
});

describe("createRegistryStore PGlite guard integration", () => {
  it("rejects a second concurrent PGlite store against the same data directory", async () => {
    const dataDir = await makeTmpDir();
    const first = await createRegistryStore({ dataDir, pgliteWriterLock: { staleMs: 60_000 } });

    try {
      await expect(createRegistryStore({ dataDir, pgliteWriterLock: { staleMs: 60_000 } })).rejects.toBeInstanceOf(
        PgliteWriterLockError
      );
    } finally {
      await first.close();
    }
  });

  it("does not create a PGlite writer lock in postgres mode", async () => {
    const dataDir = await makeTmpDir();

    // Postgres mode unifies on Kysely, whose pool connects lazily, so store creation
    // never touches the PGlite writer lock. A bad connection surfaces later at
    // migrate()/first query on boot, not here.
    const store = await createRegistryStore({
      dataDir,
      databaseUrl: "postgres://127.0.0.1:1/none"
    });

    try {
      expect(store.mode).toBe("postgres");
      await expect(readFile(join(dataDir, PGLITE_WRITER_LOCK_FILE), "utf8")).rejects.toThrow();
    } finally {
      await store.close();
    }
  });
});

async function makeTmpDir() {
  const dir = await mkdtemp(join(tmpdir(), "skill-library-pglite-lock-"));
  tmpDirs.push(dir);
  return dir;
}
