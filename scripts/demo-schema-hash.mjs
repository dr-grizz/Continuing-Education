import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

// Operator-approved migration set. CD refuses a different set rather than
// giving a public-repository runner credentials to the live database.
const entries = await readdir("prisma/migrations", { withFileTypes: true });
const migrations = [];
for (const entry of entries
  .filter((entry) => entry.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name, "en"))) {
  const contents = await readFile(
    `prisma/migrations/${entry.name}/migration.sql`,
  );
  migrations.push([
    entry.name,
    createHash("sha256").update(contents).digest("hex"),
  ]);
}
console.log(
  createHash("sha256").update(JSON.stringify(migrations)).digest("hex"),
);
