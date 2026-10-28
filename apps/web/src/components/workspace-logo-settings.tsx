import { useEffect, useState, type FormEvent } from "react";
import {
  normalizeLogoUrlInput,
  type RegistryBrandingConfig,
  type Workspace,
} from "@skill-library/domain";
import { LogoMark } from "./logo-mark.js";
import { useI18n } from "../i18n/locale.js";

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
  const { t } = useI18n();
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
      setError(readErrorMessage(err, t.team.logoUpdateFailed));
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
      setError(readErrorMessage(err, t.team.logoUpdateFailed));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-section" aria-label={t.team.branding}>
      <h3 className="admin-section-title">{t.team.branding}</h3>
      <form className="workspace-branding-form" onSubmit={handleSubmit}>
        <LogoMark
          logoUrl={effectiveLogoUrl}
          fallbackText={branding.appShortName}
          className="mark workspace-logo-preview"
        />
        <div className="workspace-branding-fields">
          <label>
            {t.team.logoUrl}
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
          <p className="admin-field-hint">{t.team.logoHint}</p>
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
              {saving ? t.team.saving : t.team.saveLogo}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={saving || !workspace || !workspace.logoUrl}
              onClick={() => void handleClear()}
            >
              {t.team.clear}
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}

function readErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message) as { error?: string };
      return parsed.error ?? err.message;
    } catch {
      return err.message;
    }
  }

  return fallback;
}
