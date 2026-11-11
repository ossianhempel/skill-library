import type { SkillFile } from "./skills.js";

/** One line of a unified diff: kept (" "), added ("+") or removed ("-"). */
export interface DiffLine {
  op: " " | "+" | "-";
  text: string;
}

export interface FileDiff {
  path: string;
  status: "added" | "removed" | "changed";
  /** Hunks of lines with up to three lines of context, or none for binary files. */
  hunks: DiffLine[][];
  binary?: boolean;
  /** Set when the file was too long to diff line by line. */
  tooLarge?: boolean;
}

const CONTEXT = 3;
/** LCS is quadratic; above this many lines per side, report the file as changed. */
const MAX_LINES = 2000;

/** What changed between two versions of a skill, file by file. */
export function diffSkillFiles(
  before: SkillFile[],
  after: SkillFile[]
): FileDiff[] {
  const old = new Map(before.map((file) => [file.path, file]));
  const next = new Map(after.map((file) => [file.path, file]));
  const paths = [...new Set([...old.keys(), ...next.keys()])].sort(
    (a, b) =>
      Number(b === "SKILL.md") - Number(a === "SKILL.md") || a.localeCompare(b)
  );
  const diffs: FileDiff[] = [];

  for (const path of paths) {
    const a = old.get(path);
    const b = next.get(path);
    if (a && b && a.bytes.equals(b.bytes)) continue;
    const status = !a ? "added" : !b ? "removed" : "changed";

    if ((a && a.text === undefined) || (b && b.text === undefined)) {
      diffs.push({ path, status, hunks: [], binary: true });
      continue;
    }

    const left = a ? splitLines(a.text!) : [];
    const right = b ? splitLines(b.text!) : [];
    if (left.length > MAX_LINES || right.length > MAX_LINES) {
      diffs.push({ path, status, hunks: [], tooLarge: true });
      continue;
    }
    diffs.push({ path, status, hunks: hunks(diffLines(left, right)) });
  }

  return diffs;
}

/** A line diff by longest common subsequence. */
export function diffLines(left: string[], right: string[]): DiffLine[] {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const lcs = new Uint32Array(rows * cols);

  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      lcs[i * cols + j] =
        left[i] === right[j]
          ? lcs[(i + 1) * cols + j + 1]! + 1
          : Math.max(lcs[(i + 1) * cols + j]!, lcs[i * cols + j + 1]!);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      lines.push({ op: " ", text: left[i]! });
      i++;
      j++;
    } else if (lcs[(i + 1) * cols + j]! >= lcs[i * cols + j + 1]!) {
      lines.push({ op: "-", text: left[i++]! });
    } else {
      lines.push({ op: "+", text: right[j++]! });
    }
  }
  while (i < left.length) lines.push({ op: "-", text: left[i++]! });
  while (j < right.length) lines.push({ op: "+", text: right[j++]! });
  return lines;
}

/** Groups changed lines into hunks with a little context around each. */
function hunks(lines: DiffLine[]): DiffLine[][] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, index) => {
    if (line.op === " ") return;
    for (
      let k = Math.max(0, index - CONTEXT);
      k <= Math.min(lines.length - 1, index + CONTEXT);
      k++
    ) {
      keep[k] = true;
    }
  });

  const groups: DiffLine[][] = [];
  let current: DiffLine[] | undefined;
  lines.forEach((line, index) => {
    if (!keep[index]) {
      current = undefined;
      return;
    }
    if (!current) groups.push((current = []));
    current.push(line);
  });
  return groups;
}

function splitLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}
