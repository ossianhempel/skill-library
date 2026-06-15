#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const MAX_LINES = 500;
const IGNORED_EXTENSIONS = new Set([".md", ".mdx"]);
const IGNORED_DIRECTORIES = new Set(["docs", "skills"]);
// Stylesheets are intentionally excluded: the LOC limit targets code modules
// (where a large file signals tangled logic). A single large stylesheet is
// idiomatic, and splitting it trades real cascade/import-order fragility for no
// maintainability gain.
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".go",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".py",
  ".rs",
  ".sh",
  ".swift",
  ".ts",
  ".tsx",
]);

function stagedFiles() {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { encoding: "utf8" }
  );

  return output.split(/\r?\n/).filter(Boolean);
}

function extensionOf(path) {
  const match = path.match(/(\.[^./]+)$/);
  return match ? match[1].toLowerCase() : "";
}

function shouldCheck(path) {
  const parts = path.split("/");
  if (parts.some((part) => IGNORED_DIRECTORIES.has(part))) return false;

  const extension = extensionOf(path);
  if (IGNORED_EXTENSIONS.has(extension)) return false;

  return SOURCE_EXTENSIONS.has(extension);
}

const oversized = [];

for (const file of stagedFiles()) {
  if (!shouldCheck(file) || !existsSync(file)) continue;

  const text = readFileSync(file, "utf8").replace(/\r?\n$/, "");
  const lines = text.length === 0 ? 0 : text.split(/\r?\n/).length;

  if (lines > MAX_LINES) {
    oversized.push({ file, lines });
  }
}

if (oversized.length > 0) {
  console.error(`Files must be ${MAX_LINES} lines or fewer:`);
  for (const { file, lines } of oversized) {
    console.error(`- ${file}: ${lines} lines`);
  }
  process.exit(1);
}
