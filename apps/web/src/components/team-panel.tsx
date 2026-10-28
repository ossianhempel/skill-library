import { ChevronDown, Loader2, RefreshCw, User, Users } from "lucide-react";
import {
  type RegistryBrandingConfig,
  type Workspace,
  type WorkspaceRole,
} from "@skill-library/domain";
import type { AdminUser, SessionUser } from "../types.js";
import { formatRoleLabel } from "../lib/format.js";
import { WorkspaceLogoSettings } from "./workspace-logo-settings.js";
import { useI18n } from "../i18n/locale.js";

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
  const { t, dateLocale } = useI18n();
  const selfRecord = members.find((user) => user.id === currentUser.id);
  const teammates = members.filter((user) => user.id !== currentUser.id);

  return (
    <section className="admin-panel" aria-label={t.team.aria}>
      <div className="admin-header">
        <div>
          <div className="panel-title">
            <Users size={17} />
            {t.team.title}
          </div>
          <p
            style={{ margin: "0", color: "var(--muted)", fontSize: "0.88rem" }}
          >
            {teammates.length === 0
              ? t.team.onlyYou
              : t.team.youAnd(teammates.length)}
          </p>
        </div>
        <button onClick={onRefresh} disabled={loading} className="secondary">
          <RefreshCw size={15} className={loading ? "spin" : ""} />
          {t.team.refresh}
        </button>
      </div>

      <section className="admin-section" aria-label={t.team.yourAccount}>
        <h3 className="admin-section-title">{t.team.yourAccount}</h3>
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
              {formatRoleLabel(currentUser.role, t.roles.labels)}
            </span>
            {selfRecord ? (
              <>
                <span className="admin-self-joined">
                  {t.team.joined}{" "}
                  {new Date(selfRecord.created_at).toLocaleDateString(
                    dateLocale,
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }
                  )}
                </span>
                <span className="admin-self-submissions">
                  {t.team.submitted(selfRecord.skillsSubmitted)}
                </span>
              </>
            ) : null}
          </div>
        </article>
      </section>

      <section className="admin-section" aria-label={t.team.roles}>
        <h3 className="admin-section-title">{t.team.roles}</h3>
        <div className="admin-role-legend">
          {(Object.keys(t.roles.labels) as WorkspaceRole[]).map((role) => (
            <div className="admin-role-legend-item" key={role}>
              <span className={`session-role role-${role}`}>
                {t.roles.labels[role]}
              </span>
              <p>{t.roles.descriptions[role]}</p>
            </div>
          ))}
        </div>
      </section>

      <WorkspaceLogoSettings
        workspace={workspace}
        branding={branding}
        effectiveLogoUrl={effectiveLogoUrl}
        canManage={canManageRoles}
        onWorkspaceLogoChange={onWorkspaceLogoChange}
      />

      <section className="admin-section" aria-label={t.team.members}>
        <h3 className="admin-section-title">{t.team.members}</h3>

        {loading && members.length === 0 ? (
          <div className="admin-empty">
            <Loader2 size={20} className="spin" aria-hidden="true" />
            <span>{t.team.loading}</span>
          </div>
        ) : members.length === 0 ? (
          <div className="admin-empty">{t.team.none}</div>
        ) : (
          <div
            className={`admin-table ${canManageRoles ? "admin-table--manageable" : "admin-table--readonly"}`}
            role="table"
            aria-label={t.team.members}
          >
            <div className="admin-table-head" role="row">
              <span>{t.team.user}</span>
              <span>{t.team.role}</span>
              <span>{t.team.skillsSubmitted}</span>
              <span>{t.team.joinedColumn}</span>
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
  const { t, dateLocale } = useI18n();
  return (
    <div className="admin-table-row" role="row">
      <div className="admin-user-cell">
        <div className="admin-user-avatar">
          {user.image ? <img src={user.image} alt="" /> : <User size={14} />}
        </div>
        <div>
          <strong>
            {user.name}
            {isSelf ? t.team.you : ""}
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
              <option value="user">{t.roles.labels.user}</option>
              <option value="maintainer">{t.roles.labels.maintainer}</option>
              <option value="admin">{t.roles.labels.admin}</option>
            </select>
            <ChevronDown size={12} className="role-select-chevron" />
          </div>
        ) : (
          <span className={`session-role role-${user.role}`}>
            {formatRoleLabel(user.role, t.roles.labels)}
          </span>
        )}
      </div>
      <span className="admin-submissions-cell">{user.skillsSubmitted}</span>
      <span className="admin-date-cell">
        {new Date(user.created_at).toLocaleDateString(dateLocale, {
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
              title={t.team.removeTitle(user.name)}
            >
              {t.team.remove}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
