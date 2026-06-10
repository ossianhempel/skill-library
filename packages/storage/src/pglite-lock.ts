import { hostname } from "node:os";
import { readFile, unlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const PGLITE_WRITER_LOCK_FILE = ".pglite-writer.lock";

const defaultStaleMs = 60_000;
const defaultHeartbeatMs = 20_000;

export interface PgliteWriterLockPayload {
  pid: number;
  hostname: string;
  startedAt: string;
  lastHeartbeat: string;
}

export interface PgliteWriterLockOptions {
  staleMs?: number;
  heartbeatMs?: number;
  now?: () => number;
}

export class PgliteWriterLockError extends Error {
  constructor(message: string, readonly holder?: PgliteWriterLockPayload) {
    super(message);
    this.name = "PgliteWriterLockError";
  }
}

export function pgliteWriterLockPath(dataDir: string): string {
  return join(dataDir, PGLITE_WRITER_LOCK_FILE);
}

export function formatPglitePersistenceWarning(dataDir: string): string {
  return [
    "PGlite mode is active: exactly one app instance may write to the data directory.",
    `Ensure ${dataDir} is on a persistent volume, run a single replica, and take external backups of the volume.`,
    "Rolling deploys that briefly run old and new instances against the same data directory can corrupt PGlite.",
    "Use stop-before-start (single-instance) deploys, or set DATABASE_URL for external Postgres in production/HA setups."
  ].join(" ");
}

export async function acquirePgliteWriterLock(dataDir: string, options: PgliteWriterLockOptions = {}): Promise<() => Promise<void>> {
  const staleMs = options.staleMs ?? defaultStaleMs;
  const heartbeatMs = options.heartbeatMs ?? defaultHeartbeatMs;
  const now = options.now ?? Date.now;
  const lockPath = pgliteWriterLockPath(dataDir);
  const startedAt = new Date(now()).toISOString();
  const payload: PgliteWriterLockPayload = {
    pid: process.pid,
    hostname: hostname(),
    startedAt,
    lastHeartbeat: startedAt
  };

  await writeLockAtomically(lockPath, payload, staleMs, now);

  const heartbeatTimer = setInterval(() => {
    void touchLockHeartbeat(lockPath, payload, now).catch(() => {
      // Best-effort heartbeat; startup guard already passed.
    });
  }, heartbeatMs);
  heartbeatTimer.unref();

  let released = false;

  return async () => {
    if (released) {
      return;
    }

    released = true;
    clearInterval(heartbeatTimer);
    await unlink(lockPath).catch(() => {
      // Another instance may have taken over after a stale timeout.
    });
  };
}

async function writeLockAtomically(
  lockPath: string,
  payload: PgliteWriterLockPayload,
  staleMs: number,
  now: () => number
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(lockPath, `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx" });
      return;
    } catch (error) {
      const errno = error as NodeJS.ErrnoException;

      if (errno.code !== "EEXIST") {
        throw error;
      }

      const holder = await readLockPayload(lockPath);

      if (holder && !isStaleLock(holder, staleMs, now)) {
        throw new PgliteWriterLockError(buildLockHeldMessage(holder, staleMs), holder);
      }

      await unlink(lockPath).catch(() => {
        // Another process may have removed a stale lock between checks.
      });
    }
  }

  throw new PgliteWriterLockError(
    `Failed to acquire PGlite single-writer lock at ${lockPath}. Retry startup after the current holder stops or the stale lock timeout (${staleMs}ms) elapses.`
  );
}

async function readLockPayload(lockPath: string): Promise<PgliteWriterLockPayload | undefined> {
  try {
    const raw = await readFile(lockPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PgliteWriterLockPayload>;

    if (
      typeof parsed.pid !== "number" ||
      typeof parsed.hostname !== "string" ||
      typeof parsed.startedAt !== "string" ||
      typeof parsed.lastHeartbeat !== "string"
    ) {
      return undefined;
    }

    return {
      pid: parsed.pid,
      hostname: parsed.hostname,
      startedAt: parsed.startedAt,
      lastHeartbeat: parsed.lastHeartbeat
    };
  } catch {
    return undefined;
  }
}

function isStaleLock(holder: PgliteWriterLockPayload, staleMs: number, now: () => number): boolean {
  const lastHeartbeatMs = Date.parse(holder.lastHeartbeat);

  if (Number.isNaN(lastHeartbeatMs)) {
    return true;
  }

  return now() - lastHeartbeatMs >= staleMs;
}

function buildLockHeldMessage(holder: PgliteWriterLockPayload, staleMs: number): string {
  return [
    "PGlite single-writer lock is already held.",
    `Holder: pid ${holder.pid} on ${holder.hostname} (started ${holder.startedAt}, last heartbeat ${holder.lastHeartbeat}).`,
    "PGlite supports exactly one writing instance per data directory. Running multiple replicas or overlapping rolling deploy instances against the same volume can corrupt the database.",
    "Stop the other instance, wait for the stale lock timeout, or configure DATABASE_URL to use external Postgres for production/HA.",
    `Stale locks may be taken over automatically after ${staleMs}ms without a heartbeat.`
  ].join(" ");
}

async function touchLockHeartbeat(lockPath: string, payload: PgliteWriterLockPayload, now: () => number): Promise<void> {
  payload.lastHeartbeat = new Date(now()).toISOString();
  await writeFile(lockPath, `${JSON.stringify(payload, null, 2)}\n`);
  await utimes(lockPath, now() / 1000, now() / 1000);
}
