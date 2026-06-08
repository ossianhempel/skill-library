# Deployment

Skill Library runs as **one container** with **one persistent volume** at `/data`.

| Path | Contents |
|------|----------|
| `/data/db` | PGlite database (default) |
| `/data/artifacts` | Immutable package files |

No separate database container is required for the default setup.

## Quick start (agent or human)

**Fastest path:** copy the prompt from [deploy-agent-prompt.md](./deploy-agent-prompt.md) to an agent with shell access on the target host. Fill in `PUBLIC_URL` and Microsoft Entra credentials before sending.

**Azure (Rebtech):** live deployment notes in [deploy-azure.md](./deploy-azure.md).

**Local smoke test:**

```sh
cp .env.example .env
# Set BETTER_AUTH_SECRET to a random string (openssl rand -hex 32)
docker compose up --build
curl http://localhost:3000/health
```

## Required environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `BETTER_AUTH_SECRET` | Yes | Session signing secret. Generate: `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | Yes | Public URL of the registry, no trailing slash. Must match browser URL for SSO. |
| `MICROSOFT_CLIENT_ID` | For SSO | Azure App Registration |
| `MICROSOFT_CLIENT_SECRET` | For SSO | Azure client secret |
| `MICROSOFT_TENANT_ID` | For SSO | Org tenant ID (or `common`) |
| `SKILL_LIBRARY_API_KEYS` | Recommended | CLI/MCP bearer tokens. Format: `token:role:actor-id,...` |
| `PORT` | No | Host port. Default `3000`. |
| `DATABASE_URL` | No | External Postgres. Omit to use bundled PGlite. |

Azure redirect URI:

```text
${BETTER_AUTH_URL}/api/auth/callback/microsoft
```

First user to sign in via Microsoft SSO receives the `admin` role automatically.

## Docker Compose (default)

```sh
docker compose up --build -d
```

With external Postgres:

```sh
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up --build -d
```

## Runtime

Entrypoint: `node apps/server/dist/serve.js`

Serves:
- Web UI (static assets + SPA)
- API under `/api`
- Better Auth under `/api/auth/*`
- Health at `/health`

## Post-deploy checks

```sh
curl https://your-registry.example.com/health
```

See [operations.md](./operations.md) for backups, upgrades, and API key rotation.

## Backups

**PGlite (default):** back up the entire `/data` volume.

**External Postgres:** back up Postgres and `/data/artifacts`.
