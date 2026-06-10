import { describe, expect, it } from "vitest";
import { createWriteStream } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import yazl from "yazl";
import { packPackageZip, readPackageDirectory, readPackageZip, validatePackageTree } from "./index.js";

function skillMd(name: string, description: string, body = "# Skill\n\nBody content.\n"): string {
  return `---
name: ${name}
description: ${description}
---
${body}`;
}

describe("validatePackageTree", () => {
  it("accepts a skill root with bundled files", () => {
    const result = validatePackageTree([
      { path: "code-review/SKILL.md", content: skillMd("code-review", "Review code changes.") },
      { path: "code-review/scripts/check.ts", content: "export {};\n" }
    ]);

    expect(result.ok).toBe(true);
    expect(result.skillRoot).toBe("code-review");
    expect(result.files.map((file) => file.path).sort()).toEqual(["code-review/SKILL.md", "code-review/scripts/check.ts"].sort());
    expect(result.digest).toMatch(/^sha256:/);
  });

  it("rejects packages without SKILL.md", () => {
    const result = validatePackageTree([{ path: "README.md", content: "No skill here\n" }]);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        ruleId: "required-skill-md",
        severity: "error"
      })
    );
  });

  it("rejects path traversal entries", () => {
    const result = validatePackageTree([{ path: "../SKILL.md", content: skillMd("unsafe", "Unsafe path.") }]);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        ruleId: "path-traversal",
        severity: "error",
        path: "../SKILL.md"
      })
    );
  });

  it("rejects SKILL.md without frontmatter", () => {
    const result = validatePackageTree([{ path: "demo/SKILL.md", content: "# Demo\n" }]);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        ruleId: "skill-md-missing-frontmatter",
        severity: "error"
      })
    );
  });

  it("rejects invalid frontmatter name format", () => {
    const result = validatePackageTree([
      { path: "demo/SKILL.md", content: skillMd("Bad_Name", "Invalid name format.") }
    ]);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        ruleId: "skill-md-invalid-name-format",
        severity: "error"
      })
    );
  });

  it("rejects name directory mismatch", () => {
    const result = validatePackageTree([
      { path: "demo/SKILL.md", content: skillMd("other-name", "Name does not match folder.") }
    ]);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        ruleId: "skill-md-name-directory-mismatch",
        severity: "error"
      })
    );
  });

  it("warns when the body is empty but frontmatter is valid", () => {
    const result = validatePackageTree([
      { path: "demo/SKILL.md", content: skillMd("demo", "Valid frontmatter with no body.", "") }
    ]);

    expect(result.ok).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        ruleId: "skill-md-body-empty",
        severity: "warning"
      })
    );
  });

  it("produces the same digest for identical artifacts regardless of entry order", () => {
    const skillContent = skillMd("demo", "Deterministic digest.");
    const first = validatePackageTree([
      { path: "demo/SKILL.md", content: skillContent },
      { path: "demo/references/a.md", content: "A\n" }
    ]);
    const second = validatePackageTree([
      { path: "demo/references/a.md", content: "A\n" },
      { path: "demo/SKILL.md", content: skillContent }
    ]);

    expect(first.digest).toBe(second.digest);
  });
});

describe("artifact readers", () => {
  it("reads a package directory into validation entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "skill-library-validation-"));
    await writeFile(
      join(root, "SKILL.md"),
      skillMd("directory-skill", "Directory skill example.", "# Directory skill\n")
    );

    const entries = await readPackageDirectory(root);
    const result = validatePackageTree(entries);

    expect(entries).toContainEqual(expect.objectContaining({ path: "SKILL.md", kind: "file" }));
    expect(result.ok).toBe(true);
    expect(result.skillRoot).toBe(".");
  });

  it("reads a zip archive into validation entries", async () => {
    const archivePath = join(await mkdtemp(join(tmpdir(), "skill-library-validation-")), "skill.zip");
    await writeZip(archivePath, {
      "zip-skill/SKILL.md": skillMd("zip-skill", "Zip skill example."),
      "zip-skill/references/a.md": "A\n"
    });

    const entries = await readPackageZip(archivePath);
    const result = validatePackageTree(entries);

    expect(entries.map((entry) => entry.path).sort()).toEqual(["zip-skill/SKILL.md", "zip-skill/references/a.md"]);
    expect(result.ok).toBe(true);
    expect(result.skillRoot).toBe("zip-skill");
  });

  it("packs normalized package entries as a readable zip archive", async () => {
    const archivePath = join(await mkdtemp(join(tmpdir(), "skill-library-validation-")), "packed.zip");
    const packed = await packPackageZip([
      { path: "packed-skill/SKILL.md", content: skillMd("packed-skill", "Packed skill example.") },
      { path: "packed-skill/references/a.md", content: "A\n" }
    ]);

    await writeFile(archivePath, packed);

    const entries = await readPackageZip(archivePath);
    const result = validatePackageTree(entries);

    expect(result.ok).toBe(true);
    expect(result.skillRoot).toBe("packed-skill");
  });
});

describe("example skill packages", () => {
  it("keeps valid examples publishable", async () => {
    const examplesRoot = resolve(process.cwd(), "..", "..", "examples", "skills");

    await expect(validateDirectory(join(examplesRoot, "review-helper-v1"))).resolves.toEqual(expect.objectContaining({ ok: true, skillRoot: "." }));
    await expect(validateDirectory(join(examplesRoot, "review-helper-v2"))).resolves.toEqual(expect.objectContaining({ ok: true, skillRoot: "." }));
  });

  it("keeps the invalid example blocked by validation", async () => {
    const result = await validateDirectory(resolve(process.cwd(), "..", "..", "examples", "skills", "invalid-missing-skill"));

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ ruleId: "required-skill-md" }));
  });

  it("blocks the bad frontmatter example", async () => {
    const result = await validateDirectory(resolve(process.cwd(), "..", "..", "examples", "skills", "invalid-bad-frontmatter"));

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ ruleId: "skill-md-missing-frontmatter" }));
  });
});

async function validateDirectory(path: string) {
  return validatePackageTree(await readPackageDirectory(path));
}

async function writeZip(path: string, files: Record<string, string>) {
  const zip = new yazl.ZipFile();

  for (const [filePath, content] of Object.entries(files)) {
    zip.addBuffer(Buffer.from(content), filePath);
  }

  zip.end();

  await new Promise<void>((resolve, reject) => {
    zip.outputStream.pipe(createWriteStream(path)).on("close", resolve).on("error", reject);
  });
}
