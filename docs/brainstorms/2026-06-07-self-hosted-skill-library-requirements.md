# Self-hosted skill library for company agent workflows

> **Brainstorm:** docs/brainstorms/2026-06-07-self-hosted-skill-library-requirements.md
> **Status:** Requirements  ·  **Depth:** Standard

## Problem

Agent skills are valuable, but inside real work environments they are scattered across repos, machines, teammates, and agent-specific settings folders. Copies drift, different people end up on different versions, updates happen individually, and non-technical users cannot easily discover or install them without help.

The counterfactual is continued manual sharing: ZIPs, copied folders, one-off setup prompts, and undocumented local edits. That keeps technical users moving in the short term, but it prevents reliable team-wide distribution and makes non-technical access dependent on a technical intermediary.

This should be open source software authored by Ossian as a private person, while still being useful inside company environments. The registry is not a public marketplace for publishing skills to the world; it is software a company can self-host for its own internal skill catalog.

## Who & when

The product serves two audiences from the start:

- **Non-technical company users** who need to browse, understand, and install approved skills without knowing where each agent stores its skill folders.
- **Technical users and agents** who need CLI, API, or MCP access to search, install, update, validate, and report skill state.

The key moment is when a person or agent needs a known-good skill installed or updated across one or more agent environments. A secondary moment is when a skill author or maintainer wants to publish a new internal skill version and make it discoverable.

## Value & success criteria

This works if a company can keep a shared internal skill catalog where:

- Users can find approved skills and understand what they do.
- Skills install through a repeatable flow instead of copy-paste folder sharing.
- Installed skills carry enough metadata to detect origin, version, and staleness.
- Maintainers can validate packages before publishing them.
- Teams can see adoption and update status across skills.
- Non-technical users have a viable web-first path, even if the local installation work is delegated to an agent or helper.

The strongest success signal is reduced version drift: a maintainer can answer which skills are current, which installs are stale, and what version a user or agent has.

## Approach

Build a self-hosted internal registry for full open-skill packages. A skill package is a canonical agent-neutral directory with a required `SKILL.md` and optional bundled scripts, markdown files, references, assets, and subdirectories. Since agents support the same open skill format, "support all agents" means supporting the right installation destinations and workflows, not producing separate package variants.

The web interface is the main discovery and management surface. It should let users browse skills, read human-facing descriptions, preview package contents, see validation status, choose install targets, and publish or approve new skill versions.

The CLI is the default installation and update mechanism. It installs skills directly into the chosen agent's global skill root by default, with project-specific install as an explicit option. Installed packages should include generated registry metadata such as source registry, package ID, version, and install time. That metadata enables update checks, stale install detection, and adoption reporting without changing the open skill format authors write.

For non-technical users, the web UI should generate a one-time setup or install prompt that can be copied into their local agent. The agent can then run the CLI/helper locally and perform the filesystem work. If that is unavailable, the web UI can provide a ZIP download as a fallback, but ZIP should not be the ideal path because it reintroduces drift.

Publishing should support both direct web upload and Git import. Direct upload is first-class for accessibility; Git import is preferred when teams want stronger provenance. Published versions are immutable. New uploads create new versions. Workspace maintainers can approve, hide, or deprecate versions.

Storage should support two deployment modes from the start: bundled PGlite for zero-config local or small-team hosting, and external Postgres for shared company use. External Postgres should include common managed providers such as Azure Database for PostgreSQL, Supabase, Neon, and RDS.

Alternatives considered:

- A public marketplace was rejected for the initial product because company-internal distribution, trust, and private skills are the real pain. Public publishing would add moderation, abuse, namespace, and spam problems too early.
- ZIP-first distribution was rejected as the default because it does not solve update or drift problems.
- A full browser-based skill editor was deferred. It is useful later, but validation, publishing, installation, and version tracking are more important for v1.
- Universal runtime invocation tracking was deferred. It is desirable, but agent-specific and privacy-sensitive enough that it should not block the first version.

## Scope boundaries

- **In:** self-hosted internal catalog.
- **In:** full open-skill package support with required `SKILL.md` and bundled files.
- **In:** package validation before publishing.
- **In:** direct web upload.
- **In:** Git import with provenance.
- **In:** immutable versions, approval, hiding, and deprecation.
- **In:** web browse/preview/install guidance.
- **In:** CLI install and update flow.
- **In:** generated local install metadata for origin, version, and staleness.
- **In:** default install to an agent's global skill root.
- **In:** explicit project-specific installs.
- **In:** ZIP download fallback.
- **In:** registry-side stats for views, downloads, installs, updates, versions, and stale installs.
- **In:** bundled PGlite and configurable external Postgres.
- **Out:** public multi-tenant marketplace.
- **Out:** generic agent asset registry for prompts, slash commands, MCP servers, or subagents.
- **Out:** separate per-agent package variants as the default publishing model.
- **Out:** full browser IDE for editing multi-file skill packages.
- **Out:** guaranteed runtime invocation tracking across every agent.
- **Out:** symlink-based shared local cache as the first installation model.

## Assumptions & open questions

Assumptions:

- The open skill format is stable enough to treat `SKILL.md` plus bundled files as the canonical package shape.
- Agents can install the same package format if the package is placed in the correct destination folder.
- A local CLI/helper can do filesystem installation work more safely and reliably than a hosted browser app.
- Companies will accept a self-hosted registry for private skill catalogs.

Open questions:

- What exact validation rules define a valid skill package beyond the required `SKILL.md`?
- Which agent destinations are supported first, and how are their global and project-specific skill roots discovered?
- Should the one-time local helper be only a CLI, or should there eventually be a small desktop/helper app for non-technical users?
- What authentication model is needed for company use?
- How should install reporting work when users or companies are sensitive about telemetry?
- Which events belong in the optional future invocation tracking model: invoked, suggested, failed, ignored, or session-linked usage?
- What should the future browser-based editor support: metadata only, `SKILL.md` editing, multi-file package editing, or guided skill creation?

## Dependencies

- A clear package validation definition for the open skill format.
- Agent destination knowledge for supported runtimes.
- A CLI or local helper capable of installing, updating, and reporting installed versions.
- A web app with workspace, publishing, approval, and catalog concepts.
- Storage that can run with bundled PGlite or external Postgres.
- Documentation that explains the non-technical setup path clearly enough to copy into an agent.
