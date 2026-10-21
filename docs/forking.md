# Forking and syncing upstream

Skill Library is designed to be forked for private or company deployments. The upstream repo ships a sync script so forks can pull OSS fixes without losing fork-local CI or agent config.

## Upstream-first rule

**App changes always start in the OSS source repo** (`~/Developer/skill-library` → GitHub), then flow into forks via `./scripts/sync-from-upstream.sh`.

| Change type                                             | Where to edit                           |
| ------------------------------------------------------- | --------------------------------------- |
| App code, bugs, features, schema                        | OSS source repo first                   |
| Company CI/CD, secrets scripts, Azure docs, `AGENTS.md` | Fork only (`fork-sync.conf` paths)      |
| Instance branding (`registry.config.json`)              | Local gitignored file — never committed |

Do not patch app code directly in a company fork except in an emergency — and if you do, land the same fix in OSS immediately, then re-sync the fork so both repos stay aligned and you keep exercising the real update path.

## Workflow

1. Fork or mirror the repo (GitHub fork, Azure DevOps import, or `git clone` + new `origin`).
2. Run `./scripts/setup-instance-config.sh` and edit `registry.config.json` with your company values (file is gitignored).
3. Add fork-only files (pipeline YAML, `AGENTS.md`, etc.).
4. Copy `scripts/fork-sync.conf.example` to `fork-sync.conf` at the repo root and list paths to preserve.
5. Deploy from **your fork**, not from upstream.

## Staying up to date (without manual tracking)

Forks drift from OSS over time. You do **not** need to watch the GitHub repo by hand — use **detect → review → sync → deploy**:

| Step       | What                                | How often                                                      |
| ---------- | ----------------------------------- | -------------------------------------------------------------- |
| **Detect** | Learn that upstream has new commits | Automated (CI schedule) or `./scripts/check-upstream-drift.sh` |
| **Review** | Skim incoming fixes/features        | `./scripts/sync-from-upstream.sh --dry-run`                    |
| **Sync**   | Merge upstream into your fork       | `./scripts/sync-from-upstream.sh --verify --push`              |
| **Deploy** | Ship the updated image              | Your fork CI/CD (or manual deploy script)                      |

**Do not auto-merge upstream into production.** Merges can still conflict on fork-local files (pipelines, `AGENTS.md`). Instance branding lives in gitignored `registry.config.json`, so upstream syncs do not touch it. Automate **detection and notification**; keep **merge and deploy** human-reviewed unless you add your own conflict-resolution policy.

### One-command drift check

`scripts/check-upstream-drift.sh` fetches upstream and exits **0** when your branch is current, **1** when behind (with a short log of new commits). Use it locally or in scheduled CI:

```sh
./scripts/check-upstream-drift.sh
```

Reads the same `fork-sync.conf` as the sync script (`UPSTREAM_URL`, `UPSTREAM_BRANCH`, `UPSTREAM_REMOTE`).

### Recommended cadence

- **Weekly scheduled CI** — run `check-upstream-drift.sh`; fail the job or send email/Teams when exit code is 1.
- **After any OSS fix you care about** — run sync in the fork once GitHub `main` has the commit.
- **Before production deploys** — if you have not synced recently, run `--dry-run` first.

### Azure DevOps: scheduled upstream drift job

Add a **separate pipeline** (or a scheduled stage) in your fork that only checks drift — it does not deploy. Example `azure-pipelines-upstream-drift.yml` in the fork:

```yaml
# Fork-only: schedule upstream drift checks (does not deploy).
trigger: none

schedules:
  - cron: "0 8 * * 1" # Mondays 08:00 UTC
    displayName: Weekly upstream drift check
    branches:
      include:
        - main
    always: true

pool:
  vmImage: ubuntu-latest

steps:
  - checkout: self
    fetchDepth: 0
    persistCredentials: true

  - script: ./scripts/check-upstream-drift.sh
    displayName: Check if fork is behind OSS upstream
    # Exit 1 when behind — configure pipeline notifications on failure.
```

Register the pipeline in Azure DevOps, enable **Notifications** for failed runs (email or Teams). When it fails, run sync locally or in a follow-up pipeline that opens a PR — see below.

### GitHub fork: scheduled Action

For GitHub forks, a similar workflow:

```yaml
# .github/workflows/upstream-drift.yml (fork-only)
name: Upstream drift check
on:
  schedule:
    - cron: "0 8 * * 1"
  workflow_dispatch:

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: ./scripts/check-upstream-drift.sh
```

GitHub can email the repo watchers when the workflow fails.

### Optional: sync via pull request

Some teams prefer a PR instead of pushing straight to `main`:

```sh
./scripts/sync-from-upstream.sh --verify
git push -u origin HEAD:sync/upstream-$(date +%Y%m%d)
```

