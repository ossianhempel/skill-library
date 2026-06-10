# Connect & Install Model — Requirements

**Date:** 2026-06-10
**Status:** Draft (brainstorm output, ready for `/ce-plan`)
**Scope:** Deep — product (distribution/onboarding shape for the OSS skill registry)

## Problem

Getting a skill from the registry into an agent today requires a terminal on every path, and no single path actually serves a non-technical person who lives in the Claude app or ChatGPT. The three mechanisms each solve a slice and expose the seams:

- **MCP** discovers but cannot install — it is local-stdio-only and requires `git clone` + `pnpm install` + `pnpm build`, and its `installPlan` tool just returns a CLI command string (`packages/mcp/src/index.ts:116`).
- **CLI** installs, but only to developer folders (`~/.claude/skills`, `~/.codex/skills`, `~/.openclaw/skills`, project `.agents/skills`) and only from a terminal — and the one-time setup is also clone + build.
- **Web** offers copy-paste CLI commands and a ZIP download.

The literal goal — "a non-technical person installs a skill into their Claude app or ChatGPT app" — is **not achievable on any current path**. ChatGPT has no skill-folder concept and supports only remote HTTP MCP connectors; the registry exposes no hosted MCP endpoint, so ChatGPT dead-ends entirely.

## Reframe

For non-technical users, **"install each skill" is the wrong primitive — "connect once" is the right one.** The product should support two coexisting primitives, clearly separated:

- **Connect the library** (primary, all surfaces) — paste one endpoint + token once; the agent searches and uses skills live.
- **Install a skill** (for persisting files to disk) — one command, for Claude Code / Codex users who want skill files locally.

## Goals

- A non-technical user can connect their Claude app or ChatGPT to the library without a terminal, clone, or build.
- The connect step is ~one action (endpoint URL + auth), not a five-platform divergent prompt.
- Developers who want skill files on disk can install with a single command — no clone, no build.
- The web UI's onboarding copy reflects one clear path per surface, not three overlapping mechanisms.

## Non-Goals

- Replacing the local-stdio MCP for power users who already rely on it (it stays, de-emphasized).
- Auto-updating installed skills (existing `status`/`update` CLI behavior is unchanged here).
- Solving discovery/ranking/search quality — this is about the connect/install path only.
- A hosted *public* multi-tenant registry. Instances remain self-hosted, one per company.

## Approach (selected)

**A + B together.**

**A — Hosted remote MCP endpoint (primary connect path).** Add a streamable-HTTP MCP transport to the existing Hono registry server (`apps/server/src/http.ts`), exposing the same tool set over HTTP that stdio exposes today. Users add the registry as a *custom connector* in Claude.ai, Claude Desktop, ChatGPT, Cursor, or Claude Code. One time. No clone, no build, no per-skill install — the agent searches and pulls skills live. This is the only path that serves ChatGPT and the consumer Claude app.

**A is phased, because auth differs by surface (researched 2026-06-10, see Auth findings):**
- **P1 — bearer-header + optional no-auth.** Desktop, Claude Code, and Cursor accept a static `Authorization: Bearer` header — works immediately, no OAuth. An optional **no-auth** mode reaches *every* surface including ChatGPT and Claude.ai web, and is acceptable when the network is the perimeter (VPN/SSO-gated or trusted-LAN instances). This is the cheap day-one unlock.
- **P2 — OAuth for authenticated web surfaces.** Claude.ai web and ChatGPT web **do not accept pasted bearer tokens** — authenticated access there requires OAuth 2.0 (Auth Code + PKCE, Protected-Resource-Metadata discovery, CIMD/DCR client registration). Delegate rather than build: Auth0/Clerk/Keycloak in front, or reuse the existing **Better Auth + Entra** stack (Better Auth exposes OAuth-provider / MCP capability). The MCP server then only serves `/.well-known/oauth-protected-resource` and validates JWTs.

**B — One-command CLI install (install-to-disk path).** Publish the CLI so `npx @skill-library/cli install <slug>` works with zero clone/build, for users who want skill files persisted to a dev folder. Remote MCP cannot write to a user's disk, so B is what covers the "persist files" case A structurally can't.

Why both: A handles *connect/use live* across all surfaces; B handles *persist to disk* for Claude Code/Codex. Neither alone covers the matrix.

## Scope Boundaries

