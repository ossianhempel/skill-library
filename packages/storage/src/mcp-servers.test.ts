import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { McpServerEntry } from "@skill-library/domain";
import {
  createRegistryStore,
  MemoryRegistryStore,
  type RegistryStore,
} from "./index.js";

const tmpDirs: string[] = [];
const stores: RegistryStore[] = [];

afterEach(async () => {
  await Promise.all(stores.map((store) => store.close()));
  stores.length = 0;
  await Promise.all(
    tmpDirs.map((dir) => rm(dir, { recursive: true, force: true }))
  );
  tmpDirs.length = 0;
});

function mcpEntry(overrides: Partial<McpServerEntry> = {}): McpServerEntry {
  return {
    id: "mcp-1",
    workspaceId: "main",
    slug: "brain",
    name: "Company brain",
    description: "Search the company wiki.",
    url: "https://brain.example.com/mcp",
    access: "Everyone",
    notes: "",
    docsUrl: null,
    createdById: "user-1",
    createdByName: "Ada",
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
    ...overrides,
  };
}

const engines: Array<[string, () => Promise<RegistryStore>]> = [
  ["memory", async () => new MemoryRegistryStore()],
  [
    "pglite",
    async () => {
      const dataDir = await mkdtemp(join(tmpdir(), "sl-mcp-"));
      tmpDirs.push(dataDir);
      const store = await createRegistryStore({ dataDir });
      await store.migrate();
      stores.push(store);
      return store;
    },
  ],
];

describe.each(engines)("MCP server directory (%s)", (_name, open) => {
  it("lists a workspace's servers by name and keeps other workspaces apart", async () => {
    const store = await open();
    await store.mcpServers.save(
      mcpEntry({ id: "a", slug: "skills", name: "Skill library" })
    );
    await store.mcpServers.save(mcpEntry({ id: "b" }));
    await store.mcpServers.save(mcpEntry({ id: "c", workspaceId: "other" }));

    const listed = await store.mcpServers.list("main");
    expect(listed.map((entry) => entry.slug)).toEqual(["brain", "skills"]);
    expect(listed[0]).toEqual(mcpEntry({ id: "b" }));
  });

  it("updates an entry with the same slug but keeps who created it", async () => {
    const store = await open();
    await store.mcpServers.save(mcpEntry());
    await store.mcpServers.save(
      mcpEntry({
        id: "ignored",
        url: "https://brain.example.com/v2/mcp",
        docsUrl: "https://example.com/help",
        createdById: "user-2",
        createdByName: "Bob",
        updatedAt: "2026-11-02T10:00:00.000Z",
      })
    );

    const saved = await store.mcpServers.get("main", "brain");
    expect(saved).toMatchObject({
      id: "mcp-1",
      url: "https://brain.example.com/v2/mcp",
      docsUrl: "https://example.com/help",
      createdByName: "Ada",
      updatedAt: "2026-11-02T10:00:00.000Z",
    });
    expect(await store.mcpServers.list("main")).toHaveLength(1);
  });

  it("removes an entry and reports whether one was there", async () => {
    const store = await open();
    await store.mcpServers.save(mcpEntry());

    expect(await store.mcpServers.remove("main", "brain")).toBe(true);
    expect(await store.mcpServers.remove("main", "brain")).toBe(false);
    expect(await store.mcpServers.get("main", "brain")).toBeUndefined();
  });
});
