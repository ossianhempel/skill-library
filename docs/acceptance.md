# Acceptance Flow

This checklist proves the current self-hosted registry path from maintainer publish through user install, update, and reporting.

## Prerequisites

Build the workspace:

```sh
pnpm build
```

Start a fresh local registry:

```sh
SKILL_LIBRARY_DATA_DIR=/tmp/skill-library-acceptance \
SKILL_LIBRARY_API_KEYS=maintainer-secret:maintainer:maintainer-1,user-secret:user:user-1 \
PORT=3000 \
pnpm --filter @skill-library/server start
```

Open:

```text
http://localhost:3000
```

Health check:

```sh
curl http://localhost:3000/health
```

Expected response includes:

```json
{"ok":true,"mode":"pglite"}
```

## Validate Examples

Valid examples:

```sh
pnpm --filter @skill-library/validation test
```

The test suite reads `examples/skills/review-helper-v1`, `examples/skills/review-helper-v2`, `examples/skills/invalid-missing-skill`, and `examples/skills/invalid-bad-frontmatter`.

Each valid example includes Agent Skills YAML frontmatter (`name`, `description`) in `SKILL.md`. See [validation-rules.md](validation-rules.md) for the full rule catalog.

Preflight validation API check (expect blocking frontmatter error):

```sh
curl -s -X POST http://localhost:3000/api/validation/package-tree \
  -H 'content-type: application/json' \
  -d '{"entries":[{"path":"broken/SKILL.md","content":"# No frontmatter\n"}]}'
```

Expect `validation.ok: false` and a `skill-md-missing-frontmatter` issue in the response.

Bad-frontmatter upload still creates a draft but cannot be approved:

```sh
# After uploading a package whose SKILL.md lacks frontmatter, attempt:
curl -s -X POST http://localhost:3000/api/versions/<version-id>/lifecycle \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer maintainer-secret' \
  -d '{"toState":"approved"}'
```

Expect HTTP 422 with `Cannot approve a version with validation errors.`

## Publish Version 1

Convert `examples/skills/review-helper-v1` into package-tree JSON and upload it:

```sh
node --input-type=module - <<'NODE' > /tmp/review-helper-v1.json
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = "examples/skills/review-helper-v1";
const entries = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path);
    } else {
      entries.push({ path: relative(root, path), content: readFileSync(path, "utf8") });
    }
  }
}
walk(root);
console.log(JSON.stringify({
  packageSlug: "review-helper",
  packageName: "Review Helper",
  description: "Review local code changes.",
  categories: ["review", "quality"],
  version: "1.0.0",
  entries
}));
NODE

curl -sS -X POST http://localhost:3000/api/workspaces/acme/packages/upload \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer maintainer-secret' \
  --data @/tmp/review-helper-v1.json
```

Capture the returned `version.id`, then approve it:

```sh
curl -sS -X POST http://localhost:3000/api/versions/<version-id>/lifecycle \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer maintainer-secret' \
  --data '{"toState":"approved"}'
```

## Install Version 1

Search:

```sh
node packages/cli/dist/index.js workspace --workspace acme --registry http://localhost:3000 --token user-secret
node packages/cli/dist/index.js search --workspace acme --registry http://localhost:3000 --token user-secret review
```

Install into a temporary target:

```sh
mkdir -p /tmp/skill-library-target
node packages/cli/dist/index.js install acme-review-helper \
  --workspace acme \
  --root /tmp/skill-library-target \
  --slug review-helper \
  --target project \
  --registry http://localhost:3000 \
  --token user-secret \
  --report
```

Check status:

```sh
node packages/cli/dist/index.js status \
  --root /tmp/skill-library-target/review-helper \
  --package acme-review-helper \
  --registry http://localhost:3000 \
  --token user-secret
```

Expected state is `current`.

## Publish Version 2 And Update

Repeat the upload step with `examples/skills/review-helper-v2` and `version: "2.0.0"`, approve the returned version, then run status again. Expected state is `stale`.

Update:

```sh
node packages/cli/dist/index.js update \
  --root /tmp/skill-library-target/review-helper \
  --registry http://localhost:3000 \
  --token user-secret
```

Run status again. Expected state is `current`.

## Reporting

Fetch maintainer reports:

```sh
curl -sS http://localhost:3000/api/workspaces/acme/reports \
  -H 'authorization: Bearer maintainer-secret'
```

Expected report fields include views, downloads, version count, latest approved version ID, and deduplicated install-state totals.

## Invalid Package

Upload `examples/skills/invalid-missing-skill` with the same package-tree shape. Expected response is `422` with:

```text
Cannot ingest an invalid skill package artifact.
```

Direct validation should report `required-skill-md`.

## MCP Contract

Run:

```sh
pnpm --filter @skill-library/mcp test
```

Expected coverage includes search, package detail, validation, CLI-backed install plans, and status-report tool contracts.
