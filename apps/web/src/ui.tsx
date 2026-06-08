import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { Archive, BarChart3, CheckCircle2, ChevronDown, Download, FileCode2, GitBranch, LogOut, RefreshCw, Search, Shield, ShieldCheck, TerminalSquare, UploadCloud, User, Users } from "lucide-react";
import type { LifecycleState, PackageReport, SkillPackage, SkillVersion, ValidationResult } from "@skill-library/domain";

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
}

export interface CatalogSkill {
  pkg: SkillPackage;
  latestApproved?: SkillVersion;
  activeVersion?: SkillVersion;
  validation?: ValidationResult;
  files: string[];
  installs: number;
  downloads: number;
  staleInstalls: number;
  report?: PackageReport;
}

export interface WebApiClient {
  search(workspaceId: string, query?: string): Promise<SkillPackage[]>;
  latestApprovedVersion(packageId: string): Promise<SkillVersion | undefined>;
  packageVersions(packageId: string): Promise<SkillVersion[]>;
  workspaceReports(workspaceId: string): Promise<PackageReport[]>;
  uploadVersion(workspaceId: string, input: UploadVersionInput): Promise<SkillVersion>;
  importGitVersion(workspaceId: string, input: GitImportInput): Promise<SkillVersion>;
  transitionVersion(versionId: string, toState: LifecycleState): Promise<SkillVersion>;
}

export interface UploadVersionInput {
  packageSlug: string;
  packageName: string;
  description: string;
  categories?: string[];
  version: string;
  entries: { path: string; content: string }[];
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
}

type AppTab = "overview" | "catalog" | "publish" | "reports" | "admin";

const sampleSkills: CatalogSkill[] = [
  {
    pkg: packageData("workspace-1-review-helper", "review-helper", "Review Helper", "Turns repository diffs into a focused code-review checklist for internal agents.", ["review", "quality"]),
    latestApproved: version("version-review-2", "workspace-1-review-helper", "1.2.0", "approved"),
    validation: { ok: true, files: [], issues: [] },
    files: ["SKILL.md", "scripts/review.ts", "references/checklist.md"],
    installs: 43,
    downloads: 118,
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
    staleInstalls: 3,
    report: packageReport("workspace-1-git-importer", 1, 8, 21, 5, 3)
  }
];

