import { useMemo, useState, type ChangeEvent } from "react";
import type { ValidationResult } from "@skill-library/domain";
import type { UploadVersionInput, WebApiClient } from "../types.js";
import { parseSimpleFrontmatter, titleize } from "../lib/format.js";
import {
  emptyGitFields,
  emptyPublishForm,
  resolvePublishInput,
} from "../lib/publish.js";
import { filesToPackageEntries } from "../api/catalog.js";

export function usePublish({
  apiClient,
  workspaceId,
  availableCategories,
  loading,
  setLoading,
  onNotice,
  onUploaded,
}: {
  apiClient: WebApiClient;
  workspaceId: string;
  availableCategories: string[];
  loading: boolean;
  setLoading: (loading: boolean) => void;
  onNotice: (notice: string) => void;
  onUploaded: () => Promise<void>;
}) {
  const [publishForm, setPublishForm] = useState(emptyPublishForm);
  const [gitFields, setGitFields] = useState(emptyGitFields);
  const [uploadEntries, setUploadEntries] = useState<
    UploadVersionInput["entries"]
  >([]);
  const [preflightValidation, setPreflightValidation] = useState<
    ValidationResult | undefined
  >();
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const selectedCategoriesArray = useMemo(() => {
    if (Array.isArray(publishForm.categories)) {
      return publishForm.categories;
    }
    if (typeof publishForm.categories === "string") {
      return publishForm.categories
        .split(",")
        .map((cat) => cat.trim())
        .filter(Boolean);
    }
    return [];
  }, [publishForm.categories]);

  const categoriesToShow = useMemo(() => {
    const set = new Set<string>(availableCategories);
    for (const cat of selectedCategoriesArray) {
      set.add(cat);
    }
    return Array.from(set).sort();
  }, [availableCategories, selectedCategoriesArray]);

  const handleAddCategory = () => {
    const trimmed = newCategoryInput.trim().toLowerCase();
    if (trimmed && !selectedCategoriesArray.includes(trimmed)) {
      setPublishForm({
        ...publishForm,
        categories: [...selectedCategoriesArray, trimmed],
      });
    }
    setNewCategoryInput("");
  };

  async function handlePreflightValidate() {
    if (uploadEntries.length === 0) {
      onNotice("Choose a skill directory before validating.");
      return;
    }

    setLoading(true);

    try {
      const validation = await apiClient.validatePackageTree(uploadEntries);
      setPreflightValidation(validation);
      onNotice(
        validation.ok
          ? validation.issues.some((issue) => issue.severity === "warning")
            ? "Validation passed with warnings. You can upload the draft for maintainer review."
            : "Validation passed. Ready to upload."
          : "Validation found blocking errors. Fix them before approval; you can still upload an invalid draft for review."
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Validation failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (uploadEntries.length === 0) {
      onNotice(
        "Choose a skill directory or JSON package tree before uploading."
      );
      return;
    }

    setLoading(true);

    try {
      const resolved = resolvePublishInput(publishForm);
      const version = await apiClient.uploadVersion(workspaceId, {
        ...resolved,
        entries: uploadEntries,
      });
      setPreflightValidation(version.validation);
      onNotice(
        version.validation.ok
          ? `Uploaded as draft: version ${version.version}. Validation passed. Maintainers must Approve it from the Catalog page to make it available for download/install.`
          : `Uploaded as draft: version ${version.version}. Validation found blocking errors — fix frontmatter before approval. Maintainers can review the issue list in Catalog.`
      );
      await onUploaded();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGitImport() {
    setLoading(true);

    try {
      const resolved = resolvePublishInput(publishForm);
      const repositoryPath = gitFields.repositoryPath.trim();
      const ref = gitFields.ref.trim();
      const subdirectory = gitFields.subdirectory.trim();

      if (!repositoryPath) {
        throw new Error("Repository path is required.");
      }

      if (!ref) {
        throw new Error("Git ref is required.");
      }

      if (!subdirectory) {
        throw new Error("Git subdirectory is required.");
      }

      const version = await apiClient.importGitVersion(workspaceId, {
        ...resolved,
        repositoryPath,
        ref,
        subdirectory,
      });
      onNotice(`Git import created: ${version.version}`);
      await onUploaded();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Git import failed");
    } finally {
      setLoading(false);
    }
  }

  async function detectSkillMetadata(files: File[], defaultSlug: string) {
    const skillMdFile = files.find((file) => {
      const path = file.webkitRelativePath || file.name;
      return path === "SKILL.md" || path.endsWith("/SKILL.md");
    });

    let nameFromFrontmatter = "";
    let descFromFrontmatter = "";
    let catsFromFrontmatter: string[] = [];

    if (skillMdFile) {
      try {
        const content = await skillMdFile.text();
        const frontmatter = parseSimpleFrontmatter(content);
        if (frontmatter.name) {
          nameFromFrontmatter = String(frontmatter.name);
        }
        if (frontmatter.description) {
          descFromFrontmatter = String(frontmatter.description);
        }
        if (frontmatter.categories) {
          if (Array.isArray(frontmatter.categories)) {
            catsFromFrontmatter = frontmatter.categories.map(String);
          } else if (typeof frontmatter.categories === "string") {
            catsFromFrontmatter = frontmatter.categories
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean);
          }
        }
      } catch (e) {
        console.error("Failed to parse simple frontmatter", e);
      }
    }

    const slug = nameFromFrontmatter || defaultSlug;

    setPublishForm((prev) => ({
      ...prev,
      packageSlug: prev.packageSlug.trim() ? prev.packageSlug : slug,
      packageName: prev.packageName.trim()
        ? prev.packageName
        : nameFromFrontmatter
          ? titleize(nameFromFrontmatter)
          : titleize(defaultSlug),
      description: prev.description.trim()
        ? prev.description
        : descFromFrontmatter,
      categories:
        prev.categories && String(prev.categories).trim()
          ? prev.categories
          : catsFromFrontmatter.join(", "),
    }));

    setGitFields((prev) => ({
      ...prev,
      subdirectory: prev.subdirectory.trim() ? prev.subdirectory : slug,
    }));
  }

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.currentTarget.files ?? [])];
    if (files.length === 0) {
      setUploadEntries([]);
      setPreflightValidation(undefined);
      onNotice("No files staged");
      return;
    }

    const hasSkillMd = files.some((file) => {
      const path = file.webkitRelativePath || file.name;
      return path === "SKILL.md" || path.endsWith("/SKILL.md");
    });

    if (!hasSkillMd) {
      setUploadEntries([]);
      setPreflightValidation(undefined);
      onNotice(
        "Validation error: The selected folder does not contain a SKILL.md file. Publishing requires a SKILL.md file."
      );
      return;
    }

    const entries = await filesToPackageEntries(files);
    setUploadEntries(entries);
    setPreflightValidation(undefined);

    const firstRelativePath = files[0]?.webkitRelativePath;
    let slug = "";
    if (firstRelativePath) {
      const parts = firstRelativePath.split("/");
      if (parts.length > 1 && parts[0]) {
        slug = parts[0]
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      }
    }

    await detectSkillMetadata(files, slug);
    onNotice(
      `${entries.length} files staged for upload from skill folder "${slug || "selected"}". Ready to publish.`
    );
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  async function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);

    const items = [...(event.dataTransfer.items ?? [])];
    const files: File[] = [];

    async function traverseEntry(item: any, path: string = ""): Promise<void> {
      if (item.isFile) {
        const file = await new Promise<File>((resolve, reject) =>
          item.file(resolve, reject)
        );
        const relativePath = path ? `${path}/${file.name}` : file.name;
        Object.defineProperty(file, "webkitRelativePath", {
          value: relativePath,
          writable: true,
          configurable: true,
        });
        files.push(file);
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const readEntries = async (): Promise<any[]> => {
          return new Promise((resolve, reject) => {
            dirReader.readEntries(resolve, reject);
          });
        };
        const entries = await readEntries();
        for (const entry of entries) {
          await traverseEntry(entry, path ? `${path}/${item.name}` : item.name);
        }
      }
    }

    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        await traverseEntry(entry);
      }
    }

    if (files.length === 0) {
      return;
    }

    const hasSkillMd = files.some((file) => {
      const path = file.webkitRelativePath || file.name;
      return path === "SKILL.md" || path.endsWith("/SKILL.md");
    });

    if (!hasSkillMd) {
      setUploadEntries([]);
      setPreflightValidation(undefined);
      onNotice(
        "Validation error: The selected folder does not contain a SKILL.md file. Publishing requires a SKILL.md file."
      );
      return;
    }

    const entries = await filesToPackageEntries(files);
    setUploadEntries(entries);
    setPreflightValidation(undefined);

    const firstRelativePath = files[0]?.webkitRelativePath;
    let slug = "";
    if (firstRelativePath) {
      const parts = firstRelativePath.split("/");
      if (parts.length > 1 && parts[0]) {
        slug = parts[0]
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      }
    }

    await detectSkillMetadata(files, slug);
    onNotice(
      `${entries.length} files staged for upload from dropped folder "${slug || "dropped"}". Ready to publish.`
    );
  }

  return {
    publishForm,
    setPublishForm,
    gitFields,
    setGitFields,
    uploadEntries,
    preflightValidation,
    newCategoryInput,
    setNewCategoryInput,
    dragOver,
    selectedCategoriesArray,
    categoriesToShow,
    handleAddCategory,
    handlePreflightValidate,
    handleUpload,
    handleGitImport,
    handleFileSelection,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    loading,
  };
}
