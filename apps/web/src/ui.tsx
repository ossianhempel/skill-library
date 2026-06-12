import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { Archive, BarChart3, CheckCircle2, ChevronDown, ClipboardCheck, Copy, Download, FileCode2, GitBranch, Loader2, LogOut, RefreshCw, Search, Shield, ShieldCheck, TerminalSquare, UploadCloud, User, Users } from "lucide-react";
import {
  buildMcpSetupContext,
  buildMcpSetupPrompt,
  fetchMcpSetupAgentAuth,
  MCP_SETUP_TARGETS,
  withMcpSetupAgentAuth,
  type McpSetupTarget
} from "./mcp-setup-prompts.js";
import { ValidationPanel } from "./validation-panel.js";
import { SkillStatsMeta } from "./skill-stats.js";
import {
  DEFAULT_REGISTRY_BRANDING,
  DOWNLOAD_HISTORY_DAYS,
  WORKSPACE_ROLE_DESCRIPTIONS,
  WORKSPACE_ROLE_LABELS,
  type CatalogPackageStats,
  type DownloadHistoryPoint,
  type LifecycleState,
  type PackageReport,
  type RegistryBrandingConfig,
  type SkillPackage,
  type SkillVersion,
  type ValidationResult,
  type WorkspaceRole
} from "@skill-library/domain";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  image: string | null;
  skillsSubmitted: number;
}

export interface CatalogSkill {
  pkg: SkillPackage;
  latestApproved?: SkillVersion;
  activeVersion?: SkillVersion;
  validation?: ValidationResult;
  files: string[];
  installs: number;
  downloads: number;
  downloadHistory: DownloadHistoryPoint[];
  lastModifiedAt: string;
  staleInstalls: number;
  report?: PackageReport;
}

export interface WebApiClient {
  search(workspaceId: string, query?: string): Promise<SkillPackage[]>;
  latestApprovedVersion(packageId: string): Promise<SkillVersion | undefined>;
  packageVersions(packageId: string): Promise<SkillVersion[]>;
  workspaceCatalogStats(workspaceId: string): Promise<CatalogPackageStats[]>;
  workspaceReports(workspaceId: string): Promise<PackageReport[]>;
  uploadVersion(workspaceId: string, input: UploadVersionInput): Promise<SkillVersion>;
  importGitVersion(workspaceId: string, input: GitImportInput): Promise<SkillVersion>;
  validatePackageTree(entries: UploadVersionInput["entries"]): Promise<ValidationResult>;
  transitionVersion(versionId: string, toState: LifecycleState): Promise<SkillVersion>;
}

export interface UploadVersionInput {
  packageSlug: string;
  packageName: string;
  description: string;
  categories?: string[];
  version: string;
  entries: { path: string; content: string; encoding?: "utf8" | "base64" }[];
}

export interface GitImportInput {
  packageSlug: string;
  packageName: string;
  description: string;
  categories?: string[];
  version: string;
  repositoryPath: string;
  ref?: string;
  subdirectory?: string;
}

export interface SkillLibraryAppProps {
  skills?: CatalogSkill[];
  workspaceId?: string;
  registryUrl?: string;
  authToken?: string;
  api?: WebApiClient;
  branding?: RegistryBrandingConfig;
}

type AppTab = "overview" | "catalog" | "publish" | "reports" | "team";

function isLocalDev(): boolean {
  return typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
}

// Local-dev demo catalog only. Production must never show placeholder skills.
const devSampleSkills: CatalogSkill[] = [
  {
    pkg: packageData("workspace-1-review-helper", "review-helper", "Review Helper", "Turns repository diffs into a focused code-review checklist for internal agents.", ["review", "quality"]),
    latestApproved: version("version-review-2", "workspace-1-review-helper", "1.2.0", "approved"),
    validation: { ok: true, files: [], issues: [] },
    files: ["SKILL.md", "scripts/review.ts", "references/checklist.md"],
    installs: 43,
    downloads: 118,
    downloadHistory: demoDownloadHistory([4, 6, 8, 5, 9, 7, 11, 10, 12, 8, 14, 9, 13, 12]),
    lastModifiedAt: "2026-06-07T12:00:00.000Z",
    staleInstalls: 6,
    report: packageReport("workspace-1-review-helper", 2, 43, 118, 37, 6)
  },
  {
    pkg: packageData("workspace-1-release-notes", "release-notes", "Release Notes", "Builds release notes from merged commits, issue links, and deployment metadata.", ["release", "writing"]),
    latestApproved: version("version-release-1", "workspace-1-release-notes", "1.0.0", "approved"),
    validation: { ok: true, files: [], issues: [] },
    files: ["SKILL.md", "templates/release.md"],
    installs: 17,
    downloads: 52,
    downloadHistory: demoDownloadHistory([2, 3, 4, 3, 5, 4, 6, 5, 4, 3, 5, 4, 6, 4]),
    lastModifiedAt: "2026-06-07T12:00:00.000Z",
    staleInstalls: 0,
    report: packageReport("workspace-1-release-notes", 1, 17, 52, 17, 0)
  },
  {
    pkg: packageData("workspace-1-git-importer", "git-importer", "Git Importer", "Imports accessible Git-hosted skill directories with ref and commit provenance.", ["publishing", "git"]),
    latestApproved: version("version-git-1", "workspace-1-git-importer", "0.4.0", "published"),
    validation: { ok: true, files: [], issues: [] },
    files: ["SKILL.md", "scripts/import.ts", "references/provenance.md"],
    installs: 8,
    downloads: 21,
    downloadHistory: demoDownloadHistory([1, 1, 2, 1, 2, 2, 3, 1, 2, 1, 2, 1, 1, 1]),
    lastModifiedAt: "2026-06-07T12:00:00.000Z",
    staleInstalls: 3,
    report: packageReport("workspace-1-git-importer", 1, 8, 21, 5, 3)
  }
];

