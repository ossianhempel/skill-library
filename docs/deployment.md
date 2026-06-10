# Deployment

Skill Library runs as **one container** with **one persistent volume** at `/data`.

| Path | Contents |
|------|----------|
| `/data/db` | PGlite database (default) |
| `/data/artifacts` | Immutable package files |

No separate database container is required for the default setup.

## PGlite persistence and single-writer rules

When `DATABASE_URL` is unset, the app uses embedded **PGlite** under `/data/db`. PGlite is convenient for evaluation and small deployments, but it has strict operational requirements:

1. **Persistent volume required.** Mount a durable volume at `/data` (or at `SKILL_LIBRARY_DATA_DIR`). Ephemeral container filesystems wipe the database on every redeploy with no startup error.
2. **Exactly one writing instance.** PGlite is strictly single-writer. Run **one replica** only. Multiple replicas, or a rolling deploy that briefly runs old and new instances against the same data directory, can corrupt the database.
3. **External backups.** Back up the entire `/data` volume on a schedule. PGlite does not provide managed point-in-time recovery.
4. **Production / HA.** For production or high availability, set `DATABASE_URL` to external Postgres instead of relying on PGlite.

At startup in PGlite mode, the app writes a single-writer lock file under the data directory and **fails fast** if another live instance already holds the lock. Stale locks from crashed instances are taken over automatically after a heartbeat timeout.

**Rolling deploy hazard:** default rolling updates can start the new container before the old one stops, creating two writers on the same volume. Use a **stop-before-start** or otherwise **single-instance** deploy strategy for PGlite, or switch to external Postgres.

Company or private deployments should fork the repo and deploy from the fork. See [forking.md](./forking.md) for syncing upstream with `./scripts/sync-from-upstream.sh` and scheduled drift checks with `./scripts/check-upstream-drift.sh`.

## Quick start (agent or human)

**Fastest path:** copy the prompt from [deploy-agent-prompt.md](./deploy-agent-prompt.md) to an agent with shell access on the target host. Fill in `PUBLIC_URL` and Microsoft Entra credentials before sending.

**Local smoke test:**

```sh
cp .env.example .env
./scripts/setup-instance-config.sh   # optional: customize registry.config.json
# Set BETTER_AUTH_SECRET to a random string (openssl rand -hex 32)
docker compose up --build
curl http://localhost:3000/health
```

`registry.config.json` is gitignored (like `.env`). The Docker build copies `registry.config.example.json` when no local file exists.

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
