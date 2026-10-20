import { describe, expect, it } from "vitest";
import {
  packForClaudeApp,
  packPackageZip,
  readPackageZipBuffer,
} from "./index.js";

const skillMd = (name: string) =>
  `---\nname: ${name}\ndescription: Review code changes.\n---\n# Skill\n`;

async function pathsIn(archive: Buffer) {
  return (await readPackageZipBuffer(archive))
    .map((entry) => entry.path)
    .sort();
}

describe("packForClaudeApp", () => {
  it("wraps a root-level skill in a folder named after the skill", async () => {
    const archive = await packPackageZip([
      { path: "SKILL.md", content: skillMd("code-review") },
      { path: "scripts/check.ts", content: "export {};\n" },
    ]);

    const result = await packForClaudeApp(archive, "fallback");

    expect(result.folder).toBe("code-review");
    expect(await pathsIn(result.content)).toEqual([
      "code-review/SKILL.md",
      "code-review/scripts/check.ts",
    ]);
  });

  it("re-roots a nested skill folder and drops files outside it", async () => {
    const archive = await packPackageZip([
      { path: "repo/skills/helper/SKILL.md", content: skillMd("helper") },
      { path: "repo/skills/helper/notes.md", content: "notes" },
      { path: "repo/README.md", content: "readme" },
    ]);

    const result = await packForClaudeApp(archive, "fallback");

    expect(await pathsIn(result.content)).toEqual([
      "helper/SKILL.md",
      "helper/notes.md",
    ]);
  });

  it("falls back to the slug, then to 'skill', when the name is unusable", async () => {
    const archive = await packPackageZip([
      { path: "SKILL.md", content: skillMd("Not A Valid Name") },
    ]);

    expect((await packForClaudeApp(archive, "my-slug")).folder).toBe("my-slug");
    expect((await packForClaudeApp(archive, "../evil")).folder).toBe("skill");
  });

  it("rejects artifacts without exactly one SKILL.md", async () => {
    const archive = await packPackageZip([{ path: "README.md", content: "x" }]);

    await expect(packForClaudeApp(archive, "x")).rejects.toThrow("SKILL.md");
  });
});
