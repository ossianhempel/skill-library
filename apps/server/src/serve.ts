import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { stat, readdir, readFile } from "node:fs/promises";
import { extname, join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { createRegistryStore } from "@skill-library/storage";
import { createHttpApp } from "./http.js";
import { loadRegistryBrandingConfig } from "./registry-config.js";
import { createRegistryApi } from "./index.js";
import { nodeResponseHeaders } from "./node-response-headers.js";
import { resolveStaticAssetPath } from "./static-asset-path.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const serverDistDir = fileURLToPath(new URL(".", import.meta.url));
const staticDir = resolve(process.env.SKILL_LIBRARY_WEB_DIST ?? join(serverDistDir, "..", "..", "web", "dist"));
const store = await createRegistryStore({
  databaseUrl: process.env.DATABASE_URL,
  dataDir: process.env.SKILL_LIBRARY_DATA_DIR
});

await store.migrate();

if (process.env.NODE_ENV !== "production" && process.env.SKILL_LIBRARY_DISABLE_DEV_SEED !== "1") {
// Dev seeding logic when running locally
const api = createRegistryApi(store);
try {
  const devWorkspaceId = "main";
  console.log(`Seeding check: calling api.search for ${devWorkspaceId}...`);
  const packages = await api.search(devWorkspaceId);
  console.log(`Seeding check: found ${packages.length} packages in ${devWorkspaceId}`);
const devSkills = [
  { slug: "review-helper", name: "Review Helper", desc: "Turns repository diffs into a focused code-review checklist for internal agents.", version: "1.0.0", dir: "review-helper-v1" },
  { slug: "release-notes", name: "Release Notes Generator", desc: "Builds release notes from merged commits, issue links, and deployment metadata.", version: "1.0.0", dir: "review-helper-v2" }
];

for (const skill of devSkills) {
  const packageId = `${devWorkspaceId}-${skill.slug}`;
  const existingPkg = await api.packageDetail(packageId);
  if (!existingPkg) {
    console.log(`Seeding check: ${skill.slug} not found, seeding...`);
    const examplesDir = join(serverDistDir, "..", "..", "..", "examples", "skills", skill.dir);
    console.log(`Seeding check: resolved examplesDir path for ${skill.slug}: ${examplesDir}`);
    const entries = await getFilesRecursively(examplesDir);
    console.log(`Seeding check: read ${entries.length} files for ${skill.slug}`);
    if (entries.length > 0) {
      const ver = await api.createUploadedVersion({
        workspaceId: devWorkspaceId,
        packageSlug: skill.slug,
        packageName: skill.name,
        description: skill.desc,
        version: skill.version,
        entries,
        actorId: "system"
      });
      await api.transitionVersion({
        versionId: ver.id,
        toState: "approved",
        actorId: "system"
      });
      console.log(`Seeded skill: ${skill.slug} (${skill.version})`);
    }
  } else {
    console.log(`Seeding check: ${skill.slug} already exists, skipping seed.`);
  }
}
} catch (e) {
  console.error("Dev seeding failed with error:", e);
}
}

const branding = await loadRegistryBrandingConfig();
const app = createHttpApp(store, branding);

async function getFilesRecursively(dir: string, baseDir: string = dir): Promise<{ path: string; content: string }[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: { path: string; content: string }[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getFilesRecursively(fullPath, baseDir)));
    } else if (entry.isFile()) {
      const relPath = relative(baseDir, fullPath);
      const content = await readFile(fullPath, "utf-8");
      files.push({ path: relPath, content });
    }
  }

  return files;
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);

    if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
      const appResponse = await app.fetch(toWebRequest(request, url));
      await writeWebResponse(response, appResponse);
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }));
  }
});

server.listen(port, host, () => {
  console.log(`Skill Library listening on http://${host}:${port}`);
  console.log(`Serving web assets from ${staticDir}`);
});

// Graceful shutdown that prioritizes flushing PGlite to disk. On a Container Apps
// deploy the platform sends SIGTERM, then SIGKILLs at the termination grace
// deadline. A plain server.close() waits for ALL open connections to end, and
// long-lived MCP/keep-alive streams may never drain in time -- if the callback
// never fires, store.close() never runs and PGlite is killed mid-write (TOAST
// corruption). So we stop new work, force-close lingering sockets, and always
// flush the store under a hard backstop that can't hang past the grace window.
let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  server.close();
  // Node 18.2+: drop idle keep-alives immediately, then force the rest shortly
  // after so the event loop can proceed to the DB flush instead of blocking.
  server.closeIdleConnections();
  const forceCloseSockets = setTimeout(() => server.closeAllConnections(), 3000);
  forceCloseSockets.unref();

  // Backstop: never let shutdown outlast the platform grace period. If the flush
  // itself wedges, exit non-zero rather than get SIGKILLed mid-write.
  const backstop = setTimeout(() => process.exit(1), 20000);
  backstop.unref();

  try {
    await store.close();
  } finally {
    clearTimeout(forceCloseSockets);
    clearTimeout(backstop);
    process.exit(0);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void shutdown());
}

function toWebRequest(request: IncomingMessage, url: URL): Request {
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(name, value);
    }
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: hasBody ? (Readable.toWeb(request) as ReadableStream) : undefined,
    duplex: hasBody ? "half" : undefined
  };

  return new Request(url, init);
}

async function writeWebResponse(response: ServerResponse, appResponse: Response): Promise<void> {
  response.writeHead(appResponse.status, nodeResponseHeaders(appResponse));

  if (!appResponse.body) {
    response.end();
    return;
  }

  const reader = appResponse.body.getReader();

  while (true) {
    const chunk = await reader.read();

    if (chunk.done) {
      break;
    }

    response.write(Buffer.from(chunk.value));
  }

  response.end();
}

async function serveStatic(response: ServerResponse, pathname: string): Promise<void> {
  const candidate = resolveStaticAssetPath(staticDir, pathname);
  const targetPath = candidate && (await isFile(candidate)) ? candidate : join(staticDir, "index.html");

  response.writeHead(200, { "content-type": contentType(targetPath) });
  createReadStream(targetPath).pipe(response);
}

async function isFile(path: string): Promise<boolean> {
  return stat(path)
    .then((stats) => stats.isFile())
    .catch(() => false);
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
