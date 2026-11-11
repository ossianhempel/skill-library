import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  BASE,
  addUser,
  authorizeUrl,
  authorizeWithConsent,
  cleanup,
  connect,
  registerClient,
  sessionCookie,
  setup,
  signIn,
  text,
} from "./mcp-test-helpers.js";

const spans = new InMemorySpanExporter();
const toolSpans = () =>
  spans
    .getFinishedSpans()
    .filter((span) => span.name.startsWith("tools/call "));

beforeAll(() => {
  process.env.BETTER_AUTH_URL = BASE;
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(spans)],
    })
  );
});

afterEach(async () => {
  spans.reset();
  await cleanup();
});

describe("remote MCP", () => {
  it("tells a client without a token where to sign in", async () => {
    const { app } = await setup();

    const response = await app.request(`${BASE}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`
    );

    const resource = await (
      await app.request(`${BASE}/.well-known/oauth-protected-resource/mcp`)
    ).json();
    expect(resource).toMatchObject({
      resource: `${BASE}/mcp`,
      authorization_servers: [BASE],
    });

    const server = await (
      await app.request(`${BASE}/.well-known/oauth-authorization-server`)
    ).json();
    expect(server).toMatchObject({
      issuer: BASE,
      authorization_endpoint: `${BASE}/api/auth/mcp/authorize`,
      token_endpoint: `${BASE}/api/auth/mcp/token`,
      registration_endpoint: `${BASE}/api/auth/mcp/register`,
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("sends a signed-out person to Microsoft sign-in and remembers the pending authorization", async () => {
    const { app } = await setup();
    const clientId = await registerClient(app);

    const first = await app.request(authorizeUrl(clientId, "challenge"));
    expect(first.headers.get("location")).toContain("prompt=consent");
    const authorize = await app.request(
      `${BASE}${first.headers.get("location")}`
    );
    expect(authorize.status).toBe(302);
    expect(authorize.headers.get("location")).toMatch(/^\/api\/mcp\/sign-in\?/);
    expect(authorize.headers.getSetCookie().join(";")).toContain(
      "oidc_login_prompt"
    );

    const signIn = await app.request(
      `${BASE}${authorize.headers.get("location")}`
    );
    expect(signIn.status).toBe(302);
    expect(signIn.headers.get("location")).toMatch(
      /^https:\/\/login\.microsoftonline\.com\//
    );
  });

  it("signs a person in with OAuth and lets them find, read, install and share skills", async () => {
    const { app, store } = await setup();
    const token = await signIn(app, store, "ada", "user");
    const client = await connect(app, token);

    const info = client.getServerVersion();
    expect(info?.websiteUrl).toBe(BASE);
    expect(info?.icons?.map((icon) => icon.src)).toEqual([
      `${BASE}/favicon.svg`,
      `${BASE}/apple-touch-icon.png`,
    ]);

    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    expect(tools).toEqual([
      "skills_search",
      "skills_get",
      "skills_read_file",
      "skills_install",
      "skills_vote",
      "skills_leaderboard",
      "skills_publish",
      "skills_proposals",
      "skills_review_proposal",
      "mcp_servers_list",
      "mcp_servers_save",
      "mcp_servers_remove",
    ]);

    const search = await client.callTool({
      name: "skills_search",
      arguments: { query: "cv" },
    });
    expect(text(search)).toContain("**CV Tailor** (`cv-tailor`)");
    expect(text(search)).not.toContain("draft-only");

    const [span] = toolSpans();
    expect(span?.name).toBe("tools/call skills_search");
    expect(span?.kind).toBe(SpanKind.SERVER);
    expect(span?.attributes).toEqual({
      "mcp.method.name": "tools/call",
      "gen_ai.operation.name": "execute_tool",
      "gen_ai.tool.name": "skills_search",
      "enduser.id": "ada@example.com",
      "mcp.client.name": "Claude",
    });

    const get = await client.callTool({
      name: "skills_get",
      arguments: { skill: "CV Tailor" },
    });
    expect(text(get)).toContain("references/rules.md");
    expect(text(get)).toContain("Tailor a CV to an assignment.");
    expect(text(get)).toContain(`${BASE}/s/main/cv-tailor`);

    const file = await client.callTool({
      name: "skills_read_file",
      arguments: { skill: "cv-tailor", path: "references/rules.md" },
    });
    expect(text(file)).toBe("Keep it to two pages.");

    const app_ = await client.callTool({
      name: "skills_install",
      arguments: { skill: "cv-tailor", client: "claude-app" },
    });
    expect(text(app_)).toContain(`${BASE}/api/artifacts/`);
    expect(text(app_)).toContain("layout=claude-app");

    const code = await client.callTool({
      name: "skills_install",
      arguments: { skill: "cv-tailor", client: "claude-code" },
    });
    expect(text(code)).toContain("~/.claude/skills/cv-tailor/");
    expect(text(code)).toContain("=== logo.png (base64) ===");
    expect(text(code)).toContain("Keep it to two pages.");
    // Claude Code shows the model structuredContent instead of the text when
    // both are present, which would drop the file contents.
    expect(code.structuredContent).toBeUndefined();

    const logo = await client.callTool({
      name: "skills_read_file",
      arguments: { skill: "cv-tailor", path: "logo.png" },
    });
    expect(logo.isError).toBeFalsy();
    expect(text(logo)).toContain(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]).toString("base64")
    );

    // The Claude Code install counts Ada as a colleague using the skill.
    const vote = await client.callTool({
      name: "skills_vote",
      arguments: { skill: "cv-tailor" },
    });
    expect(text(vote)).toContain("1 upvote(s) and 1 colleague(s)");

    // The leaderboard ranks skills and names who made each one, not people.
    const leaderboard = await client.callTool({
      name: "skills_leaderboard",
      arguments: {},
    });
    expect(text(leaderboard)).toMatch(
      /^1\. \*\*CV Tailor\*\* \(`cv-tailor`\)( by .+)?: used by 1 colleague\(s\), 1 upvote\(s\)$/
    );

    const published = await client.callTool({
      name: "skills_publish",
      arguments: {
        files: [
          {
            path: "SKILL.md",
            content:
              "---\nname: meeting-notes\ndescription: Turn a meeting transcript into decisions and actions.\n---\n\nList decisions first, then actions with owners.\n",
          },
        ],
      },
    });
    expect(text(published)).toContain(
      "Submitted meeting-notes 1.0.0 as a draft"
    );

    // A SKILL.md without frontmatter is refused, and the span records it.
    const invalid = await client.callTool({
      name: "skills_publish",
      arguments: { files: [{ path: "SKILL.md", content: "No frontmatter." }] },
    });
    expect(invalid.isError).toBe(true);
    const failed = toolSpans().at(-1);
    expect(failed?.name).toBe("tools/call skills_publish");
    expect(failed?.attributes["error.type"]).toBe("tool_error");
    expect(failed?.status.code).toBe(SpanStatusCode.ERROR);

    await client.close();
  });

  it("gives maintainers the review queue and lets them approve", async () => {
    const { app, store } = await setup();
    const token = await signIn(app, store, "max", "maintainer");
    const client = await connect(app, token);

    const queue = await client.callTool({
      name: "skills_review_queue",
      arguments: {},
    });
    expect(text(queue)).toContain("(`draft-only`) 0.1.0: draft");

    // The draft under review is readable by version before approving.
    const draft = await client.callTool({
      name: "skills_get",
      arguments: { skill: "draft-only", version: "0.1.0" },
    });
    expect(draft.isError).toBeFalsy();
    expect(text(draft)).toContain("--- SKILL.md ---");

    const approve = await client.callTool({
      name: "skills_set_status",
      arguments: { skill: "draft-only", status: "approved" },
    });
    expect(text(approve)).toBe("draft-only 0.1.0 is now approved.");

    await client.close();
  });

  it("lets maintainers delete a skill for good, and nobody else", async () => {
    const { app, store } = await setup();
    const colleague = await connect(
      app,
      await signIn(app, store, "colleague", "user")
    );
    await colleague.callTool({
      name: "skills_install",
      arguments: { skill: "cv-tailor", client: "claude-code" },
    });
    await colleague.callTool({
      name: "skills_vote",
      arguments: { skill: "cv-tailor" },
    });
    const colleagueTools = (await colleague.listTools()).tools;
    expect(colleagueTools.map((tool) => tool.name)).not.toContain(
      "skills_delete"
    );

    const max = await connect(
      app,
      await signIn(app, store, "max", "maintainer")
    );
    const unknown = await max.callTool({
      name: "skills_delete",
      arguments: { skill: "CV Tailor" },
    });
    expect(unknown.isError).toBe(true);
    expect(text(unknown)).toContain("cv-tailor");

    const deleted = await max.callTool({
      name: "skills_delete",
      arguments: { skill: "cv-tailor" },
    });
    expect(text(deleted)).toBe("CV Tailor (`cv-tailor`) is deleted.");

    const search = await colleague.callTool({
      name: "skills_search",
      arguments: { query: "" },
    });
    expect(text(search)).not.toContain("cv-tailor");
    const db = store.kysely!;
    for (const table of ["usage_events", "skill_votes", "artifacts"] as const) {
      const rows = await db.selectFrom(table).selectAll().execute();
      expect(rows, table).toHaveLength(table === "artifacts" ? 2 : 0);
    }
    const left = await db.selectFrom("skill_packages").select("slug").execute();
    expect(left.map((row) => row.slug)).toEqual(["draft-only"]);

    await colleague.close();
    await max.close();
  });

  it("does not let a colleague read someone else's draft by version", async () => {
    const { app, store } = await setup();
    const token = await signIn(app, store, "ada", "user");
    const client = await connect(app, token);

    const draft = await client.callTool({
      name: "skills_get",
      arguments: { skill: "draft-only", version: "0.1.0" },
    });
    expect(draft.isError).toBe(true);

    await client.close();
  });

  it("refuses a consent code that is not one the server issued", async () => {
    const { app, store } = await setup();
    await addUser(store, "ada", "user");
    const cookie = await sessionCookie(store, "ada");
    const clientId = await registerClient(app);
    const payload = "x</script><script>alert(1)</script>";

    const response = await app.request(
      `${BASE}/api/mcp/consent?client_id=${clientId}&consent_code=${encodeURIComponent(payload)}`,
      { headers: { cookie } }
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("<script>alert");
  });

  it("asks once per assistant, then reconnects without asking", async () => {
    const { app, store } = await setup();
    await addUser(store, "ada", "user");
    const cookie = await sessionCookie(store, "ada");
    const clientId = await registerClient(app);

    await authorizeWithConsent(
      app,
      authorizeUrl(clientId, "a".repeat(43)),
      cookie
    );
    const again = await app.request(authorizeUrl(clientId, "b".repeat(43)), {
      headers: { cookie },
    });
    expect(
      new URL(again.headers.get("location")!).searchParams.get("code")
    ).toBeTruthy();

    // Another client, say one registered by someone else, is asked about again.
    const other = await registerClient(app);
    const stranger = await app.request(authorizeUrl(other, "c".repeat(43)), {
      headers: { cookie },
    });
    expect(stranger.headers.get("location")).toContain("prompt=consent");
  });

  it("refuses an expired access token", async () => {
    const { app, store } = await setup();
    const token = await signIn(app, store, "ada", "user");
    await store
      .kysely!.updateTable("oauthAccessToken" as never)
      .set({ accessTokenExpiresAt: new Date(Date.now() - 1000) } as never)
      .execute();

    const response = await app.request(`${BASE}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(401);
  });
});
