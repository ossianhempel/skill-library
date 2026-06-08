# Deployment

Skill Library's reference deployment is one application container with one persistent data volume. That default topology must stay usable for local and small-team hosting.

## Default PGlite Mode

Default runtime layout:

- App container serves the web UI, registry API, upload/download routes, and health checks.
- `/data/db` stores the PGlite database.
- `/data/artifacts` stores immutable package artifacts.
- `SKILL_LIBRARY_DATA_DIR` can override `/data`.

Minimal compose shape:

```yaml
services:
  skill-library:
    image: skill-library
    ports:
      - "3000:3000"
    volumes:
      - skill-library-data:/data

volumes:
  skill-library-data:
```

No separate database service is required for the default path.

Run the reference local deployment with:

```sh
docker compose up --build
```

Then open:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/health
```

## External Postgres Mode

Set `DATABASE_URL` to switch relational storage to external Postgres while keeping the same app container and base URL:

```sh
DATABASE_URL=postgres://user:password@postgres.example.com:5432/skill_library
```

With Compose, use the override file:

```sh
DATABASE_URL=postgres://user:password@postgres.example.com:5432/skill_library docker compose -f docker-compose.yml -f docker-compose.postgres.yml up --build
```

Artifact storage still defaults to `/data/artifacts` unless a future artifact-store adapter is configured.

## Configuration

- `SKILL_LIBRARY_DATA_DIR`: root directory for local runtime state. Defaults to `/data`.
- `DATABASE_URL`: optional external Postgres connection string. If omitted, PGlite is used.
- `PORT`: host port exposed by `docker-compose.yml`. Defaults to `3000`.
- `SKILL_LIBRARY_WEB_DIST`: optional path to built web assets for custom runtime layouts.
- `SKILL_LIBRARY_API_KEYS`: comma-separated `token:role:actor-id` entries for protected API access.

## Runtime

The production entrypoint is `node apps/server/dist/serve.js`. It serves:

- static web assets from `apps/web/dist`
- API routes under `/api`
- health checks at `/health`

Backups in PGlite mode must include the mounted data volume. Backups in external Postgres mode must include both the Postgres database and artifact directory.
