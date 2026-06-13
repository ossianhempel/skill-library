# Skill Library

Self-hosted registry for company skill packages. Teams publish agent skills, review drafts, approve installable versions, and install them through the CLI or MCP.

## Quick start

```sh
pnpm install
pnpm verify
pnpm --filter @skill-library/server start
```

Open the web UI at `http://localhost:3000`. In production, deploy as a single container with a persistent `/data` volume. See [docs/deployment.md](docs/deployment.md).

## Documentation

| Doc                                                    | What it covers                                |
| ------------------------------------------------------ | --------------------------------------------- |
| [docs/user-guide.md](docs/user-guide.md)               | Sign-in, roles, publishing, approval, install |
| [docs/forking.md](docs/forking.md)                     | Company forks, branding config, upstream sync |
| [docs/deployment.md](docs/deployment.md)               | Container, Postgres/PGlite, env vars          |
| [docs/security.md](docs/security.md)                   | SSO, API keys, permissions                    |
| [docs/publishing.md](docs/publishing.md)               | Upload, Git import, lifecycle states          |
| [docs/cli.md](docs/cli.md)                             | CLI install and search                        |
| [docs/api.md](docs/api.md)                             | HTTP API reference                            |
| [docs/agent-skills-spec.md](docs/agent-skills-spec.md) | Official Agent Skills specification pointer   |

## Sign-in and roles

The web app uses **Microsoft Entra ID SSO** (Better Auth). The **first person to sign in** becomes **Admin** automatically so the registry can be bootstrapped without manual setup. Everyone who signs in after that starts as **Viewer** until an Admin promotes them in the Admin tab.

| UI label   | Role         | Can do                                            |
| ---------- | ------------ | ------------------------------------------------- |
| **Viewer** | `user`       | Browse approved skills, install, publish drafts   |
| **Editor** | `maintainer` | Approve, hide, and deprecate skills; view reports |
| **Admin**  | `admin`      | Manage teammate roles plus all editor actions     |

**Draft → approve flow:** any signed-in teammate can upload a draft. **Editors and Admins** approve drafts from the Catalog page; only approved skills appear for installation.

CLI and MCP continue to use bearer API keys (`SKILL_LIBRARY_API_KEYS`). See [docs/security.md](docs/security.md).

## Company deployments

Forks customize copy and defaults in **gitignored** `registry.config.json` (copy from `registry.config.example.json` via `./scripts/setup-instance-config.sh`). Upstream merges never overwrite instance config.

**Staying current with OSS:** run `./scripts/check-upstream-drift.sh` locally or on a weekly CI schedule; merge with `./scripts/sync-from-upstream.sh --verify --push`. Full workflow: [docs/forking.md](docs/forking.md).

## License

Private / internal use. See repository owner for terms.
