import { ClipboardCheck, Copy, Search, UploadCloud } from "lucide-react";
import type { RegistryBrandingConfig } from "@skill-library/domain";
import {
  MCP_SETUP_TARGETS,
  type McpSetupTarget,
} from "../mcp-setup-prompts.js";
import type { AppTab, CatalogSkill, SessionUser } from "../types.js";
import { FeaturedSkill } from "./catalog-list.js";
import { Metric } from "./chrome.js";

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
  return (
    <section className="overview-stack" aria-label="Start here">
      <div className="decision-panel">
        <p className="kicker">Start here</p>
        <h2>{branding.overviewHeading}</h2>
        <p>{branding.overviewDescription}</p>
        <div className="actions">
          <button onClick={() => setActiveTab("catalog")}>
            <Search size={17} />
            Browse catalog
          </button>
          <button className="secondary" onClick={() => setActiveTab("publish")}>
            <UploadCloud size={17} />
            Publish draft
          </button>
        </div>
      </div>
      <section
        className="mcp-connect-panel"
        aria-label="Connect your agent via MCP"
      >
        <div className="mcp-connect-copy">
          <p className="kicker">Connect your agent</p>
          <h3>Copy agent setup prompt</h3>
          <p>
            {session || activeToken
              ? "Choose your agent below. The copied prompt embeds your personal MCP bearer token — paste it into Claude Code, Codex, Cursor, or another agent to configure local MCP and validate search."
              : "Sign in first. The copied prompt will embed your personal MCP bearer token so your agent can authenticate without Microsoft SSO."}{" "}
            Registry: <strong>{resolvedRegistryUrl}</strong>
          </p>
        </div>
        <div className="mcp-connect-grid">
          {MCP_SETUP_TARGETS.map((target) => (
            <button
              key={target.id}
              type="button"
              className={`mcp-connect-button ${copiedMcpTarget === target.id ? "copied" : ""}`}
              aria-label={`Copy ${target.label} MCP setup prompt`}
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
                {copiedMcpTarget === target.id ? "Copied" : "Copy prompt"}
              </span>
            </button>
          ))}
        </div>
      </section>
      <div className="metrics compact" aria-label="Registry metrics">
        <Metric label="Approved skills" value={catalog.length} />
        <Metric label="Installs" value={totals.installs} />
        <Metric label="Need update" value={totals.stale} tone="warn" />
      </div>
      {selected ? (
        <FeaturedSkill
          skill={selected}
          onOpen={() => setActiveTab("catalog")}
        />
      ) : (
        <article className="featured-skill empty-catalog">
          <div>
            <p className="kicker">No skills yet</p>
            <h2>{branding.emptyCatalogTitle}</h2>
            <p>{branding.emptyCatalogDescription}</p>
          </div>
          <button onClick={() => setActiveTab("publish")}>
            Publish first skill
          </button>
        </article>
      )}
    </section>
  );
}
