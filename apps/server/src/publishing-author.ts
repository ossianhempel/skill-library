import type { Actor } from "@skill-library/domain";
import type { RegistryStore } from "@skill-library/storage";
import {
  readSkillDescription,
  type PackageTreeEntry,
} from "@skill-library/validation";
import { hasRole } from "./auth.js";

export interface PublishingAuthor {
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
}

/**
 * Who a new version is recorded as made by. Maintainers may publish on
 * someone else's behalf by naming them in the request; anyone else is recorded
 * as themselves, whatever the request says. Missing name and email are filled
 * in from the signed-in person's account.
 */
export async function publishingAuthor(
  store: RegistryStore,
  actor: Actor | undefined,
  requested: PublishingAuthor
): Promise<PublishingAuthor> {
  const onBehalf = hasRole(actor, "maintainer") ? requested : {};
  let { actorName, actorEmail } = onBehalf;

  if (actor?.id && (!actorName || !actorEmail)) {
    const userRow = await store.kysely
      ?.selectFrom("user")
      .select(["name", "email"])
      .where("id", "=", actor.id)
      .executeTakeFirst();
    actorName ||= userRow?.name;
    actorEmail ||= userRow?.email;
  }

  return { actorId: onBehalf.actorId ?? actor?.id, actorName, actorEmail };
}

// What a line-based frontmatter reader returns for `description: >-` or `|`.
const YAML_BLOCK_HEADER = /^[>|][-+0-9]*$/;

/**
 * The description to store for an upload. Clients that read SKILL.md with a
 * regex send the YAML block header (">-") instead of the text, so in that
 * case the text is taken from the uploaded SKILL.md itself.
 */
export function uploadDescription(
  given: string,
  entries: PackageTreeEntry[]
): string {
  if (!YAML_BLOCK_HEADER.test(given.trim())) {
    return given;
  }

  const skillMd = entries.find((entry) => entry.path === "SKILL.md");
  if (!skillMd?.content) {
    return given;
  }

  const text =
    typeof skillMd.content === "string"
      ? Buffer.from(
          skillMd.content,
          skillMd.encoding === "base64" ? "base64" : "utf8"
        ).toString("utf8")
      : Buffer.from(skillMd.content).toString("utf8");
  return readSkillDescription(text) ?? given;
}
