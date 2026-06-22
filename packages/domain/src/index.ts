export type SkillPackageId = string;
export type SkillVersionId = string;
export type WorkspaceId = string;

export type LifecycleState =
  | "draft"
  | "published"
  | "approved"
  | "hidden"
  | "deprecated";
export type InstallTargetKind =
  | "codex-global"
  | "claude-global"
  | "openclaw-global"
  | "project";
export type ValidationSeverity = "error" | "warning";

export const VALIDATION_RULE_IDS = [
  "required-skill-md",
  "invalid-path",
  "path-traversal",
  "skill-md-missing-frontmatter",
  "skill-md-missing-name",
  "skill-md-missing-description",
  "skill-md-invalid-name-format",
  "skill-md-invalid-description-length",
  "skill-md-name-directory-mismatch",
  "skill-md-body-empty",
  "skill-md-body-large",
  "skill-md-slug-package-mismatch",
] as const;

export type ValidationRuleId = (typeof VALIDATION_RULE_IDS)[number];
export type InstalledSkillState =
  | "current"
  | "stale"
  | "deprecated"
  | "hidden"
  | "unknown-registry"
  | "missing-metadata"
  | "modified-local-content";

export interface Workspace {
  id: WorkspaceId;
  slug: string;
  name: string;
  reportingPolicy: "disabled" | "opt-in" | "required";
  visibility: "public" | "private";
  logoUrl?: string;
}

export interface SkillPackage {
  id: SkillPackageId;
  workspaceId: WorkspaceId;
  slug: string;
  name: string;
  description: string;
  categories: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SkillVersion {
  id: SkillVersionId;
  packageId: SkillPackageId;
  version: string;
  lifecycleState: LifecycleState;
  artifactDigest: string;
  validation: ValidationResult;
  provenance: VersionProvenance;
  createdAt: string;
  approvedAt?: string;
  replacementVersionId?: SkillVersionId;
  author?: string;
}

export interface VersionProvenance {
  kind: "upload" | "git";
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
  sourceUrl?: string;
  ref?: string;
  commit?: string;
  importedAt: string;
  gitAuthorName?: string;
  gitAuthorEmail?: string;
}

export interface ArtifactFile {
  path: string;
  size: number;
  digest: string;
  kind: "file" | "directory";
}

export interface ValidationIssue {
  ruleId: string;
  severity: ValidationSeverity;
  message: string;
  path?: string;
}

export interface ValidationResult {
  ok: boolean;
  digest?: string;
  skillRoot?: string;
  files: ArtifactFile[];
  issues: ValidationIssue[];
}

export interface InstallTarget {
  kind: InstallTargetKind;
  root: string;
  agent: "codex" | "claude" | "openclaw";
}

export interface InstallMetadata {
  registryUrl: string;
  workspaceId: WorkspaceId;
  packageId: SkillPackageId;
  versionId: SkillVersionId;
  contentDigest: string;
  installTarget: InstallTarget;
  installedAt: string;
  installerVersion: string;
  reportConsent: boolean;
}

export interface InstallReport {
  packageId: SkillPackageId;
  versionId: SkillVersionId;
  installId: string;
  state: InstalledSkillState;
  reportedAt: string;
  targetKind: InstallTargetKind;
}

export type InstallStateCounts = Record<InstalledSkillState, number>;

export interface DownloadHistoryPoint {
  date: string;
  count: number;
}

export interface CatalogPackageStats {
  packageId: SkillPackageId;
  downloads: number;
  downloadHistory: DownloadHistoryPoint[];
  lastModifiedAt: string;
}

export interface PackageReport {
  packageId: SkillPackageId;
  workspaceId: WorkspaceId;
  versionCount: number;
  latestApprovedVersionId?: SkillVersionId;
  views: number;
  downloads: number;
  downloadHistory: DownloadHistoryPoint[];
  lastModifiedAt: string;
  installs: {
    total: number;
    byState: InstallStateCounts;
  };
}

export const DOWNLOAD_HISTORY_DAYS = 14;

export type UsageEventType = "view" | "download";
export type WorkspaceRole = "user" | "maintainer" | "admin";

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  user: "Viewer",
  maintainer: "Editor",
  admin: "Admin",
};

export const WORKSPACE_ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  user: "Browse and install approved skills.",
  maintainer: "Publish drafts and approve skills for the catalog.",
  admin: "Manage teammates plus all editor actions.",
};

export interface Actor {
  id: string;
  role: WorkspaceRole;
}

export interface UsageEvent {
  id: string;
  workspaceId: WorkspaceId;
  eventType: UsageEventType;
  createdAt: string;
  packageId?: SkillPackageId;
  versionId?: SkillVersionId;
}

