import {
  Archive,
  BarChart3,
  LogOut,
  Search,
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
  return (
    <aside className="rail" aria-label="Workspace">
      <LogoMark logoUrl={logoUrl} fallbackText={branding.appShortName} />
      <NavButton
        icon={<Archive size={19} />}
        label="Overview"
        active={activeTab === "overview"}
        onClick={() => setActiveTab("overview")}
      />
      <NavButton
        icon={<Search size={19} />}
        label="Catalog"
        active={activeTab === "catalog"}
        onClick={() => setActiveTab("catalog")}
      />
      {hasSession && (
        <NavButton
          icon={<UserCheck size={19} />}
          label="My Skills"
          active={activeTab === "my-skills"}
          onClick={() => setActiveTab("my-skills")}
        />
      )}
      <NavButton
        icon={<UploadCloud size={19} />}
        label="Publish"
        active={activeTab === "publish"}
        onClick={() => setActiveTab("publish")}
      />
      <NavButton
        icon={<BarChart3 size={19} />}
        label="Reports"
        active={activeTab === "reports"}
        onClick={() => setActiveTab("reports")}
      />
      {hasSession && (
        <NavButton
          icon={<Users size={19} />}
          label="Team"
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
              {formatRoleLabel(session.role)}
            </span>
          </div>
          <button
            className="session-logout"
            onClick={() => void handleLogout()}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      ) : (
        <div className="token-config">
          <label>
            API Key
            <input
              type="password"
              value={activeToken ?? ""}
              onChange={handleTokenChange}
              placeholder="Enter token..."
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
              title="Active Workspace"
            >
              {availableWorkspaces.map((ws) => (
                <option key={ws} value={ws}>
                  Workspace: {ws}
                </option>
              ))}
              <option value="__new__">+ New Workspace...</option>
            </select>
          </div>
        </div>
      </div>
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
    </header>
  );
}
