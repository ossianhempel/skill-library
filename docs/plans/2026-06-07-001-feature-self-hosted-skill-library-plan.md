# Self-hosted skill library for company agent workflows

> **Plan:** docs/plans/2026-06-07-001-feature-self-hosted-skill-library-plan.md
> **Status:** In progress
> **Type:** feature  ·  **Depth:** Deep

## Problem & Scope

Companies need a self-hosted internal catalog for open-skill packages so non-technical users, technical users, and agents can discover, install, update, validate, and report skill state without copy-paste folder sharing. The product should be authored as open source software by Ossian, but designed for company-internal hosting and private catalogs rather than public marketplace distribution.

In scope: an initial app scaffold, package validation, immutable registry versions, web discovery and publishing, CLI installation and update flows, generated install metadata, API and MCP access, adoption and staleness reporting, ZIP fallback downloads, and deployment as a single default app container with bundled PGlite or configurable external Postgres.

Out of scope: a public multi-tenant marketplace, generic registry support for prompts/slash commands/MCP servers/subagents, separate per-agent package variants, a browser-based multi-file skill IDE, guaranteed runtime invocation tracking, and symlink-based shared local cache installs.

## Requirements Traceability

- **R1** — Provide a self-hosted internal skill catalog for company environments, not a public marketplace. — _docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md_
- **R2** — Treat a full open-skill directory with required `SKILL.md` and bundled files as the canonical package shape. — _docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md_
- **R3** — Validate packages before publishing, including direct upload and Git import paths. — _docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md_
- **R4** — Store immutable package versions with approval, hidden, and deprecated lifecycle states. — _docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md_
- **R5** — Provide web-first discovery, package previews, validation status, install target selection, install prompts, and ZIP fallback downloads. — _docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md_
- **R6** — Provide CLI install and update flows that default to global agent skill roots and allow explicit project-specific installs. — _docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md_
- **R7** — Write local registry metadata during install so origin, package ID, version, install time, and staleness can be detected. — _docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md_
- **R8** — Support technical access through CLI, API, and MCP for search, install, update, validate, and state reporting. — _docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md_
- **R9** — Track registry-side stats for views, downloads, installs, updates, versions, and stale installs while keeping telemetry choices explicit. — _docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md_
- **R10** — Support bundled PGlite for local or small-team hosting and configurable external Postgres for company hosting. — _docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md_
- **R11** — Document a non-technical setup path where the web UI generates a one-time prompt a user can hand to their local agent/helper. — _docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md_

## Specification

### User Stories

1. As a non-technical company user, I want to browse approved skills by name, description, status, and category, so that I can find a skill without knowing where it lives in Git or on disk.
2. As a non-technical company user, I want to read a human-facing skill page with package contents and validation status, so that I can decide whether a skill is appropriate before installing it.
3. As a non-technical company user, I want the web UI to generate a one-time install prompt for my agent, so that the local agent can perform filesystem installation work for me.
4. As a non-technical company user, I want a ZIP fallback download, so that I can still access a skill if the CLI/helper path is unavailable.
5. As a technical user, I want a CLI search command, so that I can discover internal skills from the terminal or agent workflow.
6. As a technical user, I want a CLI install command that defaults to known global agent skill roots, so that standard installs are repeatable and require minimal flags.
7. As a technical user, I want an explicit project install option, so that I can vendor skills into a repo when project-local behavior is needed.
8. As a technical user, I want a CLI update command, so that stale installed skills can be brought to the latest approved version.
9. As a technical user, I want a CLI status command, so that I can report installed package versions and detect drift.
10. As a skill maintainer, I want to upload a skill directory or archive through the web UI, so that non-Git users can publish internal skill versions.
11. As a skill maintainer, I want to import from Git with provenance, so that teams with source-controlled skills can publish from a trusted origin.
12. As a skill maintainer, I want validation failures to identify the failing rule and file path, so that I can fix packages before publishing.
13. As a workspace maintainer, I want to approve, hide, or deprecate package versions, so that users only install versions that match current company policy.
14. As a workspace maintainer, I want published versions to be immutable, so that a version installed yesterday means the same thing today.
15. As a workspace maintainer, I want adoption and stale install reports, so that I can answer which skills are current and which need updates.
16. As an agent, I want MCP tools for search, fetch, install guidance, validation, and status reporting, so that I can participate in the workflow without scraping the web UI.
17. As a self-hosting admin, I want a zero-config PGlite mode, so that I can evaluate or run a small deployment without provisioning external infrastructure.
18. As a self-hosting admin, I want external Postgres support, so that a company deployment can run on managed providers such as Azure Database for PostgreSQL, Supabase, Neon, or RDS.
19. As a privacy-sensitive company, I want install reporting to be explicit and configurable, so that telemetry does not surprise users or leak sensitive local paths.
20. As a self-hosting admin, I want the default deployment to run as one container with one persistent data volume, so that I can operate the registry without assembling a multi-service stack.

