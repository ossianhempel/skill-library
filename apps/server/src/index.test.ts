import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createRegistryStore } from "@skill-library/storage";
import { createRegistryApi } from "./index.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tmpDirs.length = 0;
});

describe("registry artifact ingestion", () => {
  it("validates and stores valid package artifacts by digest", async () => {
    const store = await createRegistryStore({ dataDir: await makeTmpDir() });

    try {
      await store.migrate();
      const api = createRegistryApi(store);
      const result = await api.ingestArtifact([
        { path: "demo/SKILL.md", content: "# Demo\n" },
        { path: "demo/references/a.md", content: "A\n" }
      ]);

      expect(result.validation.ok).toBe(true);
      expect(result.artifact.digest).toBe(result.validation.digest);
      await expect(store.readArtifactContent(result.artifact.digest)).resolves.toEqual(expect.any(Buffer));
    } finally {
      await store.close();
    }
  });

  it("refuses invalid package artifacts", async () => {
    const store = await createRegistryStore({ dataDir: await makeTmpDir() });

    try {
      await store.migrate();
      const api = createRegistryApi(store);

      await expect(api.ingestArtifact([{ path: "README.md", content: "No skill\n" }])).rejects.toThrow("Cannot ingest");
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
