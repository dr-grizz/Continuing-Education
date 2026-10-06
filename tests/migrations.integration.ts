import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { applyLegacyMigrations } from "../scripts/legacy-migrations";
import { migrate } from "../scripts/db-migrate";
// Migration tests on disposable databases (issue #2). Never touches the main database:
// every database here is created with the ce_migtest_ prefix and dropped afterwards.
const base = new URL(process.env.DATABASE_URL as string);
const admin = new Pool({
  connectionString: Object.assign(new URL(base), {
    pathname: "/postgres",
  }).toString(),
  max: 1,
});
const created: string[] = [];
const pools: Pool[] = [];
const urlFor = (name: string) =>
  Object.assign(new URL(base), { pathname: `/${name}` }).toString();
async function createDb() {
  const name = `ce_migtest_${randomUUID().slice(0, 8)}`;
  await admin.query(`CREATE DATABASE ${name}`);
  created.push(name);
  const pool = new Pool({ connectionString: urlFor(name), max: 2 });
  pools.push(pool);
  return { name, url: urlFor(name), pool };
}
// Structural fingerprint: columns, constraints, indexes, triggers and functions.
async function structure(pool: Pool) {
  const rows = await pool.query(`
    SELECT 'column ' || c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
      || CASE WHEN a.attnotnull THEN ' not null' ELSE '' END
      || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '') AS line
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
    UNION ALL
    SELECT 'constraint ' || conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid)
    FROM pg_constraint WHERE connamespace = 'public'::regnamespace
    UNION ALL
    SELECT 'index ' || indexdef FROM pg_indexes WHERE schemaname = 'public'
    UNION ALL
    SELECT 'trigger ' || pg_get_triggerdef(t.oid) FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal
    UNION ALL
    SELECT 'function ' || pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    ORDER BY 1`);
  return rows.rows.map((row) => row.line as string);
}
// Application data snapshot used to prove adoption preserves records.
async function snapshot(pool: Pool) {
  const q = async (sql: string) => (await pool.query(sql)).rows;
  return {
    offerings: await q(
      "SELECT id,title,price_cents,published,version FROM offerings ORDER BY id",
    ),
    learners: await q("SELECT id,email FROM learners ORDER BY id"),
    entitlements: await q(
      "SELECT id,learner_id,offering_id,status,quoted_price_cents FROM entitlements ORDER BY id",
    ),
    orders: await q(
      "SELECT id,entitlement_id,amount_cents FROM orders ORDER BY id",
    ),
    operations: await q(
      "SELECT id,entitlement_id,status,stage,simulated_outcome FROM operations ORDER BY id",
    ),
    commands: await q("SELECT actor,key FROM commands ORDER BY 1,2"),
    audit: await q("SELECT id,action,object_id FROM audit_events ORDER BY id"),
    prices: await q(
      "SELECT offering_id,price_cents,reason FROM offering_prices ORDER BY id",
    ),
    settings: await q("SELECT key,value FROM prototype_settings ORDER BY key"),
  };
}
async function seedActivity(pool: Pool) {
  const learner = (
    await pool.query(
      "INSERT INTO learners(email) VALUES ('adopt@example.test') RETURNING id",
    )
  ).rows[0].id;
  const reserved = (
    await pool.query(
      "INSERT INTO entitlements(learner_id,offering_id,status,reserved_until,quoted_price_cents) VALUES ($1,'10000000-0000-4000-8000-000000000002','reserved',now()+interval '30 minutes',19900) RETURNING id",
      [learner],
    )
  ).rows[0].id;
  const paid = (
    await pool.query(
      "INSERT INTO entitlements(learner_id,offering_id,status) VALUES ($1,'10000000-0000-4000-8000-000000000001','provisioning') RETURNING id",
      [learner],
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO orders(entitlement_id,amount_cents) VALUES ($1,14900)",
    [paid],
  );
  await pool.query("INSERT INTO operations(entitlement_id) VALUES ($1)", [
    paid,
  ]);
  await pool.query(
    "INSERT INTO commands(actor,key,fingerprint,response) VALUES ('demo-staff','k1','f','{}')",
  );
  await pool.query(
    "INSERT INTO audit_events(actor,action,object_id) VALUES ('demo-staff','seat.reserved',$1)",
    [reserved],
  );
  await pool.query(
    "INSERT INTO offering_prices(offering_id,price_cents,actor,reason) VALUES ('10000000-0000-4000-8000-000000000002',20900,'demo-staff','Adoption test price')",
  );
}
const migrationNames = async (pool: Pool) =>
  (
    await pool.query(
      "SELECT migration_name,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations ORDER BY started_at",
    )
  ).rows;

async function main() {
  const workspace = path.resolve(__dirname, "../.tmp-migration-tests");
  try {
    // 1. Fresh installation.
    const fresh = await createDb();
    await migrate(fresh.url, { quiet: true });
    const freshData = await snapshot(fresh.pool);
    assert.equal(freshData.offerings.length, 6);
    assert.deepEqual(
      freshData.learners.map((l) => l.id),
      ["00000000-0000-4000-8000-000000000001"],
    );
    assert.equal(freshData.prices.length, 6);
    assert.deepEqual(freshData.settings, [
      { key: "provisioning_outcome", value: "normal" },
    ]);
    await assert.rejects(
      fresh.pool.query("UPDATE offering_prices SET price_cents=1"),
      /append-only/,
    );
    await assert.rejects(
      fresh.pool.query(
        "INSERT INTO offerings(title,category,summary,description,format,course_type,price_cents,capacity) VALUES ('x','Technology','s','d','f','cohort',1,1)",
      ),
      /offerings_schedule_check/,
    );
    assert.deepEqual(await migrationNames(fresh.pool), [
      { migration_name: "0_baseline", finished: true, rolled_back: false },
    ]);
    console.log(
      "PASS: fresh database gets the baseline schema, checks, trigger and synthetic seed",
    );

    // 2. Repeat run is a no-op.
    const before = {
      structure: await structure(fresh.pool),
      data: await snapshot(fresh.pool),
    };
    await migrate(fresh.url, { quiet: true });
    assert.deepEqual(await structure(fresh.pool), before.structure);
    assert.deepEqual(await snapshot(fresh.pool), before.data);
    assert.equal((await migrationNames(fresh.pool)).length, 1);
    console.log("PASS: a second migration run changes nothing");

    // 3. Adoption of an existing 001-007 database with live records.
    const legacy = await createDb();
    const legacyClient = await legacy.pool.connect();
    await applyLegacyMigrations(legacyClient);
    legacyClient.release();
    await seedActivity(legacy.pool);
    const legacyBefore = await snapshot(legacy.pool);
    const legacyHistory = (
      await legacy.pool.query(
        "SELECT version FROM schema_migrations ORDER BY 1",
      )
    ).rows;
    await migrate(legacy.url, { quiet: true });
    assert.deepEqual(
      await snapshot(legacy.pool),
      legacyBefore,
      "records, IDs, statuses, orders and operations preserved",
    );
    assert.deepEqual(
      (
        await legacy.pool.query(
          "SELECT version FROM schema_migrations ORDER BY 1",
        )
      ).rows,
      legacyHistory,
    );
    assert.equal(legacyBefore.offerings.length, 6, "no duplicate seed");
    assert.deepEqual(await migrationNames(legacy.pool), [
      { migration_name: "0_baseline", finished: true, rolled_back: false },
    ]);
    console.log(
      "PASS: existing 001-007 database adopted without replay; all records preserved",
    );

    // 4. Fresh and adopted databases have identical structure.
    const freshStructure = await structure(fresh.pool);
    const adoptedStructure = await structure(legacy.pool);
    const onlyFresh = freshStructure.filter(
      (line) => !adoptedStructure.includes(line),
    );
    const onlyAdopted = adoptedStructure.filter(
      (line) => !freshStructure.includes(line),
    );
    assert.deepEqual(
      { onlyFresh, onlyAdopted },
      { onlyFresh: [], onlyAdopted: [] },
    );
    assert.ok(
      freshStructure.some((line) =>
        line.startsWith("trigger CREATE TRIGGER offering_prices_no_update"),
      ),
    );
    console.log(
      `PASS: fresh and adopted schemas are structurally identical (${freshStructure.length} elements)`,
    );

    // 5. An older database (001-003 only) catches up, then is adopted.
    const older = await createDb();
    const olderClient = await older.pool.connect();
    await applyLegacyMigrations(olderClient, "003");
    olderClient.release();
    await migrate(older.url, { quiet: true });
    assert.deepEqual(await structure(older.pool), freshStructure);
    console.log(
      "PASS: a 001-003 database catches up through 007 and is adopted",
    );

    // 6. Unknown state: tables without migration history are refused.
    const unknown = await createDb();
    await unknown.pool.query("CREATE TABLE offerings (id uuid PRIMARY KEY)");
    await assert.rejects(
      migrate(unknown.url, { quiet: true }),
      /no migration history/,
    );
    console.log("PASS: a database with tables but no history is refused");

    // 7. Concurrent runs are serialized.
    const racing = await createDb();
    await Promise.all([
      migrate(racing.url, { quiet: true }),
      migrate(racing.url, { quiet: true }),
    ]);
    assert.equal((await migrationNames(racing.pool)).length, 1);
    assert.equal((await snapshot(racing.pool)).offerings.length, 6);
    console.log(
      "PASS: concurrent migration runs are serialized; baseline applied once",
    );

    // 8. No drift: replaying the migrations matches prisma/schema.prisma.
    const shadow = await createDb();
    const driftConfig = path.resolve(__dirname, "../.tmp-drift.config.ts");
    writeFileSync(
      driftConfig,
      `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: "prisma/schema.prisma", migrations: { path: "prisma/migrations" }, datasource: { url: ${JSON.stringify(fresh.url)}, shadowDatabaseUrl: ${JSON.stringify(shadow.url)} } });\n`,
    );
    try {
      const { execFileSync } = await import("node:child_process");
      execFileSync(
        path.resolve(__dirname, "../node_modules/.bin/prisma"),
        [
          "migrate",
          "diff",
          "--from-migrations",
          "prisma/migrations",
          "--to-schema",
          "prisma/schema.prisma",
          "--exit-code",
          "--config",
          driftConfig,
        ],
        { stdio: "pipe", cwd: path.resolve(__dirname, "..") },
      );
    } catch (error: any) {
      assert.fail(
        `Schema drift between migrations and schema.prisma:\n${error.stdout ?? error}`,
      );
    } finally {
      rmSync(driftConfig, { force: true });
    }
    console.log(
      "PASS: replaying migrations matches prisma/schema.prisma (no drift)",
    );

    // 9. Failed migration recovery, then a schema change with backfill.
    rmSync(workspace, { recursive: true, force: true });
    mkdirSync(workspace, { recursive: true });
    cpSync(
      path.resolve(__dirname, "../prisma/migrations"),
      path.join(workspace, "migrations"),
      { recursive: true },
    );
    writeFileSync(
      path.join(workspace, "prisma.config.ts"),
      `import { defineConfig, env } from "prisma/config";\nexport default defineConfig({ schema: "../prisma/schema.prisma", migrations: { path: "migrations" }, datasource: { url: env("DATABASE_URL") } });\n`,
    );
    process.env.PRISMA_CONFIG_PATH = path.join(workspace, "prisma.config.ts");
    const failing = path.join(workspace, "migrations", "1_failing_change");
    mkdirSync(failing);
    writeFileSync(
      path.join(failing, "migration.sql"),
      "ALTER TABLE offerings ADD COLUMN subtitle text;\nSELECT 1/0;\n",
    );
    await assert.rejects(migrate(legacy.url, { quiet: true }));
    const failedRow = (await migrationNames(legacy.pool)).find(
      (m) => m.migration_name === "1_failing_change",
    );
    assert.deepEqual(failedRow, {
      migration_name: "1_failing_change",
      finished: false,
      rolled_back: false,
    });
    const partial = (
      await legacy.pool.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name='offerings' AND column_name='subtitle'",
      )
    ).rowCount;
    await assert.rejects(
      migrate(legacy.url, { quiet: true }),
      "deploy refuses while a failed migration is unresolved",
    );
    // Documented recovery: undo any partial change, mark rolled back, ship a corrective migration.
    if (partial)
      await legacy.pool.query("ALTER TABLE offerings DROP COLUMN subtitle");
    rmSync(failing, { recursive: true });
    const { execFileSync } = await import("node:child_process");
    execFileSync(
      path.resolve(__dirname, "../node_modules/.bin/prisma"),
      [
        "migrate",
        "resolve",
        "--rolled-back",
        "1_failing_change",
        "--config",
        process.env.PRISMA_CONFIG_PATH,
      ],
      { stdio: "pipe", env: { ...process.env, DATABASE_URL: legacy.url } },
    );
    const corrective = path.join(
      workspace,
      "migrations",
      "2_offering_subtitle",
    );
    mkdirSync(corrective);
    writeFileSync(
      path.join(corrective, "migration.sql"),
      "ALTER TABLE offerings ADD COLUMN subtitle text;\nUPDATE offerings SET subtitle = summary;\n",
    );
    const beforeChange = await snapshot(legacy.pool);
    await migrate(legacy.url, { quiet: true });
    assert.deepEqual(
      await snapshot(legacy.pool),
      beforeChange,
      "schema change preserves existing records",
    );
    const backfilled = (
      await legacy.pool.query(
        "SELECT count(*)::int AS n FROM offerings WHERE subtitle = summary",
      )
    ).rows[0].n;
    assert.equal(backfilled, 6);
    const history = await migrationNames(legacy.pool);
    assert.deepEqual(
      history.map((m) => [m.migration_name, m.finished, m.rolled_back]),
      [
        ["0_baseline", true, false],
        ["1_failing_change", false, true],
        ["2_offering_subtitle", true, false],
      ],
    );
    console.log(
      `PASS: failed migration blocks deploy, recovers via resolve --rolled-back and a corrective migration (partial change ${partial ? "was" : "was not"} left behind); backfill preserves data`,
    );
  } finally {
    delete process.env.PRISMA_CONFIG_PATH;
    rmSync(workspace, { recursive: true, force: true });
    await Promise.all(pools.map((pool) => pool.end()));
    for (const name of created)
      if (name.startsWith("ce_migtest_"))
        await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