### Behavioral Contract

The registry owns packages, immutable versions, validation results, approval lifecycle, artifact storage, install events, update events, view/download events, and stale status reports. A package is a logical skill identity. A version is a content-addressed immutable package artifact with metadata, provenance, lifecycle state, and validation output.

Skill package contract:

- A package artifact is a directory tree or archive that expands to one root skill directory.
- `SKILL.md` is required at the skill root.
- Bundled scripts, references, markdown files, assets, and nested directories are preserved.
- Authored package content remains agent-neutral; registry install metadata is generated locally during installation and is not part of the authored package.

Version lifecycle contract:

- Draft/imported versions can fail validation and remain unpublished.
- Valid versions can be published but are not installable by default until approved, unless workspace policy allows auto-approval.
- Approved versions are installable.
- Hidden versions are omitted from ordinary browse/search but remain addressable for already-installed users and maintainers.
- Deprecated versions remain downloadable only when policy permits and should surface replacement guidance where available.
- Version content never mutates; corrections create a new version.

Install metadata contract:

- Local installs include generated registry metadata containing at least registry URL, workspace ID or slug, package ID, version ID, content digest, install target, install time, installer version, and optional report consent state.
- Status checks compare local metadata against the registry's latest approved version and report current, stale, deprecated, hidden, unknown registry, missing metadata, and modified-local-content states.

Testing principle: assert behavior at the highest stable seam for each surface. Registry behavior should be tested through API/service calls, web behavior through user-visible flows, CLI behavior through command execution against a disposable filesystem root, and MCP behavior through tool-call contracts.

## Key Technical Decisions

- **D1** — Build a TypeScript monorepo with shared domain packages, a web app, an API/server package, a CLI package, and an MCP package. _Rationale:_ The product needs shared validation, package metadata, and API contracts across web, CLI, and MCP; TypeScript keeps those contracts portable without duplicating models.
- **D2** — Use Postgres-compatible persistence through an adapter that supports bundled PGlite and external Postgres from the same migration path. _Rationale:_ The requirements call for zero-config small deployments and managed company deployments; one schema and migration track avoids divergent storage behavior.
- **D3** — Store package artifacts by content digest outside relational rows, with database records holding metadata, lifecycle state, provenance, and validation summaries. _Rationale:_ Immutable artifacts are binary/file-tree concerns; metadata and reporting need queryable relational state.
- **D4** — Make validation a shared library invoked by web upload, Git import, CLI validation, and MCP validation. _Rationale:_ Validation rules must be consistent across every publishing and automation path.
- **D5** — Treat the CLI as the primary local filesystem actor. _Rationale:_ Hosted web apps cannot safely write local agent skill roots; a local CLI/helper can handle path detection, install metadata, and update checks.
- **D6** — Add API-first behavior before polishing web-only flows. _Rationale:_ The web UI, CLI, and MCP all need the same registry operations, and API contracts make feature behavior testable without browser-only coupling.
- **D7** — Keep install reporting opt-in or policy-configurable at workspace level. _Rationale:_ Adoption/staleness reporting is a core success signal, but telemetry has privacy and trust implications in company environments.
- **D8** — Support Codex, Claude, and OpenClaw-style destinations first via a destination registry, with additional agents added as data/config rather than package variants. _Rationale:_ The requirements call for broad agent support through installation destinations, not separate package formats.
- **D9** — Treat the single-container PGlite deployment as the reference topology. _Rationale:_ Small teams should be able to self-host with one app container and one persistent volume; external Postgres should be a configuration swap for larger company deployments, not a separate product mode.

