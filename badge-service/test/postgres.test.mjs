import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { sign, randomUUID } from "node:crypto";
import { BadgeStore, fixture } from "../core.mjs";
import { PostgresBadgeDatabase } from "../postgres.mjs";
import { importSqlite } from "../import-sqlite.mjs";
const config = JSON.parse(
  readFileSync(new URL("../config.example.json", import.meta.url)),
);
function directory(t) {
  const dir = mkdtempSync(join(tmpdir(), "ce-pg-badges-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test("concurrent issuance is atomic across independent PostgreSQL pools and isolates workspaces", async (t) => {
  const dir = directory(t),
    first = await BadgeStore.open(dir, config, "http://127.0.0.1:3051"),
    second = await BadgeStore.open(dir, config, "http://127.0.0.1:3051"),
    other = await BadgeStore.open(
      directory(t),
      config,
      "http://127.0.0.1:3051",
    );
  t.after(async () => {
    await first.close();
    await second.close();
    await other.close();
  });
  const issued = await Promise.all([
    first.issue("demo-alex", fixture("complete"), "test"),
    second.issue("demo-alex", fixture("complete"), "test"),
  ]);
  assert.equal(issued.filter((r) => !r.duplicate).length, 1);
  assert.equal(issued[0].badge.id, issued[1].badge.id);
  assert.equal((await other.list("demo-alex")).length, 0);
  assert.equal(
    (
      await other.db
        .prepare("UPDATE badges SET shared=? WHERE id=?")
        .run(1, issued[0].badge.id)
    ).changes,
    0,
  );
  assert.equal((await first.get(issued[0].badge.id)).shared, 0);
});
test("legacy import backs up SQLite, preserves signed bytes and rejects overwrite or invalid signatures", async (t) => {
  const original = await BadgeStore.open(
    directory(t),
    config,
    "http://127.0.0.1:4178",
  );
  t.after(() => original.close());
  const award = await original.issue("demo-alex", fixture("complete"), "test"),
    row = await original.get(award.badge.id);
  const dir = directory(t);
  copyFileSync(
    join(original.directory, "issuer-private.pem"),
    join(dir, "issuer-private.pem"),
  );
  const legacy = new DatabaseSync(join(dir, "badges.sqlite"));
  const cols = Object.keys(row).filter((c) => c !== "workspace");
  legacy.exec(
    `CREATE TABLE badges(${cols.map((c) => `${c} ${c === "shared" ? "INTEGER" : "TEXT"}`).join(",")});CREATE TABLE metadata(key TEXT,value TEXT);CREATE TABLE audit(id INTEGER,at TEXT,action TEXT,badge_id TEXT,actor TEXT);CREATE TABLE certificates(id TEXT,source_id TEXT,badge_id TEXT,learner TEXT,created_at TEXT,created_by TEXT,snapshot_json TEXT,signature TEXT);`,
  );
  legacy
    .prepare(`INSERT INTO badges VALUES(${cols.map(() => "?").join(",")})`)
    .run(...cols.map((c) => row[c]));
  legacy
    .prepare("INSERT INTO metadata VALUES(?,?)")
    .run("configuration", "original-fingerprint");
  legacy
    .prepare("INSERT INTO audit VALUES(?,?,?,?,?)")
    .run(7, row.issued_at, "issued", row.id, "test");
  const snapshot = JSON.stringify({
      id: randomUUID(),
      badgeId: row.id,
      recipientName: "Synthetic Learner",
    }),
    signature = sign(null, Buffer.from(snapshot), original.privateKey).toString(
      "base64url",
    );
  legacy
    .prepare("INSERT INTO certificates VALUES(?,?,?,?,?,?,?,?)")
    .run(
      randomUUID(),
      "workspace",
      row.id,
      "demo-alex",
      row.issued_at,
      "test",
      snapshot,
      signature,
    );
  legacy.close();
  await assert.rejects(
    BadgeStore.open(dir, config, "http://127.0.0.1:3051"),
    /Legacy SQLite/,
  );
  const options = { directory: dir, config, baseUrl: "http://127.0.0.1:3051" };
  const result = await importSqlite(options);
  assert.equal(result.counts.badges, 1);
  assert.equal(result.counts.certificates, 1);
  const imported = await BadgeStore.open(dir, config, options.baseUrl);
  t.after(() => imported.close());
  assert.equal((await imported.get(row.id)).credential, row.credential);
  assert.equal((await imported.get(row.id)).signature, row.signature);
  const certificate = await imported.db
    .prepare("SELECT * FROM certificates WHERE badge_id=?")
    .get(row.id);
  assert.equal(certificate.snapshot_json, snapshot);
  assert.equal(certificate.signature, signature);
  await assert.rejects(importSqlite(options), /already exists/);
  const untouched = new DatabaseSync(join(dir, "badges.sqlite"), {
    readOnly: true,
  });
  assert.equal(
    untouched.prepare("SELECT credential FROM badges").get().credential,
    row.credential,
  );
  untouched.close();
  const badDir = directory(t);
  copyFileSync(
    join(dir, "issuer-private.pem"),
    join(badDir, "issuer-private.pem"),
  );
  copyFileSync(result.backupPath, join(badDir, "badges.sqlite"));
  const corrupt = new DatabaseSync(join(badDir, "badges.sqlite"));
  corrupt.exec("UPDATE badges SET signature='invalid'");
  corrupt.close();
  await assert.rejects(
    importSqlite({ ...options, directory: badDir }),
    /signature failed/,
  );
  const check = new PostgresBadgeDatabase(badDir);
  try {
    await assert.rejects(check.checkWorkspace(), /not imported/);
  } finally {
    await check.close();
  }
});
