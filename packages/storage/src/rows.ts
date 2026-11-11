import type { SkillPackage, SkillVersion } from "@skill-library/domain";

/** Database row shapes and their mapping to domain objects, shared by the SQL store. */

export interface PackageRow {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  description: string;
  categories: string[] | string;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface VersionRow {
  id: string;
  package_id: string;
  version: string;
  lifecycle_state: SkillVersion["lifecycleState"];
  artifact_digest: string;
  validation: SkillVersion["validation"] | string;
  provenance: SkillVersion["provenance"] | string;
  created_at: string | Date;
  approved_at?: string | Date | null;
  replacement_version_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
}

export function fromPackageRow(row: PackageRow): SkillPackage {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    categories: parseJson(row.categories),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export function fromVersionRow(row: VersionRow): SkillVersion {
  const provenance = parseJson(row.provenance);

  let author: string | undefined = undefined;
  if (row.actor_name) {
    author = row.actor_name;
  } else if (row.actor_email) {
    author = row.actor_email;
  } else if (
    provenance &&
    typeof provenance === "object" &&
    "actorName" in provenance &&
    typeof (provenance as any).actorName === "string" &&
    (provenance as any).actorName
  ) {
    author = (provenance as any).actorName;
  } else if (
    provenance &&
    typeof provenance === "object" &&
    "actorEmail" in provenance &&
    typeof (provenance as any).actorEmail === "string" &&
    (provenance as any).actorEmail
  ) {
    author = (provenance as any).actorEmail;
  } else if (
    provenance &&
    typeof provenance === "object" &&
    "gitAuthorName" in provenance &&
    typeof (provenance as any).gitAuthorName === "string" &&
    (provenance as any).gitAuthorName
  ) {
    author = (provenance as any).gitAuthorName;
  } else if (
    provenance &&
    typeof provenance === "object" &&
    "gitAuthorEmail" in provenance &&
    typeof (provenance as any).gitAuthorEmail === "string" &&
    (provenance as any).gitAuthorEmail
  ) {
    author = (provenance as any).gitAuthorEmail;
  } else if (
    provenance &&
    typeof provenance === "object" &&
    "actorId" in provenance &&
    typeof (provenance as any).actorId === "string"
  ) {
    author = (provenance as any).actorId;
  }

  return {
    id: row.id,
    packageId: row.package_id,
    version: row.version,
    lifecycleState: row.lifecycle_state,
    artifactDigest: row.artifact_digest,
    validation: parseJson(row.validation),
    provenance,
    createdAt: toIsoString(row.created_at),
    approvedAt: row.approved_at ? toIsoString(row.approved_at) : undefined,
    replacementVersionId: row.replacement_version_id ?? undefined,
    author,
  };
}

export function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

export function toIsoString(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
