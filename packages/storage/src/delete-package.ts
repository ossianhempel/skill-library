import type { Kysely } from "kysely";
import type { DatabaseSchema } from "./kysely.js";

/**
 * Permanently deletes a skill package: its versions, their lifecycle history,
 * install reports, usage events and votes. Rows go child-first in one
 * transaction because SQL Server can't cascade along every path.
 *
 * Archives stay: they are content-addressed and an upload running at the same
 * time may reuse the same one, so removing them here could break that upload.
 *
 * Returns false when the package doesn't exist.
 */
export async function deletePackageRows(
  db: Kysely<DatabaseSchema>,
  packageId: string
): Promise<boolean> {
  return db.transaction().execute(async (trx) => {
    const pkg = await trx
      .selectFrom("skill_packages")
      .select("id")
      .where("id", "=", packageId)
      .executeTakeFirst();
    if (!pkg) return false;

    const versions = await trx
      .selectFrom("skill_versions")
      .select("id")
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

    return true;
  });
}