Open questions:

- Which authentication system should v1 use for company hosting: email/password, magic links, OAuth/OIDC, SSO-first, or pluggable auth?
- What exact validation rules beyond required `SKILL.md` should block publishing versus warn?
- Should direct web upload accept only archives at first, or also browser directory upload?
- What local path data, if any, may be included in install reports?
- Should workspaces allow unapproved-but-valid versions to be installed by maintainers only?

## High-Level Design

The system has four main surfaces sharing one domain core.

The registry server exposes HTTP API routes for catalog search, package/version details, upload/import, validation, lifecycle moderation, artifact downloads, install prompt generation, health checks, and telemetry/reporting. It stores relational data in PGlite or external Postgres, stores immutable package artifacts by digest, and exposes a small MCP server over the same domain operations.

The reference deployment is one app container serving the web UI, API, upload/download routes, and health checks. In default PGlite mode, relational data and artifacts live under one mounted data directory, for example `/data/db` and `/data/artifacts`. In external Postgres mode, setting `DATABASE_URL` swaps the relational backend while preserving the same app container, base URL, client behavior, and artifact-storage defaults.

The web app is the primary human surface. It consumes the API to show package lists, skill detail pages, previews of package contents, validation results, publishing flows, lifecycle controls, install target selection, copyable agent prompts, and reporting dashboards.

The CLI is the local executor. It talks to the registry API, resolves supported agent destinations, installs package artifacts into global or project-specific skill roots, writes generated install metadata, checks local status, performs updates, and optionally reports install/update/status events.

The MCP server is the agent-native automation surface. It should not duplicate installation logic when the local CLI is required; instead it exposes registry search/fetch/validate/status/reporting tools and returns concrete CLI commands or install plans when filesystem execution must happen locally.

Data flow for install: user or agent selects package and target, registry resolves latest approved version, web or MCP generates install guidance, CLI downloads immutable artifact, CLI validates digest and package shape, CLI writes files to destination, CLI writes generated metadata, and CLI reports the install if reporting is enabled.

Data flow for publishing: maintainer uploads archive or imports Git ref, server normalizes artifact, validation runs, version record is created with validation output, maintainer publishes or requests approval, approver marks version approved, and catalog search exposes it to ordinary users.

## Implementation Units

Progress note, 2026-06-07: U1 scaffold is implemented with a pnpm TypeScript workspace, shared domain contracts, validation/storage/server/web/CLI/MCP package boundaries, architecture docs, and passing root verification. U2 has an initial PGlite/Postgres storage adapter, SQL migrations, `/data` path defaults, storage tests, and deployment docs. U3 has directory/zip artifact readers, artifact zip packing, immutable artifact persistence, server ingestion tests, shared validation tests, and validation-rule docs. U4 has Hono routes for health, catalog search, package detail, version detail/listing, latest approved lookup, validation, ingestion, artifact download, view/download counters, approved-only ordinary catalog filtering, and install report ingestion. U5 has upload publishing, Git import from local/accessible repositories with commit provenance, fresh-workspace default creation, invalid draft records with validation output, lifecycle transition routes with storage lifecycle events, publishing docs, and API-bound web publishing/lifecycle controls. U6 has a React/Vite catalog/detail/install-guidance UI with API-bound catalog/report loading, validation/file previews, lifecycle badges, metrics, CLI prompt, ZIP fallback links, publishing console, reporting dashboard, tests, user guide, browser-token support, and local web smoke checks. U7 has CLI destination resolution, package-tree file installation, HTTP registry client with bearer token support, workspace config lookup, latest-approved artifact download/install flow, workspace reporting-policy enforcement, unmanaged overwrite safety, generated install metadata helpers, local content modification detection, status classification, local validate command, update orchestration for stale managed installs, user-facing command runner for workspace/search/info/install/validate/update/status/install-plan, tests, and CLI docs. U8 has maintainer report aggregates for package/workspace views, downloads, version counts, latest approved version, deduplicated latest install-state totals, HTTP tests, API docs, privacy/reporting docs, and dashboard summary helpers. U9 has MCP tool helpers for search, package detail, validation, CLI-backed install plans, status-report submission, HTTP-backed registry access, a stdio JSON-RPC transport, tests, docs, and a tool-list smoke check. U10 has API-key bearer auth via `SKILL_LIBRARY_API_KEYS`, development header fallback, actor/role parsing, private workspace browse enforcement, admin workspace reporting/visibility settings, maintainer/user route enforcement, authorization tests, and security/API/deployment docs; external SSO and persisted memberships remain future hardening. U11 has a combined Node runtime serving web assets plus API/health routes, Dockerfile, default single-service Compose file, external Postgres override, `.env.example`, deployment docs, operations docs, and local runtime smoke checks. U12 has valid/invalid example skills, validation tests over examples, and a documented end-to-end acceptance flow.

