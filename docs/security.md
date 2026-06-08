# Security

The current server has a minimal role enforcement layer for company-internal deployments. It is intentionally small so the identity source can be replaced later without changing route-level permission decisions.

## Current Identity Contract

Production-style protected requests should use bearer API keys configured through `SKILL_LIBRARY_API_KEYS`:

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

The supported roles are `user`, `maintainer`, and `admin`.

## Development Header Fallback

Requests may include:

- `x-skill-library-role`: `user`, `maintainer`, or `admin`
- `x-skill-library-actor`: actor ID recorded in provenance/lifecycle operations when available

This remains available for local tests and development when `NODE_ENV` is not `production`. Bearer API keys take precedence when both are present.

## Current Permissions

- Public workspace browse routes: catalog search, package detail, version detail, latest approved lookup.
- Private workspace browse routes: require at least `user`.
- Validation route: public/internal utility route.
- User role: install report submission.
- Maintainer role: artifact ingestion, upload publishing, Git import publishing, lifecycle transitions, usage counters.
- Admin role: inherits maintainer permissions and may update workspace reporting policy and visibility.

## Pending Hardening

- Replace static API keys with OIDC/SSO or another external identity provider if company SSO is required.
- Persist workspace memberships and roles beyond static environment configuration.
- Add CSRF/session strategy if cookie-based auth is selected.
- Audit local path exposure in reports before enabling required reporting.
