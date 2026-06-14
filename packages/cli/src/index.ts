#!/usr/bin/env node
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import type {
  InstallMetadata,
  InstallReport,
  InstallTarget,
  InstallTargetKind,
  InstalledSkillState,
  SkillPackage,
  SkillVersion,
  Workspace,
} from "@skill-library/domain";
import {
  readPackageDirectory,
  readPackageZip,
  validatePackageTree,
  type PackageTreeEntry,
} from "@skill-library/validation";

export const metadataFileName = ".skill-library.json";

export const defaultDestinations: Record<
  Exclude<InstallTargetKind, "project">,
  InstallTarget
> = {
  "codex-global": {
    kind: "codex-global",
    agent: "codex",
    root: "~/.codex/skills",
  },
  "claude-global": {
    kind: "claude-global",
    agent: "claude",
    root: "~/.claude/skills",
  },
  "openclaw-global": {
    kind: "openclaw-global",
    agent: "openclaw",
    root: "~/.openclaw/skills",
  },
};

export interface ResolveInstallTargetInput {
  target?: InstallTargetKind;
  projectRoot?: string;
  explicitRoot?: string;
}

export interface InstalledSkillStatus {
  state: InstalledSkillState;
  metadata?: InstallMetadata;
  latestApprovedVersionId?: string;
}

export interface InstallPackageInput {
  entries: PackageTreeEntry[];
  destinationRoot: string;
  packageSlug?: string;
  metadata: InstallMetadata;
  force?: boolean;
}

export interface InstallPackageResult {
  skillRoot: string;
  filesWritten: string[];
  metadata: InstallMetadata;
}

export interface RegistryClientConfig {
  registryUrl: string;
  fetch?: typeof fetch;
  token?: string;
}

export interface RegistryClient {
  workspaceDetail(workspaceId: string): Promise<Workspace>;
  search(workspaceId: string, query?: string): Promise<SkillPackage[]>;
  packageDetail(packageId: string): Promise<SkillPackage>;
  latestApprovedVersion(packageId: string): Promise<SkillVersion>;
  downloadArtifact(
    digest: string,
    packageId: string,
    versionId: string
  ): Promise<Buffer>;
  reportInstall(report: InstallReport): Promise<void>;
}

export interface InstallFromRegistryInput {
  client: RegistryClient;
  registryUrl: string;
  workspaceId: string;
  packageId: string;
  packageSlug: string;
  destinationRoot: string;
  installTarget: InstallTarget;
  archivePath: string;
  force?: boolean;
  reportConsent?: boolean;
}

export interface UpdateFromRegistryInput {
  client: RegistryClient;
  registryUrl: string;
  skillRoot: string;
  archivePath: string;
  force?: boolean;
  reportConsent?: boolean;
}

export interface UpdateFromRegistryResult {
  updated: boolean;
  status: InstalledSkillStatus;
  install?: InstallPackageResult;
}

