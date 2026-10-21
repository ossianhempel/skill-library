import type {
  DownloadHistoryPoint,
  LifecycleState,
  PackageReport,
  RegistryBrandingConfig,
  SkillPackage,
  SkillVersion,
  ValidationResult,
  Workspace,
} from "@skill-library/domain";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  image: string | null;
  skillsSubmitted: number;
}

export interface CatalogSkill {
  pkg: SkillPackage;
  latestApproved?: SkillVersion;
  activeVersion?: SkillVersion;
  validation?: ValidationResult;
  files: string[];
  installs: number;
  downloads: number;
  downloadHistory: DownloadHistoryPoint[];
  lastModifiedAt: string;
  staleInstalls: number;
  report?: PackageReport;
}

export interface WebApiClient {
  workspaceDetail(workspaceId: string): Promise<Workspace | undefined>;
  updateWorkspace(
    workspaceId: string,
    input: { logoUrl?: string }
  ): Promise<Workspace>;
  search(workspaceId: string, query?: string): Promise<SkillPackage[]>;
  latestApprovedVersion(packageId: string): Promise<SkillVersion | undefined>;
  packageVersions(packageId: string): Promise<SkillVersion[]>;
  workspaceCatalogStats(
    workspaceId: string
  ): Promise<import("@skill-library/domain").CatalogPackageStats[]>;
  workspaceReports(workspaceId: string): Promise<PackageReport[]>;
  uploadVersion(
    workspaceId: string,
    input: UploadVersionInput
  ): Promise<SkillVersion>;
  importGitVersion(
    workspaceId: string,
    input: GitImportInput
  ): Promise<SkillVersion>;
  validatePackageTree(
    entries: UploadVersionInput["entries"]
  ): Promise<ValidationResult>;
  transitionVersion(
    versionId: string,
    toState: LifecycleState
  ): Promise<SkillVersion>;
}

export interface UploadVersionInput {
  packageSlug: string;
  packageName: string;
  description: string;
  categories?: string[] | string;
  version: string;
  entries: { path: string; content: string; encoding?: "utf8" | "base64" }[];
}

export interface GitImportInput {
  packageSlug: string;
  packageName: string;
  description: string;
  categories?: string[] | string;
  version: string;
  repositoryPath: string;
  ref?: string;
  subdirectory?: string;
}

export interface SkillLibraryAppProps {
  skills?: CatalogSkill[];
  workspaceId?: string;
  registryUrl?: string;
  authToken?: string;
  api?: WebApiClient;
  branding?: RegistryBrandingConfig;
}

export type AppTab =
  | "overview"
  | "catalog"
  | "publish"
  | "reports"
  | "team"
  | "my-skills";
