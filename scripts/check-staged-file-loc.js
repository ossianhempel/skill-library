#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

// Files that already exceeded MAX_LINES when this check was introduced, with the
// count they were at. They are allowed to stay oversized but may never grow --
// a ratchet, so the debt can only shrink.
//
// Without this, the check blocked every commit touching one of these files, so
// it was routinely bypassed with --no-verify and enforced nothing at all. A rule
// that is always skipped is worse than a rule with an explicit, visible baseline.
//
// To pay debt down: split the file, then lower or delete its baseline entry. The
// check tells you when an entry is stale.
const BASELINE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "max-lines-baseline.json"
);

function baseline() {
  if (!existsSync(BASELINE_PATH)) return {};
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

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

function lineCount(path) {
  const text = readFileSync(path, "utf8").replace(/\r?\n$/, "");
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
}

const allowed = baseline();
const oversized = [];
const grown = [];
const improved = [];

for (const file of stagedFiles()) {
  if (!shouldCheck(file) || !existsSync(file)) continue;

  const lines = lineCount(file);
  const allowance = allowed[file];

  if (allowance === undefined) {
    if (lines > MAX_LINES) oversized.push({ file, lines });
    continue;
  }

  if (lines > allowance) {
    grown.push({ file, lines, allowance });
  } else if (lines < allowance) {
    improved.push({ file, lines, allowance });
  }
}

for (const { file, lines, allowance } of improved) {
  console.log(
    `${file} is down to ${lines} lines (baseline ${allowance}). ` +
      `Lower it in scripts/max-lines-baseline.json to lock the win in.`
  );
}

if (oversized.length > 0) {
  console.error(`Files must be ${MAX_LINES} lines or fewer:`);
  for (const { file, lines } of oversized) {
    console.error(`- ${file}: ${lines} lines`);
  }
}

if (grown.length > 0) {
  console.error(
    `These files are already over the ${MAX_LINES}-line limit and must not grow:`
  );
  for (const { file, lines, allowance } of grown) {
    console.error(`- ${file}: ${lines} lines (baseline ${allowance})`);
  }
  console.error(
    "Move the new code into a smaller module, or split the file and lower its baseline."
  );
}

if (oversized.length > 0 || grown.length > 0) {
  process.exit(1);
}