export function SkillLibraryApp({ skills, workspaceId = "workspace-1", registryUrl = "", authToken = browserToken(), api }: SkillLibraryAppProps) {
  const [catalog, setCatalog] = useState<CatalogSkill[]>(skills ?? sampleSkills);
  const [selectedId, setSelectedId] = useState<string | undefined>(catalog[0]?.pkg.id);
  const [query, setQuery] = useState("");
  const [publishForm, setPublishForm] = useState(() => buildUploadRequest(catalog[0]?.pkg.slug ?? "review-helper", "1.0.0"));
  const [gitFields, setGitFields] = useState({
    repositoryPath: "/path/to/skills.git",
    ref: "main",
    subdirectory: catalog[0]?.pkg.slug ?? "review-helper"
  });
  const [uploadEntries, setUploadEntries] = useState<UploadVersionInput["entries"]>([]);
  const [notice, setNotice] = useState("Ready");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("overview");
  const [activeToken, setActiveToken] = useState(() => authToken);
  const [dragOver, setDragOver] = useState(false);
  const apiClient = useMemo(() => api ?? createWebApiClient({ registryUrl, token: activeToken }), [api, registryUrl, activeToken]);

  // Session state for Better Auth SSO
  const [session, setSession] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);

  useEffect(() => {
    void fetchSession();
  }, [registryUrl]);

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
    window.location.href = `${baseUrl}/api/auth/sign-in/social?provider=microsoft&callbackURL=${encodeURIComponent(window.location.href)}`;
  }

  async function loadAdminUsers() {
    setAdminLoading(true);
    try {
      const baseUrl = registryUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/admin/users`, { credentials: "include" });
      if (response.ok) {
        const data = (await response.json()) as { users: AdminUser[] };
        setAdminUsers(data.users);
      }
    } catch { /* ignore */ } finally {
      setAdminLoading(false);
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
        setNotice(`User role updated to ${newRole}`);
        await loadAdminUsers();
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
        await loadAdminUsers();
      } else {
        setNotice("Failed to remove user");
      }
    } catch {
      setNotice("Failed to remove user");
    }
  }

  // Load admin users when switching to admin tab
  useEffect(() => {
    if (activeTab === "admin" && session?.role === "admin") {
      void loadAdminUsers();
    }
  }, [activeTab]);

  useEffect(() => {
    if (skills) {
      setCatalog(skills);
      setSelectedId(skills[0]?.pkg.id);
      return;
    }

    void loadCatalog();
  }, [skills, workspaceId, query, apiClient]);

  const selected = catalog.find((skill) => skill.pkg.id === selectedId) ?? catalog[0];
  const totals = catalog.reduce(
    (acc, skill) => ({ installs: acc.installs + skill.installs, downloads: acc.downloads + skill.downloads, stale: acc.stale + skill.staleInstalls }),
    { installs: 0, downloads: 0, stale: 0 }
  );
  const reportSummary = summarizeReports(catalog.map((skill) => skill.report).filter((report): report is PackageReport => Boolean(report)));

  async function loadCatalog() {
    setLoading(true);

    try {
      const next = await loadCatalogSkills(apiClient, workspaceId, query);
      setCatalog(next.length > 0 ? next : sampleSkills);
      setSelectedId((current) => current && next.some((skill) => skill.pkg.id === current) ? current : next[0]?.pkg.id);
      setNotice(next.length > 0 ? "Catalog synced" : "Catalog is empty; showing sample data");
    } catch (error) {
      setCatalog(sampleSkills);
      setSelectedId(sampleSkills[0]?.pkg.id);
      setNotice(error instanceof Error ? `API unavailable: ${error.message}` : "API unavailable");
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
      const version = await apiClient.uploadVersion(workspaceId, { ...publishForm, entries: uploadEntries });
      setNotice(`Uploaded as draft: version ${version.version}. Maintainers must Approve it from the Catalog page to make it available for download/install.`);
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
      const version = await apiClient.importGitVersion(workspaceId, {
        packageSlug: publishForm.packageSlug,
        packageName: publishForm.packageName,
        description: publishForm.description,
        version: publishForm.version,
        repositoryPath: gitFields.repositoryPath,
        ref: gitFields.ref,
        subdirectory: gitFields.subdirectory
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
      setNotice("No files staged");
      return;
    }

    const hasSkillMd = files.some((file) => {
      const path = file.webkitRelativePath || file.name;
      return path === "SKILL.md" || path.endsWith("/SKILL.md");
    });

    if (!hasSkillMd) {
      setUploadEntries([]);
      setNotice("Validation error: The selected folder does not contain a SKILL.md file. Publishing requires a SKILL.md file.");
      return;
    }

    const entries = await filesToPackageEntries(files);
    setUploadEntries(entries);

    const firstRelativePath = files[0]?.webkitRelativePath;
    let slug = publishForm.packageSlug;
    if (firstRelativePath) {
      const parts = firstRelativePath.split("/");
      if (parts.length > 1 && parts[0]) {
        slug = parts[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      }
    }

    setPublishForm((prev) => ({
      ...prev,
      packageSlug: slug,
      packageName: titleize(slug)
    }));
    setGitFields((prev) => ({
      ...prev,
      subdirectory: slug
    }));

    setNotice(`${entries.length} files staged for upload from skill folder "${slug}". Ready to publish.`);
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
      setNotice("Validation error: The selected folder does not contain a SKILL.md file. Publishing requires a SKILL.md file.");
      return;
    }

    const entries = await filesToPackageEntries(files);
    setUploadEntries(entries);

    const firstRelativePath = files[0]?.webkitRelativePath;
    let slug = publishForm.packageSlug;
    if (firstRelativePath) {
      const parts = firstRelativePath.split("/");
      if (parts.length > 1 && parts[0]) {
        slug = parts[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      }
    }

    setPublishForm((prev) => ({
      ...prev,
      packageSlug: slug,
      packageName: titleize(slug)
    }));
    setGitFields((prev) => ({
      ...prev,
      subdirectory: slug
    }));

    setNotice(`${entries.length} files staged for upload from skill folder "${slug}". Ready to publish.`);
  }

  async function copyInstallPrompt() {
    if (!selected) {
      return;
    }

    await navigator.clipboard?.writeText(buildInstallPrompt(selected.pkg.slug)).catch(() => undefined);
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
  const isDev = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  if (!sessionLoading && !hasSession && !useTokenAuth && !isDev) {
    return <LoginScreen onSignIn={handleSignIn} />;
  }

  if (!selected) {
    return <main className="empty-shell">No skills available.</main>;
  }

  return (
    <main className={`shell ${activeTab === "catalog" ? "layout-catalog" : "layout-single"}`}>
      <aside className="rail" aria-label="Workspace">
        <div className="mark">SL</div>
        <NavButton icon={<Archive size={19} />} label="Overview" active={activeTab === "overview"} onClick={() => setActiveTab("overview")} />
        <NavButton icon={<Search size={19} />} label="Catalog" active={activeTab === "catalog"} onClick={() => setActiveTab("catalog")} />
        <NavButton icon={<UploadCloud size={19} />} label="Publish" active={activeTab === "publish"} onClick={() => setActiveTab("publish")} />
        <NavButton icon={<BarChart3 size={19} />} label="Reports" active={activeTab === "reports"} onClick={() => setActiveTab("reports")} />
        {isAdmin && <NavButton icon={<Users size={19} />} label="Admin" active={activeTab === "admin"} onClick={() => setActiveTab("admin")} />}

        <div className="rail-spacer" />

        {session ? (
          <div className="session-profile">
            <div className="session-avatar">
              {session.image ? <img src={session.image} alt="" /> : <User size={16} />}
            </div>
            <div className="session-info">
              <span className="session-name">{session.name}</span>
              <span className={`session-role role-${session.role}`}>{session.role}</span>
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
            <p className="kicker">Acme internal registry</p>
            <h1>Skill Library</h1>
          </div>
          {(activeTab === "catalog" || activeTab === "overview") && <label className="searchbox"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search approved skills" /></label>}
        </header>

        {activeTab === "overview" && (
          <section className="overview-stack" aria-label="Start here">
            <div className="decision-panel">
              <p className="kicker">Start here</p>
              <h2>Find an approved skill or publish a new draft.</h2>
              <p>Most teams only need these two paths: browse what is ready to install, or send a new skill through validation and approval.</p>
              <div className="actions">
                <button onClick={() => setActiveTab("catalog")}><Search size={17} />Browse catalog</button>
                <button className="secondary" onClick={() => setActiveTab("publish")}><UploadCloud size={17} />Publish draft</button>
              </div>
            </div>
            <div className="metrics compact" aria-label="Registry metrics">
              <Metric label="Approved skills" value={catalog.length} />
              <Metric label="Installs" value={totals.installs} />
              <Metric label="Need update" value={totals.stale} tone="warn" />
            </div>
            <FeaturedSkill skill={selected} onOpen={() => setActiveTab("catalog")} />
          </section>
        )}

        {activeTab === "catalog" && <SkillList catalog={catalog} selectedId={selected.pkg.id} onSelect={setSelectedId} />}

        {activeTab === "publish" && (
          <div className="publish-console-container" style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%", maxWidth: "800px" }}>
            <section className="publish-console" aria-label="Publish local draft">
              <div className="panel-title"><UploadCloud size={17} />Publish local folder</div>
              <p style={{ margin: "-8px 0 16px", color: "var(--muted)", fontSize: "0.92rem" }}>
                Upload a skill package folder from your machine. The folder must contain a SKILL.md file at its root.
              </p>
              <div className="form-grid">
                <label>Workspace<input value={workspaceId} readOnly /></label>
                <label>Slug<input value={publishForm.packageSlug} onChange={(event) => setPublishForm({ ...publishForm, packageSlug: event.target.value })} /></label>
                <label>Version<input value={publishForm.version} onChange={(event) => setPublishForm({ ...publishForm, version: event.target.value })} /></label>
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
                      <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>Folder: <code>{publishForm.packageSlug}</code></p>
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
                  onClick={handleUpload} 
                  disabled={loading || uploadEntries.length === 0}
                  className={uploadEntries.length > 0 ? "primary" : undefined}
                >
                  <UploadCloud size={17} />
                  Upload skill
                </button>
              </div>
            </section>

            <section className="publish-console" aria-label="Import from Git">
              <div className="panel-title"><GitBranch size={17} />Import from Git</div>
              <p style={{ margin: "-8px 0 16px", color: "var(--muted)", fontSize: "0.92rem" }}>
                Import a skill package version directly from a remote Git repository.
              </p>
              <div className="form-grid git-fields">
                <label>Repository<input value={gitFields.repositoryPath} onChange={(event) => setGitFields({ ...gitFields, repositoryPath: event.target.value })} /></label>
                <label>Ref<input value={gitFields.ref} onChange={(event) => setGitFields({ ...gitFields, ref: event.target.value })} /></label>
                <label>Subdir<input value={gitFields.subdirectory} onChange={(event) => setGitFields({ ...gitFields, subdirectory: event.target.value })} /></label>
              </div>
              <div className="git-import" style={{ marginTop: "16px" }}>
                <GitBranch size={18} />
                <code>{buildGitImportCurl(publishForm.packageSlug)}</code>
                <button onClick={handleGitImport} disabled={loading}>Import</button>
              </div>
            </section>
            
            <p className="notice" role="status" style={{ margin: "0 8px" }}>{notice}</p>
          </div>
        )}

        {activeTab === "reports" && <ReportPanel catalog={catalog} summary={reportSummary} />}

        {activeTab === "admin" && isAdmin && (
          <AdminPanel
            users={adminUsers}
            loading={adminLoading}
            currentUserId={session.id}
            onRoleChange={handleRoleChange}
            onDeleteUser={handleDeleteUser}
            onRefresh={loadAdminUsers}
            notice={notice}
          />
        )}
      </section>

      {activeTab === "catalog" && (
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
                <code>{buildInstallPrompt(selected.pkg.slug)}</code>
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

          <div className="split">
            <div className="panel">
              <div className="panel-title"><FileCode2 size={17} />Contents</div>
              <ul className="file-tree">{selected.files.map((file) => <li key={file}>{file}</li>)}</ul>
            </div>

            <div className="panel">
              <div className="panel-title"><CheckCircle2 size={17} />Validation</div>
              <p className="validation-copy">{selected.activeVersion?.validation?.ok ? "Package shape is valid. SKILL.md found and bundled files preserved." : "Validation needs attention."}</p>
              <div className="version-line"><span>Active version</span><strong>{selected.activeVersion?.version ?? "No version selected"}</strong></div>
              {selected.latestApproved && selected.activeVersion?.id !== selected.latestApproved.id ? (
                <div className="version-line"><span>Approved install</span><strong>{selected.latestApproved.version}</strong></div>
              ) : null}
            </div>
          </div>

          {canManageLifecycle && (
            <div className="lifecycle-panel">
              <div className="panel-title"><RefreshCw size={17} />Lifecycle controls</div>
              <div className="actions">
                <button onClick={() => void handleLifecycle("approved")} disabled={loading}><CheckCircle2 size={17} />Approve</button>
                <button className="secondary" onClick={() => void handleLifecycle("hidden")} disabled={loading}><ShieldCheck size={17} />Hide</button>
                <button className="secondary" onClick={() => void handleLifecycle("deprecated")} disabled={loading}><Archive size={17} />Deprecate</button>
              </div>
            </div>
          )}

          <div className="activity-strip"><GitBranch size={18} /><span>Git import provenance, lifecycle approval, and download counters are available through the registry API.</span></div>
        </section>
      )}
    </main>
  );
}

export function renderCatalogTitle(packages: SkillPackage[]) {
  return `Skill Library (${packages.length})`;
}

export function renderLifecycleBadge(version: SkillVersion) {
  return version.lifecycleState.toUpperCase();
}

export function buildInstallPrompt(packageSlug: string, target: "codex-global" | "project" = "codex-global") {
  return `skill-library install ${packageSlug} --workspace workspace-1 --target ${target} --registry https://skills.internal`;
}

export function buildUploadRequest(packageSlug: string, version: string) {
  return {
    packageSlug,
    packageName: titleize(packageSlug),
    description: `Internal ${packageSlug} skill package.`,
    version
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
  const [packages, reports] = await Promise.all([api.search(workspaceId, query), api.workspaceReports(workspaceId).catch(() => [])]);
  const reportsByPackage = new Map(reports.map((report) => [report.packageId, report]));

  return Promise.all(
    packages.map(async (pkg) => {
      const latestApproved = await api.latestApprovedVersion(pkg.id).catch(() => undefined);
      const versions = await api.packageVersions(pkg.id).catch(() => []);
      const activeVersion = pickActiveVersion(latestApproved, versions);
      const report = reportsByPackage.get(pkg.id);
      const validation = activeVersion?.validation;

      return {
        pkg,
        latestApproved,
        activeVersion,
        validation,
        files: validation?.files.map((file) => file.path) ?? [],
        installs: report?.installs.total ?? 0,
        downloads: report?.downloads ?? 0,
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
    async workspaceReports(workspaceId) {
      return (await jsonRequest<{ reports: PackageReport[] }>(request, `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/reports`, authHeaders(token))).reports;
    },
    async uploadVersion(workspaceId, input) {
      return (await jsonRequest<{ version: SkillVersion }>(request, `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/packages/upload`, jsonInit(input, token))).version;
    },
    async importGitVersion(workspaceId, input) {
      return (await jsonRequest<{ version: SkillVersion }>(request, `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/packages/import-git`, jsonInit(input, token))).version;
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

      return {
        path: browserFile.webkitRelativePath || file.name,
        content: await file.text()
      };
    })
  );
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

function buildGitImportCurl(packageSlug: string) {
  return `POST /api/workspaces/workspace-1/packages/import-git  ${packageSlug}@main`;
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
      </div>
      <button onClick={onOpen}>Open catalog</button>
    </article>
  );
}

function SkillList({ catalog, selectedId, onSelect }: { catalog: CatalogSkill[]; selectedId: string; onSelect: (id: string) => void }) {
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

function LoginScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="mark" style={{ margin: "0 auto 20px" }}>SL</div>
        <h1 style={{ fontSize: "2.2rem", textAlign: "center", marginBottom: "8px" }}>Skill Library</h1>
        <p style={{ textAlign: "center", maxWidth: "360px", margin: "0 auto 32px" }}>
          Sign in with your company account to browse, publish, and manage skills.
        </p>
        <button className="login-btn" onClick={onSignIn}>
          <Shield size={18} />
          Sign in with Microsoft
        </button>
      </div>
    </main>
  );
}

function AdminPanel({
  users,
  loading,
  currentUserId,
  onRoleChange,
  onDeleteUser,
  onRefresh,
  notice
}: {
  users: AdminUser[];
  loading: boolean;
  currentUserId: string;
  onRoleChange: (userId: string, role: string) => void;
  onDeleteUser: (userId: string, name: string) => void;
  onRefresh: () => void;
  notice: string;
}) {
  return (
    <section className="admin-panel" aria-label="User administration">
      <div className="admin-header">
        <div>
          <div className="panel-title"><Users size={17} />User Administration</div>
          <p style={{ margin: "0", color: "var(--muted)", fontSize: "0.88rem" }}>
            {users.length} registered {users.length === 1 ? "user" : "users"}
          </p>
        </div>
        <button onClick={onRefresh} disabled={loading} className="secondary">
          <RefreshCw size={15} className={loading ? "spin" : ""} />
          Refresh
        </button>
      </div>

      {loading && users.length === 0 ? (
        <div className="admin-empty">Loading users…</div>
      ) : users.length === 0 ? (
        <div className="admin-empty">No users have signed in yet.</div>
      ) : (
        <div className="admin-table" role="table" aria-label="Users">
          <div className="admin-table-head" role="row">
            <span>User</span>
            <span>Role</span>
            <span>Joined</span>
            <span></span>
          </div>
          {users.map((user) => (
            <div className="admin-table-row" role="row" key={user.id}>
              <div className="admin-user-cell">
                <div className="admin-user-avatar">
                  {user.image ? <img src={user.image} alt="" /> : <User size={14} />}
                </div>
                <div>
                  <strong>{user.name}</strong>
                  <span className="admin-user-email">{user.email}</span>
                </div>
              </div>
              <div className="admin-role-cell">
                <div className="role-select-wrapper">
                  <select
                    value={user.role}
                    onChange={(e) => void onRoleChange(user.id, e.target.value)}
                    disabled={user.id === currentUserId}
                    className={`role-select role-${user.role}`}
                  >
                    <option value="user">user</option>
                    <option value="maintainer">maintainer</option>
                    <option value="admin">admin</option>
                  </select>
                  <ChevronDown size={12} className="role-select-chevron" />
                </div>
              </div>
              <span className="admin-date-cell">
                {new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <div className="admin-actions-cell">
                {user.id !== currentUserId && (
                  <button
                    className="admin-delete-btn"
                    onClick={() => void onDeleteUser(user.id, user.name)}
                    title={`Remove ${user.name}`}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {notice && <p className="notice" role="status" style={{ margin: "16px 0 0" }}>{notice}</p>}
    </section>
  );
}

function SkillRow({ skill, active, onSelect }: { skill: CatalogSkill; active: boolean; onSelect: () => void }) {
  return (
    <article className={active ? "skill-row active" : "skill-row"} onClick={onSelect}>
      <div>
        <h2>{skill.pkg.name}</h2>
        <p>{skill.pkg.description}</p>
        <div className="tags">{skill.pkg.categories.map((category) => <span key={category}>{category}</span>)}</div>
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

function packageReport(packageId: string, versionCount: number, installs: number, downloads: number, current: number, stale: number): PackageReport {
  return {
    packageId,
    workspaceId: "workspace-1",
    versionCount,
    latestApprovedVersionId: `version-${packageId}`,
    views: downloads * 2,
    downloads,
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
