import { useEffect, useState, type FormEvent } from "react";
import {
  normalizeLogoUrlInput,
  type RegistryBrandingConfig,
  type Workspace,
} from "@skill-library/domain";
import { LogoMark } from "./logo-mark.js";

export function WorkspaceLogoSettings({
  workspace,
  branding,
  effectiveLogoUrl,
  canManage,
  onWorkspaceLogoChange,
}: {
  workspace: Workspace | null;
  branding: RegistryBrandingConfig;
  effectiveLogoUrl?: string;
  canManage: boolean;
  onWorkspaceLogoChange: (logoUrl: string) => Promise<void>;
}) {
  const [draftLogoUrl, setDraftLogoUrl] = useState(workspace?.logoUrl ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftLogoUrl(workspace?.logoUrl ?? "");
    setError("");
  }, [workspace?.logoUrl]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || !workspace) {
      return;
    }

    const logo = normalizeLogoUrlInput(draftLogoUrl);

    if (!logo.ok) {
      setError(logo.error);
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onWorkspaceLogoChange(logo.value ?? "");
    } catch (err) {
      setError(readErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!canManage || !workspace) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onWorkspaceLogoChange("");
      setDraftLogoUrl("");
    } catch (err) {
      setError(readErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-section" aria-label="Workspace branding">
      <h3 className="admin-section-title">Workspace branding</h3>
      <form className="workspace-branding-form" onSubmit={handleSubmit}>
        <LogoMark
          logoUrl={effectiveLogoUrl}
          fallbackText={branding.appShortName}
          className="mark workspace-logo-preview"
        />
        <div className="workspace-branding-fields">
          <label>
            Logo URL
            <input
              value={draftLogoUrl}
              onChange={(event) => {
                setDraftLogoUrl(event.target.value);
                setError("");
              }}
              placeholder="https://example.com/logo.svg"
              disabled={!canManage || saving || !workspace}
            />
          </label>
          <p className="admin-field-hint">
            Supports http(s), root-relative paths, and base64 image data URLs.
          </p>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        {canManage ? (
          <div className="workspace-branding-actions">
            <button
              type="submit"
              className="secondary"
              disabled={saving || !workspace}
            >
              {saving ? "Saving..." : "Save logo"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={saving || !workspace || !workspace.logoUrl}
              onClick={() => void handleClear()}
            >
              Clear
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}

function readErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message) as { error?: string };
      return parsed.error ?? err.message;
    } catch {
      return err.message;
    }
  }

  return "Could not update workspace logo.";
}
