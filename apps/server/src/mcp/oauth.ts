import type { WorkspaceRole } from "@skill-library/domain";
import type { RegistryStore } from "@skill-library/storage";
import type { BetterAuthInstance } from "../better-auth.js";
import { parseRole } from "../auth.js";

/** The signed-in person an MCP request acts for. */
export interface McpUser {
  id: string;
  role: WorkspaceRole;
  name: string;
  email: string;
}

export const MCP_SCOPES = ["openid", "profile", "email", "offline_access"];

/**
 * The endpoints Better Auth's MCP plugin adds to `auth.api`. better-auth.ts
 * registers the plugin behind a cast (its endpoint types cannot be named in
 * emitted declarations), so the calls this module makes are typed here.
 */
interface McpAuthApi {
  getMcpSession(input: { headers: Headers }): Promise<{
    userId?: string | null;
    accessTokenExpiresAt: Date | string;
  } | null>;
  getMcpOAuthConfig(input: { headers: Headers }): Promise<unknown>;
  signInSocial(input: {
    body: { provider: string; callbackURL: string };
    headers: Headers;
    asResponse: true;
  }): Promise<Response>;
}

function mcpAuthApi(auth: BetterAuthInstance): McpAuthApi {
  return auth.api as unknown as McpAuthApi;
}

/**
 * Resolves the bearer token on an MCP request to the person it was issued to.
 * The plugin returns stored tokens without checking expiry, and its token rows
 * outlive deleted users, so both are checked here.
 */
export async function mcpUserFromHeaders(
  auth: BetterAuthInstance,
  store: RegistryStore,
  headers: Headers
): Promise<McpUser | undefined> {
  if (!/^Bearer\s+\S+/i.test(headers.get("authorization") ?? "")) {
    return undefined;
  }

  const token = await mcpAuthApi(auth)
    .getMcpSession({ headers })
    .catch(() => null);

  if (
    !token?.userId ||
    new Date(token.accessTokenExpiresAt).getTime() <= Date.now()
  ) {
    return undefined;
  }

  const user = await store.kysely
    ?.selectFrom("user")
    .select(["id", "name", "email", "role"])
    .where("id", "=", token.userId)
    .executeTakeFirst();

  if (!user) {
    return undefined;
  }

  return {
    id: user.id,
    role: parseRole(user.role ?? null) ?? "user",
    name: user.name,
    email: user.email,
  };
}

/** RFC 8414 metadata for the authorization server (issuer = the site root). */
export async function authorizationServerMetadata(
  auth: BetterAuthInstance,
  headers: Headers
): Promise<unknown> {
  return mcpAuthApi(auth).getMcpOAuthConfig({ headers });
}

/** RFC 9728 metadata for the protected resource at `<base>/mcp`. */
export function protectedResourceMetadata(baseUrl: string, appName: string) {
  return {
    resource: `${baseUrl}/mcp`,
    resource_name: appName,
    authorization_servers: [baseUrl],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
  };
}

export function protectedResourceMetadataUrl(baseUrl: string): string {
  return `${baseUrl}/.well-known/oauth-protected-resource/mcp`;
}

/**
 * The login page the plugin sends a signed-out person to. It starts the same
 * Microsoft sign-in as the web app; when Microsoft redirects back and the
 * session cookie is set, the plugin finishes the pending authorization and
 * sends the browser on to the MCP client with a code.
 */
export async function startMcpSignIn(
  auth: BetterAuthInstance,
  request: Request
): Promise<Response> {
  const response = await mcpAuthApi(auth).signInSocial({
    body: { provider: "microsoft", callbackURL: "/" },
    headers: request.headers,
    asResponse: true,
  });
  const body = (await response
    .clone()
    .json()
    .catch(() => ({}))) as { url?: string };

  if (!response.ok || !body.url) {
    return new Response("Could not start sign-in. Try connecting again.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const redirect = new Response(null, {
    status: 302,
    headers: { location: body.url },
  });

  for (const cookie of response.headers.getSetCookie()) {
    redirect.headers.append("set-cookie", cookie);
  }

  return redirect;
}
