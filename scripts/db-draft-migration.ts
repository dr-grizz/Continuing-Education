import "dotenv/config";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { Pool } from "pg";
// Drafts a reviewable migration from prisma/schema.prisma changes (issue #2) by diffing
// the existing migrations, replayed into a disposable shadow database, against the
// schema. It never connects Prisma to the main database, so it cannot reset it.
// Usage: npm run db:migrate:draft -- <short_name>
const root = path.resolve(__dirname, "..");
async function main() {
  const name = process.argv[2];
  if (!name || !/^[a-z0-9_]+$/.test(name))
    throw new Error(
      "Usage: npm run db:migrate:draft -- <short_name> (a-z, 0-9, _)",
    );
  const base = new URL(process.env.DATABASE_URL as string);
  const admin = new Pool({
    connectionString: Object.assign(new URL(base), {
      pathname: "/postgres",
    }).toString(),
    max: 1,
  });
  const shadow = `ce_shadow_${randomUUID().slice(0, 8)}`;
  const config = path.join(root, `.tmp-draft-${shadow}.config.ts`);
  await admin.query(`CREATE DATABASE ${shadow}`);
  try {
    const shadowUrl = Object.assign(new URL(base), {
      pathname: `/${shadow}`,
    }).toString();
    writeFileSync(
      config,
      `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: "prisma/schema.prisma", migrations: { path: "prisma/migrations" }, datasource: { url: ${JSON.stringify(shadowUrl)}, shadowDatabaseUrl: ${JSON.stringify(shadowUrl)} } });\n`,
    );
    const sql = execFileSync(
      path.join(root, "node_modules/.bin/prisma"),
      [
        "migrate",
        "diff",
        "--from-migrations",
        "prisma/migrations",
        "--to-schema",
        "prisma/schema.prisma",
        "--script",
        "--config",
        config,
      ],
      { cwd: root, encoding: "utf8" },
    );
    if (!sql.trim() || /^-- This is an empty migration/m.test(sql)) {
      console.log("No schema changes to migrate.");
      return;
    }
    const directory = path.join(root, "prisma/migrations");
    const next =
      Math.max(
        ...readdirSync(directory)
          .map((entry) => Number.parseInt(entry, 10))
          .filter(Number.isFinite),
      ) + 1;
    // Three digits keep Prisma's alphabetical order equal to the real order.
    const target = path.join(
      directory,
      `${String(next).padStart(3, "0")}_${name}`,
    );
    if (existsSync(target)) throw new Error(`${target} already exists.`);
    mkdirSync(target);
    // Prisma does not wrap migrations in a transaction; keep the draft atomic.
    writeFileSync(
      path.join(target, "migration.sql"),
      `BEGIN;\n\n${sql.trim()}\n\nCOMMIT;\n`,
    );
    console.log(
      `Drafted ${path.relative(root, target)}/migration.sql. Review it, add any checks, triggers or backfills, then run npm run db:migrate.`,
    );
  } finally {
    rmSync(config, { force: true });
    await admin.query(`DROP DATABASE IF EXISTS ${shadow} WITH (FORCE)`);
    await admin.end();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
