import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, isAbsolute } from "node:path";
import { promisify } from "node:util";
import * as tar from "tar";
import { readPackageDirectory, type PackageTreeEntry } from "@skill-library/validation";

const execFileAsync = promisify(execFile);

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
}

export async function importPackageTreeFromGit(input: GitImportRequest): Promise<GitImportResult> {
  const ref = input.ref ?? "HEAD";
  const commit = await resolveCommit(input.repositoryPath, ref);
  const sourceUrl = await resolveSourceUrl(input.repositoryPath);
  const extractDir = await mkdtemp(join(tmpdir(), "skill-library-git-import-"));
  const archivePath = join(extractDir, "archive.tar");

  await execFileAsync("git", ["-C", input.repositoryPath, "archive", "--format=tar", `--output=${archivePath}`, commit]);
  await tar.extract({ file: archivePath, cwd: extractDir });
  const packageRoot = resolveSubdirectoryWithin(extractDir, input.subdirectory);

  return {
    entries: await readPackageDirectory(packageRoot),
    commit,
    ref,
    sourceUrl
  };
}

export function resolveSubdirectoryWithin(extractDir: string, subdirectory?: string): string {
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
  const { stdout } = await execFileAsync("git", ["-C", repositoryPath, "rev-parse", ref]);
  return stdout.trim();
}

async function resolveSourceUrl(repositoryPath: string) {
  const { stdout } = await execFileAsync("git", ["-C", repositoryPath, "remote", "get-url", "origin"]).catch(() => ({ stdout: repositoryPath }));
  return stdout.trim() || repositoryPath;
}
