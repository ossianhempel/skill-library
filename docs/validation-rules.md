# Validation Rules

Validation runs before package publishing, Git import approval, CLI validation, and MCP validation. The shared validator normalizes directory and zip inputs into the same package-tree shape before applying rules.

Rules follow the [Agent Skills specification](https://agentskills.io/specification). Implementation lives in `@skill-library/validation`; this document is the rule catalog.

## Blocking Errors

Structural rules (existing):

| ruleId | Condition |
|--------|-----------|
| `required-skill-md` | Package must contain exactly one skill root with `SKILL.md`. |
| `invalid-path` | Every artifact entry must have a file-relative path. |
| `path-traversal` | Artifact paths cannot include `..` segments or escape the skill root. |

Open-spec frontmatter rules (errors):

| ruleId | Condition |
|--------|-----------|
| `skill-md-missing-frontmatter` | `SKILL.md` at the detected skill root does not start with parseable YAML frontmatter delimited by `---`. |
| `skill-md-missing-name` | Frontmatter lacks a non-empty `name`. |
| `skill-md-missing-description` | Frontmatter lacks a non-empty `description`. |
| `skill-md-invalid-name-format` | `name` violates spec: 1–64 chars, lowercase `a-z` / `0-9` / `-`, no leading/trailing hyphen, no consecutive hyphens (`--`). |
| `skill-md-invalid-description-length` | `description` is empty or longer than 1024 characters. |
| `skill-md-name-directory-mismatch` | Frontmatter `name` does not equal the skill root directory basename (when skill root is a named folder, e.g. `review-helper/SKILL.md` requires `name: review-helper`). |

Blocking errors prevent ordinary approval and artifact ingestion.

### Passing `SKILL.md` example

```markdown
---
name: review-helper
description: Review local code changes for correctness and test gaps.
---

# Review Helper

Use this skill when reviewing diffs before merge.
```

### Failing examples

Missing frontmatter (markdown heading only):

```markdown
# Review Helper

No YAML frontmatter block.
```

Invalid name format:

```markdown
---
name: Bad_Name
description: Uses uppercase and underscore in the name field.
---
```

Name does not match folder (`review-helper/SKILL.md` with `name: code-review`):

```markdown
---
name: code-review
description: Name must match the skill directory basename.
---
```

## Warnings

Warnings do not block approval or artifact ingestion. Reviewers should read them during catalog review.

| ruleId | Condition |
|--------|-----------|
| `skill-md-body-empty` | Markdown body after frontmatter is empty or whitespace-only. |
| `skill-md-body-large` | Body exceeds the recommended size threshold (`SKILL_MD_BODY_SIZE_WARNING_CHARS`, default 20_000 characters — approximates ~5000 tokens). |
| `skill-md-slug-package-mismatch` | Publish metadata `packageSlug` differs from frontmatter `name` (when publish context is available). |

## Artifact Inputs

The validator currently supports:

- directory trees from filesystem/Git import flows
- zip archives from upload/fallback flows
- already-normalized package tree entries from tests, MCP, or API calls

The output preserves file paths, file sizes, per-file digests, the detected skill root, validation issues, and a deterministic package digest.
