import type { UploadVersionInput } from "../types.js";
import { titleize } from "./format.js";

export const PUBLISH_FIELD_PLACEHOLDERS = {
  packageSlug: "my-skill",
  version: "1.0.0",
  repositoryPath: "https://github.com/org/skills.git",
  ref: "main",
  subdirectory: "my-skill",
} as const;

export function emptyPublishForm(): UploadVersionInput {
  return {
    packageSlug: "",
    packageName: "",
    description: "",
    categories: "",
    version: "",
    entries: [],
  };
}

export function emptyGitFields() {
  return {
    repositoryPath: "",
    ref: "",
    subdirectory: "",
  };
}

export function resolvePublishInput(
  form: Pick<
    UploadVersionInput,
    "packageSlug" | "packageName" | "description" | "categories" | "version"
  >
) {
  const packageSlug = form.packageSlug.trim();

  if (!packageSlug) {
    throw new Error("Skill slug is required.");
  }

  const version = form.version.trim();

  if (!version) {
    throw new Error("Version is required.");
  }

  let categories: string[] = [];
  if (Array.isArray(form.categories)) {
    categories = form.categories;
  } else if (typeof form.categories === "string") {
    categories = (form.categories as string)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }

  return {
    packageSlug,
    packageName: form.packageName.trim() || titleize(packageSlug),
    description:
      form.description.trim() || `Internal ${packageSlug} skill package.`,
    categories,
    version,
  };
}

export function buildUploadRequest(packageSlug: string, version: string) {
  return {
    packageSlug,
    packageName: titleize(packageSlug),
    description: `Internal ${packageSlug} skill package.`,
    version,
    entries: [] as UploadVersionInput["entries"],
  };
}

export function buildGitImportCurl(workspaceId: string, packageSlug: string) {
  return `POST /api/workspaces/${workspaceId}/packages/import-git  ${packageSlug}@main`;
}
