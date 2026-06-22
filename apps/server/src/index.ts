import { randomUUID } from "node:crypto";
import type {
  InstallReport,
  LifecycleState,
  SkillPackage,
  SkillVersion,
  ValidationResult,
  VersionProvenance,
} from "@skill-library/domain";
import type { Workspace } from "@skill-library/domain";
import {
  createRegistryStore,
  type RegistryStore,
  type RegistryStoreConfig,
  type StoredArtifact,
} from "@skill-library/storage";
import {
  packPackageZip,
  validatePackageTree,
  type PackageTreeEntry,
} from "@skill-library/validation";
import {
  importPackageTreeFromGit,
  type GitImportRequest,
} from "./git-import.js";

export interface RegistryApi {
  search(workspaceId: string, query?: string): Promise<SkillPackage[]>;
  workspaceDetail(workspaceId: string): Promise<Workspace | undefined>;
  updateWorkspace(input: UpdateWorkspaceInput): Promise<Workspace | undefined>;
  packageDetail(packageId: string): Promise<SkillPackage | undefined>;
  packageVersions(packageId: string): ReturnType<RegistryStore["listVersions"]>;
  versionDetail(versionId: string): ReturnType<RegistryStore["getVersion"]>;
  latestApprovedVersion(
    packageId: string
  ): ReturnType<RegistryStore["getLatestApprovedVersion"]>;
  recordPackageView(packageId: string): Promise<void>;
  recordArtifactDownload(packageId: string, versionId: string): Promise<void>;
  recordInstallReport(report: InstallReport): Promise<void>;
  usageCount: RegistryStore["countUsageEvents"];
  packageReport: RegistryStore["getPackageReport"];
  workspaceReports: RegistryStore["getWorkspaceReports"];
  workspaceCatalogStats: RegistryStore["getWorkspaceCatalogStats"];
  validate(entries: PackageTreeEntry[]): ReturnType<typeof validatePackageTree>;
  ingestArtifact(entries: PackageTreeEntry[]): Promise<IngestedArtifact>;
  createUploadedVersion(
    input: CreateUploadedVersionInput
  ): Promise<SkillVersion>;
  createGitImportedVersion(
    input: CreateGitImportedVersionInput
  ): Promise<SkillVersion>;
  transitionVersion(
    input: TransitionVersionInput
  ): Promise<SkillVersion | undefined>;
  artifactDownload(
    digest: string
  ): Promise<{ artifact: StoredArtifact; content: Buffer } | undefined>;
}

export interface IngestedArtifact {
  validation: ValidationResult;
  artifact: StoredArtifact;
}

export interface CreateUploadedVersionInput {
  workspaceId: string;
  packageSlug: string;
  packageName: string;
  description: string;
  categories?: string[];
  version: string;
  entries: PackageTreeEntry[];
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
}

export interface CreateGitImportedVersionInput {
  workspaceId: string;
  packageSlug: string;
  packageName: string;
  description: string;
  categories?: string[];
  version: string;
  git: GitImportRequest;
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
}

export interface TransitionVersionInput {
  versionId: string;
  toState: LifecycleState;
  actorId?: string;
  replacementVersionId?: string;
}

export interface UpdateWorkspaceInput {
  workspaceId: string;
  reportingPolicy?: Workspace["reportingPolicy"];
  visibility?: Workspace["visibility"];
  logoUrl?: string;
}

