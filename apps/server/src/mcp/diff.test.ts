import { describe, expect, it } from "vitest";
import { diffSkillFiles } from "./diff.js";
import type { SkillFile } from "./skills.js";

const file = (path: string, text: string): SkillFile => ({
  path,
  text,
  size: text.length,
  bytes: Buffer.from(text),
});

describe("diffSkillFiles", () => {
  it("shows changed lines with context and skips unchanged files", () => {
    const diffs = diffSkillFiles(
      [file("SKILL.md", "a\nb\nc\n"), file("same.md", "x\n")],
      [file("SKILL.md", "a\nB\nc\n"), file("same.md", "x\n")]
    );
    expect(diffs).toEqual([
      {
        path: "SKILL.md",
        status: "changed",
        hunks: [
          [
            { op: " ", text: "a" },
            { op: "-", text: "b" },
            { op: "+", text: "B" },
            { op: " ", text: "c" },
          ],
        ],
      },
    ]);
  });

  it("flags a change of line endings instead of showing an empty diff", () => {
    const [diff] = diffSkillFiles(
      [file("run.sh", "#!/bin/sh\necho hi\n")],
      [file("run.sh", "#!/bin/sh\r\necho hi\r\n")]
    );
    expect(diff).toEqual({
      path: "run.sh",
      status: "changed",
      hunks: [],
      lineEndingsOnly: true,
    });
  });

  it("lists an added empty file without flagging line endings", () => {
    expect(diffSkillFiles([], [file("empty.md", "")])).toEqual([
      { path: "empty.md", status: "added", hunks: [] },
    ]);
  });
});
