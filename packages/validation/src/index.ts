import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative } from "node:path";
import yauzl from "yauzl";
import yazl from "yazl";
import type { ArtifactFile, ValidationResult } from "@skill-library/domain";
import { validateSkillMd } from "./skill-md.js";

// Rule catalog: docs/validation-rules.md

export interface PackageTreeEntry {
  path: string;
  content?: Uint8Array | string;
  kind?: "file" | "directory";
}

export function validatePackageTree(entries: PackageTreeEntry[]): ValidationResult {
  const normalized = entries.map(normalizeEntry);
  const issues: ValidationResult["issues"] = normalized.flatMap((entry) => validatePath(entry.path));
  const safeEntries = normalized.filter((entry) => !validatePath(entry.path).some((issue) => issue.severity === "error"));
  const skillRoot = findSkillRoot(safeEntries.map((entry) => entry.path));

  if (!skillRoot) {
    issues.push({
      ruleId: "required-skill-md",
      severity: "error",
      message: "Package must contain exactly one skill root with SKILL.md.",
      path: "SKILL.md"
    });
  } else {
    const skillMdPath = skillRoot === "." ? "SKILL.md" : `${skillRoot}/SKILL.md`;
    const skillMdEntry = safeEntries.find((entry) => entry.path === skillMdPath && entry.kind === "file");

    if (skillMdEntry) {
      const content =
        typeof skillMdEntry.content === "string" ? skillMdEntry.content : Buffer.from(skillMdEntry.content).toString("utf8");
      issues.push(...validateSkillMd(content, skillRoot, skillMdPath));
    }
  }

  const files = safeEntries.map(toArtifactFile).sort((left, right) => left.path.localeCompare(right.path));
  const digest = digestFiles(files);

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    digest,
    skillRoot,
    files,
    issues
  };
}

export async function readPackageDirectory(rootDir: string): Promise<PackageTreeEntry[]> {
  const entries: PackageTreeEntry[] = [];

  await collectDirectoryEntries(rootDir, rootDir, entries);

  return entries;
}

export async function readPackageZip(archivePath: string): Promise<PackageTreeEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError) {
        reject(openError);
        return;
      }

      if (!zipFile) {
        reject(new Error(`Unable to open archive: ${archivePath}`));
        return;
      }

      const entries: PackageTreeEntry[] = [];

      zipFile.readEntry();
      zipFile.on("entry", (entry) => {
        if (entry.fileName.endsWith("/")) {
          entries.push({ path: entry.fileName.replace(/\/$/, ""), kind: "directory" });
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            reject(streamError);
            return;
          }

          if (!stream) {
            reject(new Error(`Unable to read archive entry: ${entry.fileName}`));
            return;
          }

          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => {
            entries.push({ path: entry.fileName, content: Buffer.concat(chunks), kind: "file" });
            zipFile.readEntry();
          });
        });
      });
      zipFile.on("error", reject);
      zipFile.on("end", () => resolve(entries));
    });
  });
}

export async function packPackageZip(entries: PackageTreeEntry[]): Promise<Buffer> {
  const zip = new yazl.ZipFile();

  for (const entry of entries.map(normalizeEntry).sort((left, right) => left.path.localeCompare(right.path))) {
    if (entry.kind === "directory") {
      zip.addEmptyDirectory(entry.path);
      continue;
    }

    const content = typeof entry.content === "string" ? Buffer.from(entry.content) : Buffer.from(entry.content);
    zip.addBuffer(content, entry.path);
  }

  zip.end();

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on("error", reject);
  });
}

function normalizeEntry(entry: PackageTreeEntry): Required<PackageTreeEntry> {
  return {
    path: entry.path.replaceAll("\\", "/").replace(/^\/+/, ""),
    content: entry.content ?? "",
    kind: entry.kind ?? "file"
  };
}

async function collectDirectoryEntries(rootDir: string, currentDir: string, entries: PackageTreeEntry[]) {
  const dirEntries = await readdir(currentDir, { withFileTypes: true });

  for (const dirEntry of dirEntries) {
    const absolutePath = `${currentDir}/${dirEntry.name}`;
    const path = relative(rootDir, absolutePath).replaceAll("\\", "/");

    if (dirEntry.isDirectory()) {
      entries.push({ path, kind: "directory" });
      await collectDirectoryEntries(rootDir, absolutePath, entries);
      continue;
    }

    if (dirEntry.isFile()) {
      entries.push({ path, content: await readFile(absolutePath), kind: "file" });
    }
  }
}

function validatePath(path: string) {
  const issues = [];
  const segments = path.split("/");

  if (!path || path === ".") {
    issues.push({
      ruleId: "invalid-path",
      severity: "error" as const,
      message: "Package entries must have a file-relative path.",
      path
    });
  }

  if (segments.includes("..")) {
    issues.push({
      ruleId: "path-traversal",
      severity: "error" as const,
      message: "Package entries cannot traverse outside the skill root.",
      path
    });
  }

  return issues;
}

function findSkillRoot(paths: string[]): string | undefined {
  const roots = paths
    .filter((path) => path.endsWith("SKILL.md"))
    .map((path) => path.slice(0, -"SKILL.md".length).replace(/\/$/, ""))
    .map((root) => root || ".");

  return roots.length === 1 ? roots[0] : undefined;
}

function toArtifactFile(entry: Required<PackageTreeEntry>): ArtifactFile {
  const content = typeof entry.content === "string" ? Buffer.from(entry.content) : Buffer.from(entry.content);

  return {
    path: entry.path,
    size: entry.kind === "directory" ? 0 : content.byteLength,
    digest: entry.kind === "directory" ? "" : createHash("sha256").update(content).digest("hex"),
    kind: entry.kind
  };
}

function digestFiles(files: ArtifactFile[]): string {
  const hash = createHash("sha256");

  for (const file of files) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.kind);
    hash.update("\0");
    hash.update(file.digest);
    hash.update("\0");
  }

  return `sha256:${hash.digest("hex")}`;
}