export interface CliRuntime {
  fetch?: typeof fetch;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export interface ParsedOptions {
  values: Record<string, string | boolean>;
  positionals: string[];
}

export function renderInstallCommand(
  packageSlug: string,
  target: InstallTargetKind = "codex-global"
) {
  return `npx @skill-library/cli install ${packageSlug} --target ${target}`;
}

export async function runCli(
  argv: string[],
  runtime: CliRuntime = {}
): Promise<number> {
  const [command, ...args] = argv;
  const stdout = runtime.stdout ?? console.log;
  const stderr = runtime.stderr ?? console.error;

  try {
    if (!command || command === "help" || command === "--help") {
      stdout(helpText());
      return 0;
    }

    const parsed = parseOptions(args);
    const registryUrl = stringOption(
      parsed,
      "registry",
      "http://localhost:3000"
    );
    const token = stringOption(parsed, "token", "");
    const client = createRegistryClient({
      registryUrl,
      fetch: runtime.fetch,
      token,
    });

    if (command === "workspace") {
      const workspaceId = requiredOption(parsed, "workspace");
      const workspace = await client.workspaceDetail(workspaceId);
      stdout(JSON.stringify({ workspace }, null, 2));
      return 0;
    }

    if (command === "search") {
      const workspaceId = requiredOption(parsed, "workspace");
      const query =
        parsed.positionals.join(" ") || stringOption(parsed, "query", "");
      const packages = await client.search(workspaceId, query);
      stdout(JSON.stringify({ packages }, null, 2));
      return 0;
    }

    if (command === "info") {
      const packageId =
        parsed.positionals[0] ?? requiredOption(parsed, "package");
      const [pkg, latestApproved] = await Promise.all([
        client.packageDetail(packageId),
        client.latestApprovedVersion(packageId),
      ]);
      stdout(JSON.stringify({ package: pkg, latestApproved }, null, 2));
      return 0;
    }

    if (command === "install") {
      const packageId =
        parsed.positionals[0] ?? requiredOption(parsed, "package");
      const destinationRoot = requiredOption(parsed, "root");
      const workspaceId = requiredOption(parsed, "workspace");
      const packageSlug = stringOption(parsed, "slug", packageId);
      const targetKind = installTargetOption(parsed);
      const installTarget = resolveInstallTarget({
        target: targetKind,
        explicitRoot: destinationRoot,
      });
      const archivePath = stringOption(
        parsed,
        "archive",
        join(destinationRoot, ".skill-library-download.zip")
      );
      const result = await installFromRegistry({
        client,
        registryUrl,
        workspaceId,
        packageId,
        packageSlug,
        destinationRoot,
        installTarget,
        archivePath,
        force: booleanOption(parsed, "force"),
        reportConsent: booleanOption(parsed, "report"),
      });

      stdout(JSON.stringify({ installed: result }, null, 2));
      return 0;
    }

    if (command === "validate") {
      const root = stringOption(parsed, "root", "");
      const archive = stringOption(parsed, "archive", "");

      if (!root && !archive) {
        throw new Error("Missing required option --root or --archive");
      }

      const entries = root
        ? await readPackageDirectory(root)
        : await readPackageZip(archive);
      stdout(
        JSON.stringify({ validation: validatePackageTree(entries) }, null, 2)
      );
      return 0;
    }

    if (command === "update") {
      const skillRoot = requiredOption(parsed, "root");
      const metadata = await readInstallMetadata(skillRoot);

      if (!metadata) {
        throw new Error(`Missing install metadata at ${skillRoot}`);
      }

      const updateRegistryUrl =
        typeof parsed.values.registry === "string"
          ? parsed.values.registry
          : metadata.registryUrl;
      const updateClient = createRegistryClient({
        registryUrl: updateRegistryUrl,
        fetch: runtime.fetch,
        token,
      });
      const result = await updateFromRegistry({
        client: updateClient,
        registryUrl: updateRegistryUrl,
        skillRoot,
        archivePath: stringOption(
          parsed,
          "archive",
          join(dirname(skillRoot), ".skill-library-update.zip")
        ),
        force: booleanOption(parsed, "force"),
        reportConsent:
          parsed.values.report === undefined
            ? metadata.reportConsent
            : booleanOption(parsed, "report"),
      });

      stdout(JSON.stringify({ update: result }, null, 2));
      return 0;
    }

    if (command === "status") {
      const skillRoot = requiredOption(parsed, "root");
      const packageId = stringOption(parsed, "package", "");
      const latestApproved = packageId
        ? await client.latestApprovedVersion(packageId)
        : undefined;
      const status = await getInstalledSkillStatus(skillRoot, latestApproved);
      stdout(JSON.stringify({ status }, null, 2));
      return 0;
    }

    if (command === "install-plan") {
      const packageSlug =
        parsed.positionals[0] ?? requiredOption(parsed, "package");
      stdout(renderInstallCommand(packageSlug, installTargetOption(parsed)));
      return 0;
    }

    stderr(`Unknown command: ${command}`);
    stdout(helpText());
    return 1;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function createRegistryClient(
  config: RegistryClientConfig
): RegistryClient {
  const request = config.fetch ?? fetch;
  const baseUrl = config.registryUrl.replace(/\/$/, "");
  const headers = authHeaders(config.token);

  return {
    async workspaceDetail(workspaceId) {
      return (
        await jsonRequest<{ workspace: Workspace }>(
          request,
          `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}`,
          headers
        )
      ).workspace;
    },
    async search(workspaceId, query) {
      const url = new URL(
        `${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/packages`
      );

      if (query) {
        url.searchParams.set("q", query);
      }

      return (
        await jsonRequest<{ packages: SkillPackage[] }>(request, url, headers)
      ).packages;
    },
    async packageDetail(packageId) {
      return (
        await jsonRequest<{ package: SkillPackage }>(
          request,
          `${baseUrl}/api/packages/${encodeURIComponent(packageId)}`,
          headers
        )
      ).package;
    },
    async latestApprovedVersion(packageId) {
      return (
        await jsonRequest<{ version: SkillVersion }>(
          request,
          `${baseUrl}/api/packages/${encodeURIComponent(packageId)}/latest-approved`,
          headers
        )
      ).version;
    },
    async downloadArtifact(digest, packageId, versionId) {
      const url = new URL(
        `${baseUrl}/api/artifacts/${encodeURIComponent(digest)}/download`
      );
      url.searchParams.set("packageId", packageId);
      url.searchParams.set("versionId", versionId);

      const response = await request(url, { headers });

      if (!response.ok) {
        throw new Error(
          `Registry request failed: ${response.status} ${response.statusText}`
        );
      }

      return Buffer.from(await response.arrayBuffer());
    },
    async reportInstall(report) {
      await jsonRequest(request, `${baseUrl}/api/install-reports`, {
        method: "POST",
        body: JSON.stringify(report),
        headers: { "content-type": "application/json", ...headers },
      }).catch((error) => {
        if (!String(error).includes("404")) {
          throw error;
        }
      });
    },
  };
}

export function resolveInstallTarget(
  input: ResolveInstallTargetInput = {}
): InstallTarget {
  if (input.explicitRoot) {
    return {
      kind: input.target ?? "project",
      agent: agentForTarget(input.target ?? "project"),
      root: input.explicitRoot,
    };
  }

  if (input.target === "project") {
    if (!input.projectRoot) {
      throw new Error("Project installs require projectRoot or explicitRoot.");
    }

    return {
      kind: "project",
      agent: "codex",
      root: join(input.projectRoot, ".agents", "skills"),
    };
  }

  return defaultDestinations[input.target ?? "codex-global"];
}

export async function writeInstallMetadata(
  skillRoot: string,
  metadata: InstallMetadata
): Promise<void> {
  await mkdir(skillRoot, { recursive: true });
  await writeFile(
    join(skillRoot, metadataFileName),
    `${JSON.stringify(metadata, null, 2)}\n`
  );
}

export async function readInstallMetadata(
  skillRoot: string
): Promise<InstallMetadata | undefined> {
  try {
    return JSON.parse(
      await readFile(join(skillRoot, metadataFileName), "utf8")
    ) as InstallMetadata;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

export async function getInstalledSkillStatus(
  skillRoot: string,
  latestApproved?: SkillVersion
): Promise<InstalledSkillStatus> {
  const metadata = await readInstallMetadata(skillRoot);

  if (!metadata) {
    return {
      state: "missing-metadata",
      latestApprovedVersionId: latestApproved?.id,
    };
  }

  const localValidation = await validateInstalledSkillRoot(skillRoot);

  if (
    localValidation.digest &&
    localValidation.digest !== metadata.contentDigest
  ) {
    return {
      state: "modified-local-content",
      metadata,
      latestApprovedVersionId: latestApproved?.id,
    };
  }

  if (latestApproved?.lifecycleState === "deprecated") {
    return {
      state: "deprecated",
      metadata,
      latestApprovedVersionId: latestApproved.id,
    };
  }

  if (latestApproved?.lifecycleState === "hidden") {
    return {
      state: "hidden",
      metadata,
      latestApprovedVersionId: latestApproved.id,
    };
  }

  if (latestApproved && metadata.versionId !== latestApproved.id) {
    return {
      state: "stale",
      metadata,
      latestApprovedVersionId: latestApproved.id,
    };
  }

  return {
    state: "current",
    metadata,
    latestApprovedVersionId: latestApproved?.id,
  };
}

export async function validateInstalledSkillRoot(skillRoot: string) {
  const entries = (await readPackageDirectory(skillRoot)).filter(
    (entry) => entry.path !== metadataFileName
  );
  return validatePackageTree(entries);
}

export async function installPackageTree(
  input: InstallPackageInput
): Promise<InstallPackageResult> {
  const validation = validatePackageTree(input.entries);

  if (!validation.ok || !validation.skillRoot) {
    throw new Error("Cannot install an invalid skill package.");
  }

  const skillRootName =
    input.packageSlug ??
    (validation.skillRoot === "."
      ? input.metadata.packageId
      : (validation.skillRoot.split("/").at(-1) ?? input.metadata.packageId));
  const skillRoot = join(input.destinationRoot, skillRootName);
  const existingMetadata = await readInstallMetadata(skillRoot);

  if (!input.force && (await exists(skillRoot)) && !existingMetadata) {
    throw new Error(
      `Refusing to overwrite unmanaged skill directory: ${skillRoot}`
    );
  }

  const normalizedRoot =
    validation.skillRoot === "." ? "" : `${validation.skillRoot}/`;
  const plannedFiles: Array<{
    relativePath: string;
    destinationPath: string;
    entry: PackageTreeEntry;
  }> = [];

  for (const entry of input.entries) {
    const normalizedPath = entry.path.replaceAll("\\", "/").replace(/^\/+/, "");

    if (
      entry.kind === "directory" ||
      !normalizedPath.startsWith(normalizedRoot)
    ) {
      continue;
    }

    const relativePath = normalizedRoot
      ? normalizedPath.slice(normalizedRoot.length)
      : normalizedPath;

    if (!relativePath) {
      continue;
    }

    const destinationPath = join(skillRoot, relativePath);
    assertInside(skillRoot, destinationPath);
    plannedFiles.push({ relativePath, destinationPath, entry });
  }

  if (existingMetadata && input.force) {
    await removeStaleManagedFiles(
      skillRoot,
      new Set(plannedFiles.map((file) => file.relativePath))
    );
  }

  const filesWritten: string[] = [];

  for (const file of plannedFiles) {
    await mkdir(dirname(file.destinationPath), { recursive: true });
    await writeFile(
      file.destinationPath,
      typeof file.entry.content === "string"
        ? Buffer.from(file.entry.content)
        : Buffer.from(file.entry.content ?? "")
    );
    filesWritten.push(relative(skillRoot, file.destinationPath));
  }

  await writeInstallMetadata(skillRoot, input.metadata);

  return {
    skillRoot,
    filesWritten: filesWritten.sort(),
    metadata: input.metadata,
  };
}

export async function installFromRegistry(
  input: InstallFromRegistryInput
): Promise<InstallPackageResult> {
  const version = await input.client.latestApprovedVersion(input.packageId);
  const archive = await input.client.downloadArtifact(
    version.artifactDigest,
    input.packageId,
    version.id
  );

  await writeFile(input.archivePath, archive);

  const entries = await readPackageZip(input.archivePath);
  const validation = validatePackageTree(entries);

  if (validation.digest !== version.artifactDigest) {
    throw new Error(
      `Artifact digest mismatch: expected ${version.artifactDigest}, got ${validation.digest ?? "missing"}`
    );
  }

  const localValidation = validatePackageTree(
    entriesForInstalledRoot(entries, validation.skillRoot ?? ".")
  );

  const result = await installPackageTree({
    entries,
    destinationRoot: input.destinationRoot,
    packageSlug: input.packageSlug,
    force: input.force,
    metadata: {
      registryUrl: input.registryUrl,
      workspaceId: input.workspaceId,
      packageId: input.packageId,
      versionId: version.id,
      contentDigest: localValidation.digest ?? version.artifactDigest,
      installTarget: input.installTarget,
      installedAt: new Date().toISOString(),
      installerVersion: "0.1.0",
      reportConsent: input.reportConsent ?? false,
    },
  });

  if (
    await shouldReportInstall(
      input.client,
      input.workspaceId,
      input.reportConsent ?? false
    )
  ) {
    await input.client.reportInstall({
      installId: `${input.packageId}:${input.installTarget.kind}`,
      packageId: input.packageId,
      versionId: version.id,
      state: "current",
      reportedAt: new Date().toISOString(),
      targetKind: input.installTarget.kind,
    });
  }

  return result;
}

function entriesForInstalledRoot(
  entries: PackageTreeEntry[],
  skillRoot: string
): PackageTreeEntry[] {
  const normalizedRoot =
    skillRoot === "."
      ? ""
      : `${skillRoot.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")}/`;

  return entries
    .map((entry) => {
      const normalizedPath = entry.path
        .replaceAll("\\", "/")
        .replace(/^\/+/, "");

      if (
        entry.kind === "directory" ||
        (normalizedRoot && !normalizedPath.startsWith(normalizedRoot))
      ) {
        return undefined;
      }

      const path = normalizedRoot
        ? normalizedPath.slice(normalizedRoot.length)
        : normalizedPath;

      if (!path) {
        return undefined;
      }

      return { ...entry, path };
    })
    .filter((entry): entry is PackageTreeEntry => Boolean(entry));
}

export async function updateFromRegistry(
  input: UpdateFromRegistryInput
): Promise<UpdateFromRegistryResult> {
  const metadata = await readInstallMetadata(input.skillRoot);

  if (!metadata) {
    throw new Error(`Missing install metadata at ${input.skillRoot}`);
  }

  const latestApproved = await input.client.latestApprovedVersion(
    metadata.packageId
  );
  const status = await getInstalledSkillStatus(input.skillRoot, latestApproved);

  if (status.state === "modified-local-content" && !input.force) {
    throw new Error(
      `Refusing to update locally modified skill without --force: ${input.skillRoot}`
    );
  }

  if (status.state === "current") {
    if (
      await shouldReportInstall(
        input.client,
        metadata.workspaceId,
        input.reportConsent ?? metadata.reportConsent
      )
    ) {
      await input.client.reportInstall({
        installId: `${metadata.packageId}:${metadata.installTarget.kind}`,
        packageId: metadata.packageId,
        versionId: metadata.versionId,
        state: "current",
        reportedAt: new Date().toISOString(),
        targetKind: metadata.installTarget.kind,
      });
    }

    return { updated: false, status };
  }

  const install = await installFromRegistry({
    client: input.client,
    registryUrl: input.registryUrl,
    workspaceId: metadata.workspaceId,
    packageId: metadata.packageId,
    packageSlug: basename(input.skillRoot),
    destinationRoot: dirname(input.skillRoot),
    installTarget: {
      ...metadata.installTarget,
      root: dirname(input.skillRoot),
    },
    archivePath: input.archivePath,
    force: true,
    reportConsent: input.reportConsent ?? metadata.reportConsent,
  });

  return { updated: true, status, install };
}

async function shouldReportInstall(
  client: RegistryClient,
  workspaceId: string,
  localConsent: boolean
): Promise<boolean> {
  const workspace = await client
    .workspaceDetail(workspaceId)
    .catch(() => undefined);

  if (workspace?.reportingPolicy === "disabled") {
    return false;
  }

  if (workspace?.reportingPolicy === "required") {
    return true;
  }

  return localConsent;
}

function agentForTarget(target: InstallTargetKind): InstallTarget["agent"] {
  if (target === "claude-global") {
    return "claude";
  }

  if (target === "openclaw-global") {
    return "openclaw";
  }

  return "codex";
}

async function removeStaleManagedFiles(
  skillRoot: string,
  nextRelativePaths: Set<string>
): Promise<void> {
  if (!(await exists(skillRoot))) {
    return;
  }

  const metadataPath = join(skillRoot, metadataFileName);

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (fullPath === metadataPath) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
        const remaining = await readdir(fullPath);

        if (remaining.length === 0) {
          await rm(fullPath, { recursive: true, force: true });
        }

        continue;
      }

      const relativePath = relative(skillRoot, fullPath).replaceAll("\\", "/");

      if (!nextRelativePaths.has(relativePath)) {
        await rm(fullPath, { force: true });
      }
    }
  }

  await walk(skillRoot);
}

async function exists(path: string) {
  return stat(path)
    .then(() => true)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return false;
      }

      throw error;
    });
}

