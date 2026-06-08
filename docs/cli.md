# CLI

The CLI is the local filesystem actor for installing, updating, validating, and reporting skill state.

## Current Foundations

Implemented library behavior:

- global destination registry for Codex, Claude, and OpenClaw
- project destination resolution to `.agents/skills`
- package-tree installation into a resolved destination root
- HTTP registry client for workspace config, search, package detail, latest approved version, artifact download, and install reporting
- latest-approved install flow that downloads a registry artifact, verifies digest, installs files, writes metadata, and optionally reports install state
- update flow that reads existing metadata, checks latest approved version, refuses locally modified updates unless forced, and reinstalls into the existing managed skill root
- local package validation for directories or zip archives
- bearer token support for private catalogs and reporting
- user-facing command runner for `workspace`, `search`, `info`, `install`, `validate`, `update`, `status`, and `install-plan`
- managed-install overwrite safety
- generated install metadata file name: `.skill-library.json`
- metadata read/write helpers
- status classification for missing metadata, current, stale, deprecated, hidden, and modified-local-content states
- install-plan command rendering

## Install Metadata

Each installed skill root receives `.skill-library.json` with:

- registry URL
- workspace ID
- package ID
- version ID
- installed-root content digest
- install target
- install time
- installer version
- report consent state

The current binary supports:

```sh
skill-library workspace --workspace <workspace-id> [--registry <url>] [--token <token>]
skill-library search --workspace <workspace-id> [query] [--registry <url>] [--token <token>]
skill-library info <package-id> [--registry <url>] [--token <token>]
skill-library install <package-id> --workspace <workspace-id> --root <path> [--slug <slug>] [--target <target>] [--force] [--report] [--registry <url>] [--token <token>]
skill-library validate (--root <skill-root> | --archive <zip-path>)
skill-library update --root <skill-root> [--force] [--report] [--registry <url>] [--token <token>]
skill-library status --root <skill-root> [--package <package-id>] [--registry <url>] [--token <token>]
skill-library install-plan <package-slug> [--target <target>]
```

The install path verifies the downloaded artifact against the registry artifact digest before writing files. Metadata stores the digest of the installed skill root, excluding the generated `.skill-library.json` file, so later `status` and `update` checks can detect local content drift.

Before sending install/update reports, the CLI reads workspace reporting policy. `disabled` suppresses reports, `opt-in` follows local consent, and `required` sends reports.

The install path refuses to overwrite an unmanaged existing skill directory unless forced. The update path refuses to overwrite managed but locally modified content unless `--force` is provided.
