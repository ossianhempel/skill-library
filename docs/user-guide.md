# User Guide

Skill Library is an internal catalog for company skill packages.

For private catalogs, set a browser API token before opening the app:

```js
localStorage.setItem("skill-library-token", "<user-or-maintainer-token>")
```

## Browse

The web app opens directly to the catalog. It loads packages from `/api/workspaces/:workspaceId/packages`, enriches them with latest-version and report data, and shows install/download activity, stale install counts, categories, lifecycle status, and the selected skill detail.

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

The web UI generates a one-time prompt that a user can hand to a local agent/helper. ZIP fallback is present in the UI and maps to the artifact download API.

## Publish

Maintainer controls in the web UI call the publishing APIs:

- package metadata fields for workspace, slug, and version
- upload file selection for package-tree publishing through `/api/workspaces/:workspaceId/packages/upload`
- Git import controls for `/api/workspaces/:workspaceId/packages/import-git`
- lifecycle actions for approve, hide, and deprecate through `/api/versions/:versionId/lifecycle`

On localhost only, if the API is unavailable, the catalog falls back to demo data and shows a status notice. Production shows an empty catalog instead of placeholder skills.

## Report

The web UI includes an adoption report panel with package totals, current installs, stale or locally modified installs, and per-package rows. Maintainer report data comes from `/api/workspaces/:workspaceId/reports`.
