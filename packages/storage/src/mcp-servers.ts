import type { Insertable, Kysely, Selectable } from "kysely";
import type { McpServerEntry } from "@skill-library/domain";
import type { DatabaseSchema } from "./kysely.js";

/** The MCP servers listed in a workspace, by slug. */
export interface McpServerDirectory {
  list(workspaceId: string): Promise<McpServerEntry[]>;
  get(workspaceId: string, slug: string): Promise<McpServerEntry | undefined>;
  /** Inserts, or replaces the entry with the same workspace and slug. */
  save(entry: McpServerEntry): Promise<McpServerEntry>;
  /** Returns whether an entry was removed. */
  remove(workspaceId: string, slug: string): Promise<boolean>;
}

type Row = DatabaseSchema["mcp_servers"];

export class SqlMcpServerDirectory implements McpServerDirectory {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async list(workspaceId: string): Promise<McpServerEntry[]> {
    const rows = await this.db
      .selectFrom("mcp_servers")
      .selectAll()
      .where("workspace_id", "=", workspaceId)
      .execute();
    return sortByName(rows.map(fromRow));
  }

  async get(
    workspaceId: string,
    slug: string
  ): Promise<McpServerEntry | undefined> {
    const row = await this.db
      .selectFrom("mcp_servers")
      .selectAll()
      .where("workspace_id", "=", workspaceId)
      .where("slug", "=", slug)
      .executeTakeFirst();
    return row ? fromRow(row) : undefined;
  }

  async save(entry: McpServerEntry): Promise<McpServerEntry> {
    const values = toRow(entry);
    await this.db.transaction().execute(async (trx) => {
      const updated = await trx
        .updateTable("mcp_servers")
        .set({
          name: values.name,
          description: values.description,
          url: values.url,
          access: values.access,
          notes: values.notes,
          docs_url: values.docs_url,
          updated_at: values.updated_at,
        })
        .where("workspace_id", "=", entry.workspaceId)
        .where("slug", "=", entry.slug)
        .executeTakeFirst();

      if (Number(updated.numUpdatedRows) === 0) {
        await trx.insertInto("mcp_servers").values(values).execute();
      }
    });
    return (await this.get(entry.workspaceId, entry.slug)) ?? entry;
  }

  async remove(workspaceId: string, slug: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom("mcp_servers")
      .where("workspace_id", "=", workspaceId)
      .where("slug", "=", slug)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }
}

export class MemoryMcpServerDirectory implements McpServerDirectory {
  private readonly entries = new Map<string, McpServerEntry>();

  async list(workspaceId: string): Promise<McpServerEntry[]> {
    return sortByName(
      [...this.entries.values()].filter(
        (entry) => entry.workspaceId === workspaceId
      )
    );
  }

  async get(
    workspaceId: string,
    slug: string
  ): Promise<McpServerEntry | undefined> {
    return this.entries.get(key(workspaceId, slug));
  }

  async save(entry: McpServerEntry): Promise<McpServerEntry> {
    const current = this.entries.get(key(entry.workspaceId, entry.slug));
    const saved = current
      ? {
          ...entry,
          id: current.id,
          createdAt: current.createdAt,
          createdById: current.createdById,
          createdByName: current.createdByName,
        }
      : entry;
    this.entries.set(key(entry.workspaceId, entry.slug), saved);
    return saved;
  }

  async remove(workspaceId: string, slug: string): Promise<boolean> {
    return this.entries.delete(key(workspaceId, slug));
  }
}

function key(workspaceId: string, slug: string): string {
  return `${workspaceId}\u0000${slug}`;
}

function sortByName(entries: McpServerEntry[]): McpServerEntry[] {
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function toRow(entry: McpServerEntry): Insertable<Row> {
  return {
    id: entry.id,
    workspace_id: entry.workspaceId,
    slug: entry.slug,
    name: entry.name,
    description: entry.description,
    url: entry.url,
    access: entry.access,
    notes: entry.notes,
    docs_url: entry.docsUrl,
    created_by_id: entry.createdById,
    created_by_name: entry.createdByName,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

function fromRow(row: Selectable<Row>): McpServerEntry {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    url: row.url,
    access: row.access,
    notes: row.notes,
    docsUrl: row.docs_url,
    createdById: row.created_by_id,
    createdByName: row.created_by_name,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
