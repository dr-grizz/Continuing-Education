import "dotenv/config";
import path from "node:path";
import { readFileSync } from "node:fs";
import { db } from "../src/domain/db";
import { endPoolAndWaitForClients } from "../tests/helpers/close-pool";
async function main() {
  const directory = path.resolve(
    process.argv[2] || process.env.BADGE_DATA_DIR || "badge-service/data",
  );
  const { importSqlite } = require("../badge-service/import-sqlite.mjs");
  try {
    const result = await importSqlite({
      directory,
      pool: db,
      config: JSON.parse(
        readFileSync(
          process.env.BADGE_CONFIG || "badge-service/config.example.json",
          "utf8",
        ),
      ),
      baseUrl: `http://127.0.0.1:${process.env.API_PORT || 3051}`,
      mode: process.env.BADGE_DEMO === "false" ? "canvas" : "demo",
    });
    console.log("Credential import verified:", result.counts);
    console.log(
      "Consistent legacy backup saved in the private source directory.",
    );
  } finally {
    await endPoolAndWaitForClients(db);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
