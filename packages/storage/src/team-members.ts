import type { Kysely } from "kysely";
import type { DatabaseEngine, DatabaseSchema } from "./kysely.js";
import type { TeamMemberRecord } from "./index.js";
import { jsonText } from "./ranking-store.js";

/** Every user with the number of skill versions their provenance resolves to them. */
export async function listTeamMembers(
  db: Kysely<DatabaseSchema>,
  engine: DatabaseEngine
): Promise<TeamMemberRecord[]> {
  const actorId = jsonText(engine, "v.provenance", "actorId");
  const actorEmail = jsonText(engine, "v.provenance", "actorEmail");
  const gitAuthorEmail = jsonText(engine, "v.provenance", "gitAuthorEmail");

  const rows = await db
    .selectFrom("user as u")
    .leftJoin("skill_versions as v", (join) =>
      join.on((eb) =>
        eb.or([
          eb(actorId, "=", eb.ref("u.id")),
          eb(actorId, "=", eb.ref("u.email")),
          eb(actorEmail, "=", eb.ref("u.email")),
          eb(gitAuthorEmail, "=", eb.ref("u.email")),
        ])
      )
    )
    .select((eb) => [
      "u.id",
      "u.name",
      "u.email",
      "u.role",
      "u.created_at",
      "u.image",
      eb.fn.count("v.id").as("skills_submitted"),
    ])
    .groupBy(["u.id", "u.name", "u.email", "u.role", "u.created_at", "u.image"])
    .orderBy("u.created_at", "asc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: toIsoString(row.created_at),
    image: row.image,
    skillsSubmitted: Number(row.skills_submitted ?? 0),
  }));
}

function toIsoString(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