function assertInside(root: string, candidate: string) {
  const relativePath = relative(root, candidate);

  if (relativePath.startsWith("..") || relativePath === "") {
    throw new Error(`Refusing to write outside skill root: ${candidate}`);
  }
}

export function parseOptions(args: string[]): ParsedOptions {
  const values: ParsedOptions["values"] = {};
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const name = arg.slice(2);
    const next = args[index + 1];

    if (!next || next.startsWith("--")) {
      values[name] = true;
      continue;
    }

    values[name] = next;
    index += 1;
  }

  return { values, positionals };
}

function requiredOption(parsed: ParsedOptions, name: string): string {
  const value = parsed.values[name];

  if (typeof value !== "string" || !value) {
    throw new Error(`Missing required option --${name}`);
  }

  return value;
}

function stringOption(
  parsed: ParsedOptions,
  name: string,
  fallback: string
): string {
  const value = parsed.values[name];
  return typeof value === "string" ? value : fallback;
}

function booleanOption(parsed: ParsedOptions, name: string): boolean {
  return parsed.values[name] === true || parsed.values[name] === "true";
}

function installTargetOption(parsed: ParsedOptions): InstallTargetKind {
  const value = stringOption(parsed, "target", "codex-global");

  if (
    value === "codex-global" ||
    value === "claude-global" ||
    value === "openclaw-global" ||
    value === "project"
  ) {
    return value;
  }

  throw new Error(`Unsupported install target: ${value}`);
}

