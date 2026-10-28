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
  Link2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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
import { AddToClaudeSteps, ClaudePromptInstall } from "./add-to-claude.js";
import { useI18n } from "../i18n/locale.js";
import { PopularityLine, UpvoteButton } from "./popularity.js";

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
    copiedLink: boolean;
    filesExpanded: boolean;
    canManageLifecycle: boolean;
    loading: boolean;
    setInstallTarget: (target: InstallTargetKind) => void;
    copyInstallPrompt: () => void;
    copyShareLink: () => void;
    setFilesExpanded: (expanded: boolean) => void;
    handleLifecycle: (toState: LifecycleState) => void;
    onVote: (voted: boolean) => void;
    votePending: boolean;
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
    copiedLink,
    filesExpanded,
    canManageLifecycle,
    loading,
    setInstallTarget,
    copyInstallPrompt,
    copyShareLink,
    setFilesExpanded,
    handleLifecycle,
    onVote,
    votePending,
  },
  ref
) {
  const { t } = useI18n();
  return (
    <section className="detail-pane" aria-label={t.detail.aria} ref={ref}>
      <div className="detail-head">
        <div>
          <p className="kicker">{t.detail.selected}</p>
          <h2>{selected.pkg.name}</h2>
          <p>{selected.pkg.description}</p>
          <PopularityLine ranking={selected.ranking} />
          {selected.pkg.categories && selected.pkg.categories.length > 0 && (
            <div className="tags" style={{ marginTop: "8px" }}>
              {selected.pkg.categories.map((category) => (
                <span key={category}>{category}</span>
              ))}
            </div>
          )}
        </div>
        <div className="detail-head-actions">
          <LifecycleBadge
            state={selected.activeVersion?.lifecycleState ?? "draft"}
          />
          {/* New votes need an approved version; an existing vote can always be withdrawn. */}
          {(selected.latestApproved || selected.ranking?.votedByMe) && (
            <UpvoteButton
              ranking={selected.ranking}
              disabled={loading || votePending}
              onVote={onVote}
            />
          )}
          <button
            type="button"
            className="secondary copy-link-button"
            onClick={() => copyShareLink()}
            title={t.detail.copyLinkTitle}
          >
            {copiedLink ? <ClipboardCheck size={16} /> : <Link2 size={16} />}
            {copiedLink ? t.detail.copied : t.detail.copyLink}
          </button>
        </div>
      </div>

      <div className="install-section">
        <div className="panel-title">
          <Sparkles size={17} />
          {t.addToClaude.title}
        </div>
        {selected.latestApproved ? (
          <>
            <AddToClaudeSteps
              downloadUrl={artifactDownloadUrl(
                registryUrl,
                selected,
                "claude-app"
              )}
              fileName={`${selected.pkg.slug}.zip`}
            />
            <ClaudePromptInstall
              promptInput={{
                packageId: selected.pkg.id,
                packageSlug: selected.pkg.slug,
                packageName: selected.pkg.name,
                appName: branding.appName,
                registryUrl: resolvedRegistryUrl,
                downloadUrl: artifactDownloadUrl(
                  resolvedRegistryUrl,
                  selected,
                  "claude-app"
                ),
              }}
            />
            <details className="developer-install">
              <summary>
                <TerminalSquare size={15} />
                {t.detail.developerSummary}
              </summary>
              <div className="install-actions-stack">
                <p className="install-hint">{t.detail.developerHint}</p>
                <div
                  className="install-target-toggle"
                  role="group"
                  aria-label={t.detail.installTarget}
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
                    {copiedInstall ? t.detail.copied : t.detail.copyPrompt}
                  </button>
                  <a
                    className="button secondary"
                    href={artifactDownloadUrl(registryUrl, selected)}
                  >
                    <Download size={17} />
                    {t.detail.downloadZip}
                  </a>
                </div>
              </div>
            </details>
          </>
        ) : (
          <p className="install-warning">{t.detail.noApproved}</p>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">
          <BarChart3 size={17} />
          {t.detail.usage}
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

      <details className="technical-details">
        <summary>{t.detail.technical}</summary>
        <div className="split">
          <div className="panel">
            <div className="panel-title">
              <FileCode2 size={17} />
              {t.detail.contents}
            </div>
            <ul className="file-tree">
              {selected.files.slice(0, 5).map((file) => (
                <li key={file}>{file}</li>
              ))}
              {filesExpanded &&
                selected.files
                  .slice(5)
                  .map((file) => <li key={file}>{file}</li>)}
            </ul>
            {selected.files.length > 5 && (
              <button
                type="button"
                className="toggle-files-button"
                onClick={() => setFilesExpanded(!filesExpanded)}
                aria-label={
                  filesExpanded ? t.detail.showLessAria : t.detail.showMoreAria
                }
              >
                <span>
                  {filesExpanded
                    ? t.detail.showLess
                    : t.detail.showMore(selected.files.length - 5)}
                </span>
                <ChevronDown
                  size={15}
                  style={{
                    transform: filesExpanded
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                />
              </button>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">
              <CheckCircle2 size={17} />
              {t.detail.validation}
            </div>
            <ValidationPanel validation={selected.activeVersion?.validation} />
            <div className="version-line">
              <span>{t.detail.activeVersion}</span>
              <strong>
                {selected.activeVersion?.version ?? t.detail.noVersion}
              </strong>
            </div>
            {selected.latestApproved &&
            selected.activeVersion?.id !== selected.latestApproved.id ? (
              <div className="version-line">
                <span>{t.detail.approvedInstall}</span>
                <strong>{selected.latestApproved.version}</strong>
              </div>
            ) : null}
          </div>
        </div>
      </details>

      {canManageLifecycle && (
        <div className="lifecycle-panel">
          <div className="panel-title">
            <RefreshCw size={17} />
            {t.detail.lifecycle}
          </div>
          <p className="lifecycle-copy">{t.detail.lifecycleCopy}</p>
          <div className="actions">
            {selected.activeVersion?.lifecycleState !== "approved" && (
              <button
                onClick={() => void handleLifecycle("approved")}
                disabled={loading}
              >
                <CheckCircle2 size={17} />
                {t.detail.approve}
              </button>
            )}
            <button
              className="secondary"
              onClick={() => void handleLifecycle("hidden")}
              disabled={loading}
            >
              <ShieldCheck size={17} />
              {t.detail.hide}
            </button>
            <button
              className="secondary"
              onClick={() => void handleLifecycle("deprecated")}
              disabled={loading}
            >
              <Archive size={17} />
              {t.detail.deprecate}
            </button>
          </div>
        </div>
      )}

      <div className="activity-strip">
        <GitBranch size={18} />
        <span>{t.detail.activity(DOWNLOAD_HISTORY_DAYS)}</span>
      </div>
    </section>
  );
});
