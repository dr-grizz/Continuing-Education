import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
const secret = () => randomBytes(24).toString("hex");
if (!existsSync(".env")) {
  const password = secret();
  writeFileSync(
    ".env",
    `PROTOTYPE_MODE=true\nDATABASE_URL=postgresql://portal:${password}@127.0.0.1:5433/continuing_education\nPOSTGRES_PASSWORD=${password}\nAPI_URL=http://127.0.0.1:3001\nLEARNER_API_TOKEN=${secret()}\nSTAFF_API_TOKEN=${secret()}\nAUTOMATION_API_TOKEN=${secret()}\n`,
    { mode: 0o600 },
  );
}
mkdirSync("src/web", { recursive: true });
if (!existsSync("src/web/.env.local"))
  writeFileSync("src/web/.env.local", readFileSync(".env"), { mode: 0o600 });
console.log(
  "Local environment ready. Existing environment files were preserved.",
);
