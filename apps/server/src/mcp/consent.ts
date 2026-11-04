import type { Hono } from "hono";
import type { RegistryStore } from "@skill-library/storage";
import type { BetterAuthInstance } from "../better-auth.js";

export const MCP_AUTHORIZE_PATH = "/api/auth/mcp/authorize";
export const MCP_CONSENT_PATH = "/api/mcp/consent";

/**
 * Anyone can register an OAuth client, so a signed-in person must approve each
 * client once before it gets a token; otherwise a link to the authorize URL
 * with someone else's redirect URI would hand that client the person's access
 * without them noticing. Better Auth's MCP plugin only asks when the request
 * carries `prompt=consent`, so this adds it until the person has approved the
 * client, and serves the approval page the plugin redirects to.
 *
 * Register before the `/api/auth/*` handler so the authorize route runs here first.
 */
export function registerMcpConsent(
  app: Hono,
  deps: { auth: BetterAuthInstance; store: RegistryStore; appName: string }
) {
  const { auth, store, appName } = deps;

  app.get(MCP_AUTHORIZE_PATH, async (context) => {
    const request = context.req.raw;
    const url = new URL(request.url);
    const prompts = (url.searchParams.get("prompt") ?? "").split(" ");

    if (!prompts.includes("consent")) {
      const session = await auth.api
        .getSession({ headers: request.headers })
        .catch(() => null);
      const clientId = url.searchParams.get("client_id") ?? "";
      const approved =
        session?.user && (await hasConsent(store, clientId, session.user.id));

      if (!approved) {
        url.searchParams.set(
          "prompt",
          [...prompts, "consent"].filter(Boolean).join(" ")
        );
        return context.redirect(`${url.pathname}${url.search}`, 302);
      }
    }

    return auth.handler(request);
  });

  app.get(MCP_CONSENT_PATH, async (context) => {
    const consentCode = context.req.query("consent_code") ?? "";
    const clientId = context.req.query("client_id") ?? "";
    const session = await auth.api
      .getSession({ headers: context.req.raw.headers })
      .catch(() => null);
    const client = await store.kysely
      ?.selectFrom("oauthApplication" as never)
      .select(["name" as never, "redirectUrls" as never])
      .where("clientId" as never, "=", clientId as never)
      .executeTakeFirst();

    if (!session?.user || !client || !consentCode) {
      return context.html(
        page(
          appName,
          "<p>This sign-in link has expired. Go back to your assistant and connect again.</p>"
        ),
        400
      );
    }

    const clientName =
      (client as { name?: string | null }).name || "An AI assistant";
    return context.html(
      page(
        appName,
        `<h1>Allow ${escapeHtml(clientName)} to use ${escapeHtml(appName)}?</h1>
<p>It will act as <strong>${escapeHtml(session.user.email)}</strong>: find, read and install skills, upvote them and submit skills you share. It sees what you see in the library.</p>
<p class="muted">After you allow it, you go back to <strong>${escapeHtml(redirectHost(client))}</strong>. Only continue if you just connected an assistant there yourself.</p>
<p class="actions"><button id="allow">Allow</button> <button id="deny" class="secondary">Cancel</button></p>
<p id="error" role="alert"></p>
<script>
async function answer(accept) {
  const response = await fetch("/api/auth/oauth2/consent", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accept, consent_code: ${JSON.stringify(consentCode)} }),
  });
  const body = await response.json().catch(() => ({}));
  if (body.redirectURI) { window.location.href = body.redirectURI; return; }
  document.getElementById("error").textContent = "Something went wrong. Go back to your assistant and connect again.";
}
document.getElementById("allow").addEventListener("click", () => answer(true));
document.getElementById("deny").addEventListener("click", () => answer(false));
</script>`
      )
    );
  });
}

function redirectHost(client: unknown): string {
  const urls = (client as { redirectUrls?: string }).redirectUrls ?? "";
  try {
    return new URL(urls.split(",")[0] ?? "").host || urls;
  } catch {
    return urls;
  }
}

async function hasConsent(
  store: RegistryStore,
  clientId: string,
  userId: string
): Promise<boolean> {
  const row = await store.kysely
    ?.selectFrom("oauthConsent" as never)
    .select(["id" as never])
    .where("clientId" as never, "=", clientId as never)
    .where("userId" as never, "=", userId as never)
    .where("consentGiven" as never, "=", true as never)
    .executeTakeFirst();
  return Boolean(row);
}

function page(appName: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(appName)}: connect</title>
<style>
body { font: 16px/1.5 system-ui, sans-serif; background: #f4f2ea; color: #1b1b18; margin: 0; padding: 48px 16px; }
main { max-width: 520px; margin: 0 auto; background: #fbfaf4; border: 1px solid #d8d4c4; padding: 28px; }
h1 { font-size: 1.4rem; line-height: 1.2; margin: 0 0 12px; }
button { font: inherit; padding: 10px 18px; border: 1px solid #1f4d3d; background: #1f4d3d; color: #fff; cursor: pointer; }
button.secondary { background: transparent; color: #1f4d3d; }
#error { color: #9b1c1c; }
.muted { color: #5b5a52; font-size: 0.92rem; }
</style></head><body><main>${body}</main></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