### U1 — Establish the application scaffold and shared contracts

- **Goal:** Create the monorepo foundation for web, API/server, CLI, MCP, shared domain, validation, storage, and tests.
- **Depends on:** none
- **Files:** `package.json`, `pnpm-workspace.yaml`, `apps/web`, `apps/server`, `packages/cli`, `packages/mcp`, `packages/domain`, `packages/validation`, `packages/storage`, `docs/architecture.md`
- **Approach:** Scaffold a TypeScript workspace with consistent linting, formatting, test runner, build scripts, and package boundaries. Define the initial domain vocabulary for package, version, artifact, validation result, lifecycle state, install target, install report, and workspace in shared prose and types.
- **Test scenarios:**
  - Given a fresh checkout, when dependencies are installed and the root verification command runs, then every package builds or typechecks successfully.
  - Given shared domain package imports from web, server, CLI, and MCP, when each workspace package builds, then no package reaches across private source boundaries.
- **Verification:** Run the root build/typecheck/test command and confirm `docs/architecture.md` documents the package boundaries.

### U2 — Add Postgres-compatible storage with PGlite and external Postgres modes

- **Goal:** Implement the registry schema, migrations, and storage adapter for local PGlite and external Postgres.
- **Depends on:** U1
- **Files:** `packages/storage`, `apps/server`, `docs/deployment.md`, `docs/architecture.md`
- **Approach:** Define migrations for workspaces, users or actors, packages, versions, artifacts, validation results, provenance records, lifecycle events, install reports, update reports, view/download events, and destination metadata. Add configuration that chooses bundled PGlite by default and external Postgres through an environment variable. Keep the PGlite data path configurable under the app data directory so the default container needs only one persistent volume.
- **Test scenarios:**
  - Given no database configuration, when the server starts in local mode, then it initializes or opens a PGlite database and applies migrations.
  - Given a Postgres connection string, when the server starts, then it applies the same migrations to external Postgres.
  - Given an existing migrated database, when the server restarts, then migrations are idempotent and no records are lost.
  - Given default container configuration, when the app starts with a mounted `/data` volume, then PGlite and artifact paths resolve inside that volume.
- **Verification:** Run storage tests against PGlite and, where available, an external Postgres test database.

### U3 — Implement immutable artifact ingestion and package validation

- **Goal:** Accept package artifacts, normalize them, validate open-skill package rules, and produce actionable validation output.
- **Depends on:** U1, U2
- **Files:** `packages/validation`, `packages/domain`, `apps/server`, `docs/validation-rules.md`
- **Approach:** Build shared validation that expands archives or receives directory trees, identifies the skill root, requires `SKILL.md`, preserves bundled files, rejects unsafe paths, computes a content digest, and returns errors/warnings with file-relative locations. Document blocking rules versus warnings.
- **Test scenarios:**
  - Given a package with root `SKILL.md` and bundled scripts/assets, when validation runs, then it passes and records preserved file metadata.
  - Given an archive without `SKILL.md`, when validation runs, then it fails with a blocking error that names the missing required file.
  - Given an archive with path traversal entries, when validation runs, then it rejects the artifact before storage.
  - Given two identical artifacts, when ingestion runs, then they produce the same digest and immutable artifact reference.