**In scope now**
- HTTP MCP transport on the registry server, reusing existing tool definitions and token auth.
- An auth path that custom-connector UIs actually accept (see open questions — this is the gating risk).
- `npx`-runnable CLI install with no clone/build.
- Rewritten web onboarding copy: "Connect the library" (primary) vs "Install a skill" (disk), per surface.

**Deferred for later**
- Web "one-click per surface" polish (download-as-Claude-Skill zip, prefilled connector buttons) — layers on top of A once it exists (was Approach C).
- An MCP tool that returns skill contents for the Claude Code agent to write to disk itself (an alternative to B's CLI).

**Outside this product's identity**
- A hosted, internet-public, multi-tenant registry. Self-hosted, one-instance-per-company stays the model.

## Key Decisions & Assumptions

- **Connect ≠ install.** The two primitives stay distinct in product language and UI. This is a deliberate mental-model shift from "install skills" to "connect to the library."
- **Reuse, not rebuild.** A adds a transport to the existing server and reuses existing tools + token model. B publishes the existing CLI. Neither is net-new architecture.
- **(Assumption) The registry instance is internet-reachable with TLS.** A's reach is gated on this; VPN-only instances cannot be reached by claude.ai/ChatGPT connector backends. Self-hosted deployments behind a firewall fall back to local-stdio MCP + B.
- **(Assumption) Write-capable MCP tools stay role-gated by token** when exposed over HTTP — `validatePackage`, `submitStatusReport`, etc. must not be reachable with a read-only or absent token.

## Auth findings (resolved 2026-06-10)

Per-surface what the custom-connector flow actually accepts:

| Surface | Bearer header | No-auth endpoint | OAuth |
|---|---|---|---|
| Claude Desktop / Claude Code / Cursor | ✅ | ✅ | optional |
| Claude.ai web | ❌ (Anthropic closed `static_bearer` request as not-planned) | ✅ experimental | required for auth |
| ChatGPT web (Developer Mode, paid tiers) | ❌ no pasted-token field | ✅ | required for auth |
| Anthropic / ChatGPT API path | ✅ caller passes token | ✅ | not needed |

OAuth, when needed, is: OAuth 2.0 Auth-Code + PKCE (S256), `/.well-known/oauth-protected-resource` (RFC 9728) + AS metadata (RFC 8414), CIMD (preferred) or DCR client registration, resource indicators (RFC 8707). Bearer-in-header only; never in query string. Delegating to an external AS (Auth0/Clerk/Keycloak) or reusing Better Auth reduces this to "serve PRM + validate JWTs."

## Outstanding Questions

1. **Can Better Auth serve as the delegated OAuth AS for P2?** It already backs the web app (Entra SSO). Confirm it can issue MCP-compatible OAuth (PRM discovery, PKCE, CIMD/DCR) so P2 doesn't need a separate Auth0/Keycloak. This is the cheapest-if-true path and should be validated early in planning.
2. **Is no-auth acceptable for P1 on your deployment topology?** Reaches all surfaces day one, but only safe when the instance network is the perimeter (VPN/SSO-gated or trusted LAN). If instances are publicly exposed, P1 is bearer-only (dev surfaces) and authenticated web waits for P2.
3. **npm publishing for B.** Public npm (`@skill-library/cli`) for the OSS, and what do downstream company forks do — private registry, or `npx` against a Git URL?
4. **Does remote MCP need an install tool at all,** or is "connect + use live" enough for the app surfaces, leaving disk-install entirely to B?

## Already shipped this session (prerequisite cleanup)

Correctness fixes to the existing stdio setup prompts (`apps/web/src/mcp-setup-prompts.ts`), so the current path isn't broken while A+B is built:
- Codex snippet no longer emits an undefined `${SKILL_LIBRARY_REPO}` path; uses the shared `<absolute-path-to>` placeholder.
- ChatGPT prompt now states honestly that it cannot connect (stdio-only, no hosted endpoint) instead of fabricating a stdio config — this is exactly what A removes.
- `MCP_ACTOR` marked optional.

## Success Criteria

- A non-technical user connects Claude.ai (or Claude Desktop) to a reachable instance with no terminal, and the agent can search the catalog.
- ChatGPT's connect path either works via the resolved auth shape, or the UI states a clear, honest reason it can't yet — never a dead-end config.
- A developer installs a skill to `~/.claude/skills` with a single `npx` command, no clone/build.
- Web onboarding presents one path per surface; the five-platform stdio prompt wall is gone or demoted to a "power user / offline" section.
