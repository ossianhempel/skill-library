import {
  CheckCircle2,
  ClipboardCheck,
  GitBranch,
  UploadCloud,
} from "lucide-react";
import type { RegistryBrandingConfig } from "@skill-library/domain";
import type { WebApiClient } from "../types.js";
import {
  PUBLISH_FIELD_PLACEHOLDERS,
  buildGitImportCurl,
} from "../lib/publish.js";
import { usePublish } from "../hooks/use-publish.js";
import { ValidationPanel } from "../validation-panel.js";
import { useI18n } from "../i18n/locale.js";

export function PublishTab({
  apiClient,
  workspaceId,
  branding,
  availableWorkspaces,
  availableCategories,
  isCreatingCustomWorkspace,
  customWorkspaceId,
  loading,
  setLoading,
  onWorkspaceChange,
  onCustomWorkspaceChange,
  onNotice,
  onUploaded,
  notice,
}: {
  apiClient: WebApiClient;
  workspaceId: string;
  branding: RegistryBrandingConfig;
  availableWorkspaces: string[];
  availableCategories: string[];
  isCreatingCustomWorkspace: boolean;
  customWorkspaceId: string;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  onWorkspaceChange: (val: string) => void;
  onCustomWorkspaceChange: (val: string) => void;
  onNotice: (notice: string) => void;
  onUploaded: () => Promise<void>;
  notice: string;
}) {
  const { t } = useI18n();
  const {
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
  } = usePublish({
    apiClient,
    workspaceId,
    availableCategories,
    loading,
    setLoading,
    onNotice,
    onUploaded,
  });

  return (
    <div
      className="publish-console-container"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        width: "100%",
        maxWidth: "800px",
      }}
    >
      <section className="publish-console" aria-label={t.publish.localAria}>
        <div className="panel-title">
          <UploadCloud size={17} />
          {t.publish.localTitle}
        </div>
        <p
          style={{
            margin: "-8px 0 16px",
            color: "var(--muted)",
            fontSize: "0.92rem",
          }}
        >
          {branding.uploadDescription}
        </p>
        <div className="form-grid">
          <label>
            {t.publish.workspace}
            <select
              value={isCreatingCustomWorkspace ? "__new__" : workspaceId}
              onChange={(event) => onWorkspaceChange(event.target.value)}
            >
              {availableWorkspaces.map((ws) => (
                <option key={ws} value={ws}>
                  {ws}
                </option>
              ))}
              <option value="__new__">{t.publish.createWorkspace}</option>
            </select>
          </label>
          {isCreatingCustomWorkspace && (
            <label>
              {t.publish.newWorkspaceId}
              <input
                value={customWorkspaceId}
                placeholder={t.publish.newWorkspacePlaceholder}
                onChange={(event) =>
                  onCustomWorkspaceChange(event.target.value)
                }
                required
              />
            </label>
          )}
          <label>
            {t.publish.slug}
            <input
              value={publishForm.packageSlug}
              placeholder={PUBLISH_FIELD_PLACEHOLDERS.packageSlug}
              onChange={(event) =>
                setPublishForm({
                  ...publishForm,
                  packageSlug: event.target.value,
                })
              }
            />
          </label>
          <label>
            {t.publish.version}
            <input
              value={publishForm.version}
              placeholder={PUBLISH_FIELD_PLACEHOLDERS.version}
              onChange={(event) =>
                setPublishForm({
                  ...publishForm,
                  version: event.target.value,
                })
              }
            />
          </label>
          <label style={{ gridColumn: "span 3" }}>
            {t.publish.categories}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginTop: "6px",
                marginBottom: "8px",
                padding: "10px",
                background: "rgba(21, 23, 19, 0.03)",
                border: "1px solid var(--line)",
              }}
            >
              {categoriesToShow.length === 0 ? (
                <span
                  style={{
                    color: "var(--muted)",
                    fontSize: "0.85rem",
                    fontStyle: "italic",
                  }}
                >
                  {t.publish.noCategories}
                </span>
              ) : (
                categoriesToShow.map((cat) => {
                  const isSelected = selectedCategoriesArray.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      className={`category-pill ${isSelected ? "active" : ""}`}
                      onClick={() => {
                        const nextCategories = isSelected
                          ? selectedCategoriesArray.filter((c) => c !== cat)
                          : [...selectedCategoriesArray, cat];
                        setPublishForm({
                          ...publishForm,
                          categories: nextCategories,
                        });
                      }}
                      style={{ textTransform: "capitalize" }}
                    >
                      {cat}
                      {isSelected && (
                        <span
                          style={{
                            marginLeft: "4px",
                            fontSize: "0.8em",
                          }}
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                value={newCategoryInput}
                placeholder={t.publish.newCategoryPlaceholder}
                onChange={(event) => setNewCategoryInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddCategory();
                  }
                }}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="button"
                onClick={handleAddCategory}
                style={{ height: "40px", padding: "0 16px" }}
              >
                {t.publish.addCategory}
              </button>
            </div>
          </label>
          <label>
            {t.publish.name}
            <input
              value={publishForm.packageName}
              placeholder={t.publish.namePlaceholder}
              onChange={(event) =>
                setPublishForm({
                  ...publishForm,
                  packageName: event.target.value,
                })
              }
            />
          </label>
          <label>
            {t.publish.description}
            <input
              value={publishForm.description}
              placeholder={t.publish.descriptionPlaceholder}
              onChange={(event) =>
                setPublishForm({
                  ...publishForm,
                  description: event.target.value,
                })
              }
            />
          </label>
        </div>
        <label
          className={`drop-target ${dragOver ? "drag-over" : ""} ${uploadEntries.length > 0 ? "has-files" : "empty"}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            marginTop: "16px",
            minHeight: "120px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
          }}
        >
          {uploadEntries.length > 0 ? (
            <>
              <CheckCircle2 size={24} style={{ color: "var(--accent)" }} />
              <div style={{ margin: "4px 0" }}>
                <strong>{t.publish.filesStaged(uploadEntries.length)}</strong>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "0.82rem",
                    color: "var(--muted)",
                  }}
                >
                  {t.publish.folder}{" "}
                  <code>
                    {publishForm.packageSlug ||
                      PUBLISH_FIELD_PLACEHOLDERS.packageSlug}
                  </code>
                </p>
              </div>
              <span
                className="button secondary choose-btn"
                style={{ pointerEvents: "none", height: "34px" }}
              >
                {t.publish.chooseDifferent}
              </span>
            </>
          ) : (
            <>
              <UploadCloud size={24} />
              <div style={{ margin: "4px 0" }}>
                <strong>{t.publish.dropHere}</strong>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "0.82rem",
                    color: "var(--muted)",
                  }}
                >
                  {t.publish.orBrowse}
                </p>
              </div>
              <span
                className="button secondary choose-btn"
                style={{ pointerEvents: "none", height: "34px" }}
              >
                {t.publish.chooseFolder}
              </span>
            </>
          )}
          <input
            type="file"
            {...{ webkitdirectory: "", directory: "" }}
            multiple
            onChange={handleFileSelection}
            style={{ display: "none" }}
          />
        </label>
        <div className="actions" style={{ marginTop: "16px" }}>
          <button
            className="secondary"
            onClick={() => void handlePreflightValidate()}
            disabled={loading || uploadEntries.length === 0}
          >
            <ClipboardCheck size={17} />
            {t.publish.validate}
          </button>
          <button
            onClick={handleUpload}
            disabled={loading || uploadEntries.length === 0}
            className={uploadEntries.length > 0 ? "primary" : undefined}
          >
            <UploadCloud size={17} />
            {t.publish.upload}
          </button>
        </div>
        {preflightValidation ? (
          <div className="panel" style={{ marginTop: "16px" }}>
            <div className="panel-title">
              <ClipboardCheck size={17} />
              {t.publish.preflight}
            </div>
            <ValidationPanel validation={preflightValidation} />
          </div>
        ) : null}
      </section>

      <section className="publish-console" aria-label={t.publish.gitAria}>
        <div className="panel-title">
          <GitBranch size={17} />
          {t.publish.gitTitle}
        </div>
        <p
          style={{
            margin: "-8px 0 16px",
            color: "var(--muted)",
            fontSize: "0.92rem",
          }}
        >
          {t.publish.gitDescription}
        </p>
        <div className="form-grid git-fields">
          <label>
            {t.publish.repository}
            <input
              value={gitFields.repositoryPath}
              placeholder={PUBLISH_FIELD_PLACEHOLDERS.repositoryPath}
              onChange={(event) =>
                setGitFields({
                  ...gitFields,
                  repositoryPath: event.target.value,
                })
              }
            />
          </label>
          <label>
            {t.publish.ref}
            <input
              value={gitFields.ref}
              placeholder={PUBLISH_FIELD_PLACEHOLDERS.ref}
              onChange={(event) =>
                setGitFields({ ...gitFields, ref: event.target.value })
              }
            />
          </label>
          <label>
            {t.publish.subdir}
            <input
              value={gitFields.subdirectory}
              placeholder={PUBLISH_FIELD_PLACEHOLDERS.subdirectory}
              onChange={(event) =>
                setGitFields({
                  ...gitFields,
                  subdirectory: event.target.value,
                })
              }
            />
          </label>
        </div>
        <div className="git-import" style={{ marginTop: "16px" }}>
          <GitBranch size={18} />
          <code>
            {buildGitImportCurl(
              workspaceId,
              publishForm.packageSlug || PUBLISH_FIELD_PLACEHOLDERS.packageSlug
            )}
          </code>
          <button onClick={handleGitImport} disabled={loading}>
            {t.publish.import}
          </button>
        </div>
      </section>

      <p className="notice" role="status" style={{ margin: "0 8px" }}>
        {notice}
      </p>
    </div>
  );
}