export function SkillLibraryApp({
  skills,
  workspaceId: workspaceIdProp,
  registryUrl = "",
  authToken = browserToken(),
  api,
  branding: brandingProp
}: SkillLibraryAppProps) {
  const [branding, setBranding] = useState<RegistryBrandingConfig>(brandingProp ?? DEFAULT_REGISTRY_BRANDING);
  const workspaceId = workspaceIdProp ?? branding.defaultWorkspaceId;
  const [catalog, setCatalog] = useState<CatalogSkill[]>(skills ?? []);
  const [selectedId, setSelectedId] = useState<string | undefined>(catalog[0]?.pkg.id);
  const [query, setQuery] = useState("");
  const [publishForm, setPublishForm] = useState(emptyPublishForm);
  const [gitFields, setGitFields] = useState(emptyGitFields);
  const [uploadEntries, setUploadEntries] = useState<UploadVersionInput["entries"]>([]);
  const [preflightValidation, setPreflightValidation] = useState<ValidationResult | undefined>();
  const [notice, setNotice] = useState("Ready");
  const [copiedMcpTarget, setCopiedMcpTarget] = useState<McpSetupTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("overview");
  const [activeToken, setActiveToken] = useState(() => authToken);
  const [dragOver, setDragOver] = useState(false);
  const [filesExpanded, setFilesExpanded] = useState(false);

  useEffect(() => {
    setFilesExpanded(false);
  }, [selectedId]);

  const apiClient = useMemo(() => api ?? createWebApiClient({ registryUrl, token: activeToken }), [api, registryUrl, activeToken]);

  // Session state for Better Auth SSO
  const [session, setSession] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [teamMembers, setTeamMembers] = useState<AdminUser[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  useEffect(() => {
    void fetchSession();
  }, [registryUrl]);

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
        const data = (await response.json()) as { branding: RegistryBrandingConfig };
        setBranding(data.branding);
      }
    } catch {
      // Keep defaults when config is unavailable.
    }
  }

  async function fetchSession() {
    setSessionLoading(true);
    try {
      const baseUrl = registryUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/auth/get-session`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json() as { user?: SessionUser } | null;
        setSession(data?.user ?? null);
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    } finally {
      setSessionLoading(false);
    }
  }

  async function handleLogout() {
    try {
      const baseUrl = registryUrl.replace(/\/$/, "");
      await fetch(`${baseUrl}/api/auth/sign-out`, { method: "POST", credentials: "include" });
    } catch { /* ignore */ }
    setSession(null);
    setActiveTab("overview");
  }

  async function handleSignIn() {
    const baseUrl = registryUrl.replace(/\/$/, "");

    setSigningIn(true);

    try {
      const response = await fetch(`${baseUrl}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: "microsoft",
          callbackURL: window.location.href,
          disableRedirect: true
        })
      });

      if (!response.ok) {
        throw new Error(`Sign-in failed (${response.status})`);
      }

      const data = (await response.json()) as { url?: string };

      if (!data.url) {
        throw new Error("Sign-in response did not include a redirect URL.");
      }

      window.location.href = data.url;
    } catch (error) {
      setSigningIn(false);
      console.error("Microsoft sign-in failed:", error);
    }
  }

  async function loadTeamMembers() {
    setTeamLoading(true);
    try {
      const baseUrl = registryUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/team/members`, { credentials: "include" });
      if (response.ok) {
        const data = (await response.json()) as { members: AdminUser[] };
        setTeamMembers(data.members);
      }
    } catch { /* ignore */ } finally {
      setTeamLoading(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    const baseUrl = registryUrl.replace(/\/$/, "");
    try {
      const response = await fetch(`${baseUrl}/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: newRole })
      });
      if (response.ok) {
        setNotice(`Role updated to ${formatRoleLabel(newRole)}`);
        await loadTeamMembers();
      } else {
        setNotice("Failed to update user role");
      }
    } catch {
      setNotice("Failed to update user role");
    }
  }

  async function handleDeleteUser(userId: string, userName: string) {
    if (!window.confirm(`Remove ${userName} from the registry? This action cannot be undone.`)) {
      return;
    }
    const baseUrl = registryUrl.replace(/\/$/, "");
    try {
      const response = await fetch(`${baseUrl}/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (response.ok) {
        setNotice(`${userName} has been removed`);
        await loadTeamMembers();
      } else {
        setNotice("Failed to remove user");
      }
    } catch {
      setNotice("Failed to remove user");
    }
  }

  // Load team roster when the team tab opens for any signed-in user.
  useEffect(() => {
    if (activeTab === "team" && session) {
      void loadTeamMembers();
    }
  }, [activeTab, session?.id]);

  useEffect(() => {
    if (skills) {
      setCatalog(skills);
      setSelectedId(skills[0]?.pkg.id);
      return;
    }

    void loadCatalog();
  }, [skills, workspaceId, query, apiClient]);

  const selected = catalog.find((skill) => skill.pkg.id === selectedId);
  const totals = catalog.reduce(
    (acc, skill) => ({ installs: acc.installs + skill.installs, downloads: acc.downloads + skill.downloads, stale: acc.stale + skill.staleInstalls }),
    { installs: 0, downloads: 0, stale: 0 }
  );
  const reportSummary = summarizeReports(catalog.map((skill) => skill.report).filter((report): report is PackageReport => Boolean(report)));

  async function loadCatalog() {
    setLoading(true);

    try {
      const next = await loadCatalogSkills(apiClient, workspaceId, query);
      setCatalog(next);
      setSelectedId((current) => current && next.some((skill) => skill.pkg.id === current) ? current : next[0]?.pkg.id);
      setNotice(next.length > 0 ? "Catalog synced" : "Catalog is empty. Publish a skill to get started.");
    } catch (error) {
      const fallback = isLocalDev() ? devSampleSkills : [];
      setCatalog(fallback);
      setSelectedId(fallback[0]?.pkg.id);
      setNotice(
        error instanceof Error
          ? isLocalDev()
            ? `API unavailable: ${error.message}; showing local demo data`
            : `API unavailable: ${error.message}`
          : isLocalDev()
            ? "API unavailable; showing local demo data"
            : "API unavailable"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handlePreflightValidate() {
    if (uploadEntries.length === 0) {
      setNotice("Choose a skill directory before validating.");
      return;
    }

    setLoading(true);

    try {
      const validation = await apiClient.validatePackageTree(uploadEntries);
      setPreflightValidation(validation);
      setNotice(
        validation.ok
          ? validation.issues.some((issue) => issue.severity === "warning")
            ? "Validation passed with warnings. You can upload the draft for maintainer review."
            : "Validation passed. Ready to upload."
          : "Validation found blocking errors. Fix them before approval; you can still upload an invalid draft for review."
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Validation failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (uploadEntries.length === 0) {
      setNotice("Choose a skill directory or JSON package tree before uploading.");
      return;
    }

    setLoading(true);

    try {
      const resolved = resolvePublishInput(publishForm);
      const version = await apiClient.uploadVersion(workspaceId, { ...resolved, entries: uploadEntries });
      setPreflightValidation(version.validation);
      setNotice(
        version.validation.ok
          ? `Uploaded as draft: version ${version.version}. Validation passed. Maintainers must Approve it from the Catalog page to make it available for download/install.`
          : `Uploaded as draft: version ${version.version}. Validation found blocking errors — fix frontmatter before approval. Maintainers can review the issue list in Catalog.`
      );
      await loadCatalog();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGitImport() {
    setLoading(true);

    try {
      const resolved = resolvePublishInput(publishForm);
      const repositoryPath = gitFields.repositoryPath.trim();
      const ref = gitFields.ref.trim();
      const subdirectory = gitFields.subdirectory.trim();

      if (!repositoryPath) {
        throw new Error("Repository path is required.");
      }

      if (!ref) {
        throw new Error("Git ref is required.");
      }

      if (!subdirectory) {
        throw new Error("Git subdirectory is required.");
      }

      const version = await apiClient.importGitVersion(workspaceId, {
        ...resolved,
        repositoryPath,
        ref,
        subdirectory
      });
      setNotice(`Git import created: ${version.version}`);
      await loadCatalog();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Git import failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleLifecycle(toState: LifecycleState) {
    const versionId = selected?.activeVersion?.id;

    if (!versionId) {
      setNotice("No selected version to transition.");
      return;
    }

    setLoading(true);

    try {
      const version = await apiClient.transitionVersion(versionId, toState);
      setNotice(`Version ${version.version} moved to ${version.lifecycleState}`);
      await loadCatalog();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Lifecycle transition failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.currentTarget.files ?? [])];
    if (files.length === 0) {
      setUploadEntries([]);
      setPreflightValidation(undefined);
      setNotice("No files staged");
      return;
    }

    const hasSkillMd = files.some((file) => {
      const path = file.webkitRelativePath || file.name;
      return path === "SKILL.md" || path.endsWith("/SKILL.md");
    });

    if (!hasSkillMd) {
      setUploadEntries([]);
      setPreflightValidation(undefined);
      setNotice("Validation error: The selected folder does not contain a SKILL.md file. Publishing requires a SKILL.md file.");
      return;
    }

    const entries = await filesToPackageEntries(files);
    setUploadEntries(entries);
    setPreflightValidation(undefined);

    const firstRelativePath = files[0]?.webkitRelativePath;
    let slug = publishForm.packageSlug;
    if (firstRelativePath) {
      const parts = firstRelativePath.split("/");
      if (parts.length > 1 && parts[0]) {
        slug = parts[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      }
    }

    applyDetectedSkillSlug(slug);
    setNotice(`${entries.length} files staged for upload from skill folder "${slug}". Ready to publish.`);
  }

  function applyDetectedSkillSlug(slug: string) {
    setPublishForm((prev) => ({
      ...prev,
      packageSlug: prev.packageSlug.trim() ? prev.packageSlug : slug,
      packageName: prev.packageName.trim() ? prev.packageName : titleize(slug)
    }));
    setGitFields((prev) => ({
      ...prev,
      subdirectory: prev.subdirectory.trim() ? prev.subdirectory : slug
    }));
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  async function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);

    const items = [...(event.dataTransfer.items ?? [])];
    const files: File[] = [];

    async function traverseEntry(item: any, path: string = ""): Promise<void> {
      if (item.isFile) {
        const file = await new Promise<File>((resolve, reject) => item.file(resolve, reject));
        const relativePath = path ? `${path}/${file.name}` : file.name;
        Object.defineProperty(file, "webkitRelativePath", {
          value: relativePath,
          writable: true,
          configurable: true
        });
        files.push(file);
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const readEntries = async (): Promise<any[]> => {
          return new Promise((resolve, reject) => {
            dirReader.readEntries(resolve, reject);
          });
        };
        const entries = await readEntries();
        for (const entry of entries) {
          await traverseEntry(entry, path ? `${path}/${item.name}` : item.name);
        }
      }
    }

    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        await traverseEntry(entry);
      }
    }

    if (files.length === 0) {
      return;
    }

    const hasSkillMd = files.some((file) => {
      const path = file.webkitRelativePath || file.name;
      return path === "SKILL.md" || path.endsWith("/SKILL.md");
    });

    if (!hasSkillMd) {
      setUploadEntries([]);
      setPreflightValidation(undefined);
      setNotice("Validation error: The selected folder does not contain a SKILL.md file. Publishing requires a SKILL.md file.");
      return;
    }

    const entries = await filesToPackageEntries(files);
    setUploadEntries(entries);
    setPreflightValidation(undefined);

    const firstRelativePath = files[0]?.webkitRelativePath;
    let slug = publishForm.packageSlug;
    if (firstRelativePath) {
      const parts = firstRelativePath.split("/");
      if (parts.length > 1 && parts[0]) {
        slug = parts[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      }
    }

    applyDetectedSkillSlug(slug);
    setNotice(`${entries.length} files staged for upload from dropped folder "${slug}". Ready to publish.`);
  }

  async function copyInstallPrompt() {
    if (!selected) {
      return;
    }

    await navigator.clipboard?.writeText(buildInstallPrompt(selected.pkg.slug, workspaceId, resolvedRegistryUrl)).catch(() => undefined);
    setNotice("Install prompt copied");
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
  const canManageLifecycle = activeToken !== undefined || session?.role === "maintainer" || session?.role === "admin";
  const hasSession = session !== null;
  const useTokenAuth = activeToken !== undefined;

  // Show login screen when not authenticated (no SSO session and no API token)
  // In dev mode (localhost), always allow access via token fallback
  if (!hasSession && !useTokenAuth && !isLocalDev()) {
    return <LoginScreen branding={branding} onSignIn={handleSignIn} signingIn={signingIn} checkingSession={sessionLoading} />;
  }

  const resolvedRegistryUrl = registryUrl || branding.registryPublicUrl || (typeof window !== "undefined" ? window.location.origin : "");

  async function copyMcpSetupPrompt(target: McpSetupTarget) {
    const agentAuth = await fetchMcpSetupAgentAuth({
      registryUrl: resolvedRegistryUrl,
      hasSession: Boolean(session),
      activeToken
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
    const label = MCP_SETUP_TARGETS.find((entry) => entry.id === target)?.label ?? "Agent";
    setCopiedMcpTarget(target);
    setNotice(`Copied ${label} agent setup prompt with your MCP token`);
    window.setTimeout(() => {
      setCopiedMcpTarget((current) => (current === target ? null : current));
    }, 2500);
  }

  return (
    <main className={`shell ${activeTab === "catalog" ? "layout-catalog" : "layout-single"}`}>
      <aside className="rail" aria-label="Workspace">
        <div className="mark">{branding.appShortName}</div>
        <NavButton icon={<Archive size={19} />} label="Overview" active={activeTab === "overview"} onClick={() => setActiveTab("overview")} />
        <NavButton icon={<Search size={19} />} label="Catalog" active={activeTab === "catalog"} onClick={() => setActiveTab("catalog")} />
        <NavButton icon={<UploadCloud size={19} />} label="Publish" active={activeTab === "publish"} onClick={() => setActiveTab("publish")} />
        <NavButton icon={<BarChart3 size={19} />} label="Reports" active={activeTab === "reports"} onClick={() => setActiveTab("reports")} />
        {hasSession && <NavButton icon={<Users size={19} />} label="Team" active={activeTab === "team"} onClick={() => setActiveTab("team")} />}

        <div className="rail-spacer" />

        {session ? (
          <div className="session-profile">
            <div className="session-avatar">
              {session.image ? <img src={session.image} alt="" /> : <User size={16} />}
            </div>
            <div className="session-info">
              <span className="session-name">{session.name}</span>
              <span className={`session-role role-${session.role}`}>{formatRoleLabel(session.role)}</span>
            </div>
            <button className="session-logout" onClick={() => void handleLogout()} aria-label="Sign out" title="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div className="token-config">
            <label>API Key
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

      <section className="catalog-pane" aria-label="Workspace overview">
        <header className="topbar">
          <div>
            <p className="kicker">{branding.registryTagline}</p>
            <h1>{branding.appName}</h1>
          </div>
          {(activeTab === "catalog" || activeTab === "overview") && <label className="searchbox"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={branding.searchPlaceholder} /></label>}
        </header>

        {activeTab === "overview" && (
          <section className="overview-stack" aria-label="Start here">
            <div className="decision-panel">
              <p className="kicker">Start here</p>
              <h2>{branding.overviewHeading}</h2>
              <p>{branding.overviewDescription}</p>
              <div className="actions">
                <button onClick={() => setActiveTab("catalog")}><Search size={17} />Browse catalog</button>
                <button className="secondary" onClick={() => setActiveTab("publish")}><UploadCloud size={17} />Publish draft</button>
              </div>
            </div>
            <section className="mcp-connect-panel" aria-label="Connect your agent via MCP">
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
                      {copiedMcpTarget === target.id ? <ClipboardCheck size={16} /> : <Copy size={16} />}
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
              <FeaturedSkill skill={selected} onOpen={() => setActiveTab("catalog")} />
            ) : (
              <article className="featured-skill empty-catalog">
                <div>
                  <p className="kicker">No skills yet</p>
                  <h2>{branding.emptyCatalogTitle}</h2>
                  <p>{branding.emptyCatalogDescription}</p>
                </div>
                <button onClick={() => setActiveTab("publish")}>Publish first skill</button>
              </article>
            )}
          </section>
        )}

        {activeTab === "catalog" && (
          <SkillList
            catalog={catalog}
            selectedId={selected?.pkg.id}
            onSelect={setSelectedId}
            emptyMessage={catalog.length === 0 ? branding.emptyCatalogListMessage : undefined}
          />
        )}

        {activeTab === "publish" && (
          <div className="publish-console-container" style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%", maxWidth: "800px" }}>
            <section className="publish-console" aria-label="Publish local draft">
              <div className="panel-title"><UploadCloud size={17} />Publish local folder</div>
              <p style={{ margin: "-8px 0 16px", color: "var(--muted)", fontSize: "0.92rem" }}>
                {branding.uploadDescription}
              </p>
              <div className="form-grid">
                <label>Workspace<input value={workspaceId} readOnly /></label>
                <label>Slug<input value={publishForm.packageSlug} placeholder={PUBLISH_FIELD_PLACEHOLDERS.packageSlug} onChange={(event) => setPublishForm({ ...publishForm, packageSlug: event.target.value })} /></label>
                <label>Version<input value={publishForm.version} placeholder={PUBLISH_FIELD_PLACEHOLDERS.version} onChange={(event) => setPublishForm({ ...publishForm, version: event.target.value })} /></label>
              </div>
              <label 
                className={`drop-target ${dragOver ? "drag-over" : ""} ${uploadEntries.length > 0 ? "has-files" : "empty"}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{ marginTop: "16px", minHeight: "120px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}
              >
                {uploadEntries.length > 0 ? (
                  <>
                    <CheckCircle2 size={24} style={{ color: "var(--accent)" }} />
                    <div style={{ margin: "4px 0" }}>
                      <strong>{uploadEntries.length} files staged</strong>
                      <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>Folder: <code>{publishForm.packageSlug || PUBLISH_FIELD_PLACEHOLDERS.packageSlug}</code></p>
                    </div>
                    <span className="button secondary choose-btn" style={{ pointerEvents: "none", height: "34px" }}>Choose different folder</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={24} />
                    <div style={{ margin: "4px 0" }}>
                      <strong>Drag & drop a skill folder here</strong>
                      <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>or click to browse your folders</p>
                    </div>
                    <span className="button secondary choose-btn" style={{ pointerEvents: "none", height: "34px" }}>Choose Folder</span>
                  </>
                )}
                <input type="file" {...{ webkitdirectory: "", directory: "" }} multiple onChange={handleFileSelection} style={{ display: "none" }} />
              </label>
              <div className="actions" style={{ marginTop: "16px" }}>
                <button
                  className="secondary"
                  onClick={() => void handlePreflightValidate()}
                  disabled={loading || uploadEntries.length === 0}
                >
                  <ClipboardCheck size={17} />
                  Validate
                </button>
                <button 
                  onClick={handleUpload} 
                  disabled={loading || uploadEntries.length === 0}
                  className={uploadEntries.length > 0 ? "primary" : undefined}
                >
                  <UploadCloud size={17} />
                  Upload skill
                </button>
              </div>
              {preflightValidation ? (
                <div className="panel" style={{ marginTop: "16px" }}>
                  <div className="panel-title"><ClipboardCheck size={17} />Preflight validation</div>
                  <ValidationPanel validation={preflightValidation} />
                </div>
              ) : null}
            </section>

            <section className="publish-console" aria-label="Import from Git">
              <div className="panel-title"><GitBranch size={17} />Import from Git</div>
              <p style={{ margin: "-8px 0 16px", color: "var(--muted)", fontSize: "0.92rem" }}>
                Import a skill package version directly from a remote Git repository.
              </p>
              <div className="form-grid git-fields">
                <label>Repository<input value={gitFields.repositoryPath} placeholder={PUBLISH_FIELD_PLACEHOLDERS.repositoryPath} onChange={(event) => setGitFields({ ...gitFields, repositoryPath: event.target.value })} /></label>
                <label>Ref<input value={gitFields.ref} placeholder={PUBLISH_FIELD_PLACEHOLDERS.ref} onChange={(event) => setGitFields({ ...gitFields, ref: event.target.value })} /></label>
                <label>Subdir<input value={gitFields.subdirectory} placeholder={PUBLISH_FIELD_PLACEHOLDERS.subdirectory} onChange={(event) => setGitFields({ ...gitFields, subdirectory: event.target.value })} /></label>
              </div>
              <div className="git-import" style={{ marginTop: "16px" }}>
                <GitBranch size={18} />
                <code>{buildGitImportCurl(workspaceId, publishForm.packageSlug || PUBLISH_FIELD_PLACEHOLDERS.packageSlug)}</code>
                <button onClick={handleGitImport} disabled={loading}>Import</button>
              </div>
            </section>
            
            <p className="notice" role="status" style={{ margin: "0 8px" }}>{notice}</p>
          </div>
        )}

        {activeTab === "reports" && <ReportPanel catalog={catalog} summary={reportSummary} />}

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

      {activeTab === "catalog" && selected && (
        <section className="detail-pane" aria-label="Skill detail">
          <div className="detail-head">
            <div>
              <p className="kicker">Selected package</p>
              <h2>{selected.pkg.name}</h2>
              <p>{selected.pkg.description}</p>
            </div>
            <LifecycleBadge state={selected.activeVersion?.lifecycleState ?? "draft"} />
          </div>

          <div className="install-section">
            <div className="panel-title"><TerminalSquare size={17} />How to use</div>
            {selected.latestApproved ? (
              <div className="install-actions-stack">
                <code>{buildInstallPrompt(selected.pkg.slug, workspaceId, resolvedRegistryUrl)}</code>
                <div className="actions">
                  <button onClick={() => void copyInstallPrompt()}><TerminalSquare size={17} />Copy command</button>
                  <a className="button secondary" href={artifactDownloadUrl(registryUrl, selected)}>
                    <Download size={17} />Download ZIP
                  </a>
                </div>
              </div>
            ) : (
              <p className="install-warning">No approved version is available for installation.</p>
            )}
          </div>

          <div className="panel">
            <div className="panel-title"><BarChart3 size={17} />Usage</div>
            <SkillStatsMeta
              version={selected.latestApproved?.version ?? selected.activeVersion?.version}
              downloads={selected.downloads}
              downloadHistory={selected.downloadHistory}
              updatedAt={selected.pkg.updatedAt}
              lastModifiedAt={selected.lastModifiedAt}
            />
          </div>

          <div className="split">
            <div className="panel">
              <div className="panel-title"><FileCode2 size={17} />Contents</div>
              <ul className="file-tree">
                {selected.files.slice(0, 5).map((file) => (
                  <li key={file}>{file}</li>
                ))}
                {filesExpanded && selected.files.slice(5).map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
              {selected.files.length > 5 && (
                <button
                  type="button"
                  className="toggle-files-button"
                  onClick={() => setFilesExpanded(!filesExpanded)}
                  aria-label={filesExpanded ? "Show less files" : "Show more files"}
                >
                  <span>{filesExpanded ? "Show less" : `Show ${selected.files.length - 5} more files`}</span>
                  <ChevronDown
                    size={15}
                    style={{
                      transform: filesExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease"
                    }}
                  />
                </button>
              )}
            </div>

            <div className="panel">
              <div className="panel-title"><CheckCircle2 size={17} />Validation</div>
              <ValidationPanel validation={selected.activeVersion?.validation} />
              <div className="version-line"><span>Active version</span><strong>{selected.activeVersion?.version ?? "No version selected"}</strong></div>
              {selected.latestApproved && selected.activeVersion?.id !== selected.latestApproved.id ? (
                <div className="version-line"><span>Approved install</span><strong>{selected.latestApproved.version}</strong></div>
              ) : null}
            </div>
          </div>

          {canManageLifecycle && (
            <div className="lifecycle-panel">
              <div className="panel-title"><RefreshCw size={17} />Lifecycle controls</div>
              <p className="lifecycle-copy">Editors and Admins review drafts here. Approval makes a skill installable from the catalog.</p>
              <div className="actions">
                <button onClick={() => void handleLifecycle("approved")} disabled={loading}><CheckCircle2 size={17} />Approve</button>
                <button className="secondary" onClick={() => void handleLifecycle("hidden")} disabled={loading}><ShieldCheck size={17} />Hide</button>
                <button className="secondary" onClick={() => void handleLifecycle("deprecated")} disabled={loading}><Archive size={17} />Deprecate</button>
              </div>
            </div>
          )}

          <div className="activity-strip"><GitBranch size={18} /><span>Download counts and sparklines reflect the last {DOWNLOAD_HISTORY_DAYS} days of artifact downloads.</span></div>
        </section>
      )}
    </main>
  );
}

export function renderCatalogTitle(packages: SkillPackage[], appName = DEFAULT_REGISTRY_BRANDING.appName) {
  return `${appName} (${packages.length})`;
}

export function renderLifecycleBadge(version: SkillVersion) {
  return version.lifecycleState.toUpperCase();
}

export function buildInstallPrompt(
  packageSlug: string,
  workspaceId: string,
  registryUrl: string,
  target: "codex-global" | "project" = "codex-global"
) {
  return `skill-library install ${packageSlug} --workspace ${workspaceId} --target ${target} --registry ${registryUrl}`;
}

export const PUBLISH_FIELD_PLACEHOLDERS = {
  packageSlug: "my-skill",
  version: "1.0.0",
  repositoryPath: "https://github.com/org/skills.git",
  ref: "main",
  subdirectory: "my-skill"
} as const;

export function emptyPublishForm(): UploadVersionInput {
  return {
    packageSlug: "",
    packageName: "",
    description: "",
    version: "",
    entries: []
  };
}

export function emptyGitFields() {
  return {
    repositoryPath: "",
    ref: "",
    subdirectory: ""
  };
}

export function resolvePublishInput(form: Pick<UploadVersionInput, "packageSlug" | "packageName" | "description" | "version">) {
  const packageSlug = form.packageSlug.trim();

  if (!packageSlug) {
    throw new Error("Skill slug is required.");
  }

  const version = form.version.trim();

  if (!version) {
    throw new Error("Version is required.");
  }

  return {
    packageSlug,
    packageName: form.packageName.trim() || titleize(packageSlug),
    description: form.description.trim() || `Internal ${packageSlug} skill package.`,
    version
  };
}

export function buildUploadRequest(packageSlug: string, version: string) {
  return {
    packageSlug,
    packageName: titleize(packageSlug),
    description: `Internal ${packageSlug} skill package.`,
    version,
    entries: [] as UploadVersionInput["entries"]
  };
}

export function pickActiveVersion(latestApproved: SkillVersion | undefined, versions: SkillVersion[]): SkillVersion | undefined {
  if (versions.length === 0) {
    return latestApproved;
  }

  const sorted = [...versions].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const newest = sorted[0];

  if (!newest) {
    return latestApproved;
  }

  if (!latestApproved) {
    return newest;
  }

  if (newest.id !== latestApproved.id) {
    return newest;
  }

  return latestApproved;
}

export async function loadCatalogSkills(api: WebApiClient, workspaceId: string, query?: string): Promise<CatalogSkill[]> {
  const [packages, reports, catalogStats] = await Promise.all([
    api.search(workspaceId, query),
    api.workspaceReports(workspaceId).catch(() => []),
    api.workspaceCatalogStats(workspaceId).catch(() => [])
  ]);
  const reportsByPackage = new Map(reports.map((report) => [report.packageId, report]));
  const statsByPackage = new Map(catalogStats.map((stats) => [stats.packageId, stats]));

  return Promise.all(
    packages.map(async (pkg) => {
      const latestApproved = await api.latestApprovedVersion(pkg.id).catch(() => undefined);
      const versions = await api.packageVersions(pkg.id).catch(() => []);
      const activeVersion = pickActiveVersion(latestApproved, versions);
      const report = reportsByPackage.get(pkg.id);
      const stats = statsByPackage.get(pkg.id);
      const validation = activeVersion?.validation;

      return {
        pkg,
        latestApproved,
        activeVersion,
        validation,
        files: validation?.files.map((file) => file.path) ?? [],
        installs: report?.installs.total ?? 0,
        downloads: stats?.downloads ?? report?.downloads ?? 0,
        downloadHistory: stats?.downloadHistory ?? report?.downloadHistory ?? emptyDownloadHistory(),
        lastModifiedAt: stats?.lastModifiedAt ?? report?.lastModifiedAt ?? resolveLastModifiedAt(versions),
        staleInstalls: (report?.installs.byState.stale ?? 0) + (report?.installs.byState["modified-local-content"] ?? 0),
        report
      };
    })
  );
}

export function createWebApiClient({ registryUrl = "", token, request = fetch }: { registryUrl?: string; token?: string; request?: typeof fetch } = {}): WebApiClient {
  const baseUrl = registryUrl.replace(/\/$/, "");

  return {
    async search(workspaceId, query) {
      const url = new URL(`${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/packages`, window.location.origin);

      if (query) {
        url.searchParams.set("q", query);
      }

      return (await jsonRequest<{ packages: SkillPackage[] }>(request, url, authHeaders(token))).packages;
    },
    async latestApprovedVersion(packageId) {
      return (await jsonRequest<{ version: SkillVersion }>(request, `${baseUrl}/api/packages/${encodeURIComponent(packageId)}/latest-approved`, authHeaders(token))).version;
    },
    async packageVersions(packageId) {
      return (await jsonRequest<{ versions: SkillVersion[] }>(request, `${baseUrl}/api/packages/${encodeURIComponent(packageId)}/versions`, authHeaders(token))).versions;
    },
    async workspaceCatalogStats(workspaceId) {
      return (await jsonRequest<{ stats: CatalogPackageStats[] }>(request, `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/catalog-stats`, authHeaders(token))).stats;
    },
    async workspaceReports(workspaceId) {
      return (await jsonRequest<{ reports: PackageReport[] }>(request, `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/reports`, authHeaders(token))).reports;
    },
    async uploadVersion(workspaceId, input) {
      return (await jsonRequest<{ version: SkillVersion }>(request, `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/packages/upload`, jsonInit(input, token))).version;
    },
    async importGitVersion(workspaceId, input) {
      return (await jsonRequest<{ version: SkillVersion }>(request, `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/packages/import-git`, jsonInit(input, token))).version;
    },
    async validatePackageTree(entries) {
      return (await jsonRequest<{ validation: ValidationResult }>(request, `${baseUrl}/api/validation/package-tree`, jsonInit({ entries }, token))).validation;
    },
    async transitionVersion(versionId, toState) {
      return (await jsonRequest<{ version: SkillVersion }>(request, `${baseUrl}/api/versions/${encodeURIComponent(versionId)}/lifecycle`, jsonInit({ toState }, token))).version;
    }
  };
}

export async function filesToPackageEntries(files: File[]): Promise<UploadVersionInput["entries"]> {
  return Promise.all(
    files.map(async (file) => {
      const browserFile = file as File & { webkitRelativePath?: string };
      const path = browserFile.webkitRelativePath || file.name;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = decodeUtf8Text(bytes);

      // Text files keep the original {path, content} shape; binary assets (images,
      // .pptx, fonts, ...) are base64-encoded so they round-trip byte-for-byte.
      return text === null ? { path, content: base64FromBytes(bytes), encoding: "base64" as const } : { path, content: text };
    })
  );
}

/** Decode bytes as UTF-8 text, or return null when the file is binary. */
function decodeUtf8Text(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) {
    return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function summarizeReports(reports: PackageReport[]) {
  return reports.reduce(
    (summary, report) => ({
      packages: summary.packages + 1,
      installs: summary.installs + report.installs.total,
      currentInstalls: summary.currentInstalls + report.installs.byState.current,
      staleInstalls: summary.staleInstalls + report.installs.byState.stale + report.installs.byState["modified-local-content"]
    }),
    { packages: 0, installs: 0, currentInstalls: 0, staleInstalls: 0 }
  );
}

function artifactDownloadUrl(registryUrl: string, skill: CatalogSkill) {
  const version = skill.latestApproved;

  if (!version) {
    return "#";
  }

  const baseUrl = registryUrl.replace(/\/$/, "");
  const url = new URL(`${baseUrl}/api/artifacts/${encodeURIComponent(version.artifactDigest)}/download`, window.location.origin);
  url.searchParams.set("packageId", skill.pkg.id);
  url.searchParams.set("versionId", version.id);
  return url.toString();
}

function buildGitImportCurl(workspaceId: string, packageSlug: string) {
  return `POST /api/workspaces/${workspaceId}/packages/import-git  ${packageSlug}@main`;
}

function NavButton({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button className={active ? "active" : undefined} aria-label={label} aria-current={active ? "page" : undefined} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function FeaturedSkill({ skill, onOpen }: { skill: CatalogSkill; onOpen: () => void }) {
  return (
    <article className="featured-skill">
      <div>
        <p className="kicker">Featured approved skill</p>
        <h2>{skill.pkg.name}</h2>
        <p>{skill.pkg.description}</p>
        <SkillStatsMeta
          compact
          version={skill.latestApproved?.version ?? skill.activeVersion?.version}
          downloads={skill.downloads}
          downloadHistory={skill.downloadHistory}
          updatedAt={skill.pkg.updatedAt}
          lastModifiedAt={skill.lastModifiedAt}
        />
      </div>
      <button onClick={onOpen}>Open catalog</button>
    </article>
  );
}

function SkillList({
  catalog,
  selectedId,
  onSelect,
  emptyMessage
}: {
  catalog: CatalogSkill[];
  selectedId?: string;
  onSelect: (id: string) => void;
  emptyMessage?: string;
}) {
  if (catalog.length === 0) {
    return <p className="empty-catalog-copy">{emptyMessage ?? "No skills in the catalog yet."}</p>;
  }

  return (
    <div className="list">
      {catalog.map((skill) => <SkillRow key={skill.pkg.id} skill={skill} active={skill.pkg.id === selectedId} onSelect={() => onSelect(skill.pkg.id)} />)}
    </div>
  );
}

function ReportPanel({ catalog, summary }: { catalog: CatalogSkill[]; summary: ReturnType<typeof summarizeReports> }) {
  return (
    <section className="report-panel">
      <div className="panel-title"><BarChart3 size={17} />Adoption report</div>
      <div className="report-grid">
        <Metric label="Packages" value={summary.packages} />
        <Metric label="Current" value={summary.currentInstalls} />
        <Metric label="Needs update" value={summary.staleInstalls} tone="warn" />
      </div>
      <div className="report-table" role="table" aria-label="Package reports">
        {catalog.map((skill) => (
          <div className="report-row" role="row" key={skill.pkg.id}>
            <span>{skill.pkg.name}</span>
            <strong>{skill.installs} installs</strong>
            <em>{skill.staleInstalls} stale</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function LoginScreen({
  branding,
  onSignIn,
  signingIn = false,
  checkingSession = false
}: {
  branding: RegistryBrandingConfig;
  onSignIn: () => void;
  signingIn?: boolean;
  checkingSession?: boolean;
}) {
  const busy = signingIn || checkingSession;
  const statusCopy = checkingSession
    ? "Checking your sign-in…"
    : "Redirecting to Microsoft…";

  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="mark" style={{ margin: "0 auto 20px" }}>{branding.appShortName}</div>
        <h1 style={{ fontSize: "2.2rem", textAlign: "center", marginBottom: "8px" }}>{branding.appName}</h1>
        <p style={{ textAlign: "center", maxWidth: "360px", margin: "0 auto 8px", color: "var(--muted)", fontSize: "0.92rem" }}>
          {branding.registryTagline}
        </p>
        <p style={{ textAlign: "center", maxWidth: "360px", margin: "0 auto 32px" }}>
          {branding.loginSubtitle}
        </p>
        {busy ? (
          <div className="login-loading" role="status" aria-live="polite">
            <Loader2 size={28} className="login-spinner" aria-hidden="true" />
            <p>{statusCopy}</p>
          </div>
        ) : (
          <button className="login-btn" onClick={onSignIn}>
            <Shield size={18} />
            Sign in with Microsoft
          </button>
        )}
      </div>
    </main>
  );
}

function TeamPanel({
  members,
  loading,
  currentUser,
  canManageRoles,
  onRoleChange,
  onDeleteUser,
  onRefresh,
  notice
}: {
  members: AdminUser[];
  loading: boolean;
  currentUser: SessionUser;
  canManageRoles: boolean;
  onRoleChange: (userId: string, role: string) => void;
  onDeleteUser: (userId: string, name: string) => void;
  onRefresh: () => void;
  notice: string;
}) {
  const selfRecord = members.find((user) => user.id === currentUser.id);
  const teammates = members.filter((user) => user.id !== currentUser.id);

  return (
    <section className="admin-panel" aria-label="Team roster">
      <div className="admin-header">
        <div>
          <div className="panel-title"><Users size={17} />Team</div>
          <p style={{ margin: "0", color: "var(--muted)", fontSize: "0.88rem" }}>
            {teammates.length === 0
              ? "Only you have signed in so far"
              : `You and ${teammates.length} other ${teammates.length === 1 ? "teammate" : "teammates"}`}
          </p>
        </div>
        <button onClick={onRefresh} disabled={loading} className="secondary">
          <RefreshCw size={15} className={loading ? "spin" : ""} />
          Refresh
        </button>
      </div>

      <section className="admin-section" aria-label="Your account">
        <h3 className="admin-section-title">Your account</h3>
        <article className="admin-self-card">
          <div className="admin-user-cell">
            <div className="admin-user-avatar">
              {currentUser.image ? <img src={currentUser.image} alt="" /> : <User size={16} />}
            </div>
            <div>
              <strong>{currentUser.name}</strong>
              <span className="admin-user-email">{currentUser.email}</span>
            </div>
          </div>
          <div className="admin-self-meta">
            <span className={`session-role role-${currentUser.role}`}>{formatRoleLabel(currentUser.role)}</span>
            {selfRecord ? (
              <>
                <span className="admin-self-joined">
                  Joined {new Date(selfRecord.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                <span className="admin-self-submissions">{selfRecord.skillsSubmitted} skill{selfRecord.skillsSubmitted === 1 ? "" : "s"} submitted</span>
              </>
            ) : null}
          </div>
        </article>
      </section>

      <section className="admin-section" aria-label="Roles">
        <h3 className="admin-section-title">Roles</h3>
        <div className="admin-role-legend">
          {(Object.keys(WORKSPACE_ROLE_LABELS) as WorkspaceRole[]).map((role) => (
            <div className="admin-role-legend-item" key={role}>
              <span className={`session-role role-${role}`}>{WORKSPACE_ROLE_LABELS[role]}</span>
              <p>{WORKSPACE_ROLE_DESCRIPTIONS[role]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-section" aria-label="Team members">
        <h3 className="admin-section-title">Team members</h3>

        {loading && members.length === 0 ? (
          <div className="admin-empty">
            <Loader2 size={20} className="spin" aria-hidden="true" />
            <span>Loading teammates…</span>
          </div>
        ) : members.length === 0 ? (
          <div className="admin-empty">No teammates have signed in yet.</div>
        ) : (
          <div className={`admin-table ${canManageRoles ? "admin-table--manageable" : "admin-table--readonly"}`} role="table" aria-label="Team members">
            <div className="admin-table-head" role="row">
              <span>User</span>
              <span>Role</span>
              <span>Skills submitted</span>
              <span>Joined</span>
              {canManageRoles ? <span></span> : null}
            </div>
            {members.map((user) => (
              <TeamMemberRow
                key={user.id}
                user={user}
                isSelf={user.id === currentUser.id}
                canManageRoles={canManageRoles}
                onRoleChange={onRoleChange}
                onDeleteUser={onDeleteUser}
              />
            ))}
          </div>
        )}
      </section>

      {notice && <p className="notice" role="status" style={{ margin: "16px 0 0" }}>{notice}</p>}
    </section>
  );
}

function TeamMemberRow({
  user,
  isSelf,
  canManageRoles,
  onRoleChange,
  onDeleteUser
}: {
  user: AdminUser;
  isSelf: boolean;
  canManageRoles: boolean;
  onRoleChange: (userId: string, role: string) => void;
  onDeleteUser: (userId: string, name: string) => void;
}) {
  return (
    <div className="admin-table-row" role="row">
      <div className="admin-user-cell">
        <div className="admin-user-avatar">
          {user.image ? <img src={user.image} alt="" /> : <User size={14} />}
        </div>
        <div>
          <strong>{user.name}{isSelf ? " (you)" : ""}</strong>
          <span className="admin-user-email">{user.email}</span>
        </div>
      </div>
      <div className="admin-role-cell">
        {canManageRoles && !isSelf ? (
          <div className="role-select-wrapper">
            <select
              value={user.role}
              onChange={(event) => void onRoleChange(user.id, event.target.value)}
              className={`role-select role-${user.role}`}
            >
              <option value="user">{WORKSPACE_ROLE_LABELS.user}</option>
              <option value="maintainer">{WORKSPACE_ROLE_LABELS.maintainer}</option>
              <option value="admin">{WORKSPACE_ROLE_LABELS.admin}</option>
            </select>
            <ChevronDown size={12} className="role-select-chevron" />
          </div>
        ) : (
          <span className={`session-role role-${user.role}`}>{formatRoleLabel(user.role)}</span>
        )}
      </div>
      <span className="admin-submissions-cell">{user.skillsSubmitted}</span>
      <span className="admin-date-cell">
        {new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </span>
      {canManageRoles ? (
        <div className="admin-actions-cell">
          {!isSelf ? (
            <button
              className="admin-delete-btn"
              onClick={() => void onDeleteUser(user.id, user.name)}
              title={`Remove ${user.name}`}
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SkillRow({ skill, active, onSelect }: { skill: CatalogSkill; active: boolean; onSelect: () => void }) {
  return (
    <article className={active ? "skill-row active" : "skill-row"} onClick={onSelect}>
      <div className="skill-row-main">
        <div className="skill-row-copy">
          <h2>{skill.pkg.name}</h2>
          <p>{skill.pkg.description}</p>
          <div className="tags">{skill.pkg.categories.map((category) => <span key={category}>{category}</span>)}</div>
        </div>
        <SkillStatsMeta
          compact
          version={skill.latestApproved?.version ?? skill.activeVersion?.version}
          downloads={skill.downloads}
          downloadHistory={skill.downloadHistory}
          updatedAt={skill.pkg.updatedAt}
          lastModifiedAt={skill.lastModifiedAt}
        />
      </div>
      <LifecycleBadge state={skill.activeVersion?.lifecycleState ?? skill.latestApproved?.lifecycleState ?? "draft"} />
    </article>
  );
}

async function jsonRequest<T>(request: typeof fetch, input: string | URL, init?: RequestInit | HeadersInit): Promise<T> {
  const requestInit = toRequestInit(init);
  const response = await request(input, {
    ...requestInit,
    credentials: "include"
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Registry request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function authHeaders(token: string | undefined): HeadersInit {
  return token ? { authorization: `Bearer ${token}` } : {};
}

function toRequestInit(init: RequestInit | HeadersInit | undefined): RequestInit | undefined {
  if (!init) {
    return undefined;
  }

  if (init instanceof Headers || Array.isArray(init) || !("headers" in init || "method" in init || "body" in init)) {
    return { headers: init as HeadersInit };
  }

  return init as RequestInit;
}

function jsonInit(body: unknown, token: string | undefined): RequestInit {
  return {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...authHeaders(token)
    },
    body: JSON.stringify(body)
  };
}

export function formatRoleLabel(role: string): string {
  if (role === "user" || role === "maintainer" || role === "admin") {
    return WORKSPACE_ROLE_LABELS[role];
  }

  return role;
}

function browserToken(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const token = window.localStorage.getItem("skill-library-token");
  if (token) {
    return token;
  }

  return undefined;
}

function LifecycleBadge({ state }: { state: LifecycleState }) {
  return <span className={`badge ${state}`}>{state}</span>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return <div className={tone === "warn" ? "metric warn" : "metric"}><span>{label}</span><strong>{value}</strong></div>;
}

function titleize(slug: string) {
  return slug
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function packageData(id: string, slug: string, name: string, description: string, categories: string[]): SkillPackage {
  return { id, workspaceId: "workspace-1", slug, name, description, categories, createdAt: "2026-06-07T10:00:00.000Z", updatedAt: "2026-06-07T12:00:00.000Z" };
}

function version(id: string, packageId: string, semver: string, lifecycleState: LifecycleState): SkillVersion {
  return {
    id,
    packageId,
    version: semver,
    lifecycleState,
    artifactDigest: `sha256:${id}`,
    validation: { ok: true, files: [], issues: [] },
    provenance: { kind: "upload", importedAt: "2026-06-07T12:00:00.000Z" },
    createdAt: "2026-06-07T12:00:00.000Z",
    approvedAt: lifecycleState === "approved" ? "2026-06-07T12:05:00.000Z" : undefined
  };
}

function emptyDownloadHistory(): DownloadHistoryPoint[] {
  return Array.from({ length: DOWNLOAD_HISTORY_DAYS }, (_, index) => {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - (DOWNLOAD_HISTORY_DAYS - 1 - index));

    return {
      date: day.toISOString().slice(0, 10),
      count: 0
    };
  });
}

function demoDownloadHistory(counts: number[]): DownloadHistoryPoint[] {
  const history = emptyDownloadHistory();

  return history.map((point, index) => ({
    ...point,
    count: counts[index] ?? 0
  }));
}

function resolveLastModifiedAt(versions: SkillVersion[]): string {
  const sorted = [...versions].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  return sorted[0]?.createdAt ?? new Date(0).toISOString();
}

function packageReport(packageId: string, versionCount: number, installs: number, downloads: number, current: number, stale: number): PackageReport {
  return {
    packageId,
    workspaceId: "workspace-1",
    versionCount,
    latestApprovedVersionId: `version-${packageId}`,
    views: downloads * 2,
    downloads,
    downloadHistory: demoDownloadHistory([1, 2, 3, 2, 4, 3, 5, 4, 6, 5, 4, 3, 5, 4]),
    lastModifiedAt: "2026-06-07T12:00:00.000Z",
    installs: {
      total: installs,
      byState: {
        current,
        stale,
        deprecated: 0,
        hidden: 0,
        "unknown-registry": 0,
        "missing-metadata": 0,
        "modified-local-content": 0
      }
    }
  };
}
