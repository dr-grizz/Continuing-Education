// One-time legacy import only. The running portal never imports node:sqlite.
import { DatabaseSync, backup } from "node:sqlite";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  verify,
} from "node:crypto";
import { readFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { PostgresBadgeDatabase, badgeTables } from "./postgres.mjs";

export async function importSqlite({
  directory,
  config,
  baseUrl,
  mode = "demo",
  pool,
}) {
  const legacy = new DatabaseSync(join(directory, "badges.sqlite"), {
    readOnly: true,
  });
  const target = new PostgresBadgeDatabase(directory, pool);
  const key = createPublicKey(
    createPrivateKey(readFileSync(join(directory, "issuer-private.pem"))),
  );
  const kid = createHash("sha256")
    .update(JSON.stringify(key.export({ format: "jwk" })))
    .digest("hex")
    .slice(0, 24);
  try {
    const backupPath = join(
      directory,
      `badges-pre-postgres-${Date.now()}.sqlite`,
    );
    await backup(legacy, backupPath);
    chmodSync(backupPath, 0o600);
    legacy.exec("BEGIN");
    const available = new Set(
      legacy
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name),
    );
    if (!available.has("badges") || !available.has("metadata"))
      throw new Error("Not a legacy credential store.");
    const rows = Object.fromEntries(
      badgeTables.map((t) => [
        t,
        available.has(t)
          ? legacy
              .prepare(
                `SELECT * FROM ${t}${["audit", "publishing_activity"].includes(t) ? " ORDER BY id" : ""}`,
              )
              .all()
          : [],
      ]),
    );
    for (const row of rows.badges)
      if (
        !verify(
          null,
          Buffer.from(row.credential),
          key,
          Buffer.from(row.signature, "base64url"),
        )
      )
        throw new Error("Legacy badge signature failed; nothing imported.");
    for (const row of rows.certificates)
      if (
        !verify(
          null,
          Buffer.from(row.snapshot_json),
          key,
          Buffer.from(row.signature, "base64url"),
        )
      )
        throw new Error(
          "Legacy certificate signature failed; nothing imported.",
        );
    const counts = {};
    await target.transaction(async () => {
      const existing = await target.query(
        "SELECT 1 FROM credential_workspaces WHERE id=$1",
        [target.workspace],
      );
      if (existing.rowCount)
        throw new Error(
          "Target workspace already exists; refusing to merge or overwrite it.",
        );
      await target.initialize(kid);
      // Dependencies first; preserve signed text, IDs, revisions, statuses and rules.
      for (const table of [
        "metadata",
        "badge_drafts",
        "badge_versions",
        "course_mappings",
        "badges",
        "audit",
        "publishing_activity",
        "award_batches",
        "certificate_templates",
        "certificates",
      ]) {
        for (const row of rows[table]) {
          const copy = { ...row };
          // Global event sequence IDs are reassigned, retaining original order.
          if (["audit", "publishing_activity"].includes(table)) delete copy.id;
          if (table === "metadata" && copy.key === "configuration")
            copy.key = "legacy_configuration";
          const columns = Object.keys(copy);
          // Column identifiers must exist in the migration-owned destination table.
          const allowed = (
            await target.query(
              "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
              [`credential_${table}`],
            )
          ).rows.map((r) => r.column_name);
          if (columns.some((c) => !allowed.includes(c)))
            throw new Error(
              "Legacy schema contains unsupported columns; review migration.",
            );
          await target
            .prepare(
              `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
            )
            .run(...Object.values(copy));
        }
        counts[table] = Number(
          (await target.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).n,
        );
        if (counts[table] !== rows[table].length)
          throw new Error("Imported row count mismatch.");
      }
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            course: config.course,
            issuer: config.issuerName,
            baseUrl,
            mode,
          }),
        )
        .digest("hex");
      await target
        .prepare("INSERT INTO metadata(key,value) VALUES(?,?)")
        .run("configuration", fingerprint);
      for (const original of rows.badges) {
        const row = await target
          .prepare("SELECT * FROM badges WHERE id=?")
          .get(original.id);
        if (
          row.credential !== original.credential ||
          row.signature !== original.signature
        )
          throw new Error("Imported signing bytes changed.");
      }
      for (const original of rows.certificates) {
        const row = await target
          .prepare("SELECT * FROM certificates WHERE id=?")
          .get(original.id);
        if (
          row.snapshot_json !== original.snapshot_json ||
          row.signature !== original.signature
        )
          throw new Error("Imported certificate bytes changed.");
      }
    });
    return { counts, backupPath };
  } finally {
    legacy.close();
    await target.close();
  }
}
