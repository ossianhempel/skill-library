# Operations

Skill Library is designed to run as one app container with one persistent data volume by default.

First-time deploy: use [deploy-agent-prompt.md](./deploy-agent-prompt.md) (copy-paste prompt for an agent) or [deployment.md](./deployment.md).

## Health

Use:

```text
GET /health
```

Expected response:

```json
{"ok":true,"mode":"pglite"}
```

`mode` is `postgres` when `DATABASE_URL` is configured.

## Data Layout

Default PGlite mode stores runtime state under `/data`:

- `/data/db`: PGlite database
- `/data/artifacts`: immutable package artifacts

Set `SKILL_LIBRARY_DATA_DIR` to change the root directory.

## Backups

PGlite mode:

1. Stop the app or take a volume snapshot with filesystem consistency.
2. Back up the entire mounted `/data` volume.
3. Restore by mounting the saved volume at `/data` and starting the same or newer app version.

External Postgres mode:

1. Back up the external Postgres database with the provider's native backup tooling.
2. Back up `/data/artifacts`.
3. Restore both the database and artifact directory before starting the app.

## Upgrades

The app applies idempotent SQL migrations at startup. For upgrades:

1. Back up data first.
2. Deploy the new image.
3. Start the app and check `/health`.
4. Run a catalog search and artifact download smoke test.

## API Keys

Protected routes use `SKILL_LIBRARY_API_KEYS`:

```text
token:role:actor-id,token:role:actor-id
```

Rotate a key by:

1. Adding the new key beside the old one.
2. Updating CLI/MCP/web configuration.
3. Removing the old key and restarting the app.

Use separate keys for `user`, `maintainer`, and `admin` automation.

The browser app reads `localStorage["skill-library-token"]` and sends it as a bearer token for API-bound catalog, publishing, lifecycle, and reporting calls.

## Private Catalogs

New workspaces default to `private`. Private workspace browse routes require at least `user` role. Admins can change visibility through:

```text
PATCH /api/workspaces/:workspaceId
```

## Smoke Checks

Recommended post-deploy checks:

```sh
curl http://localhost:3000/health
node packages/cli/dist/index.js workspace --workspace <workspace-id> --registry http://localhost:3000 --token <user-token>
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node packages/mcp/dist/stdio.js
```
