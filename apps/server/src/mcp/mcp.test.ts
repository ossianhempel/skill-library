import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { makeSignature } from "better-auth/crypto";
import {
  createRegistryStore,
  type SqlRegistryStore,
} from "@skill-library/storage";
import { createHttpApp } from "../http.js";
import { createRegistryApi } from "../index.js";
import { getBetterAuthInstance } from "../better-auth.js";
import { defaultRegistryBrandingConfig } from "../registry-config.js";

const BASE = "http://localhost:3000";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const tmpDirs: string[] = [];
const stores: SqlRegistryStore[] = [];

beforeAll(() => {
  process.env.BETTER_AUTH_URL = BASE;
});

afterEach(async () => {
  await Promise.all(stores.map((store) => store.close()));
  stores.length = 0;
  await Promise.all(
    tmpDirs.map((dir) => rm(dir, { recursive: true, force: true }))
  );
  tmpDirs.length = 0;
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

    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    expect(tools).toEqual([
      "skills_search",
      "skills_get",
      "skills_read_file",
      "skills_install",
      "skills_vote",
      "skills_leaderboard",
      "skills_publish",
    ]);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const search = await client.callTool({
      name: "skills_search",
      arguments: { query: "cv" },
    });
    expect(text(search)).toContain("**CV Tailor** (`cv-tailor`)");
    expect(text(search)).not.toContain("draft-only");

    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(
        /^mcp-usage \{"server":"skill-library","tool":"skills_search","user":"ada@example.com","ok":true,"ms":\d+,"client":"Claude"\}$/
      )
    );
    expect(log.mock.calls.join("\n")).not.toContain('"query"');
    log.mockRestore();

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

    // The Claude Code install counts Ada as a colleague using the skill.
    const vote = await client.callTool({
      name: "skills_vote",
      arguments: { skill: "cv-tailor" },
    });
    expect(text(vote)).toContain("1 upvote(s) and 1 colleague(s)");

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

    // Someone else's skill cannot be overwritten by a non-maintainer.
    const takeover = await client.callTool({
      name: "skills_publish",
      arguments: {
        files: [
          {
            path: "SKILL.md",
            content:
              "---\nname: cv-tailor\ndescription: Mine now.\n---\n\nBody.\n",
          },
        ],
      },
    });
    expect(takeover.isError).toBe(true);

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

    const approve = await client.callTool({
      name: "skills_set_status",
      arguments: { skill: "draft-only", status: "approved" },
    });
    expect(text(approve)).toBe("draft-only 0.1.0 is now approved.");

    await client.close();
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

type App = ReturnType<typeof createHttpApp>;

async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), "skill-library-mcp-"));
  tmpDirs.push(dataDir);
  const store = (await createRegistryStore({ dataDir })) as SqlRegistryStore;
  stores.push(store);
  await store.migrate();
  const api = createRegistryApi(store);
  const branding = {
    ...defaultRegistryBrandingConfig(),
    defaultWorkspaceId: "main",
  };

  await addUser(store, "author", "user");
  const cv = await api.createUploadedVersion({
    workspaceId: "main",
    packageSlug: "cv-tailor",
    packageName: "CV Tailor",
    description: "Tailor a consultant CV to an assignment.",
    version: "1.0.0",
    actorId: "author",
    actorName: "Author",
    entries: [
      {
        path: "SKILL.md",
        content:
          "---\nname: cv-tailor\ndescription: Tailor a CV to an assignment.\n---\n\nTailor a CV to an assignment.\n",
      },
      { path: "references/rules.md", content: "Keep it to two pages." },
      {
        path: "logo.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]).toString(
          "base64"
        ),
        encoding: "base64",
      },
    ],
  });
  await api.transitionVersion({ versionId: cv.id, toState: "approved" });
  await api.createUploadedVersion({
    workspaceId: "main",
    packageSlug: "draft-only",
    packageName: "Draft only",
    description: "Not approved yet.",
    version: "0.1.0",
    actorId: "author",
    entries: [
      {
        path: "SKILL.md",
        content:
          "---\nname: draft-only\ndescription: Not approved yet.\n---\n\nBody.\n",
      },
    ],
  });

  return { app: createHttpApp(store, branding), store };
}

async function addUser(store: SqlRegistryStore, id: string, role: string) {
  await store
    .kysely!.insertInto("user" as never)
    .values({
      id,
      name: id[0]!.toUpperCase() + id.slice(1),
      email: `${id}@example.com`,
      emailVerified: true,
      role,
    } as never)
    .execute();
}

/** A web-app session cookie for `id`, as Microsoft sign-in would leave it. */
async function sessionCookie(
  store: SqlRegistryStore,
  id: string
): Promise<string> {
  const context = await getBetterAuthInstance(store).$context;
  const session = await context.internalAdapter.createSession(id);
  return `${context.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token, context.secret)}`;
}

/**
 * Authorizes as a signed-in person: the first time, the server asks them to
 * allow the client, and this clicks Allow on that page.
 */
async function authorizeWithConsent(
  app: App,
  url: string,
  cookie: string
): Promise<URL> {
  const first = await app.request(url, { headers: { cookie } });
  expect(first.status).toBe(302);
  const withPrompt = first.headers.get("location")!;
  expect(withPrompt).toContain("prompt=consent");

  const authorize = await app.request(`${BASE}${withPrompt}`, {
    headers: { cookie },
  });
  expect(authorize.status).toBe(302);
  const consentUrl = new URL(authorize.headers.get("location")!, BASE);
  expect(consentUrl.pathname).toBe("/api/mcp/consent");

  const consentPage = await app.request(consentUrl.toString(), {
    headers: { cookie },
  });
  const html = await consentPage.text();
  expect(html).toContain("Allow Claude to use Skill Library?");
  expect(html).toMatch(/@example\.com/);

  const answer = await app.request(`${BASE}/api/auth/oauth2/consent`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", origin: BASE },
    body: JSON.stringify({
      accept: true,
      consent_code: consentUrl.searchParams.get("consent_code"),
    }),
  });
  expect(answer.status).toBe(200);
  return new URL(
    ((await answer.json()) as { redirectURI: string }).redirectURI
  );
}

/** Signs `id` in to the web app, then runs the OAuth flow Claude runs. */
async function signIn(
  app: App,
  store: SqlRegistryStore,
  id: string,
  role: string
) {
  await addUser(store, id, role);
  const cookie = await sessionCookie(store, id);

  const clientId = await registerClient(app);
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const redirect = await authorizeWithConsent(
    app,
    authorizeUrl(clientId, challenge),
    cookie
  );
  expect(`${redirect.origin}${redirect.pathname}`).toBe(REDIRECT);
  expect(redirect.searchParams.get("state")).toBe("xyz");

  const tokenResponse = await app.request(`${BASE}/api/auth/mcp/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: redirect.searchParams.get("code")!,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  expect(tokenResponse.status).toBe(200);
  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
  };
  expect(tokens.refresh_token).toBeTruthy();
  return tokens.access_token;
}

async function registerClient(app: App): Promise<string> {
  const response = await app.request(`${BASE}/api/auth/mcp/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Claude",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { client_id: string }).client_id;
}

function authorizeUrl(clientId: string, challenge: string): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope: "openid profile email offline_access",
    state: "xyz",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${BASE}/api/auth/mcp/authorize?${query}`;
}

async function connect(app: App, token: string): Promise<Client> {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
      fetch: async (input, init) =>
        app.request(String(input), init as RequestInit),
    })
  );
  return client;
}

function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((item) => item.text ?? "").join("\n");
}