Open a PR in your fork, review conflicts and `pnpm verify` output, then merge and let deploy CI run.

### After syncing

1. Resolve merge conflicts — keep **fork** values for paths in `FORK_LOCAL_PATHS`.
2. Confirm `pnpm verify` passed (`--verify` flag).
3. Push to your fork `main`.
4. Let company CI/CD deploy, or run your deploy script.
5. Smoke-test SSO and catalog on the production URL.

### Common merge conflicts

| File                            | Resolution                                                                 |
| ------------------------------- | -------------------------------------------------------------------------- |
| `azure-pipelines.yml`           | Keep fork pipeline                                                         |
| `AGENTS.md`                     | Keep fork agent notes; optionally copy useful upstream doc changes by hand |
| App code (`apps/`, `packages/`) | Prefer upstream unless you have a fork-only hotfix to port back to OSS     |

## Sync latest upstream

```sh
./scripts/check-upstream-drift.sh              # am I behind? (CI-friendly)
./scripts/sync-from-upstream.sh --dry-run      # preview incoming changes (needs clean tree)
./scripts/sync-from-upstream.sh --verify       # merge + run pnpm verify
./scripts/sync-from-upstream.sh --push         # merge, verify optional, push to origin
```

The sync script:

- Adds an `upstream` remote pointing at `ossianhempel/skill-library` if missing
- Fetches and merges `upstream/main` (or rebases with `--rebase`)
- Backs up and restores paths listed in `fork-sync.conf`
- Refuses to run when `origin` is the upstream repo (use `--allow-upstream` only for testing)

## Fork-local files

Typical fork-only paths:

| Path                   | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `azure-pipelines.yml`  | Company CI/CD                              |
| `AGENTS.md`            | Agent instructions for your environment    |
| `fork-sync.conf`       | Sync settings (not in upstream)            |
| `registry.config.json` | Instance branding (gitignored — see below) |

Keep company hostnames, tenant IDs, and resource names in your fork or a separate deploy repo — not in upstream OSS.

## Instance config (not in git)

Company-specific UI copy and defaults use the same pattern as `.env` / `.env.example`:

| File                           | In git?             | Purpose                                                               |
| ------------------------------ | ------------------- | --------------------------------------------------------------------- |
| `registry.config.example.json` | Yes (upstream)      | Template with placeholder values; updated when new branding keys ship |
| `registry.config.json`         | **No** (gitignored) | Your live config — branding, workspace id, public URL                 |

**First-time setup:**

```sh
./scripts/setup-instance-config.sh   # copies example → registry.config.json if missing
# edit registry.config.json with your company values
```

Or manually: `cp registry.config.example.json registry.config.json`

**Why gitignore?** Upstream merges never overwrite your instance file. You do **not** add `registry.config.json` to `fork-sync.conf` — it is not in the repo.

Customize these fields in `registry.config.json`:

- `registryTagline` — header kicker (for example `Rebtech skill registry`)
- `appName` / `documentTitle` — product name shown in the UI and browser tab
- `appShortName` / `logoUrl` — placeholder initials and optional instance-wide logo fallback
- `companyName` — your organization name
- `defaultWorkspaceId` — default workspace slug/id for publish and install prompts (match existing data if upgrading)
- `registryPublicUrl` — public registry URL used in generated CLI install commands
- `loginSubtitle`, `overviewHeading`, `overviewDescription`, and other UI strings

The server merges your file over built-in defaults and exposes the result at `GET /api/config`; the web UI loads it on startup. If the file is missing, the app runs with code defaults and logs a warning.

Admins can also set a workspace-specific logo from **Team → Workspace branding**. That stored workspace logo overrides `logoUrl` for the active workspace and supports `http(s)` URLs, root-relative paths, and base64 image data URLs for PNG, JPEG, GIF, WebP, or SVG images.

**Containers:** place `registry.config.json` on the build host before `docker build` (it is copied into the image), mount it as a volume, or set `SKILL_LIBRARY_CONFIG_PATH` to a mounted path.

**Migrating an older fork** that committed `registry.config.json`: keep your values in the local file, then `git rm --cached registry.config.json` and sync upstream so `.gitignore` applies. Remove `registry.config.json` from `FORK_LOCAL_PATHS` in `fork-sync.conf` if present.

## Roles and admin bootstrap

The first Microsoft SSO sign-in becomes **Admin** automatically. Later sign-ins start as **Viewer** until promoted in the Admin tab. Role names in the UI map to internal values as Viewer (`user`), Editor (`maintainer`), and Admin (`admin`). See [user-guide.md](user-guide.md) and [security.md](security.md).

## Deploy from the fork

After syncing, push to your fork's default branch. Your CI/CD pipeline should build and deploy from that remote (for example Azure DevOps `Assets/skill-library`), not from the public GitHub repo.
