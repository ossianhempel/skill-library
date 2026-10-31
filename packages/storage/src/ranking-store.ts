import { sql, type Kysely } from "kysely";
import type {
  RankingSignals,
  SkillPackage,
  SkillVersion,
  UsageEvent,
} from "@skill-library/domain";
import type { DatabaseEngine, DatabaseSchema } from "./kysely.js";

/**
 * Dialect-aware text extraction from a JSON column. Postgres/PGlite use the `->>`
 * operator on jsonb; SQL Server stores JSON as nvarchar(max) and reads it with
 * JSON_VALUE(col, '$.key').
 */
export function jsonText(
  engine: DatabaseEngine,
  columnRef: string,
  key: string
) {
  return engine === "mssql"
    ? sql<string>`json_value(${sql.ref(columnRef)}, ${sql.lit(`$.${key}`)})`
    : sql<string>`${sql.ref(columnRef)} ->> ${sql.lit(key)}`;
}

export interface SkillVoteInput {
  packageId: string;
  userId: string;
  voted: boolean;
}

/** Per-person ranking inputs for one workspace; see rankWorkspace in the domain. */
export async function loadRankingSignals(
  db: Kysely<DatabaseSchema>,
  engine: DatabaseEngine,
  workspaceId: string
): Promise<RankingSignals> {
  const installRows = await db
    .selectFrom("usage_events")
    .select((eb) => [
      "package_id",
      "actor_id",
      eb.fn.max("created_at").as("last_at"),
    ])
    .where("workspace_id", "=", workspaceId)
    .where("event_type", "=", "download")
    .where("package_id", "is not", null)
    .where("actor_id", "is not", null)
    .groupBy(["package_id", "actor_id"])
    .execute();

  const voteRows = await db
    .selectFrom("skill_votes as sv")
    .innerJoin("skill_packages as p", "p.id", "sv.package_id")
    .select(["sv.package_id", "sv.user_id"])
    .where("p.workspace_id", "=", workspaceId)
    .execute();

  // Same provenance-to-user resolution as the version reads: a version's author is
  // the user whose id or email matches the recorded actor or git author. A
  // version with no match stays attributed to its recorded actor id.
  const actorId = jsonText(engine, "v.provenance", "actorId");
  const actorEmail = jsonText(engine, "v.provenance", "actorEmail");
  const gitAuthorEmail = jsonText(engine, "v.provenance", "gitAuthorEmail");
  const authorRows = await db
    .selectFrom("skill_versions as v")
    .innerJoin("skill_packages as p", "p.id", "v.package_id")
    .leftJoin("user as u", (join) =>
      join.on((eb) =>
        eb.or([
          eb(actorId, "=", eb.ref("u.id")),
          eb(actorId, "=", eb.ref("u.email")),
          eb(actorEmail, "=", eb.ref("u.email")),
          eb(gitAuthorEmail, "=", eb.ref("u.email")),
        ])
      )
    )
    .select([
      "v.package_id",
      "v.lifecycle_state",
      "u.id as user_id",
      "u.name",
      "u.image",
      actorId.as("actor_id"),
    ])
    .where("p.workspace_id", "=", workspaceId)
    .execute();

  const authors = new Map<string, RankingSignals["authors"][number]>();
  for (const row of authorRows) {
    // A static API key publishes with no user row, yet it is still the author.
    const userId = row.user_id ?? row.actor_id;
    if (!userId) continue;
    const key = `${row.package_id}\u0000${userId}`;
    const approved = row.lifecycle_state === "approved";
    const current = authors.get(key);
    if (current) {
      current.approved ||= approved;
      continue;
    }
    authors.set(key, {
      packageId: row.package_id,
      userId,
      name: row.name,
      image: row.image,
      approved,
    });
  }

  return {
    installs: installRows.map((row) => ({
      packageId: row.package_id as string,
      userId: row.actor_id as string,
      lastAt: new Date(row.last_at as Date | string).toISOString(),
    })),
    votes: voteRows.map((row) => ({
      packageId: row.package_id,
      userId: row.user_id,
    })),
    authors: [...authors.values()],
  };
}

export async function writeSkillVote(
  db: Kysely<DatabaseSchema>,
  engine: DatabaseEngine,
  input: SkillVoteInput
): Promise<void> {
  if (!input.voted) {
    await db
      .deleteFrom("skill_votes")
      .where("package_id", "=", input.packageId)
      .where("user_id", "=", input.userId)
      .execute();
    return;
  }

  // Voting twice (a double click, two tabs) must succeed, even concurrently, so
  // an existing (package, user) row is a no-op rather than a key violation.
  const insert = db
    .insertInto("skill_votes")
    .values({ package_id: input.packageId, user_id: input.userId });

  if (engine !== "mssql") {
    await insert
      .onConflict((oc) => oc.columns(["package_id", "user_id"]).doNothing())
      .execute();
    return;
  }

  try {
    await insert.execute();
  } catch (error) {
    // SQL Server has no ON CONFLICT: 2627/2601 are primary-key/unique violations.
    const number = (error as { number?: number }).number;
    if (number !== 2627 && number !== 2601) throw error;
  }
}

/**
 * The in-memory store's equivalent of loadRankingSignals. With no user table,
 * authors are resolved from provenance.actorId alone. Votes are keyed
 * "packageId\u0000userId".
 */
export function memoryRankingSignals(
  packages: SkillPackage[],
  versions: ReadonlyMap<string, SkillVersion[]>,
  usageEvents: UsageEvent[],
  votes: ReadonlySet<string>
): RankingSignals {
  const packageIds = new Set(packages.map((pkg) => pkg.id));
  const latest = new Map<string, RankingSignals["installs"][number]>();
  for (const event of usageEvents) {
    const { packageId, actorId } = event;
    if (!packageId || !actorId || !packageIds.has(packageId)) continue;
    if (event.eventType !== "download") continue;
    const key = `${packageId}\u0000${actorId}`;
    if ((latest.get(key)?.lastAt ?? "") < event.createdAt) {
      latest.set(key, { packageId, userId: actorId, lastAt: event.createdAt });
    }
  }

  return {
    installs: [...latest.values()],
    votes: [...votes]
      .map((key) => key.split("\u0000") as [string, string])
      .filter(([packageId]) => packageIds.has(packageId))
      .map(([packageId, userId]) => ({ packageId, userId })),
    authors: [...packageIds].flatMap((packageId) =>
      (versions.get(packageId) ?? []).flatMap((version) => {
        const userId = version.provenance.actorId;
        return userId
          ? [
              {
                packageId,
                userId,
                name: version.provenance.actorName ?? userId,
                image: null,
                approved: version.lifecycleState === "approved",
              },
            ]
          : [];
      })
    ),
  };
}
