import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("BLS decoder preserves suppressed wages, converts annual-opening units and rejects schema drift", () => {
  const result = spawnSync(
    process.env.LABOR_IMPORT_PYTHON ||
      process.env.CERTIFICATE_PYTHON ||
      "python3",
    [
      fileURLToPath(
        new URL("../../scripts/test-decode-bls.py", import.meta.url),
      ),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stderr, /Ran 3 tests/);
});
