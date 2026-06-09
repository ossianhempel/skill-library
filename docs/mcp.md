# MCP

The MCP package exposes registry tool contracts for agents without requiring them to scrape the web UI.

## Deployment model

| Surface | Hosted on registry? | Auth |
|---------|---------------------|------|
| Web UI | Yes (`https://your-registry/`) | Microsoft Entra SSO (cookies) |
| HTTP API | Yes (`/api/*`) | Bearer API key or SSO session |
| MCP | **No** — local stdio on the user's machine | Bearer API key (`SKILL_LIBRARY_MCP_TOKEN`) |

MCP is **not** exposed as a remote endpoint on `skills.rebtech.se` or other registry deployments today. Each user runs `packages/mcp/dist/stdio.js` locally; it calls the registry HTTP API with a bearer token. **Microsoft SSO does not apply to MCP.**

The web Overview tab includes one-click **Copy setup prompt** buttons (Claude Code, Claude Desktop, Codex, Cursor, ChatGPT) that paste ready-made instructions into your agent to configure MCP and validate `tools/list` + search.

## Current Tools

Implemented tool helpers:

- `search`: find packages in a workspace
- `packageDetail`: fetch package detail and latest approved version
- `validatePackage`: validate normalized package-tree entries through the shared validator/API contract
- `installPlan`: return a concrete CLI command and metadata behavior
- `submitStatusReport`: pass install/status reports to the registry API when reporting is available

Filesystem mutation stays with the CLI. MCP install tooling returns a plan rather than writing local files itself.

## Stdio Transport

The package builds a stdio JSON-RPC entrypoint:

```sh
node packages/mcp/dist/stdio.js
```

Environment:

- `SKILL_LIBRARY_REGISTRY_URL`: registry base URL. Defaults to `http://localhost:3000`.
- `SKILL_LIBRARY_MCP_ROLE`: `user`, `maintainer`, or `admin`. Defaults to `user`.
- `SKILL_LIBRARY_MCP_ACTOR`: actor ID sent to the registry. Defaults to `mcp`.

Smoke test:

```sh
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node packages/mcp/dist/stdio.js
```

Supported JSON-RPC methods:

- `tools/list`
- `tools/call` with `{ "name": "<tool-name>", "arguments": { ... } }`

The transport is intentionally thin: registry data goes through the HTTP API, validation can run locally through the shared validator, and installs still return CLI guidance instead of mutating files.
