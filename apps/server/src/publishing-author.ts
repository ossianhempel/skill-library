import type { Actor } from "@skill-library/domain";
import type { RegistryStore } from "@skill-library/storage";
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
