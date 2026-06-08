# Validation Rules

Validation runs before package publishing, Git import approval, CLI validation, and MCP validation. The shared validator normalizes directory and zip inputs into the same package-tree shape before applying rules.

## Blocking Errors

- `required-skill-md`: the package must contain exactly one skill root with `SKILL.md`.
- `invalid-path`: every artifact entry must have a file-relative path.
- `path-traversal`: artifact paths cannot include `..` segments or escape the skill root.

Blocking errors prevent ordinary approval and installability.

## Current Warnings

No warning-only rules are implemented yet. Future warning rules should be documented here before being used by publishing flows.

## Artifact Inputs

The validator currently supports:

- directory trees from filesystem/Git import flows
- zip archives from upload/fallback flows
- already-normalized package tree entries from tests, MCP, or future API calls

The output preserves file paths, file sizes, per-file digests, the detected skill root, validation issues, and a deterministic package digest.
