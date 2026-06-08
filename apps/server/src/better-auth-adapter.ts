import { createAdapter } from "better-auth/adapters";
import type { RegistryStore } from "@skill-library/storage";

const authFieldColumnMap: Record<string, string> = {
  createdAt: "created_at",
  updatedAt: "updated_at",
  ipAddress: "ip_address",
  userAgent: "user_agent"
};

const authColumnFieldMap = Object.fromEntries(
  Object.entries(authFieldColumnMap).map(([field, column]) => [column, field])
) as Record<string, string>;

export function authFieldToColumn(field: string): string {
  return authFieldColumnMap[field] ?? field;
}

export function authColumnToField(column: string): string {
  return authColumnFieldMap[column] ?? column;
}

function mapAuthValuesToColumns(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([field, value]) => [authFieldToColumn(field), value]));
}

function mapAuthRowToFields(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([column, value]) => [authColumnToField(column), value]));
}

export function createBetterAuthAdapter(store: RegistryStore) {
  return createAdapter({
    config: {
      adapterId: "skill-library-store-adapter",
      adapterName: "Skill Library Store Adapter",
    },
    adapter: ({
      async create({ model, values }: { model: string; values: Record<string, any> }) {
        const columnValues = mapAuthValuesToColumns(values);
        const keys = Object.keys(columnValues);
        const quotedKeys = keys.map((key) => `"${key}"`);
        const placeholders = keys.map((_, index) => `$${index + 1}`);
        const sql = `insert into "${model}" (${quotedKeys.join(", ")}) values (${placeholders.join(", ")}) returning *`;
        const params = keys.map((key) => columnValues[key]);

        const result = await store.query(sql, params);
        return mapAuthRowToFields(result.rows[0] as Record<string, unknown>);
      },

      async findOne({ model, where }: { model: string; where: any[] }) {
        if (!where || where.length === 0) {
          const sql = `select * from "${model}" limit 1`;
          const result = await store.query(sql);
          return result.rows[0] ? mapAuthRowToFields(result.rows[0] as Record<string, unknown>) : null;
        }

        const conditions = buildConditions(where);
        const params = where.map((cond) => cond.value);
        const sql = `select * from "${model}" where ${conditions.join(" and ")} limit 1`;

        const result = await store.query(sql, params);
        return result.rows[0] ? mapAuthRowToFields(result.rows[0] as Record<string, unknown>) : null;
      },

      async findMany({ model, where }: { model: string; where?: any[] }) {
        if (!where || where.length === 0) {
          const sql = `select * from "${model}"`;
          const result = await store.query(sql);
          return result.rows.map((row) => mapAuthRowToFields(row as Record<string, unknown>));
        }

        const conditions = buildConditions(where);
        const params = where.map((cond) => cond.value);
        const sql = `select * from "${model}" where ${conditions.join(" and ")}`;

        const result = await store.query(sql, params);
        return result.rows.map((row) => mapAuthRowToFields(row as Record<string, unknown>));
      },

      async update({ model, where, values }: { model: string; where: any[]; values: Record<string, any> }) {
        const columnValues = mapAuthValuesToColumns(values);
        const updateKeys = Object.keys(columnValues);
        if (updateKeys.length === 0) {
          return null;
        }

        const setStatements = updateKeys.map((key, index) => `"${key}" = $${index + 1}`);
        const params = updateKeys.map((key) => columnValues[key]);

        const offset = params.length;
        const conditions = buildConditions(where, offset);
        params.push(...where.map((cond) => cond.value));

        const sql = `update "${model}" set ${setStatements.join(", ")} where ${conditions.join(" and ")} returning *`;
        const result = await store.query(sql, params);
        return result.rows[0] ? mapAuthRowToFields(result.rows[0] as Record<string, unknown>) : null;
      },

      async delete({ model, where }: { model: string; where: any[] }) {
        if (!where || where.length === 0) {
          const sql = `delete from "${model}"`;
          await store.query(sql);
          return;
        }

        const conditions = buildConditions(where);
        const params = where.map(cond => cond.value);
        const sql = `delete from "${model}" where ${conditions.join(" and ")}`;

        await store.query(sql, params);
      },

      async deleteMany({ model, where }: { model: string; where: any[] }) {
        if (!where || where.length === 0) {
          const sql = `delete from "${model}"`;
          await store.query(sql);
          return;
        }

        const conditions = buildConditions(where);
        const params = where.map(cond => cond.value);
        const sql = `delete from "${model}" where ${conditions.join(" and ")}`;

        await store.query(sql, params);
      }
    }) as any
  });
}

function buildConditions(where: any[], offset = 0) {
  return where.map((cond: any, i: number) => {
    const field = `"${authFieldToColumn(cond.field)}"`;
    const placeholder = `$${offset + i + 1}`;
    const isInsensitive = cond.mode === "insensitive" || cond.operator === "insensitive";

    let op = "=";
    let lhs = field;
    let rhs = placeholder;

    if (isInsensitive) {
      lhs = `lower(${field})`;
      rhs = `lower(${placeholder})`;
    }

    if (cond.operator === "in") {
      op = "= any";
      rhs = `(${placeholder})`;
    } else if (cond.operator === "contains") {
      op = "like";
      rhs = placeholder;
    }

    return `${lhs} ${op} ${rhs}`;
  });
}
