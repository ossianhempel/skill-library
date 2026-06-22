import { ChevronDown, Loader2, RefreshCw, User, Users } from "lucide-react";
import {
  type RegistryBrandingConfig,
  WORKSPACE_ROLE_DESCRIPTIONS,
  WORKSPACE_ROLE_LABELS,
  type Workspace,
  type WorkspaceRole,
} from "@skill-library/domain";
import type { AdminUser, SessionUser } from "../types.js";
import { formatRoleLabel } from "../lib/format.js";
import { WorkspaceLogoSettings } from "./workspace-logo-settings.js";

export function TeamPanel({
  members,
  loading,
  currentUser,
  workspace,
  branding,
  effectiveLogoUrl,
  canManageRoles,
  onWorkspaceLogoChange,
  onRoleChange,
  onDeleteUser,
  onRefresh,
  notice,
}: {
  members: AdminUser[];
  loading: boolean;
  currentUser: SessionUser;
  workspace: Workspace | null;
  branding: RegistryBrandingConfig;
  effectiveLogoUrl?: string;
  canManageRoles: boolean;
  onWorkspaceLogoChange: (logoUrl: string) => Promise<void>;
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
          <div className="panel-title">
            <Users size={17} />
            Team
          </div>
          <p
            style={{ margin: "0", color: "var(--muted)", fontSize: "0.88rem" }}
          >
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
              {currentUser.image ? (
                <img src={currentUser.image} alt="" />
              ) : (
                <User size={16} />
              )}
            </div>
            <div>
              <strong>{currentUser.name}</strong>
              <span className="admin-user-email">{currentUser.email}</span>
            </div>
          </div>
          <div className="admin-self-meta">
            <span className={`session-role role-${currentUser.role}`}>
              {formatRoleLabel(currentUser.role)}
            </span>
            {selfRecord ? (
              <>
                <span className="admin-self-joined">
                  Joined{" "}
                  {new Date(selfRecord.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <span className="admin-self-submissions">
                  {selfRecord.skillsSubmitted} skill
                  {selfRecord.skillsSubmitted === 1 ? "" : "s"} submitted
                </span>
              </>
            ) : null}
          </div>
        </article>
      </section>

      <section className="admin-section" aria-label="Roles">
        <h3 className="admin-section-title">Roles</h3>
        <div className="admin-role-legend">
          {(Object.keys(WORKSPACE_ROLE_LABELS) as WorkspaceRole[]).map(
            (role) => (
              <div className="admin-role-legend-item" key={role}>
                <span className={`session-role role-${role}`}>
                  {WORKSPACE_ROLE_LABELS[role]}
                </span>
                <p>{WORKSPACE_ROLE_DESCRIPTIONS[role]}</p>
              </div>
            )
          )}
        </div>
      </section>

      <WorkspaceLogoSettings
        workspace={workspace}
        branding={branding}
        effectiveLogoUrl={effectiveLogoUrl}
        canManage={canManageRoles}
        onWorkspaceLogoChange={onWorkspaceLogoChange}
      />

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
          <div
            className={`admin-table ${canManageRoles ? "admin-table--manageable" : "admin-table--readonly"}`}
            role="table"
            aria-label="Team members"
          >
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

      {notice && (
        <p className="notice" role="status" style={{ margin: "16px 0 0" }}>
          {notice}
        </p>
      )}
    </section>
  );
}

export function TeamMemberRow({
  user,
  isSelf,
  canManageRoles,
  onRoleChange,
  onDeleteUser,
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
          <strong>
            {user.name}
            {isSelf ? " (you)" : ""}
          </strong>
          <span className="admin-user-email">{user.email}</span>
        </div>
      </div>
      <div className="admin-role-cell">
        {canManageRoles && !isSelf ? (
          <div className="role-select-wrapper">
            <select
              value={user.role}
              onChange={(event) =>
                void onRoleChange(user.id, event.target.value)
              }
              className={`role-select role-${user.role}`}
            >
              <option value="user">{WORKSPACE_ROLE_LABELS.user}</option>
              <option value="maintainer">
                {WORKSPACE_ROLE_LABELS.maintainer}
              </option>
              <option value="admin">{WORKSPACE_ROLE_LABELS.admin}</option>
            </select>
            <ChevronDown size={12} className="role-select-chevron" />
          </div>
        ) : (
          <span className={`session-role role-${user.role}`}>
            {formatRoleLabel(user.role)}
          </span>
        )}
      </div>
      <span className="admin-submissions-cell">{user.skillsSubmitted}</span>
      <span className="admin-date-cell">
        {new Date(user.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
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
