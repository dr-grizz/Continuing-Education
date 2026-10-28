import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";
import {
  laborSources,
  digest,
  importLaborMarket,
} from "../badge-service/labor-import.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--offline"].includes(arg)))
    throw new Error("Usage: npm run skills:import [-- --offline]");
  const cache = resolve(
    root,
    process.env.BADGE_DATA_DIR || "badge-service/data",
    "labor-market-import",
  );
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const hashes = {},
    onetData = {};
  for (const [name, url] of Object.entries(laborSources)) {
    const extension = ["national", "state"].includes(name)
        ? ".zip"
        : name === "projections"
          ? ".xlsx"
          : ".json",
      path = join(cache, name + extension);
    let bytes;
    if (args.includes("--offline")) bytes = await readFile(path);
    else {
      const response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(60000),
        headers: {
          "User-Agent":
            "Continuing-Education/0.1 official labor-market data import",
        },
      });
      if (!response.ok)
        throw new Error(
          `Official ${name} download failed (HTTP ${response.status}); the active catalog was preserved.`,
        );
      const parts = [];
      let size = 0;
      for await (const part of response.body) {
        size += part.length;
        if (size > 80 * 1024 * 1024)
          throw new Error("Source file exceeds import limit");
        parts.push(part);
      }
      bytes = Buffer.concat(parts);
      await writeFile(path, bytes, { mode: 0o600 });
    }
    if (bytes.length > 80 * 1024 * 1024)
      throw new Error("Source file exceeds import limit");
    hashes[name] = digest(bytes);
    if (extension === ".json")
      onetData[name] = JSON.parse(bytes.toString("utf8"));
  }
  const decoded = spawnSync(
    process.env.LABOR_IMPORT_PYTHON ||
      process.env.CERTIFICATE_PYTHON ||
      "python3",
    [join(root, "scripts/decode-bls.py"), cache],
    {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    },
  );
  if (decoded.status !== 0)
    throw new Error(
      "BLS workbook columns/units could not be verified; the active catalog was preserved. " +
        String(decoded.stderr || "").slice(-800),
    );
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });
  try {
    const result = await importLaborMarket(pool, {
      onetData,
      blsData: JSON.parse(decoded.stdout),
      hashes,
    });
    await writeFile(
      join(cache, "manifest.json"),
      JSON.stringify(
        {
          importedAt: new Date().toISOString(),
          sources: laborSources,
          hashes,
          result,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    console.log(
      "Official labor-market catalog imported: " + JSON.stringify(result),
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
