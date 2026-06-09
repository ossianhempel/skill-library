# Security

Skill Library supports two identity paths for protected routes:

1. **Browser SSO** — Microsoft Entra ID through Better Auth (sessions/cookies)
2. **Bearer API keys** — for CLI, MCP, and scripted access

Route-level permission checks use the same role model for both.

## Roles

| UI label | Role value | Rank |
|----------|------------|------|
| Viewer | `user` | 1 |
| Editor | `maintainer` | 2 |
| Admin | `admin` | 3 |

Higher ranks inherit lower-rank permissions.

### Bootstrap admin

On the first SSO sign-in, if the `user` table is empty, Better Auth assigns `admin` to that account. Subsequent sign-ins default to `user` (Viewer) until an admin promotes them through `PATCH /api/admin/users/:userId`.

Any signed-in user can list teammates (with skills submitted counts) via `GET /api/team/members`. Role changes and user deletion remain admin-only.

## Microsoft Entra SSO

Configure in the server environment:

- `BETTER_AUTH_URL` — public registry URL
- `BETTER_AUTH_SECRET` — session secret
- `BETTER_AUTH_TRUSTED_ORIGINS` — comma-separated allowed origins
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`

The web UI uses cookie-based sessions. Admin user management routes require an authenticated admin session.

## Bearer API keys

Production-style scripted access uses `SKILL_LIBRARY_API_KEYS`:

```sh
SKILL_LIBRARY_API_KEYS=maintainer-secret:maintainer:maintainer-1,user-secret:user:user-1
```

Each comma-separated entry is:

```text
token:role:actor-id
```

Requests use:

```text
Authorization: Bearer maintainer-secret
```

## Development header fallback

When `NODE_ENV` is not `production`, requests may include:

- `x-skill-library-role`: `user`, `maintainer`, or `admin`
- `x-skill-library-actor`: actor ID for provenance/lifecycle operations

Bearer API keys take precedence when both are present. Dev headers are rejected in production.

## Current permissions

### Public / browse

- Public workspace catalog search, package detail, latest approved lookup: open when workspace visibility is public.
- Private workspace browse routes: require at least Viewer (`user`).

### Authenticated viewers (`user` and above)

- Install report submission
- Upload publishing (`POST /api/workspaces/:workspaceId/packages/upload`)
- Git import publishing (`POST /api/workspaces/:workspaceId/packages/import-git`)

### Editors (`maintainer` and above)

- Lifecycle transitions (approve, hide, deprecate, publish)
- Usage counters and adoption reports
- Non-approved version visibility for review

### Admins

- All editor permissions
- Workspace reporting policy and visibility updates
- List teammates with submission counts (`GET /api/team/members`) — any signed-in user
- Update roles and delete users (`PATCH` / `DELETE /api/admin/users/:userId`) — admin only

## Pending hardening

- Audit local path exposure in reports before enabling required reporting.
- Optional interactive CLI OAuth (CLI continues to use API tokens today).
