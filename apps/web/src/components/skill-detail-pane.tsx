import { forwardRef } from "react";
import {
  Archive,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Download,
  FileCode2,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import {
  DOWNLOAD_HISTORY_DAYS,
  type InstallTargetKind,
  type LifecycleState,
  type RegistryBrandingConfig,
} from "@skill-library/domain";
import type { CatalogSkill } from "../types.js";
import { artifactDownloadUrl } from "../api/catalog.js";
import {
  buildInstallAgentPrompt,
  INSTALL_PROVIDER_OPTIONS,
} from "../lib/install-prompts.js";
import { ValidationPanel } from "../validation-panel.js";
import { SkillStatsMeta } from "../skill-stats.js";
import { LifecycleBadge } from "./chrome.js";

export const SkillDetailPane = forwardRef<
  HTMLElement,
  {
    selected: CatalogSkill;
    workspaceId: string;
    registryUrl: string;
    resolvedRegistryUrl: string;
    branding: RegistryBrandingConfig;
    installTarget: InstallTargetKind;
    copiedInstall: boolean;
    filesExpanded: boolean;
    canManageLifecycle: boolean;
    loading: boolean;
    setInstallTarget: (target: InstallTargetKind) => void;
    copyInstallPrompt: () => void;
    setFilesExpanded: (expanded: boolean) => void;
    handleLifecycle: (toState: LifecycleState) => void;
  }
>(function SkillDetailPane(
  {
    selected,
    workspaceId,
    registryUrl,
    resolvedRegistryUrl,
    branding,
    installTarget,
    copiedInstall,
    filesExpanded,
    canManageLifecycle,
    loading,
    setInstallTarget,
    copyInstallPrompt,
    setFilesExpanded,
    handleLifecycle,
  },
  ref
) {
  return (
    <section className="detail-pane" aria-label="Skill detail" ref={ref}>
      <div className="detail-head">
        <div>
          <p className="kicker">Selected package</p>
          <h2>{selected.pkg.name}</h2>
          <p>{selected.pkg.description}</p>
          {selected.pkg.categories && selected.pkg.categories.length > 0 && (
            <div className="tags" style={{ marginTop: "8px" }}>
              {selected.pkg.categories.map((category) => (
                <span key={category}>{category}</span>
              ))}
            </div>
          )}
        </div>
        <LifecycleBadge
          state={selected.activeVersion?.lifecycleState ?? "draft"}
        />
      </div>

      <div className="install-section">
        <div className="panel-title">
          <TerminalSquare size={17} />
          How to use
        </div>
        {selected.latestApproved ? (
          <div className="install-actions-stack">
            <p className="install-hint">
              Agent-ready prompt — paste it into Claude Code, Codex, Cursor, or
              any agent to install this skill and verify it.
            </p>
            <div
              className="install-target-toggle"
              role="group"
              aria-label="Install target"
            >
              {INSTALL_PROVIDER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`install-target-option ${
                    installTarget === option.id ? "active" : ""
                  }`}
                  aria-pressed={installTarget === option.id}
                  title={option.hint}
                  onClick={() => setInstallTarget(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <code>
              {buildInstallAgentPrompt({
                packageSlug: selected.pkg.slug,
                packageName: selected.pkg.name,
                workspaceId,
                registryUrl: resolvedRegistryUrl,
                appName: branding.appName,
                version: selected.latestApproved?.version,
                target: installTarget,
              })}
            </code>
            <div className="actions">
              <button onClick={() => void copyInstallPrompt()}>
                {copiedInstall ? (
                  <ClipboardCheck size={17} />
                ) : (
                  <Copy size={17} />
                )}
                {copiedInstall ? "Copied" : "Copy prompt"}
              </button>
              <a
                className="button secondary"
                href={artifactDownloadUrl(registryUrl, selected)}
              >
                <Download size={17} />
                Download ZIP
              </a>
            </div>
          </div>
        ) : (
          <p className="install-warning">
            No approved version is available for installation.
          </p>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">
          <BarChart3 size={17} />
          Usage
        </div>
        <SkillStatsMeta
          version={
            selected.latestApproved?.version ?? selected.activeVersion?.version
          }
          author={
            selected.activeVersion?.author ?? selected.latestApproved?.author
          }
          downloads={selected.downloads}
          downloadHistory={selected.downloadHistory}
          uploadedAt={
            selected.activeVersion?.createdAt ?? selected.pkg.createdAt
          }
          lastModifiedAt={selected.lastModifiedAt}
        />
      </div>

      <div className="split">
        <div className="panel">
          <div className="panel-title">
            <FileCode2 size={17} />
            Contents
          </div>
          <ul className="file-tree">
            {selected.files.slice(0, 5).map((file) => (
              <li key={file}>{file}</li>
            ))}
            {filesExpanded &&
              selected.files.slice(5).map((file) => <li key={file}>{file}</li>)}
          </ul>
          {selected.files.length > 5 && (
            <button
              type="button"
              className="toggle-files-button"
              onClick={() => setFilesExpanded(!filesExpanded)}
              aria-label={filesExpanded ? "Show less files" : "Show more files"}
            >
              <span>
                {filesExpanded
                  ? "Show less"
                  : `Show ${selected.files.length - 5} more files`}
              </span>
              <ChevronDown
                size={15}
                style={{
                  transform: filesExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              />
            </button>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">
            <CheckCircle2 size={17} />
            Validation
          </div>
          <ValidationPanel validation={selected.activeVersion?.validation} />
          <div className="version-line">
            <span>Active version</span>
            <strong>
              {selected.activeVersion?.version ?? "No version selected"}
            </strong>
          </div>
          {selected.latestApproved &&
          selected.activeVersion?.id !== selected.latestApproved.id ? (
            <div className="version-line">
              <span>Approved install</span>
              <strong>{selected.latestApproved.version}</strong>
            </div>
          ) : null}
        </div>
      </div>

      {canManageLifecycle && (
        <div className="lifecycle-panel">
          <div className="panel-title">
            <RefreshCw size={17} />
            Lifecycle controls
          </div>
          <p className="lifecycle-copy">
            Editors and Admins review drafts here. Approval makes a skill
            installable from the catalog.
          </p>
          <div className="actions">
            {selected.activeVersion?.lifecycleState !== "approved" && (
              <button
                onClick={() => void handleLifecycle("approved")}
                disabled={loading}
              >
                <CheckCircle2 size={17} />
                Approve
              </button>
            )}
            <button
              className="secondary"
              onClick={() => void handleLifecycle("hidden")}
              disabled={loading}
            >
              <ShieldCheck size={17} />
              Hide
            </button>
            <button
              className="secondary"
              onClick={() => void handleLifecycle("deprecated")}
              disabled={loading}
            >
              <Archive size={17} />
              Deprecate
            </button>
          </div>
        </div>
      )}

      <div className="activity-strip">
        <GitBranch size={18} />
        <span>
          Download counts and sparklines reflect the last{" "}
          {DOWNLOAD_HISTORY_DAYS} days of artifact downloads.
        </span>
      </div>
    </section>
  );
});
