import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
const secret = () => randomBytes(24).toString("hex");
if (!existsSync(".env")) {
  const password = secret();
  writeFileSync(
    ".env",
    `PROTOTYPE_MODE=true\nDATABASE_URL=postgresql://portal:${password}@127.0.0.1:5433/continuing_education\nPOSTGRES_PASSWORD=${password}\nAPI_URL=http://127.0.0.1:3051\nLEARNER_API_TOKEN=${secret()}\nSTAFF_API_TOKEN=${secret()}\nAUTOMATION_API_TOKEN=${secret()}\nSTAFF_AUTH_MODE=mock\n`,
    { mode: 0o600 },
  );
}
// Add a separate server-side encryption key without changing existing credentials.
const existingEnvironment = readFileSync(".env", "utf8");
if (!/^CANVAS_TOKEN_ENCRYPTION_KEY=\S+/m.test(existingEnvironment)) {
  const withoutEmptyKey = existingEnvironment.replace(
    /^CANVAS_TOKEN_ENCRYPTION_KEY=.*\r?\n?/m,
    "",
  );
  writeFileSync(
    ".env",
    `${withoutEmptyKey.trimEnd()}\nCANVAS_TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}\n`,
    { mode: 0o600 },
  );
}
mkdirSync("src/web", { recursive: true });
if (!existsSync("src/web/.env.local"))
  writeFileSync(
    "src/web/.env.local",
    readFileSync(".env", "utf8")
      .split("\n")
      .filter((line) =>
        /^(PROTOTYPE_MODE|API_URL|LEARNER_API_TOKEN|STAFF_API_TOKEN)=/.test(
          line,
        ),
      )
      .join("\n") + "\n",
    { mode: 0o600 },
  );
console.log(
  "Local environment ready. Existing credentials were preserved; a missing Canvas token encryption key was generated.",
);
