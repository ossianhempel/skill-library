# User Guide

Skill Library is an internal catalog for company skill packages.

## Sign in

Production uses **Microsoft Entra ID SSO**. Open the registry URL, click **Sign in with Microsoft**, and complete your company login.

### First admin

The **first Microsoft account to sign in** is promoted to **Admin** automatically. That bootstrap admin can then promote teammates on the **Team** tab. No separate setup script is required.

### Roles

| UI label   | Internal role | Permissions                                                                           |
| ---------- | ------------- | ------------------------------------------------------------------------------------- |
| **Viewer** | `user`        | Browse and install approved skills; publish drafts                                    |
| **Editor** | `maintainer`  | Everything viewers can do; approve, hide, and deprecate skills; view adoption reports |
| **Admin**  | `admin`       | Manage teammate roles; all editor permissions                                         |

Admins change roles on the **Team** tab. Everyone signed in can open **Team** to see teammates and how many skills each person has submitted. You cannot change your own role.

### Draft review and approval

1. A teammate uploads or imports a skill on the **Publish** tab. It is stored as a **draft**.
2. An **Editor** or **Admin** opens the skill in **Catalog** and uses **Approve** in the lifecycle controls.
3. After approval, the skill appears in the catalog for all viewers to browse and install.

Viewers can submit drafts but cannot approve them.

## Agent setup (MCP / CLI)

After you sign in with Microsoft, open **Overview** and copy an **agent setup prompt** for your editor (Cursor, Claude Code, Codex, etc.). The prompt includes your **personal MCP bearer token** automatically — you do not need a separate token from an admin.

That token is tied to your account and role. Treat it like a password.

## API token fallback (optional)

For local development or automation without SSO, set a browser API token before opening the app:

```js
localStorage.setItem("skill-library-token", "<user-or-maintainer-token>");
```

Legacy static deploy keys in `SKILL_LIBRARY_API_KEYS` still work for automation. See [security.md](security.md).

## Browse

The web app opens to the overview. It loads packages from `/api/workspaces/:workspaceId/packages`, enriches them with latest-version and report data, and shows install/download activity, stale install counts, categories, lifecycle status, and the selected skill detail.

## Inspect

Skill detail shows:

- description and lifecycle state
- latest version
- validation summary with specific rule IDs, messages, and file paths (errors and warnings)
- bundled file preview list
- generated CLI install prompt
- ZIP fallback action

## Install

The recommended install path is the local CLI:

```sh
npx @skill-library/cli install <package-id> --workspace <workspace-id> --root <destination-root> --registry <registry-url>
```

The web UI generates a one-time prompt that a user can hand to a local agent/helper. ZIP fallback maps to the artifact download API.

## Publish

Any signed-in teammate can publish drafts through the web UI:

- package metadata fields for workspace, slug, and version
- upload file selection for package-tree publishing through `/api/workspaces/:workspaceId/packages/upload`
- optional **Validate** preflight against `/api/validation/package-tree` before upload
- Git import controls for `/api/workspaces/:workspaceId/packages/import-git`

`SKILL.md` must include Agent Skills YAML frontmatter (`name`, `description`). See [validation-rules.md](validation-rules.md). Invalid packages can still be uploaded as drafts for maintainer review, but approval is blocked until validation passes.

Editors and admins approve drafts through lifecycle actions (`approve`, `hide`, `deprecated`) on `/api/versions/:versionId/lifecycle`.

On localhost only, if the API is unavailable, the catalog falls back to demo data and shows a status notice. Production shows an empty catalog instead of placeholder skills.

## Report

The web UI includes an adoption report panel with package totals, current installs, stale or locally modified installs, and per-package rows. Editor and admin report data comes from `/api/workspaces/:workspaceId/reports`.

## Workspaces

A workspace is the catalog namespace inside one registry deployment. Most company installs use a single workspace. The default id is `main`, configured through `defaultWorkspaceId` in `registry.config.json`. Skills, publish forms, and CLI install commands all scope to that workspace id.

## Branding

Company deployments customize UI copy in gitignored `registry.config.json` (from `registry.config.example.json`). See [forking.md](forking.md).
