import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import pg from "pg";

// Fixed, migration-owned tables. Workspace keys isolate imported signing identities
// and test fixtures; all values, including the workspace, remain bound parameters.
export const badgeTables = [
  "badges",
  "metadata",
  "audit",
  "badge_drafts",
  "badge_versions",
  "course_mappings",
  "publishing_activity",
  "award_batches",
  "certificate_templates",
  "certificates",
];
const transactions = new AsyncLocalStorage();
export class PostgresBadgeDatabase {
  constructor(directory, pool) {
    if (!pool && !process.env.DATABASE_URL)
      throw new Error("Portal DATABASE_URL is required for badges.");
    this.workspace = createHash("sha256")
      .update(resolve(directory))
      .digest("hex");
    this.pool =
      pool ||
      new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
    this.ownsPool = !pool;
  }
  async initialize(kid) {
    await this.transaction(async () => {
      await this.query(
        "INSERT INTO credential_workspaces(id,key_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [this.workspace, kid],
      );
      const result = await this.query(
        "SELECT key_id FROM credential_workspaces WHERE id=$1",
        [this.workspace],
      );
      if (result.rows[0]?.key_id !== kid)
        throw new Error(
          "Signing key mismatch: restore the original issuer key.",
        );
    });
  }
  query(sql, params = []) {
    const tx = transactions.getStore();
    return (tx?.pool === this.pool ? tx.client : this.pool).query(sql, params);
  }
  prepare(statement) {
    const execute = async (args) => {
      let index = 0;
      let sql = statement.replace(/\?/g, () => `$${++index}`);
      const params = [...args, this.workspace],
        workspace = `$${params.length}`;
      if (index !== args.length)
        throw new Error("Invalid badge query parameter count");
      sql = sql.replace(/\browid\b/g, "id");
      const insert = sql.match(
        /^INSERT INTO (\w+)(\s*\([^)]*\))?\s+VALUES\s*\(/i,
      );
      if (insert) {
        if (!badgeTables.includes(insert[1]))
          throw new Error("Unknown badge table");
        // Explicit columns make legacy certificate snapshots portable.
        if (!insert[2])
          throw new Error("Badge inserts require explicit columns");
        sql = sql.replace(
          insert[0],
          `INSERT INTO credential_${insert[1]} (workspace,${insert[2].trim().slice(1, -1)}) VALUES (${workspace},`,
        );
      } else if (/^UPDATE /i.test(sql)) {
        sql = sql.replace(/^UPDATE (\w+) /i, (_, table) => {
          if (!badgeTables.includes(table))
            throw new Error("Unknown badge table");
          return `UPDATE credential_${table} AS ${table} `;
        });
        sql += ` AND workspace=${workspace}`;
      } else if (!/^SELECT /i.test(sql))
        throw new Error("Unsupported badge query");
      // Reads, including correlated subqueries, are always scoped to the identity.
      sql = sql.replace(/\bFROM (\w+)\b/g, (_, table) => {
        if (!badgeTables.includes(table))
          throw new Error("Unknown badge table");
        return `FROM (SELECT * FROM credential_${table} WHERE workspace=${workspace}) AS ${table}`;
      });
      const result = await this.query(sql, params);
      // PostgreSQL bigint counts are strings; the pilot contract uses a number.
      for (const row of result.rows)
        if (typeof row.n === "string" && /^\d+$/.test(row.n))
          row.n = Number(row.n);
      return result;
    };
    return {
      get: async (...args) => (await execute(args)).rows[0],
      all: async (...args) => (await execute(args)).rows,
      run: async (...args) => ({ changes: (await execute(args)).rowCount }),
    };
  }
  async transaction(callback) {
    const existing = transactions.getStore();
    if (existing?.pool === this.pool) return callback();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize mutations for a signing workspace across requests/processes.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [this.workspace],
      );
      const result = await transactions.run(
        { pool: this.pool, client },
        callback,
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async checkWorkspace() {
    const result = await this.query(
      "SELECT 1 FROM credential_workspaces WHERE id=$1",
      [this.workspace],
    );
    if (!result.rowCount)
      throw new Error("Credential workspace is not imported or initialized.");
  }
  async close() {
    if (!this.ownsPool || this.closed) return;
    this.closed = true;
    let remaining = this.pool.totalCount;
    let onRemove;
    const removed = new Promise((resolve) => {
      if (!remaining) return resolve();
      onRemove = () => {
        if (--remaining === 0) resolve();
      };
      this.pool.on("remove", onRemove);
    });
    try {
      await Promise.all([this.pool.end(), removed]);
    } finally {
      if (onRemove) this.pool.removeListener("remove", onRemove);
    }
  }
}
