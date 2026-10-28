import { ClipboardCheck, Copy, Search, UploadCloud } from "lucide-react";
import type { RegistryBrandingConfig } from "@skill-library/domain";
import {
  MCP_SETUP_TARGETS,
  type McpSetupTarget,
} from "../mcp-setup-prompts.js";
import type { AppTab, CatalogSkill, SessionUser } from "../types.js";
import { FeaturedSkill } from "./catalog-list.js";
import { Metric } from "./chrome.js";
import { HowItWorks } from "./add-to-claude.js";
import { useI18n } from "../i18n/locale.js";

export function OverviewTab({
  branding,
  catalog,
  totals,
  selected,
  resolvedRegistryUrl,
  session,
  activeToken,
  copiedMcpTarget,
  setActiveTab,
  copyMcpSetupPrompt,
}: {
  branding: RegistryBrandingConfig;
  catalog: CatalogSkill[];
  totals: { installs: number; downloads: number; stale: number };
  selected: CatalogSkill | undefined;
  resolvedRegistryUrl: string;
  session: SessionUser | null;
  activeToken: string | undefined;
  copiedMcpTarget: McpSetupTarget | null;
  setActiveTab: (tab: AppTab) => void;
  copyMcpSetupPrompt: (target: McpSetupTarget) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="overview-stack" aria-label={t.overview.startHere}>
      <div className="decision-panel">
        <p className="kicker">{t.overview.startHere}</p>
        <h2>{branding.overviewHeading}</h2>
        <p>{branding.overviewDescription}</p>
        <div className="actions">
          <button onClick={() => setActiveTab("catalog")}>
            <Search size={17} />
            {t.overview.browseSkills}
          </button>
          <button className="secondary" onClick={() => setActiveTab("publish")}>
            <UploadCloud size={17} />
            {t.overview.shareSkill}
          </button>
        </div>
      </div>
      <HowItWorks onBrowse={() => setActiveTab("catalog")} />
      <details className="developer-connect">
        <summary>{t.overview.developerSummary}</summary>
        <section
          className="mcp-connect-panel"
          aria-label={t.overview.connectAria}
        >
          <div className="mcp-connect-copy">
            <p className="kicker">{t.overview.connectKicker}</p>
            <h3>{t.overview.connectTitle}</h3>
            <p>
              {session || activeToken
                ? t.overview.connectSignedIn
                : t.overview.connectSignedOut}{" "}
              {t.overview.registry} <strong>{resolvedRegistryUrl}</strong>
            </p>
          </div>
          <div className="mcp-connect-grid">
            {MCP_SETUP_TARGETS.map((target) => (
              <button
                key={target.id}
                type="button"
                className={`mcp-connect-button ${copiedMcpTarget === target.id ? "copied" : ""}`}
                aria-label={t.overview.copyTargetAria(target.label)}
                onClick={() => void copyMcpSetupPrompt(target.id)}
              >
                <span className="mcp-connect-button-label">{target.label}</span>
                <span className="mcp-connect-button-hint">{target.hint}</span>
                <span className="mcp-connect-button-action">
                  {copiedMcpTarget === target.id ? (
                    <ClipboardCheck size={16} />
                  ) : (
                    <Copy size={16} />
                  )}
                  {copiedMcpTarget === target.id
                    ? t.overview.copied
                    : t.overview.copyPrompt}
                </span>
              </button>
            ))}
          </div>
        </section>
      </details>
      <div className="metrics compact" aria-label={t.overview.metricsAria}>
        <Metric label={t.overview.approvedSkills} value={catalog.length} />
        <Metric label={t.overview.installs} value={totals.installs} />
        <Metric
          label={t.overview.needUpdate}
          value={totals.stale}
          tone="warn"
        />
      </div>
      {selected ? (
        <FeaturedSkill
          skill={selected}
          onOpen={() => setActiveTab("catalog")}
        />
      ) : (
        <article className="featured-skill empty-catalog">
          <div>
            <p className="kicker">{t.overview.noSkillsYet}</p>
            <h2>{branding.emptyCatalogTitle}</h2>
            <p>{branding.emptyCatalogDescription}</p>
          </div>
          <button onClick={() => setActiveTab("publish")}>
            {t.overview.publishFirst}
          </button>
        </article>
      )}
    </section>
  );
}
