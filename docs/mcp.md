# MCP

The registry hosts a remote MCP server at `<registry>/mcp` (Streamable HTTP, stateless). People connect their assistant once and then ask it for skills: no CLI, no API token, nothing to install.

## Hosted server (`/mcp`)

| What            | Where                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| Endpoint        | `POST <registry>/mcp`                                                                       |
| Sign-in         | OAuth 2.1 with dynamic client registration, served by Better Auth's MCP plugin              |
| Identity        | The same SSO as the web app (Microsoft Entra). Tools act as the signed-in person and role.  |
| Discovery       | `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server`      |
| OAuth endpoints | `/api/auth/mcp/register`, `/api/auth/mcp/authorize`, `/api/auth/mcp/token`                  |
| Login page      | `/api/mcp/sign-in` starts the Microsoft sign-in; the plugin then finishes the authorization |

Connect from:

- **Claude (claude.ai, desktop, Cowork):** Settings > Connectors > Add custom connector, paste the URL, Connect, sign in.
- **Claude Code:** `claude mcp add --transport http --scope user skill-library <registry>/mcp`, then `/mcp` > Authenticate.
- **Codex:** `codex mcp add skill-library --url <registry>/mcp` and `codex mcp login skill-library`.
- **Cursor:** `{"mcpServers": {"skill-library": {"url": "<registry>/mcp"}}}` in `~/.cursor/mcp.json`.
- **ChatGPT:** a custom connector with the URL and OAuth.

The web Overview shows the URL with these steps, and per-agent copy prompts under the developer section.

Tools (all signed-in users):

| Tool                     | What it does                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills_search`          | Find skills by words in name, description or category; sort by popularity, newest or name. Paginated.                                                                         |
| `skills_get`             | A skill's details, full `SKILL.md` and file list, so the assistant can use it right away. Records a view.                                                                     |
| `skills_read_file`       | One file of a skill (a reference or template `SKILL.md` points to).                                                                                                           |
| `skills_install`         | `claude-app`: download link plus upload steps. `claude-code`, `codex`, `project`: every file and the folder to write it to (records a download, which counts in the ranking). |
| `skills_vote`            | Upvote a skill or take the upvote back (same rules as the web app).                                                                                                           |
| `skills_leaderboard`     | Top skills by colleagues and upvotes, with who made each.                                                                                                                     |
| `skills_publish`         | Submit a skill (files as text or base64) as a draft for review. A new version of someone else's skill becomes a proposed change for its owner.                                |
| `skills_proposals`       | Proposed changes waiting for the person's decision (on skills they own), and the ones they proposed.                                                                          |
| `skills_review_proposal` | Approve or reject a proposed change to a skill the person owns.                                                                                                               |

A skill's owner is whoever published its first version. When someone else publishes a version, it is a proposal: colleagues keep getting the approved version, the catalog entry keeps the owner's name and description, and the owner (or a maintainer) approves or rejects it here or on the skill's page in the web app. Approving brings in the proposal's `SKILL.md` description. Owners are told in the web app and through `skills_proposals`; there is no email.

The library also lists the team's other MCP servers (the MCPs tab in the web app), so an agent can tell the person which connectors exist and how to connect, and can add one it helped build:

- `mcp_servers_list`: every listed server with what it does, its URL, who can use it, and how to connect from the Claude app, Claude Code (`claude mcp add --transport http --scope user <slug> <url>`) and Codex (`codex mcp add <slug> --url <url>`).
- `mcp_servers_save`: add a server, or change one by its slug. Anyone signed in can add; only whoever added it or a maintainer can change it.
- `mcp_servers_remove`: take a server off the list (same rule).

The web tab and these tools share one set of rules (`apps/server/src/mcp-servers.ts`). An entry is only a pointer: the library never connects to or signs in to the listed server.

Maintainers also get `skills_review_queue` (drafts and published versions waiting) and `skills_set_status` (approve, hide, deprecate).

The first time a person connects an assistant, they see an approval page ("Allow Claude to use ...?") that names their account and where the browser returns. Anyone can register an OAuth client, so without it a link to the authorize URL could hand a stranger's client the person's access. Approval is remembered per client; Better Auth only asks when the request has `prompt=consent`, so `apps/server/src/mcp/consent.ts` adds it until the person has approved that client.

Visibility follows the web catalog: people see approved skills, plus their own drafts; maintainers see everything. Each tool call is one OpenTelemetry SERVER span, `tools/call <tool>`, following the MCP semantic conventions: `mcp.method.name`, `gen_ai.operation.name` (`execute_tool`), `gen_ai.tool.name`, `enduser.id` (the signed-in email), `mcp.client.name` (the OAuth client name, such as "Claude") and, on failure, `error.type` `tool_error` with ERROR status. Arguments and results are never recorded. Spans are exported to Azure Monitor only when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set (service name `skill-library`, override with `OTEL_SERVICE_NAME`); otherwise they are no-ops.

### Interactive view (MCP Apps)

Hosts that support [MCP Apps](https://modelcontextprotocol.io/extensions/apps) (Claude on the web and desktop, ChatGPT, VS Code) show a view next to three tools' results: `skills_search` and `skills_leaderboard` show skill cards, `skills_proposals` shows each proposed change as a file-by-file diff. Claude Code and other text-only clients get the same text as before.

- The page is the `ui://skill-library/skills-v1.html` resource (`text/html;profile=mcp-app`), built from `apps/server/src/mcp/view/` with no external scripts, styles or network access. Change the URI's version when the page changes. It sets no `_meta.ui.domain`: the view needs no fixed origin, and in Claude a domain computed from a URL other than the one the connector was added with stops the view.
- The view's data travels in the result's `_meta["skill-library/view"]`, which hosts pass to the view and never to the model. Results carry no `structuredContent`, because Claude Code gives the model `structuredContent` instead of the text.
- Every button calls a tool the model can also call: Upvote calls `skills_vote`, Install calls `skills_install` (`claude-app`) and opens the download link, Approve and Reject call `skills_review_proposal` after a second click to confirm, and Use now asks Claude in the chat to use the skill. There are no view-only tools.
- The view marks its own calls with `_meta["skill-library/caller"]: "view"` on the request, and the tool span gets `mcp.tool.caller` = `view`. Calls without it come from the model, or from a host that drops request `_meta`.

Access tokens last one hour; clients that ask for `offline_access` get a refresh token valid for 30 days. OAuth tables (`oauthApplication`, `oauthAccessToken`, `oauthConsent`) are created by the store's auth migrations. `BETTER_AUTH_URL` must be the public origin: it is the OAuth issuer and the resource URL.

## Local stdio package (`packages/mcp`)

The older local stdio server below still works for scripted use with an API key, but the hosted server is the way to connect assistants.

## Current Tools

Implemented tool helpers:

- `search`: find packages in a workspace
- `packageDetail`: fetch package detail and latest approved version
- `validatePackage`: validate normalized package-tree entries through the shared validator/API contract, including Agent Skills `SKILL.md` frontmatter rules (see [validation-rules.md](validation-rules.md))
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
