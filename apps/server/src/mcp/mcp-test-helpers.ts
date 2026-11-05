/** Shared setup for the remote MCP tests: an app, users and the OAuth flow Claude runs. */
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect } from "vitest";
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

export const BASE = "http://localhost:3000";
export const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
export const tmpDirs: string[] = [];
export const stores: SqlRegistryStore[] = [];

/** Closes stores and removes temp folders that tests created. */
export async function cleanup() {
  await Promise.all(stores.map((store) => store.close()));
  stores.length = 0;
  await Promise.all(
    tmpDirs.map((dir) => rm(dir, { recursive: true, force: true }))
  );
  tmpDirs.length = 0;
}

export type App = ReturnType<typeof createHttpApp>;

/** Builds the app on PGlite, or on the database at `databaseUrl` when given. */
export async function setup(databaseUrl?: string) {
  const dataDir = await mkdtemp(join(tmpdir(), "skill-library-mcp-"));
  tmpDirs.push(dataDir);
  const store = (await createRegistryStore({
    dataDir,
    databaseUrl,
  })) as SqlRegistryStore;
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

export async function addUser(
  store: SqlRegistryStore,
  id: string,
  role: string
) {
  await store
    .kysely!.insertInto("user" as never)
    .values({
      id,
      name: id[0]!.toUpperCase() + id.slice(1),
      email: `${id}@example.com`,
      emailVerified: true,
      role,
      // Unique column; SQL Server allows only one NULL (see prepareNewUser).
      agent_api_token: `sl_${randomBytes(24).toString("hex")}`,
    } as never)
    .execute();
}

/** A web-app session cookie for `id`, as Microsoft sign-in would leave it. */
export async function sessionCookie(
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
export async function authorizeWithConsent(
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
export async function signIn(
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

export async function registerClient(app: App): Promise<string> {
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

export function authorizeUrl(clientId: string, challenge: string): string {
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

export async function connect(app: App, token: string): Promise<Client> {
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

export function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((item) => item.text ?? "").join("\n");
}