function helpText() {
  return [
    "skill-library commands:",
    "  workspace --workspace <workspace-id> [--registry <url>] [--token <token>]",
    "  search --workspace <workspace-id> [query] [--registry <url>] [--token <token>]",
    "  info <package-id> [--registry <url>] [--token <token>]",
    "  install <package-id> --workspace <workspace-id> --root <path> [--slug <slug>] [--target <target>] [--force] [--report] [--registry <url>] [--token <token>]",
    "  validate (--root <skill-root> | --archive <zip-path>)",
    "  update --root <skill-root> [--force] [--report] [--registry <url>] [--token <token>]",
    "  status --root <skill-root> [--package <package-id>] [--registry <url>] [--token <token>]",
    "  install-plan <package-slug> [--target <target>]",
  ].join("\n");
}

async function jsonRequest<T>(
  request: typeof fetch,
  input: string | URL,
  init?: RequestInit | HeadersInit
): Promise<T> {
  const requestInit = toRequestInit(init);
  const response = await request(input, requestInit);

  if (!response.ok) {
    throw new Error(
      `Registry request failed: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as T;
}

function authHeaders(token: string | undefined): HeadersInit {
  return token ? { authorization: `Bearer ${token}` } : {};
}

function toRequestInit(
  init: RequestInit | HeadersInit | undefined
): RequestInit | undefined {
  if (!init) {
    return undefined;
  }

  if (
    init instanceof Headers ||
    Array.isArray(init) ||
    !("headers" in init || "method" in init || "body" in init)
  ) {
    return { headers: init as HeadersInit };
  }

  return init as RequestInit;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runCli(process.argv.slice(2));
}
