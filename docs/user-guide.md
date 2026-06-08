# User Guide

Skill Library is an internal catalog for company skill packages.

## Sign in

Production uses **Microsoft Entra ID SSO**. Open the registry URL, click **Sign in with Microsoft**, and complete your company login.

### First admin

The **first Microsoft account to sign in** is promoted to **Admin** automatically. That bootstrap admin can then promote teammates in the **Admin** tab. No separate setup script is required.

### Roles

| UI label | Internal role | Permissions |
|----------|---------------|-------------|
| **Viewer** | `user` | Browse and install approved skills; publish drafts |
| **Editor** | `maintainer` | Everything viewers can do; approve, hide, and deprecate skills; view adoption reports |
| **Admin** | `admin` | Manage teammate roles; all editor permissions |

Admins change roles under **Admin → Team members**. You cannot change your own role.

### Draft review and approval

1. A teammate uploads or imports a skill on the **Publish** tab. It is stored as a **draft**.
2. An **Editor** or **Admin** opens the skill in **Catalog** and uses **Approve** in the lifecycle controls.
3. After approval, the skill appears in the catalog for all viewers to browse and install.

Viewers can submit drafts but cannot approve them.

## API token fallback (optional)

For local development or automation without SSO, set a browser API token before opening the app:

```js
localStorage.setItem("skill-library-token", "<user-or-maintainer-token>")
```

CLI and MCP use bearer tokens configured in `SKILL_LIBRARY_API_KEYS`. See [security.md](security.md).

## Browse

The web app opens to the overview. It loads packages from `/api/workspaces/:workspaceId/packages`, enriches them with latest-version and report data, and shows install/download activity, stale install counts, categories, lifecycle status, and the selected skill detail.

## Inspect

Skill detail shows:

- description and lifecycle state
- latest version
- validation summary
- bundled file preview list
- generated CLI install prompt
- ZIP fallback action

## Install

The recommended install path is the local CLI:

```sh
skill-library install <package-id> --workspace <workspace-id> --root <destination-root> --registry <registry-url>
```

The web UI generates a one-time prompt that a user can hand to a local agent/helper. ZIP fallback maps to the artifact download API.

## Publish

Any signed-in teammate can publish drafts through the web UI:

- package metadata fields for workspace, slug, and version
- upload file selection for package-tree publishing through `/api/workspaces/:workspaceId/packages/upload`
- Git import controls for `/api/workspaces/:workspaceId/packages/import-git`

Editors and admins approve drafts through lifecycle actions (`approve`, `hide`, `deprecated`) on `/api/versions/:versionId/lifecycle`.

On localhost only, if the API is unavailable, the catalog falls back to demo data and shows a status notice. Production shows an empty catalog instead of placeholder skills.

## Report

The web UI includes an adoption report panel with package totals, current installs, stale or locally modified installs, and per-package rows. Editor and admin report data comes from `/api/workspaces/:workspaceId/reports`.

## Branding

Company forks customize UI copy in `registry.config.json` (tagline, app name, public URL, and related strings). See [forking.md](forking.md).
