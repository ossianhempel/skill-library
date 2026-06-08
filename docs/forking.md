# Forking and syncing upstream

Skill Library is designed to be forked for private or company deployments. The upstream repo ships a sync script so forks can pull OSS fixes without losing fork-local CI or agent config.

## Upstream-first rule

**App changes always start in the OSS source repo** (`~/Developer/skill-library` → GitHub), then flow into forks via `./scripts/sync-from-upstream.sh`.

| Change type | Where to edit |
|-------------|---------------|
| App code, bugs, features, schema | OSS source repo first |
| Company CI/CD, secrets scripts, Azure docs, `AGENTS.md`, `registry.config.json` | Fork only (`fork-sync.conf` paths) |

Do not patch app code directly in a company fork except in an emergency — and if you do, land the same fix in OSS immediately, then re-sync the fork so both repos stay aligned and you keep exercising the real update path.

## Workflow

1. Fork or mirror the repo (GitHub fork, Azure DevOps import, or `git clone` + new `origin`).
2. Add fork-only files (pipeline YAML, `AGENTS.md`, etc.).
3. Copy `scripts/fork-sync.conf.example` to `fork-sync.conf` at the repo root and list paths to preserve.
4. Deploy from **your fork**, not from upstream.

## Sync latest upstream

```sh
./scripts/sync-from-upstream.sh --dry-run   # preview incoming changes
./scripts/sync-from-upstream.sh --verify    # merge + run pnpm verify
./scripts/sync-from-upstream.sh --push      # merge, verify optional, push to origin
```

The script:

- Adds an `upstream` remote pointing at `ossianhempel/skill-library` if missing
- Fetches and merges `upstream/main` (or rebases with `--rebase`)
- Backs up and restores paths listed in `fork-sync.conf`
- Refuses to run when `origin` is the upstream repo (use `--allow-upstream` only for testing)

## Fork-local files

Typical fork-only paths:

| Path | Purpose |
|------|---------|
| `azure-pipelines.yml` | Company CI/CD |
| `AGENTS.md` | Agent instructions for your environment |
| `registry.config.json` | Company branding, default workspace, public URL |
| `fork-sync.conf` | Sync settings (not in upstream) |

Keep company hostnames, tenant IDs, and resource names in your fork or a separate deploy repo — not in upstream OSS.

## Branding and company copy

Copy `registry.config.example.json` to `registry.config.json` in your fork and customize:

- `registryTagline` — header kicker (for example `Rebtech skill registry`)
- `appName` / `documentTitle` — product name shown in the UI and browser tab
- `companyName` — your organization name
- `defaultWorkspaceId` — default workspace slug/id for publish and install prompts
- `registryPublicUrl` — public registry URL used in generated CLI install commands
- `loginSubtitle`, `overviewHeading`, `overviewDescription`, and other UI strings

Add `registry.config.json` to `FORK_LOCAL_PATHS` in `fork-sync.conf` so upstream merges do not overwrite your company copy. The server exposes the file at `GET /api/config`; the web UI loads it on startup.

Override the file path in containers with `SKILL_LIBRARY_CONFIG_PATH` if needed.

## Roles and admin bootstrap

The first Microsoft SSO sign-in becomes **Admin** automatically. Later sign-ins start as **Viewer** until promoted in the Admin tab. Role names in the UI map to internal values as Viewer (`user`), Editor (`maintainer`), and Admin (`admin`). See [user-guide.md](user-guide.md) and [security.md](security.md).

## Deploy from the fork

After syncing, push to your fork's default branch. Your CI/CD pipeline should build and deploy from that remote (for example Azure DevOps `Assets/skill-library`), not from the public GitHub repo.
