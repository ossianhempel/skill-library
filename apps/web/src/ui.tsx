import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  buildMcpSetupContext,
  buildMcpSetupPrompt,
  fetchMcpSetupAgentAuth,
  MCP_SETUP_TARGETS,
  withMcpSetupAgentAuth,
  type McpSetupTarget,
} from "./mcp-setup-prompts.js";
import {
  DEFAULT_REGISTRY_BRANDING,
  type InstallTargetKind,
  type RegistryBrandingConfig,
} from "@skill-library/domain";
import type { PackageReport } from "@skill-library/domain";
import type { AppTab, SkillLibraryAppProps } from "./types.js";
import { browserToken } from "./lib/browser.js";
import { isLocalDev } from "./lib/browser.js";
import { createWebApiClient } from "./api/client.js";
import { summarizeReports } from "./api/catalog.js";
import { buildInstallAgentPrompt } from "./lib/install-prompts.js";
import { useAuthSession } from "./hooks/use-auth-session.js";
import { useCatalog } from "./hooks/use-catalog.js";
import { useSkillUrl } from "./hooks/use-skill-url.js";
import { StatusStyles } from "./components/chrome.js";
import { AppRail, AppTopbar } from "./components/app-shell.js";
import {
  CategoryFilter,
  SkillList,
  StatusFilter,
} from "./components/catalog-list.js";
import { OverviewTab } from "./components/overview-tab.js";
import { PublishTab } from "./components/publish-tab.js";
import { ReportPanel } from "./components/report-panel.js";
import { LoginScreen } from "./components/login-screen.js";
import { TeamPanel } from "./components/team-panel.js";
import { SkillDetailPane } from "./components/skill-detail-pane.js";