- **Verification:** Run validation unit tests and server ingestion tests using fixture packages.

### U4 — Build registry API for catalog, versions, lifecycle, and downloads

- **Goal:** Expose the API contract needed by web, CLI, and MCP for browsing and consuming approved skill versions.
- **Depends on:** U2, U3
- **Files:** `apps/server`, `packages/domain`, `packages/storage`, `docs/api.md`
- **Approach:** Add routes or RPC handlers for search, package detail, version detail, artifact download, ZIP fallback download, lifecycle state reads, and event recording for views/downloads. Enforce that ordinary catalog calls show approved installable versions while maintainer calls can inspect hidden/deprecated/non-approved versions.
- **Test scenarios:**
  - Given an approved package version, when an ordinary user searches, then the package appears with its latest approved version.
  - Given a hidden package version, when an ordinary user searches, then it is omitted; when a maintainer fetches it directly, then it is visible.
  - Given an artifact download request, when the digest does not match the stored artifact, then the download is rejected or marked corrupt.
  - Given a view or download event, when it is recorded, then reporting counters include it without mutating version content.
- **Verification:** Run API integration tests against a disposable database and artifact store.

### U5 — Add publishing flows for web upload and Git import

- **Goal:** Let maintainers create immutable versions through direct upload and Git import with provenance.
- **Depends on:** U3, U4
- **Files:** `apps/server`, `apps/web`, `packages/domain`, `docs/api.md`, `docs/publishing.md`
- **Approach:** Implement server-side publishing endpoints for archive upload and Git import. Record provenance for upload actor, Git remote, ref, commit, and import time where available. Keep invalid packages inspectable as failed draft/import records. Add web flows for upload/import, validation result review, publishing, approval, hiding, and deprecation.
- **Test scenarios:**
  - Given a valid uploaded package, when a maintainer publishes it, then a new immutable version is created with validation output.
  - Given the same package ID and a changed artifact, when it is uploaded, then a new version is created instead of mutating the previous version.
  - Given a Git import URL/ref, when import succeeds, then provenance includes the resolved commit.
  - Given validation failure, when the web flow renders results, then blocking errors are visible and the version cannot be approved for ordinary install.
- **Verification:** Run server publishing tests and browser flow tests for upload/import success and failure.

### U6 — Build web catalog, skill detail, preview, and install guidance

- **Goal:** Deliver the main non-technical discovery and install-guidance surface.
- **Depends on:** U4, U5
- **Files:** `apps/web`, `apps/server`, `docs/user-guide.md`
- **Approach:** Build catalog browse/search, skill detail pages, package content previews, validation/lifecycle badges, version history, target selection, copyable one-time agent prompts, and ZIP fallback controls. Keep the first screen as the actual catalog experience, not a marketing landing page.
- **Test scenarios:**
  - Given approved packages, when a user opens the web app, then they can search, filter, and open a skill detail page.
  - Given a skill with bundled files, when a user previews it, then they can inspect the file tree and selected text files without downloading the package.
  - Given an install target choice, when a user generates guidance, then the prompt names the package, version policy, registry URL, target, and CLI/helper action.
  - Given no CLI/helper path, when a user selects fallback, then the ZIP download is available and recorded as a download event.
- **Verification:** Run component tests and browser end-to-end tests for catalog, detail, preview, install guidance, and ZIP fallback.

### U7 — Implement CLI search, install, status, and update

