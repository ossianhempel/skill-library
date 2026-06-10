# Open-spec skill validation and publish-flow integration

> **Plan:** docs/plans/2026-06-09-001-feature-open-spec-validation-plan.md
> **Status:** Draft
> **Type:** feature  ·  **Depth:** Standard

## Problem & Scope

Skill Library already validates uploaded packages structurally (one `SKILL.md`, safe paths, deterministic digest) before draft creation, approval, CLI install, and MCP validation. That catches broken folder trees but **not** Agent Skills open-spec compliance: YAML frontmatter, required `name` / `description`, naming rules, and `name` matching the skill directory.

Authors can publish skills that pass today’s validator yet fail in Cursor, Codex, or Claude because frontmatter is missing or malformed. Reviewers see only a coarse “valid / needs attention” message with no actionable rule list.

**In scope**

- Extend the shared validator in `packages/validation` to enforce the [Agent Skills specification](https://agentskills.io/specification) for `SKILL.md` (frontmatter + required fields + naming rules + directory match).
- Propagate richer validation output through all existing call sites (server upload/import, approval gate, CLI, MCP, standalone validate API).
- Improve web publish/read UX so authors and reviewers see **specific issues** before and after upload.
- Update example skills, validation docs, and acceptance checklist to match the new rules.

**Out of scope**

- In-browser skill editor or direct mutation of approved version content.
- Validating optional/experimental fields beyond documented spec (`allowed-tools`, agent-specific extensions) except as **warnings**.
- Retroactive re-validation or auto-rejection of already-approved historical versions (immutable artifacts stay as published).
- Hosted MCP upload tools (separate track).
- Registry package metadata (`packageName`, `description` from the publish form) auto-synced from frontmatter (nice follow-up, not this plan).

## Requirements Traceability

- **R1** — Validate packages before publishing, including direct upload and Git import. — _docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md_
- **R2** — Treat a full open-skill directory with required `SKILL.md` and bundled files as the canonical package shape. — _docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md_
- **R3** — Treat validation as a shared library invoked by web upload, Git import, CLI validation, and MCP validation. — _docs/plans/2026-06-07-001-feature-self-hosted-skill-library-plan.md (D4)_
- **R4** — Block approval and artifact ingestion when validation has blocking errors. — _existing server behavior + this conversation_
- **R5** — Surface actionable validation output to authors and reviewers in the web UI. — _this conversation_
- **R6** — Align documented rules and example fixtures with the Agent Skills spec. — _this conversation_

## Specification

### User Stories

1. As a **skill author**, I want upload validation to reject packages whose `SKILL.md` lacks valid frontmatter, so that I fix format issues before maintainers review them.
2. As a **skill author**, I want clear error messages pointing at the rule and file path, so that I know exactly what to change.
3. As a **maintainer**, I want invalid drafts to remain visible with their validation issues, so that I can reject or send back feedback without losing the submission record.
4. As a **maintainer**, I want approval blocked when blocking validation errors exist, so that non-compliant skills never become install candidates.
5. As a **technical user**, I want `skill-library validate` and MCP `validatePackage` to return the same results as the server, so that I can check locally before publishing.
6. As a **reviewer**, I want the catalog detail pane to list validation issues (errors and warnings), not just a pass/fail sentence, so that review is fast.
7. As an **author uploading via Git import**, I want the same open-spec rules applied as web upload, so that there is one standard.
8. As a **company admin**, I want validation rules documented in `docs/validation-rules.md`, so that authors know the bar before publishing.
9. As an **author**, I want example skills in the repo to pass the new validator, so that I can copy a known-good template.
10. As an **author**, when my `name` frontmatter does not match the skill folder name, I want a blocking error, so that installed skills work across agents that expect directory/name alignment.

### Behavioral Contract

**Validator input** remains normalized package-tree entries (directory, zip, or API/MCP payload). **Validator output** remains `ValidationResult` from `packages/domain`: `ok`, `skillRoot`, `files`, `digest`, `issues[]` with `ruleId`, `severity`, `message`, optional `path`.

**New blocking rules** (errors — `ok: false`, no artifact ingest, no approval):

| ruleId | Condition |
|--------|-----------|
| `skill-md-missing-frontmatter` | `SKILL.md` at detected skill root does not start with parseable YAML frontmatter delimited by `---`. |
| `skill-md-missing-name` | Frontmatter lacks non-empty `name`. |
| `skill-md-missing-description` | Frontmatter lacks non-empty `description`. |
| `skill-md-invalid-name-format` | `name` violates spec: 1–64 chars, lowercase `a-z` / `0-9` / `-`, no leading/trailing hyphen, no `--`. |
| `skill-md-invalid-description-length` | `description` empty or longer than 1024 characters. |
| `skill-md-name-directory-mismatch` | Frontmatter `name` does not equal the skill root directory basename (when skill root is not `.`, compare to last path segment; when root is `.`, compare to the single directory implied by upload layout or require explicit folder — see D3). |

**New non-blocking rules** (warnings — `ok` may still be true if no errors):

| ruleId | Condition |
|--------|-----------|
| `skill-md-body-empty` | Markdown body after frontmatter is empty or whitespace-only. |
| `skill-md-body-large` | Body exceeds recommended size (default threshold 5000 tokens approximated by character count with documented constant). |
| `skill-md-slug-package-mismatch` | Optional: when publish metadata includes `packageSlug`, warn if it differs from frontmatter `name` (does not block). |

Existing structural rules (`required-skill-md`, `invalid-path`, `path-traversal`) stay blocking.

**Integration contract** (unchanged seams, richer payload):

- `POST /api/validation/package-tree` → `{ validation }`
- `POST /api/workspaces/:id/packages/upload` → creates draft with embedded `validation`; 201 even when invalid (current behavior); no artifact when invalid
- `POST /api/workspaces/:id/packages/import-git` → same
- `POST /api/versions/:id/lifecycle` with `approved` → 422/400 when `validation.ok === false`
- CLI `validate` / MCP `validatePackage` → same `ValidationResult` JSON
- Web catalog detail → renders `validation.issues` list grouped by severity

**Testing principle:** assert behavior through `validatePackageTree` and HTTP/CLI/MCP seams; do not test private parser helpers directly unless they are exported for reuse.

## Key Technical Decisions

- **D1 — Spec source of truth:** Implement against [agentskills.io/specification](https://agentskills.io/specification) required frontmatter rules. _Rationale:_ Matches Cursor/Codex/Claude Agent Skills; already referenced in project brainstorm as “open-skill format.”_

- **D2 — Single validation pipeline:** Add a `validateSkillMd(content, skillRootPath)` step inside `validatePackageTree` after structural checks and skill-root detection; do not fork validation in server/web/CLI. _Rationale:_ D4 from original plan — one library, consistent results everywhere._

- **D3 — Skill root `.` vs named folder:** When `skillRoot === "."`, derive expected `name` from the sole top-level directory if entries are nested (e.g. `review-helper/SKILL.md` → expected name `review-helper`). Reject ambiguous layouts (multiple top-level skill candidates). _Rationale:_ Web upload often flattens or preserves folder names; spec requires name ↔ directory match._

- **D4 — Frontmatter parsing:** Add a lightweight YAML frontmatter parser dependency (e.g. `yaml` package) limited to the frontmatter block only; reject non-mapping root values. _Rationale:_ Hand-rolled parsing is error-prone for edge cases; full YAML lib is acceptable for frontmatter-only scope._

- **D5 — Errors vs warnings:** Required spec violations are **errors**; body size/empty body and slug mismatch are **warnings** so teams can publish with reviewer awareness. _Rationale:_ Unblocks gradual adoption without silently accepting broken frontmatter._

- **D6 — No retroactive enforcement:** Do not re-run new rules against already-approved versions in storage. _Rationale:_ Versions are immutable; changing validity would confuse install reports without a migration story._

- **D7 — Web preflight:** Add optional client-side validate call (`POST /api/validation/package-tree`) before upload when entries are staged, showing issues in Publish tab without waiting for draft creation. _Rationale:_ Faster author feedback; server remains authoritative on upload._

Open questions:

- Should `packageSlug` on upload **default** from frontmatter `name` when omitted? (Defer — out of scope unless cheap during U5.)
- Exact body-size threshold: characters vs estimated tokens? (Pick characters with constant in validation module; document in rules.)

## High-Level Design

```
PackageTreeEntry[]
        │
        ▼
validatePackageTree()
  ├─ path rules (existing)
  ├─ findSkillRoot() (existing)
  ├─ validateSkillMd()  ← NEW (frontmatter + spec)
  ├─ optional slug warning (publish context — future hook)
  └─ digest + ValidationResult
        │
        ├─ server createUploadedVersion / createGitImportedVersion
        ├─ server ingestArtifact (blocks when !ok)
        ├─ server transitionVersion approve gate
        ├─ POST /api/validation/package-tree
        ├─ CLI validate
        └─ MCP validatePackage
```

Web UI adds a validation panel component fed by `ValidationResult.issues`, used in Publish (preflight) and Catalog detail (persisted version validation).

## Implementation Units

### U1 — Codify open-spec rule catalog in docs and domain

- **Goal:** Single documented rule list that implementation and UI will reference.
- **Depends on:** none
- **Files:** `docs/validation-rules.md`, `packages/domain/src/index.ts` (optional exported `VALIDATION_RULE_IDS` constant or comment-only — prefer docs as source, domain unchanged unless adding typed ruleId union)
- **Approach:** Expand `docs/validation-rules.md` with full error/warning tables, spec link, examples of passing/failing `SKILL.md`. Add short comment in validation package pointing to doc. Decide whether to type `ruleId` as union in domain (recommended for UI labels) without changing persisted JSON shape.
- **Test scenarios:**
  - Given the updated doc, when a developer reads `docs/validation-rules.md`, then every implemented ruleId in U2 is listed with severity and message intent.
  - Test expectation: none — documentation-only unit (verified by review checklist in Verification).
- **Verification:** Doc review; rule IDs in U2 match doc exactly.

### U2 — Implement `SKILL.md` frontmatter validation in shared library

- **Goal:** `validatePackageTree` enforces Agent Skills frontmatter rules at the detected skill root.
- **Depends on:** U1
- **Files:** `packages/validation/package.json`, `packages/validation/src/index.ts`, `packages/validation/src/skill-md.ts` (new), `packages/validation/src/index.test.ts`, `packages/validation/src/skill-md.test.ts` (new)
- **Approach:** Extract frontmatter parse + field validation into `skill-md.ts`. Call from `validatePackageTree` once skill root and `SKILL.md` content are known. Append issues with paths like `{skillRoot}/SKILL.md`. Keep deterministic digest logic unchanged for identical valid artifacts. Add dependency for safe YAML frontmatter parse.
- **Test scenarios:**
  - Given a package with valid frontmatter and matching directory name, when validated, then `ok: true` and no error issues.
  - Given `SKILL.md` with markdown heading only (no frontmatter), when validated, then `ok: false` and issue `skill-md-missing-frontmatter`.
  - Given frontmatter `name: Bad_Name`, when validated, then `ok: false` and issue `skill-md-invalid-name-format`.
  - Given `name` not equal to parent folder, when validated, then `ok: false` and issue `skill-md-name-directory-mismatch`.
  - Given missing `description`, when validated, then `ok: false` and issue `skill-md-missing-description`.
  - Given valid frontmatter but empty body, when validated, then `ok: true` with warning `skill-md-body-empty`.
  - Given existing structural failure (no `SKILL.md`), when validated, then structural errors still reported and frontmatter step skipped or reports nothing duplicate.
- **Verification:** `pnpm --filter @skill-library/validation test`

### U3 — Update fixtures and example skills to spec-compliant shape

- **Goal:** Repo examples and invalid fixture reflect new rules.
- **Depends on:** U2
- **Files:** `examples/skills/review-helper-v1/SKILL.md`, `examples/skills/review-helper-v2/SKILL.md`, `examples/skills/invalid-missing-skill/` (keep), new `examples/skills/invalid-bad-frontmatter/` (optional), `docs/acceptance.md`
- **Approach:** Add spec-compliant frontmatter to valid examples (`name`, `description` aligned with folder names). Add one invalid example for bad frontmatter if useful for acceptance. Update acceptance “Validate Examples” section to mention frontmatter checks.
- **Test scenarios:**
  - Given `examples/skills/review-helper-v1`, when validated, then `ok: true`.
  - Given `examples/skills/invalid-missing-skill`, when validated, then `required-skill-md` error.
  - Given new bad-frontmatter example (if added), when validated, then appropriate frontmatter error.
- **Verification:** `pnpm --filter @skill-library/validation test` (example suite) + acceptance doc commands

### U4 — Server integration and approval gate hardening

- **Goal:** Upload, Git import, ingest, lifecycle, and standalone validate API all use extended validator without behavior drift.
- **Depends on:** U2
- **Files:** `apps/server/src/index.ts`, `apps/server/src/http.ts`, `apps/server/src/http.test.ts`, `apps/server/src/index.test.ts`
- **Approach:** Confirm `createUploadedVersion`, `createGitImportedVersion`, `ingestArtifact`, and `transitionVersion` already call `validatePackageTree` — add/adjust tests for frontmatter failures. Ensure invalid uploads still return 201 with `validation.ok: false` and no stored artifact. Ensure approve returns error when frontmatter invalid. Add HTTP test covering `POST /api/validation/package-tree` with bad frontmatter JSON.
- **Test scenarios:**
  - Given upload entries with invalid frontmatter, when `POST .../upload`, then 201, `validation.ok: false`, no downloadable artifact digest.
  - Given invalid draft, when lifecycle `approved`, then error and state unchanged.
  - Given valid spec-compliant upload, when approved, then success (regression).
  - Given `POST /api/validation/package-tree` with bad entries, when called, then 200 with issues array containing frontmatter rule IDs.
- **Verification:** `pnpm --filter @skill-library/server test`

### U5 — Web UI: validation display and publish preflight

- **Goal:** Authors and reviewers see detailed issues; authors can validate before upload.
- **Depends on:** U2, U4
- **Files:** `apps/web/src/ui.tsx`, `apps/web/src/ui.test.tsx`, `apps/web/src/styles.css`, `apps/web/src/validation-panel.tsx` (new, optional extract)
- **Approach:** Add helper to render `ValidationResult` issues (errors red, warnings amber) with ruleId + message + path. Catalog detail: replace one-line validation copy with issue list from `selected.activeVersion.validation`. Publish tab: after folder staged (or on “Validate” button), call `POST /api/validation/package-tree` with staged entries; show results inline; disable Upload or show strong warning when errors present (product choice: allow upload of invalid draft for maintainer review — **keep current behavior**, upload enabled but preflight shows errors). Update success notice after upload to mention validation status.
- **Test scenarios:**
  - Given validation result with two errors, when rendered, then both messages visible in catalog detail.
  - Given staged files and mock API validate response with errors, when user clicks Validate, then issues shown before upload.
  - Given `validation.ok: true`, when detail renders, then success summary still shown.
- **Verification:** `pnpm --filter @skill-library/web test`

### U6 — CLI and MCP parity + docs

- **Goal:** Local/agent validation paths document and test open-spec rules.
- **Depends on:** U2
- **Files:** `packages/cli/src/index.test.ts`, `packages/mcp/src/index.test.ts`, `docs/cli.md`, `docs/mcp.md`, `docs/publishing.md`, `docs/user-guide.md` (publish section)
- **Approach:** Add one CLI test fixture with bad frontmatter via temp directory. Extend MCP validatePackage test similarly. Update publishing/user docs to state frontmatter is required and link to validation-rules.
- **Test scenarios:**
  - Given CLI `validate --root` on spec-invalid folder, when run, then exit non-zero or JSON with `ok: false` (match existing CLI behavior for invalid).
  - Given MCP `validatePackage` with invalid entries, when called, then returns frontmatter issue in validation payload.
- **Verification:** `pnpm --filter @skill-library/cli test` and `pnpm --filter @skill-library/mcp test`

### U7 — End-to-end acceptance and root verify

- **Goal:** Confidence that publish → review → approve path respects open-spec validation.
- **Depends on:** U3, U4, U5, U6
- **Files:** `docs/acceptance.md`
- **Approach:** Add acceptance steps: validate bad frontmatter via API (expect fail), upload spec-compliant skill (expect pass), attempt approve on invalid draft (expect fail). Run root `pnpm verify`.
- **Test scenarios:**
  - Given acceptance checklist executed on local server, when bad-frontmatter upload then approve attempted, then approval rejected.
  - Given spec-compliant example upload and approve, when installed via CLI smoke, then success (existing path).
- **Verification:** `pnpm verify` + manual acceptance checklist

## Risks & Mitigations

- **Breaking existing drafts/examples** — Valid examples updated in U3; already-approved production skills untouched (D6). Authors with in-flight drafts may need to republish with frontmatter.
- **YAML parse differences** — Restrict parser to frontmatter block; fail closed with `skill-md-missing-frontmatter` on parse errors.
- **Web upload folder layout ambiguity** — D3 rules for `.` vs named root; test both browser `webkitdirectory` layouts in U5.
- **False sense of security on warnings** — Document that warnings do not block approval; reviewers should read warning list in UI.

## Alternatives Considered

- **JSON Schema for frontmatter** — Rejected for v1; spec rules are small and readable as explicit validators; schema adds tooling weight.
- **Block upload entirely on validation errors** — Rejected; keep invalid inspectable drafts for maintainer feedback (existing pattern).
- **Only validate on approve** — Rejected; authors need earlier feedback (preflight + validate API).

## Deferred / Out of Scope

- Auto-populate publish form `packageSlug` / `packageName` / `description` from parsed frontmatter.
- Validation of bundled script syntax (TypeScript, shell).
- Per-agent extension fields (`when_to_use`, hooks) beyond optional warnings.
- Re-validation migration job for historical approved versions.
- MCP/web upload tools (publish via agent).

## Sources

- [Agent Skills Specification](https://agentskills.io/specification) — frontmatter requirements, naming rules
- `docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md` — R2/R3 validation before publish
- `docs/plans/2026-06-07-001-feature-self-hosted-skill-library-plan.md` — shared validation library (U3/U4/U9)
- `docs/validation-rules.md` — current structural rules baseline
- `packages/validation/src/index.ts` — existing validator seam
- `apps/server/src/index.ts` — upload/import/approve integration points
- This conversation — open-spec gap analysis and UI requirements
