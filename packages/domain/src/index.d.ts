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
//# sourceMappingURL=index.d.ts.map