- **Goal:** Provide the repeatable local install and drift-detection mechanism.
- **Depends on:** U3, U4
- **Files:** `packages/cli`, `packages/domain`, `packages/validation`, `docs/cli.md`
- **Approach:** Build CLI commands for registry configuration, search, package info, install, status, update, validate, and report. Add a destination registry for supported agents with global defaults and explicit project roots. During install, download the approved artifact, verify digest, write package files, write generated registry metadata, and avoid overwriting unmanaged local changes without an explicit flag.
- **Test scenarios:**
  - Given a configured registry and global target, when install runs for an approved package, then files and generated metadata are written to the expected skill root.
  - Given an explicit project target, when install runs, then the skill is installed under the project-specific root instead of the global root.
  - Given local metadata for an older version, when status runs, then it reports stale and names the latest approved version.
  - Given local files changed after install, when update runs without force, then it refuses or requires confirmation instead of silently overwriting.
  - Given reporting is disabled, when install completes, then no install report is sent.
- **Verification:** Run CLI integration tests against a disposable registry and temporary filesystem roots.

### U8 — Add install reporting, stale status, and adoption dashboards

- **Goal:** Make version drift visible to maintainers while keeping reporting policy explicit.
- **Depends on:** U2, U4, U7
- **Files:** `apps/server`, `apps/web`, `packages/cli`, `packages/domain`, `docs/privacy.md`
- **Approach:** Record install, update, status, view, download, version, and stale report events. Aggregate per package and workspace. Add workspace reporting settings and a privacy note that describes what is collected. Show dashboards for latest approved version, installed versions, stale counts, deprecated installs, downloads, and update activity.
- **Test scenarios:**
  - Given multiple install reports for different versions, when a maintainer opens a package report, then current and stale installs are counted separately.
  - Given a deprecated version with active installs, when reports render, then the dashboard highlights deprecated installs.
  - Given reporting disabled by workspace or local config, when CLI status runs, then no report is stored.
  - Given repeated status reports from the same install identity, when aggregates update, then counts avoid obvious duplicate inflation.
- **Verification:** Run reporting aggregation tests and web dashboard tests.

### U9 — Expose MCP tools for agent workflows

- **Goal:** Let agents discover, validate, report, and guide installations through MCP without scraping the web UI.
- **Depends on:** U4, U7, U8
- **Files:** `packages/mcp`, `packages/domain`, `docs/mcp.md`
- **Approach:** Add MCP tools for registry search, package detail, latest approved version lookup, validation, install-plan generation, local status report submission, and update guidance. Where filesystem mutation is needed, return explicit CLI commands or structured install plans rather than duplicating local install implementation.
- **Test scenarios:**
  - Given a search query, when the MCP search tool runs, then it returns approved matching packages with version metadata.
  - Given a package and target, when install-plan generation runs, then it returns the intended CLI action and expected metadata behavior.
  - Given a validation request, when the MCP validation tool runs against a package fixture, then it returns the same validation result as the shared validation library.
  - Given a stale local status report, when submitted through MCP, then registry reporting aggregates update.
- **Verification:** Run MCP contract tests and fixture-based tool-call tests.

### U10 — Add authentication, workspace roles, and lifecycle permissions

- **Goal:** Protect company catalogs and enforce roles for publishing, approval, reporting, and ordinary browsing.
- **Depends on:** U4, U5, U8
- **Files:** `apps/server`, `apps/web`, `packages/domain`, `docs/security.md`, `docs/deployment.md`
- **Approach:** Choose and implement the v1 auth model after resolving the open question. Add workspace membership and roles for ordinary user, maintainer, and admin. Enforce permissions around publishing, approving, hiding, deprecating, viewing reports, and changing reporting settings.
- **Test scenarios:**
  - Given an ordinary user, when they attempt to approve a version, then the request is denied.
  - Given a maintainer, when they publish a valid version, then the version is created but lifecycle behavior follows workspace policy.
  - Given an unauthenticated request to a private workspace, when catalog data is requested, then access is denied.
  - Given an admin changes reporting policy, when a CLI reads registry config, then it receives the current reporting policy.
- **Verification:** Run API authorization tests and browser tests for role-gated controls.

### U11 — Package deployment, configuration, and operations docs