export function SkillLibraryApp({
  skills,
  workspaceId: workspaceIdProp,
  registryUrl = "",
  authToken = browserToken(),
  api,
  branding: brandingProp,
}: SkillLibraryAppProps) {
  const [branding, setBranding] = useState<RegistryBrandingConfig>(
    brandingProp ?? DEFAULT_REGISTRY_BRANDING
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    workspaceIdProp ?? branding.defaultWorkspaceId
  );
  const workspaceId = selectedWorkspaceId;
  const [customWorkspaceId, setCustomWorkspaceId] = useState("");
  const [isCreatingCustomWorkspace, setIsCreatingCustomWorkspace] =
    useState(false);

  useEffect(() => {
    if (workspaceIdProp) {
      setSelectedWorkspaceId(workspaceIdProp);
    }
  }, [workspaceIdProp]);

  const [notice, setNotice] = useState("Ready");
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [installTarget, setInstallTarget] =
    useState<InstallTargetKind>("project");
  const [copiedMcpTarget, setCopiedMcpTarget] = useState<McpSetupTarget | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("overview");
  const [activeToken, setActiveToken] = useState(() => authToken);
  const [filesExpanded, setFilesExpanded] = useState(false);

  useEffect(() => {
    if (brandingProp) {
      return;
    }

    void fetchBranding();
  }, [brandingProp, registryUrl]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = branding.documentTitle;
    }
  }, [branding.documentTitle]);

  async function fetchBranding() {
    try {
      const baseUrl = registryUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/config`);

      if (response.ok) {
        const data = (await response.json()) as {
          branding: RegistryBrandingConfig;
        };
        setBranding(data.branding);
      }
    } catch {
      // Keep defaults when config is unavailable.
    }
  }

  const apiClient = useMemo(
    () => api ?? createWebApiClient({ registryUrl, token: activeToken }),
    [api, registryUrl, activeToken]
  );

  const {
    session,
    sessionLoading,
    signingIn,
    teamMembers,
    teamLoading,
    handleLogout,
    handleSignIn,
    loadTeamMembers,
    handleRoleChange,
    handleDeleteUser,
  } = useAuthSession({
    registryUrl,
    activeTab,
    setNotice,
    setActiveTab,
  });

  const {
    catalog,
    selectedId,
    query,
    setQuery,
    selectedCategory,
    setSelectedCategory,
    statusFilter,
    setStatusFilter,
    catalogLoaded,
    detailPaneRef,
    handleSelectSkill,
    loadCatalog,
    handleLifecycle,
    availableCategories,
    myCategories,
    queryFilteredCatalog,
    queryFilteredMySkills,
    queryAndStatusFilteredCatalog,
    queryAndStatusFilteredMySkills,
    displaySkills,
    selected,
  } = useCatalog({
    apiClient,
    workspaceId,
    skills,
    session,
    activeTab,
    loading,
    setLoading,
    setNotice,
  });

  useEffect(() => {
    setFilesExpanded(false);
  }, [selectedId]);

  const { copiedLink, copyShareLink } = useSkillUrl({
    activeTab,
    setActiveTab,
    workspaceId,
    setSelectedWorkspaceId,
    catalog,
    catalogLoaded,
    selected,
    handleSelectSkill,
    setNotice,
  });

  const availableWorkspaces = useMemo(() => {
    const workspacesSet = new Set<string>();
    if (workspaceIdProp) workspacesSet.add(workspaceIdProp);
    if (branding.defaultWorkspaceId)
      workspacesSet.add(branding.defaultWorkspaceId);
    for (const skill of catalog) {
      if (skill.pkg.workspaceId) {
        workspacesSet.add(skill.pkg.workspaceId);
      }
    }
    return Array.from(workspacesSet).sort();
  }, [catalog, workspaceIdProp, branding.defaultWorkspaceId]);

  const handleWorkspaceChange = (val: string) => {
    if (val === "__new__") {
      setIsCreatingCustomWorkspace(true);
      setSelectedWorkspaceId(customWorkspaceId);
    } else {
      setIsCreatingCustomWorkspace(false);
      setSelectedWorkspaceId(val);
    }
  };

  const handleCustomWorkspaceChange = (val: string) => {
    setCustomWorkspaceId(val);
    setSelectedWorkspaceId(val);
  };

  const totals = catalog.reduce(
    (acc, skill) => ({
      installs: acc.installs + skill.installs,
      downloads: acc.downloads + skill.downloads,
      stale: acc.stale + skill.staleInstalls,
    }),
    { installs: 0, downloads: 0, stale: 0 }
  );
  const reportSummary = summarizeReports(
    catalog
      .map((skill) => skill.report)
      .filter((report): report is PackageReport => Boolean(report))
  );

  async function copyInstallPrompt() {
    if (!selected) {
      return;
    }

    const prompt = buildInstallAgentPrompt({
      packageSlug: selected.pkg.slug,
      packageName: selected.pkg.name,
      workspaceId,
      registryUrl: resolvedRegistryUrl,
      appName: branding.appName,
      version: selected.latestApproved?.version,
      target: installTarget,
    });

    await navigator.clipboard?.writeText(prompt).catch(() => undefined);
    setCopiedInstall(true);
    setNotice("Install prompt copied — paste it into your agent");
    window.setTimeout(() => setCopiedInstall(false), 2500);
  }

  function handleTokenChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setActiveToken(value || undefined);
    if (value) {
      window.localStorage.setItem("skill-library-token", value);
    } else {
      window.localStorage.removeItem("skill-library-token");
    }
  }

  const isAdmin = session?.role === "admin";
  const canManageLifecycle =
    activeToken !== undefined ||
    session?.role === "maintainer" ||
    session?.role === "admin";
  const hasSession = session !== null;
  const useTokenAuth = activeToken !== undefined;

  // Show login screen when not authenticated (no SSO session and no API token)
  // In dev mode (localhost), always allow access via token fallback
  if (!hasSession && !useTokenAuth && !isLocalDev()) {
    return (
      <>
        <StatusStyles branding={branding} />
        <LoginScreen
          branding={branding}
          onSignIn={handleSignIn}
          signingIn={signingIn}
          checkingSession={sessionLoading}
        />
      </>
    );
  }

  const resolvedRegistryUrl =
    registryUrl ||
    branding.registryPublicUrl ||
    (typeof window !== "undefined" ? window.location.origin : "");

  async function copyMcpSetupPrompt(target: McpSetupTarget) {
    const agentAuth = await fetchMcpSetupAgentAuth({
      registryUrl: resolvedRegistryUrl,
      hasSession: Boolean(session),
      activeToken,
    });

    if (!agentAuth) {
      setNotice(
        session
          ? "Could not load your MCP token. Sign out and back in, then try again. If this persists, the registry may need an update."
          : "Sign in to copy a setup prompt with your personal MCP token."
      );
      return;
    }

    const context = withMcpSetupAgentAuth(
      buildMcpSetupContext(branding, workspaceId, resolvedRegistryUrl),
      agentAuth
    );
    const prompt = buildMcpSetupPrompt(target, context);
    await navigator.clipboard?.writeText(prompt).catch(() => undefined);
    const label =
      MCP_SETUP_TARGETS.find((entry) => entry.id === target)?.label ?? "Agent";
    setCopiedMcpTarget(target);
    setNotice(`Copied ${label} agent setup prompt with your MCP token`);
    window.setTimeout(() => {
      setCopiedMcpTarget((current) => (current === target ? null : current));
    }, 2500);
  }

  return (
    <>
      <StatusStyles branding={branding} />
      <main
        className={`shell ${activeTab === "catalog" || activeTab === "my-skills" ? "layout-catalog" : "layout-single"}`}
      >
        <AppRail
          branding={branding}
          activeTab={activeTab}
          hasSession={hasSession}
          session={session}
          activeToken={activeToken}
          setActiveTab={setActiveTab}
          handleLogout={handleLogout}
          handleTokenChange={handleTokenChange}
        />

        <section className="catalog-pane" aria-label="Workspace overview">
          <AppTopbar
            branding={branding}
            workspaceId={workspaceId}
            availableWorkspaces={availableWorkspaces}
            activeTab={activeTab}
            query={query}
            setQuery={setQuery}
            setActiveTab={setActiveTab}
            setIsCreatingCustomWorkspace={setIsCreatingCustomWorkspace}
            setSelectedWorkspaceId={setSelectedWorkspaceId}
          />

          {activeTab === "overview" && (
            <OverviewTab
              branding={branding}
              catalog={catalog}
              totals={totals}
              selected={selected}
              resolvedRegistryUrl={resolvedRegistryUrl}
              session={session}
              activeToken={activeToken}
              copiedMcpTarget={copiedMcpTarget}
              setActiveTab={setActiveTab}
              copyMcpSetupPrompt={copyMcpSetupPrompt}
            />
          )}

          {activeTab === "catalog" && (
            <>
              <StatusFilter
                selectedStatus={statusFilter}
                onSelectStatus={setStatusFilter}
                catalog={queryFilteredCatalog}
              />
              <CategoryFilter
                categories={availableCategories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                catalog={queryAndStatusFilteredCatalog}
              />
              <SkillList
                catalog={displaySkills}
                selectedId={selected?.pkg.id}
                onSelect={handleSelectSkill}
                loading={!catalogLoaded}
                emptyMessage={
                  displaySkills.length === 0
                    ? statusFilter === "drafts"
                      ? "No draft or pending skills in this category match your search."
                      : statusFilter === "approved"
                        ? "No approved skills in this category match your search."
                        : "No skills in this category match your search."
                    : undefined
                }
              />
            </>
          )}

          {activeTab === "my-skills" && (
            <>
              <StatusFilter
                selectedStatus={statusFilter}
                onSelectStatus={setStatusFilter}
                catalog={queryFilteredMySkills}
              />
              <CategoryFilter
                categories={myCategories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                catalog={queryAndStatusFilteredMySkills}
              />
              <SkillList
                catalog={displaySkills}
                selectedId={selected?.pkg.id}
                onSelect={handleSelectSkill}
                loading={!catalogLoaded}
                emptyMessage={
                  displaySkills.length === 0
                    ? statusFilter === "drafts"
                      ? "You haven't uploaded any draft or pending skills in this category yet."
                      : statusFilter === "approved"
                        ? "You haven't uploaded any approved skills in this category yet."
                        : "You haven't uploaded any skills in this category yet."
                    : undefined
                }
              />
            </>
          )}

          {activeTab === "publish" && (
            <PublishTab
              apiClient={apiClient}
              workspaceId={workspaceId}
              branding={branding}
              availableWorkspaces={availableWorkspaces}
              availableCategories={availableCategories}
              isCreatingCustomWorkspace={isCreatingCustomWorkspace}
              customWorkspaceId={customWorkspaceId}
              loading={loading}
              setLoading={setLoading}
              onWorkspaceChange={handleWorkspaceChange}
              onCustomWorkspaceChange={handleCustomWorkspaceChange}
              onNotice={setNotice}
              onUploaded={loadCatalog}
              notice={notice}
            />
          )}

          {activeTab === "reports" && (
            <ReportPanel catalog={catalog} summary={reportSummary} />
          )}

          {activeTab === "team" && session && (
            <TeamPanel
              members={teamMembers}
              loading={teamLoading}
              currentUser={session}
              canManageRoles={isAdmin}
              onRoleChange={handleRoleChange}
              onDeleteUser={handleDeleteUser}
              onRefresh={loadTeamMembers}
              notice={notice}
            />
          )}
        </section>

        {(activeTab === "catalog" || activeTab === "my-skills") && selected && (
          <SkillDetailPane
            ref={detailPaneRef}
            selected={selected}
            workspaceId={workspaceId}
            registryUrl={registryUrl}
            resolvedRegistryUrl={resolvedRegistryUrl}
            branding={branding}
            installTarget={installTarget}
            copiedInstall={copiedInstall}
            copiedLink={copiedLink}
            filesExpanded={filesExpanded}
            canManageLifecycle={canManageLifecycle}
            loading={loading}
            setInstallTarget={setInstallTarget}
            copyInstallPrompt={copyInstallPrompt}
            copyShareLink={copyShareLink}
            setFilesExpanded={setFilesExpanded}
            handleLifecycle={handleLifecycle}
          />
        )}
      </main>
    </>
  );
}

// Stable public re-exports — ui.test.tsx and index.ts import these from ./ui.js.
export { buildInstallPrompt, buildInstallAgentPrompt, INSTALL_PROVIDER_OPTIONS } from "./lib/install-prompts.js"; // prettier-ignore
export type { InstallAgentPromptInput } from "./lib/install-prompts.js";
export { buildUploadRequest, resolvePublishInput, PUBLISH_FIELD_PLACEHOLDERS, emptyPublishForm, emptyGitFields } from "./lib/publish.js"; // prettier-ignore
export { filesToPackageEntries, loadCatalogSkills, pickActiveVersion, summarizeReports } from "./api/catalog.js"; // prettier-ignore
export { createWebApiClient } from "./api/client.js";
export { renderCatalogTitle, renderLifecycleBadge, formatRoleLabel } from "./lib/format.js"; // prettier-ignore
export type { SessionUser, AdminUser, CatalogSkill, WebApiClient, UploadVersionInput, GitImportInput, SkillLibraryAppProps, AppTab } from "./types.js"; // prettier-ignore