export interface RegistryBrandingConfig {
  appName: string;
  appShortName: string;
  logoUrl: string;
  registryTagline: string;
  companyName: string;
  defaultWorkspaceId: string;
  registryPublicUrl: string;
  documentTitle: string;
  loginSubtitle: string;
  overviewHeading: string;
  overviewDescription: string;
  searchPlaceholder: string;
  emptyCatalogTitle: string;
  emptyCatalogDescription: string;
  emptyCatalogListMessage: string;
  uploadDescription: string;
  statusDraftBg?: string;
  statusDraftText?: string;
  statusDraftBorder?: string;
  statusApprovedBg?: string;
  statusApprovedText?: string;
  statusApprovedBorder?: string;
  statusPublishedBg?: string;
  statusPublishedText?: string;
  statusPublishedBorder?: string;
  statusHiddenBg?: string;
  statusHiddenText?: string;
  statusHiddenBorder?: string;
  statusDeprecatedBg?: string;
  statusDeprecatedText?: string;
  statusDeprecatedBorder?: string;
}

export const DEFAULT_REGISTRY_BRANDING: RegistryBrandingConfig = {
  appName: "Skill Library",
  appShortName: "SL",
  logoUrl: "",
  registryTagline: "Internal skill registry",
  companyName: "Your company",
  defaultWorkspaceId: "main",
  registryPublicUrl: "http://localhost:3000",
  documentTitle: "Skill Library",
  loginSubtitle:
    "Sign in with your company account to browse, publish, and manage skills.",
  overviewHeading: "Find an approved skill or publish a new draft.",
  overviewDescription:
    "Most teams only need these two paths: browse what is ready to install, or send a new skill through validation and approval.",
  searchPlaceholder: "Search approved skills",
  emptyCatalogTitle: "Your registry is empty.",
  emptyCatalogDescription:
    "Upload a skill package or import one from Git to populate the catalog.",
  emptyCatalogListMessage:
    "No approved skills yet. Publish a draft and approve it to list it here.",
  uploadDescription:
    "Upload a skill package folder from your machine. The folder must contain a SKILL.md file at its root.",
  statusDraftBg: "#52525b",
  statusDraftText: "#f4f4f5",
  statusDraftBorder: "#71717a",
  statusApprovedBg: "#166534",
  statusApprovedText: "#f0fdf4",
  statusApprovedBorder: "#15803d",
  statusPublishedBg: "#854d0e",
  statusPublishedText: "#fef9c3",
  statusPublishedBorder: "#a16207",
  statusHiddenBg: "#3730a3",
  statusHiddenText: "#e0e7ff",
  statusHiddenBorder: "#4338ca",
  statusDeprecatedBg: "#991b1b",
  statusDeprecatedText: "#fee2e2",
  statusDeprecatedBorder: "#b91c1c",
};

const LOGO_URL_MAX_LENGTH = 4096;
const SUPPORTED_LOGO_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i;

export type LogoUrlValidationResult =
  | { ok: true; value?: string }
  | { ok: false; error: string };

export function normalizeLogoUrlInput(input: unknown): LogoUrlValidationResult {
  if (input === undefined) {
    return { ok: true };
  }

  if (input === null) {
    return { ok: true, value: "" };
  }

  if (typeof input !== "string") {
    return { ok: false, error: "Logo URL must be a string." };
  }

  const value = input.trim();

  if (!value) {
    return { ok: true, value: "" };
  }

  if (value.length > LOGO_URL_MAX_LENGTH) {
    return {
      ok: false,
      error: "Logo URL must be 4096 characters or fewer.",
    };
  }

  if (value.startsWith("/")) {
    return value.startsWith("//")
      ? { ok: false, error: "Protocol-relative logo URLs are not supported." }
      : { ok: true, value };
  }

  if (value.startsWith("data:")) {
    return SUPPORTED_LOGO_DATA_URL_PATTERN.test(value)
      ? { ok: true, value: value.replace(/\s+/g, "") }
      : {
          ok: false,
          error:
            "Logo data URLs must be base64 encoded PNG, JPEG, GIF, WebP, or SVG images.",
        };
  }

  try {
    const url = new URL(value);

    if (url.protocol === "https:" || url.protocol === "http:") {
      return { ok: true, value: url.toString() };
    }
  } catch {
    return {
      ok: false,
      error:
        "Logo URL must be an absolute http(s) URL, a root-relative path, or an image data URL.",
    };
  }

  return {
    ok: false,
    error: "Logo URL must use http or https.",
  };
}
