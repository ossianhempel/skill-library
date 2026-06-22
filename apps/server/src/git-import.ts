import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, isAbsolute } from "node:path";
import { promisify } from "node:util";
import * as tar from "tar";
import {
  readPackageDirectory,
  type PackageTreeEntry,
} from "@skill-library/validation";

const execFileAsync = promisify(execFile);
const GIT_ENV_KEYS = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_PREFIX",
]);

export interface GitImportRequest {
  repositoryPath: string;
  ref?: string;
  subdirectory?: string;
}

export interface GitImportResult {
  entries: PackageTreeEntry[];
  commit: string;
  ref: string;
  sourceUrl: string;
  authorName?: string;
  authorEmail?: string;
}

export async function importPackageTreeFromGit(
  input: GitImportRequest
): Promise<GitImportResult> {
  const ref = input.ref ?? "HEAD";
  const commit = await resolveCommit(input.repositoryPath, ref);
  const sourceUrl = await resolveSourceUrl(input.repositoryPath);
  const extractDir = await mkdtemp(join(tmpdir(), "skill-library-git-import-"));
  const archivePath = join(extractDir, "archive.tar");

  await execFileAsync(
    "git",
    [
      "-C",
      input.repositoryPath,
      "archive",
      "--format=tar",
      `--output=${archivePath}`,
      commit,
    ],
    { env: gitCommandEnv() }
  );
  await tar.extract({ file: archivePath, cwd: extractDir });
  const packageRoot = resolveSubdirectoryWithin(extractDir, input.subdirectory);

  const authorName = await resolveAuthorName(input.repositoryPath, commit);
  const authorEmail = await resolveAuthorEmail(input.repositoryPath, commit);

  return {
    entries: await readPackageDirectory(packageRoot),
    commit,
    ref,
    sourceUrl,
    authorName,
    authorEmail,
  };
}

export function resolveSubdirectoryWithin(
  extractDir: string,
  subdirectory?: string
): string {
  const root = resolve(extractDir);

  if (!subdirectory?.trim()) {
    return root;
  }

  if (subdirectory.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(subdirectory)) {
    throw new Error("Invalid subdirectory path.");
  }

  const resolved = resolve(root, subdirectory);
  const relativePath = relative(root, resolved);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("Subdirectory must stay within the extracted archive.");
  }

  return resolved;
}

async function resolveCommit(repositoryPath: string, ref: string) {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repositoryPath, "rev-parse", ref],
    { env: gitCommandEnv() }
  );
  return stdout.trim();
}

async function resolveSourceUrl(repositoryPath: string) {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repositoryPath, "remote", "get-url", "origin"],
    { env: gitCommandEnv() }
  ).catch(() => ({ stdout: repositoryPath }));
  return stdout.trim() || repositoryPath;
}

async function resolveAuthorName(
  repositoryPath: string,
  commit: string
): Promise<string | undefined> {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repositoryPath, "log", "-1", "--format=%an", commit],
    { env: gitCommandEnv() }
  ).catch(() => ({ stdout: "" }));
  return stdout.trim() || undefined;
}

async function resolveAuthorEmail(
  repositoryPath: string,
  commit: string
): Promise<string | undefined> {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repositoryPath, "log", "-1", "--format=%ae", commit],
    { env: gitCommandEnv() }
  ).catch(() => ({ stdout: "" }));
  return stdout.trim() || undefined;
}

function gitCommandEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !GIT_ENV_KEYS.has(key))
  );
}
