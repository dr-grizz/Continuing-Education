import {
  cp,
  mkdir,
  readFile,
  writeFile,
  stat,
  readdir,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { nodeFileTrace } = require("next/dist/compiled/@vercel/nft");

// Build on Ubuntu/Node 24 for Linux App Service. Next traces its own runtime;
// trace the compiled API separately so build tools and unused UI modules do not
// consume F1's 1 GB disk. Never ship local dotenv files, data or caches.
const destination = path.resolve("artifacts/azure-demo");
if (existsSync(destination))
  throw new Error(
    "artifacts/azure-demo already exists; move it aside before packaging again.",
  );
const standalone = "src/web/.next/standalone";
if (!existsSync(`${standalone}/src/web/server.js`))
  throw new Error("Run npm run build first (standalone output required).");
const safe = (source) => {
  const name = path.basename(source);
  return (
    name !== ".env" &&
    !name.startsWith(".env.") &&
    name !== "cache" &&
    !name.endsWith(".tsbuildinfo")
  );
};
await mkdir(destination, { recursive: true });
await cp(standalone, destination, { recursive: true, filter: safe });
const { fileList, warnings } = await nodeFileTrace(
  [
    "dist/src/server/main.js",
    "dist/src/domain/hosted-demo.js",
    "scripts/start-demo.mjs",
  ],
  { base: process.cwd(), ts: false },
);
// Missing optional dependencies may be expected, but display tracing warnings
// so a new runtime dependency does not silently disappear from the package.
if (warnings.size) {
  await writeFile(
    "artifacts/azure-demo-trace-warnings.log",
    [...warnings].map((warning) => warning.message).join("\n\n"),
  );
  console.warn(
    `Trace emitted ${warnings.size} dependency probes; details in artifacts/azure-demo-trace-warnings.log. Run verify:demo before using the release.`,
  );
}
for (const file of fileList) {
  if (path.isAbsolute(file) || file.split(path.sep).includes(".."))
    throw new Error("Trace escaped the workspace.");
  if (!file.split(path.sep).every((part) => safe(part)))
    throw new Error("Trace included a private or cache file.");
  await cp(file, path.join(destination, file), { dereference: true });
}
await cp("src/web/public", path.join(destination, "src/web/public"), {
  recursive: true,
});
await cp(
  "src/web/.next/static",
  path.join(destination, "src/web/.next/static"),
  { recursive: true },
);
const manifest = JSON.parse(await readFile("package.json", "utf8"));
await writeFile(
  path.join(destination, "package.json"),
  JSON.stringify(
    {
      name: manifest.name,
      version: manifest.version,
      private: true,
      scripts: { start: "node scripts/start-demo.mjs" },
      engines: manifest.engines,
    },
    null,
    2,
  ),
);
async function size(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    bytes += entry.isDirectory() ? await size(file) : (await stat(file)).size;
  }
  return bytes;
}
const bytes = await size(destination);
if (bytes > 600 * 1024 * 1024)
  throw new Error(
    "Runtime exceeds the 600 MiB packaging budget; review before deploying to F1.",
  );
console.log(
  `Release prepared at artifacts/azure-demo (${Math.ceil(bytes / 1024 / 1024)} MiB; no migrations or cloud operations).`,
);