- **Goal:** Make the registry runnable by a self-hosting admin as one default app container in local PGlite mode, with external Postgres available through configuration.
- **Depends on:** U1, U2, U4, U6, U7, U9, U10
- **Files:** `Dockerfile`, `docker-compose.yml`, `.env.example`, `docs/deployment.md`, `docs/operations.md`, `docs/user-guide.md`
- **Approach:** Add production build packaging, environment configuration, health checks, artifact storage configuration, database setup instructions, backups, upgrade/migration notes, and examples for PGlite and external Postgres providers. The default compose example should run one app service with one persistent volume mounted at `/data`; external Postgres examples may add a separate database service or point at a managed provider. Document CLI installation and registry URL configuration.
- **Test scenarios:**
  - Given default local configuration, when the compose stack starts, then one app container becomes healthy with the web app, API, PGlite, and artifact storage available.
  - Given an external Postgres URL, when the app starts, then it connects to external Postgres and reports healthy migrations.
  - Given the default compose file, when a user inspects services, then no database service is required for the PGlite path.
  - Given a new CLI user, when they follow setup docs, then the CLI can authenticate/configure the registry and search approved skills.
- **Verification:** Run container build, local compose smoke test, and documentation smoke-through commands where practical.

### U12 — Seed examples and end-to-end acceptance flow

- **Goal:** Prove the complete product with representative skills and a documented maintainer-to-user workflow.
- **Depends on:** U5, U6, U7, U8, U9, U11
- **Files:** `examples/skills`, `docs/acceptance.md`, `apps/web`, `packages/cli`, `packages/mcp`
- **Approach:** Add a small set of valid and invalid example skill packages. Write an end-to-end acceptance script or checklist that imports a valid skill, validates it, approves it, finds it in the web UI, generates install guidance, installs it through the CLI into a temporary target, reports status, updates it after a new version, and shows stale/current reporting.
- **Test scenarios:**
  - Given a valid example skill, when the full publish-to-install flow runs, then the skill reaches an approved installable state and installs with metadata.
  - Given a new approved version after an older install, when status and update run, then stale is detected, update succeeds, and reporting shows current state.
  - Given an invalid example skill, when publishing is attempted, then validation blocks approval and explains the failure.
  - Given an agent using MCP, when it searches and requests an install plan, then it receives enough structured guidance to hand off to the CLI.
- **Verification:** Run the end-to-end acceptance suite/checklist against a fresh local deployment.

## Risks & Mitigations

- Auth can expand the scope quickly. Mitigation: keep auth behind a documented decision point and implement the smallest company-usable model first.
- Agent destination paths may vary by platform and version. Mitigation: use a destination registry with explicit tested destinations and clear unsupported-target errors.
- Reporting can feel like unwanted telemetry. Mitigation: make policy visible, configurable, and reflected in CLI behavior.
- Web upload of directory trees can be inconsistent across browsers. Mitigation: support archive upload first if directory upload proves brittle.
- Git import can introduce credential and network complexity. Mitigation: support public/accessible Git imports first, then add private Git credentials as a separate hardening step.
- Artifact storage may need to move from local filesystem to object storage later. Mitigation: keep artifact persistence behind an adapter from the start.

## Alternatives Considered

- Public marketplace first — rejected because private company catalogs, trust, and internal distribution are the primary problem.
- ZIP-first distribution — rejected because it preserves manual drift and weakens update/status reporting.
- Per-agent package variants — rejected because the open skill package should remain canonical and agent support should live in destination/install workflows.
- Browser-only install flow — rejected because hosted browsers cannot reliably and safely write local agent skill roots.
- Browser-based multi-file skill editor in v1 — deferred because publishing, validation, installation, and drift detection are more important for first value.
- Universal runtime invocation tracking — deferred because it is agent-specific and privacy-sensitive.

## Deferred / Out of Scope

- Public package marketplace, moderation, public namespaces, spam controls, and abuse handling.
- Generic registry assets beyond skills, including prompts, slash commands, MCP servers, and subagents.
- Full browser IDE for authoring and editing multi-file skill packages.
- Desktop helper app for non-technical users beyond the CLI/helper prompt model.
- Symlink-based shared local cache installs.
- Guaranteed cross-agent runtime invocation tracking.
- Private Git provider credential management beyond the first Git import path, unless selected as part of auth design.

## Sources

- `docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md` — settled product requirements, scope boundaries, assumptions, and open questions.
