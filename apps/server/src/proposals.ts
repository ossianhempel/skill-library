import type {
  Actor,
  LifecycleState,
  SkillOwner,
  SkillVersion,
} from "@skill-library/domain";
import { hasRole } from "./auth.js";
import type { RegistryStore } from "@skill-library/storage";
import {
  readSkillDescription,
  readSkillFolder,
} from "@skill-library/validation";
import type { RegistryApi } from "./index.js";

/**
 * A skill belongs to whoever published its first version. When someone else
 * publishes a new version, it is a proposal: the owner (or a maintainer)
 * approves or rejects it.
 */
export function skillOwner(versions: SkillVersion[]): SkillOwner | undefined {
  const first = [...versions].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  )[0];
  const id = first?.provenance.actorId;
  return id ? { id, name: first.provenance.actorName } : undefined;
}

/** Waiting for a decision: not approved, hidden or deprecated yet. */
export function isPending(version: SkillVersion): boolean {
  return (
    version.lifecycleState === "draft" || version.lifecycleState === "published"
  );
}

export function isProposal(
  version: SkillVersion,
  owner: SkillOwner | undefined
): boolean {
  return (
    isPending(version) &&
    owner !== undefined &&
    version.provenance.actorId !== owner.id
  );
}

/** The newest pending proposal (versions newest first, as stored). */
export function pendingProposal(
  versions: SkillVersion[],
  owner = skillOwner(versions)
): SkillVersion | undefined {
  return versions.find((version) => isProposal(version, owner));
}

/** Approved versions are public; others only to maintainers, author and owner. */
export function mayReadVersion(
  actor: Actor | undefined,
  version: SkillVersion,
  versions: SkillVersion[]
): boolean {
  return (
    version.lifecycleState === "approved" ||
    hasRole(actor, "maintainer") ||
    (actor !== undefined &&
      (version.provenance.actorId === actor.id ||
        skillOwner(versions)?.id === actor.id))
  );
}

/**
 * Maintainers may move any version to any state. The owner may approve or
 * reject (hide) a proposal on their own skill, but not their own versions,
 * which still go through a maintainer.
 */
export function mayDecide(
  actor: Actor | undefined,
  version: SkillVersion,
  versions: SkillVersion[],
  toState: LifecycleState
): boolean {
  if (hasRole(actor, "maintainer")) {
    return true;
  }

  const owner = skillOwner(versions);
  return (
    actor !== undefined &&
    owner?.id === actor.id &&
    isProposal(version, owner) &&
    (toState === "approved" || toState === "hidden")
  );
}

/** A version with all versions of its skill, newest first. */
export async function versionWithSiblings(
  api: RegistryApi,
  versionId: string
): Promise<{ version: SkillVersion; versions: SkillVersion[] } | undefined> {
  const version = await api.versionDetail(versionId);
  return version
    ? { version, versions: await api.packageVersions(version.packageId) }
    : undefined;
}

/**
 * Once a colleague's proposal is approved, the catalog entry takes the
 * description from its SKILL.md, which uploads by others leave untouched
 * (see savePackageDetails). The name and categories stay the owner's.
 */
export async function adoptApprovedProposal(
  store: Pick<
    RegistryStore,
    "listVersions" | "getPackage" | "upsertPackage" | "readArtifactContent"
  >,
  version: SkillVersion
): Promise<void> {
  const owner = skillOwner(await store.listVersions(version.packageId));
  const pkg = await store.getPackage(version.packageId);

  if (!pkg || !owner || version.provenance.actorId === owner.id) {
    return;
  }

  const archive = await store.readArtifactContent(version.artifactDigest);
  if (!archive) return;
  const { entries } = await readSkillFolder(archive, pkg.slug);
  const skillMd = entries.find((entry) => entry.path === "SKILL.md");
  const description =
    skillMd &&
    readSkillDescription(Buffer.from(skillMd.content ?? "").toString("utf8"));

  if (description && description !== pkg.description) {
    await store.upsertPackage({
      ...pkg,
      description,
      updatedAt: new Date().toISOString(),
    });
  }
}
