import { rm } from "node:fs/promises";
import type { Kysely } from "kysely";
import type { DatabaseSchema } from "./kysely.js";

/**
 * Permanently deletes a skill package: its versions, their lifecycle history,
 * install reports, usage events and votes. Rows go child-first in one
 * transaction because SQL Server can't cascade along every path. Archives no
 * other version uses are removed afterwards, row and file.
 *
 * Returns false when the package doesn't exist.
 */
export async function deletePackageRows(
  db: Kysely<DatabaseSchema>,
  packageId: string
): Promise<boolean> {
  const digests = await db.transaction().execute(async (trx) => {
    const pkg = await trx
      .selectFrom("skill_packages")
      .select("id")
      .where("id", "=", packageId)
      .executeTakeFirst();
    if (!pkg) return undefined;

    const versions = await trx
      .selectFrom("skill_versions")
      .select(["id", "artifact_digest"])
      .where("package_id", "=", packageId)
      .execute();
    const versionIds = versions.map((row) => row.id);

    if (versionIds.length > 0) {
      await trx
        .updateTable("skill_versions")
        .set({ replacement_version_id: null })
        .where("replacement_version_id", "in", versionIds)
        .execute();
      await trx
        .deleteFrom("usage_events")
        .where("version_id", "in", versionIds)
        .execute();
      await trx
        .deleteFrom("lifecycle_events")
        .where("version_id", "in", versionIds)
        .execute();
    }

    await trx
      .deleteFrom("usage_events")
      .where("package_id", "=", packageId)
      .execute();
    await trx
      .deleteFrom("install_reports")
      .where("package_id", "=", packageId)
      .execute();
    await trx
      .deleteFrom("skill_votes")
      .where("package_id", "=", packageId)
      .execute();
    await trx
      .deleteFrom("skill_versions")
      .where("package_id", "=", packageId)
      .execute();
    await trx
      .deleteFrom("skill_packages")
      .where("id", "=", packageId)
      .execute();

    return [...new Set(versions.map((row) => row.artifact_digest))];
  });

  if (!digests) return false;
  await removeUnusedArtifacts(db, digests);
  return true;
}

async function removeUnusedArtifacts(
  db: Kysely<DatabaseSchema>,
  digests: string[]
): Promise<void> {
  if (digests.length === 0) return;

  const stillUsed = await db
    .selectFrom("skill_versions")
    .select("artifact_digest")
    .where("artifact_digest", "in", digests)
    .execute();
  const used = new Set(stillUsed.map((row) => row.artifact_digest));
  const unused = digests.filter((digest) => !used.has(digest));
  if (unused.length === 0) return;

  const artifacts = await db
    .selectFrom("artifacts")
    .select(["digest", "storage_path"])
    .where("digest", "in", unused)
    .execute();
  await db.deleteFrom("artifacts").where("digest", "in", unused).execute();
  await Promise.all(
    artifacts.map((row) => rm(row.storage_path, { force: true }))
  );
}
