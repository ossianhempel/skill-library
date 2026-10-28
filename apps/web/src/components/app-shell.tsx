import {
  Archive,
  BarChart3,
  LogOut,
  Search,
  Trophy,
  UploadCloud,
  User,
  UserCheck,
  Users,
} from "lucide-react";
import type { ChangeEvent } from "react";
import type { RegistryBrandingConfig } from "@skill-library/domain";
import type { AppTab, SessionUser } from "../types.js";
import { formatRoleLabel } from "../lib/format.js";
import { NavButton } from "./chrome.js";
import { LogoMark } from "./logo-mark.js";
import { useI18n } from "../i18n/locale.js";
import { LanguageSwitcher } from "../i18n/language-switcher.js";

export function AppRail({
  branding,
  logoUrl,
  activeTab,
  hasSession,
  session,
  activeToken,
  setActiveTab,
  handleLogout,
  handleTokenChange,
}: {
  branding: RegistryBrandingConfig;
  logoUrl?: string;
  activeTab: AppTab;
  hasSession: boolean;
  session: SessionUser | null;
  activeToken: string | undefined;
  setActiveTab: (tab: AppTab) => void;
  handleLogout: () => void;
  handleTokenChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const { t } = useI18n();
  return (
    <aside className="rail" aria-label={t.rail.workspace}>
      <LogoMark logoUrl={logoUrl} fallbackText={branding.appShortName} />
      <NavButton
        icon={<Archive size={19} />}
        label={t.rail.overview}
        active={activeTab === "overview"}
        onClick={() => setActiveTab("overview")}
      />
      <NavButton
        icon={<Search size={19} />}
        label={t.rail.catalog}
        active={activeTab === "catalog"}
        onClick={() => setActiveTab("catalog")}
      />
      <NavButton
        icon={<Trophy size={19} />}
        label={t.rail.leaderboard}
        active={activeTab === "contributors"}
        onClick={() => setActiveTab("contributors")}
      />
      {hasSession && (
        <NavButton
          icon={<UserCheck size={19} />}
          label={t.rail.mySkills}
          active={activeTab === "my-skills"}
          onClick={() => setActiveTab("my-skills")}
        />
      )}
      <NavButton
        icon={<UploadCloud size={19} />}
        label={t.rail.publish}
        active={activeTab === "publish"}
        onClick={() => setActiveTab("publish")}
      />
      <NavButton
        icon={<BarChart3 size={19} />}
        label={t.rail.reports}
        active={activeTab === "reports"}
        onClick={() => setActiveTab("reports")}
      />
      {hasSession && (
        <NavButton
          icon={<Users size={19} />}
          label={t.rail.team}
          active={activeTab === "team"}
          onClick={() => setActiveTab("team")}
        />
      )}

      <div className="rail-spacer" />

      {session ? (
        <div className="session-profile">
          <div className="session-avatar">
            {session.image ? (
              <img src={session.image} alt="" />
            ) : (
              <User size={16} />
            )}
          </div>
          <div className="session-info">
            <span className="session-name">{session.name}</span>
            <span className={`session-role role-${session.role}`}>
              {formatRoleLabel(session.role, t.roles.labels)}
            </span>
          </div>
          <button
            className="session-logout"
            onClick={() => void handleLogout()}
            aria-label={t.rail.signOut}
            title={t.rail.signOut}
          >
            <LogOut size={14} />
          </button>
        </div>
      ) : (
        <div className="token-config">
          <label>
            {t.rail.apiKey}
            <input
              type="password"
              value={activeToken ?? ""}
              onChange={handleTokenChange}
              placeholder={t.rail.apiKeyPlaceholder}
            />
          </label>
        </div>
      )}
    </aside>
  );
}

export function AppTopbar({
  branding,
  workspaceId,
  availableWorkspaces,
  activeTab,
  query,
  setQuery,
  setActiveTab,
  setIsCreatingCustomWorkspace,
  setSelectedWorkspaceId,
}: {
  branding: RegistryBrandingConfig;
  workspaceId: string;
  availableWorkspaces: string[];
  activeTab: AppTab;
  query: string;
  setQuery: (query: string) => void;
  setActiveTab: (tab: AppTab) => void;
  setIsCreatingCustomWorkspace: (value: boolean) => void;
  setSelectedWorkspaceId: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <header className="topbar">
      <div>
        <p className="kicker">{branding.registryTagline}</p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ margin: 0 }}>{branding.appName}</h1>
          <div className="role-select-wrapper">
            <select
              className="role-select"
              value={workspaceId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "__new__") {
                  setIsCreatingCustomWorkspace(true);
                  setActiveTab("publish");
                } else {
                  setIsCreatingCustomWorkspace(false);
                  setSelectedWorkspaceId(val);
                }
              }}
              title={t.topbar.activeWorkspace}
            >
              {availableWorkspaces.map((ws) => (
                <option key={ws} value={ws}>
                  {t.topbar.workspaceOption(ws)}
                </option>
              ))}
              <option value="__new__">{t.topbar.newWorkspace}</option>
            </select>
          </div>
        </div>
      </div>
      <div className="topbar-tools">
        <LanguageSwitcher />
        {(activeTab === "catalog" ||
          activeTab === "my-skills" ||
          activeTab === "overview") && (
          <label className="searchbox">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={branding.searchPlaceholder}
            />
          </label>
        )}
      </div>
    </header>
  );
}