export function createRegistryApi(store: RegistryStore): RegistryApi {
  return {
    async search(workspaceId, query) {
      const packages = await store.listPackages(workspaceId);
      const normalizedQuery = query?.trim().toLowerCase();

      if (!normalizedQuery) {
        return packages;
      }

      return packages.filter((pkg) =>
        `${pkg.name} ${pkg.description} ${pkg.categories.join(" ")}`
          .toLowerCase()
          .includes(normalizedQuery)
      );
    },
    workspaceDetail(workspaceId) {
      return store.getWorkspace(workspaceId);
    },
    async updateWorkspace(input) {
      const current = await store.getWorkspace(input.workspaceId);

      if (!current) {
        return undefined;
      }

      const workspace = {
        ...current,
        reportingPolicy: input.reportingPolicy ?? current.reportingPolicy,
        visibility: input.visibility ?? current.visibility,
        logoUrl:
          input.logoUrl === undefined
            ? current.logoUrl
            : input.logoUrl || undefined,
      };

      await store.upsertWorkspace(workspace);
      return workspace;
    },
    packageDetail(packageId) {
      return store.getPackage(packageId);
    },
    packageVersions(packageId) {
      return store.listVersions(packageId);
    },
    versionDetail(versionId) {
      return store.getVersion(versionId);
    },
    latestApprovedVersion(packageId) {
      return store.getLatestApprovedVersion(packageId);
    },
    async recordPackageView(packageId) {
      const pkg = await store.getPackage(packageId);

      if (!pkg) {
        return;
      }

      await store.recordUsageEvent({
        id: randomUUID(),
        workspaceId: pkg.workspaceId,
        packageId,
        eventType: "view",
        createdAt: new Date().toISOString(),
      });
    },
    async recordArtifactDownload(packageId, versionId) {
      const pkg = await store.getPackage(packageId);

      if (!pkg) {
        return;
      }

      await store.recordUsageEvent({
        id: randomUUID(),
        workspaceId: pkg.workspaceId,
        packageId,
        versionId,
        eventType: "download",
        createdAt: new Date().toISOString(),
      });
    },
    recordInstallReport(report) {
      return store.recordInstallReport(report);
    },
    usageCount(filter) {
      return store.countUsageEvents(filter);
    },
    packageReport(packageId) {
      return store.getPackageReport(packageId);
    },
    workspaceReports(workspaceId) {
      return store.getWorkspaceReports(workspaceId);
    },
    workspaceCatalogStats(workspaceId) {
      return store.getWorkspaceCatalogStats(workspaceId);
    },
    validate(entries) {
      return validatePackageTree(entries);
    },
    async ingestArtifact(entries) {
      const validation = validatePackageTree(entries);

      if (!validation.ok || !validation.digest) {
        throw new Error("Cannot ingest an invalid skill package artifact.");
      }

      const content = await packPackageZip(entries);
      const artifact = await store.putArtifact({
        digest: validation.digest,
        content,
      });

      return {
        validation,
        artifact,
      };
    },
    async createUploadedVersion(input) {
      const now = new Date().toISOString();
      const packageId = stableId(input.workspaceId, input.packageSlug);
      const provenance: VersionProvenance = {
        kind: "upload",
        actorId: input.actorId,
        actorName: input.actorName,
        actorEmail: input.actorEmail,
        importedAt: now,
      };
      const validation = validatePackageTree(input.entries);
      const artifact = validation.ok
        ? (await this.ingestArtifact(input.entries)).artifact
        : undefined;

      await ensureWorkspace(store, input.workspaceId);
      const slug = await persistedSlug(store, packageId, input.packageSlug);
      await store.upsertPackage({
        id: packageId,
        workspaceId: input.workspaceId,
        slug,
        name: input.packageName,
        description: input.description,
        categories: input.categories ?? [],
        createdAt: now,
        updatedAt: now,
      });

      return store.createVersion({
        id: randomUUID(),
        packageId,
        version: input.version,
        lifecycleState: "draft",
        artifactDigest:
          artifact?.digest ?? validation.digest ?? `invalid:${randomUUID()}`,
        validation,
        provenance,
        createdAt: now,
      });
    },
    async createGitImportedVersion(input) {
      const imported = await importPackageTreeFromGit(input.git);
      const now = new Date().toISOString();
      const packageId = stableId(input.workspaceId, input.packageSlug);
      const provenance: VersionProvenance = {
        kind: "git",
        actorId: input.actorId,
        actorName: input.actorName,
        actorEmail: input.actorEmail,
        sourceUrl: imported.sourceUrl,
        ref: imported.ref,
        commit: imported.commit,
        importedAt: now,
        gitAuthorName: imported.authorName,
        gitAuthorEmail: imported.authorEmail,
      };
      const validation = validatePackageTree(imported.entries);
      const artifact = validation.ok
        ? (await this.ingestArtifact(imported.entries)).artifact
        : undefined;

      await ensureWorkspace(store, input.workspaceId);
      const slug = await persistedSlug(store, packageId, input.packageSlug);
      await store.upsertPackage({
        id: packageId,
        workspaceId: input.workspaceId,
        slug,
        name: input.packageName,
        description: input.description,
        categories: input.categories ?? [],
        createdAt: now,
        updatedAt: now,
      });

      return store.createVersion({
        id: randomUUID(),
        packageId,
        version: input.version,
        lifecycleState: "draft",
        artifactDigest:
          artifact?.digest ?? validation.digest ?? `invalid:${randomUUID()}`,
        validation,
        provenance,
        createdAt: now,
      });
    },
    async transitionVersion(input) {
      const current = await store.getVersion(input.versionId);

      if (input.toState === "approved" && current && !current.validation.ok) {
        throw new Error("Cannot approve a version with validation errors.");
      }

      return store.transitionVersion(input);
    },
    async artifactDownload(digest) {
      const artifact = await store.getArtifact(digest);
      const content = await store.readArtifactContent(digest);

      return artifact && content ? { artifact, content } : undefined;
    },
  };
}

async function ensureWorkspace(
  store: RegistryStore,
  workspaceId: string
): Promise<void> {
  const existing = await store.getWorkspace(workspaceId);

  if (existing) {
    return;
  }

  await store.upsertWorkspace({
    id: workspaceId,
    slug: workspaceId,
    name: workspaceId,
    reportingPolicy: "opt-in",
    visibility: "private",
  });
}

function stableId(...parts: string[]) {
  return parts
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Resolve the slug to persist for a package. The slug is immutable after the
 * first publish: once a package exists, its originally-published slug is kept
 * even when a later upload supplies a case/format variant (e.g. "Cool Skill"
 * then "cool-skill" both map to the same packageId via {@link stableId}). This
 * keeps shareable `/s/<workspace>/<slug>` links stable across re-publishes.
 */
async function persistedSlug(
  store: RegistryStore,
  packageId: string,
  requestedSlug: string
): Promise<string> {
  const existing = await store.getPackage(packageId);
  return existing?.slug ?? requestedSlug;
}

export async function createDefaultRegistryApi(
  config: RegistryStoreConfig = {}
): Promise<{ api: RegistryApi; store: RegistryStore }> {
  const store = await createRegistryStore(config);
  await store.migrate();

  return {
    api: createRegistryApi(store),
    store,
  };
}
