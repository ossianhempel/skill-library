import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createRegistryStore } from "@skill-library/storage";
import { createRegistryApi } from "./index.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.map((dir) => rm(dir, { recursive: true, force: true }))
  );
  tmpDirs.length = 0;
});

describe("registry artifact ingestion", () => {
  it("validates and stores valid package artifacts by digest", async () => {
    const store = await createRegistryStore({ dataDir: await makeTmpDir() });

    try {
      await store.migrate();
      const api = createRegistryApi(store);
      const result = await api.ingestArtifact([
        {
          path: "demo/SKILL.md",
          content: skillMd("demo", "Demo skill package."),
        },
        { path: "demo/references/a.md", content: "A\n" },
      ]);

      expect(result.validation.ok).toBe(true);
      expect(result.artifact.digest).toBe(result.validation.digest);
      await expect(
        store.readArtifactContent(result.artifact.digest)
      ).resolves.toEqual(expect.any(Buffer));
    } finally {
      await store.close();
    }
  });

  it("refuses invalid package artifacts", async () => {
    const store = await createRegistryStore({ dataDir: await makeTmpDir() });

    try {
      await store.migrate();
      const api = createRegistryApi(store);

      await expect(
        api.ingestArtifact([{ path: "README.md", content: "No skill\n" }])
      ).rejects.toThrow("Cannot ingest");
    } finally {
      await store.close();
    }
  });
});

describe("slug immutability", () => {
  it("keeps the originally-published slug when a later upload supplies a variant", async () => {
    const store = await createRegistryStore({ dataDir: await makeTmpDir() });

    try {
      await store.migrate();
      const api = createRegistryApi(store);
      const entries = [
        {
          path: "demo/SKILL.md",
          content: skillMd("demo", "Demo skill package."),
        },
      ];

      const first = await api.createUploadedVersion({
        workspaceId: "main",
        packageSlug: "Cool Skill",
        packageName: "Cool Skill",
        description: "First publish.",
        version: "1.0.0",
        entries,
      });

      // A case/format variant resolves to the same packageId via stableId.
      const second = await api.createUploadedVersion({
        workspaceId: "main",
        packageSlug: "cool-skill",
        packageName: "Cool Skill",
        description: "Second publish with a slug variant.",
        version: "1.1.0",
        entries,
      });

      expect(second.packageId).toBe(first.packageId);
      const pkg = await api.packageDetail(first.packageId);
      expect(pkg?.slug).toBe("Cool Skill");
    } finally {
      await store.close();
    }
  });
});

async function makeTmpDir() {
  const dir = await mkdtemp(join(tmpdir(), "skill-library-server-"));
  tmpDirs.push(dir);
  return dir;
}

function skillMd(
  name: string,
  description: string,
  body = "# Skill\n\nBody content.\n"
): string {
  return `---
name: ${name}
description: ${description}
---
${body}`;
}
