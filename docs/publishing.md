# Publishing

Publishing starts with an uploaded package tree or a Git import. Both paths use the same validation, artifact packing, and immutable storage behavior.

## Upload Flow

1. Client posts package metadata and normalized package entries to `POST /api/workspaces/:workspaceId/packages/upload`.
2. Server validates the package with the shared validator.
3. Package metadata is upserted.
4. A draft version is created with upload provenance and validation output.
5. Valid packages are packed as zip bytes and stored immutably by validation digest.
6. Invalid drafts remain inspectable through version routes but do not get a downloadable artifact.

Draft versions are inspectable through version routes but are not latest-approved install candidates.

## Git Import Flow

1. Client posts package metadata and a Git repository path/ref/subdirectory to `POST /api/workspaces/:workspaceId/packages/import-git`.
2. Server resolves the commit with `git rev-parse`.
3. Server exports the commit with `git archive`.
4. Server reads the selected subdirectory as a package tree.
5. Validation, artifact storage, package upsert, and draft-version creation proceed like upload publishing.
6. Provenance records source URL or local path, requested ref, resolved commit, actor ID when provided, and import time.

The current implementation supports local or already-accessible repository paths. Private remote credential management remains deferred.

## Lifecycle Flow

Use `POST /api/versions/:versionId/lifecycle` with a `toState` value:

- `published`
- `approved`
- `hidden`
- `deprecated`
- `draft`

Approved versions receive `approvedAt`. Versions with validation errors cannot be approved. Every transition records a lifecycle event in storage. Permission checks require maintainer role or above.

## Immutability

Version rows are append-only for content identity: artifact digest, validation output, provenance, package ID, and version string are created once. Corrections should create a new version. Lifecycle state can change through explicit transition operations.
