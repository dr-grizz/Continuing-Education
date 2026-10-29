import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  checkReleaseLinks,
  makeReleaseLinksPortable,
} from "../scripts/release-links.mjs";

test("standalone dependency alias imports after the build tree is removed", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "ce-release-links-"));
  try {
    const source = path.join(temporary, "build");
    const release = path.join(temporary, "release");
    const dependency = path.join(source, "node_modules/pg");
    const aliases = path.join(source, "web/.next/node_modules");
    await mkdir(dependency, { recursive: true });
    await mkdir(aliases, { recursive: true });
    await writeFile(
      path.join(dependency, "index.js"),
      "exports.Pool = class Pool {};\n",
    );
    await symlink(dependency, path.join(aliases, "pg-build-alias"));
    await writeFile(
      path.join(source, "web/.next/probe.mjs"),
      'import { Pool } from "pg-build-alias"; if (typeof Pool !== "function") process.exit(1);\n',
    );
    await cp(source, release, { recursive: true, verbatimSymlinks: true });
    await assert.rejects(checkReleaseLinks(release), /nonportable link/);
    await makeReleaseLinksPortable(source, release);
    assert.equal(
      path.isAbsolute(
        await readlink(
          path.join(release, "web/.next/node_modules/pg-build-alias"),
        ),
      ),
      false,
    );
    await rm(source, { recursive: true });
    // Match the smoke test's copy into a separate deployment directory.
    const isolated = path.join(temporary, "isolated");
    await cp(release, isolated, { recursive: true, verbatimSymlinks: true });
    await rm(release, { recursive: true });
    await checkReleaseLinks(isolated);
    execFileSync(process.execPath, [
      path.join(isolated, "web/.next/probe.mjs"),
    ]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("release validation rejects escaping and broken relative links", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ce-release-invalid-"));
  try {
    const link = path.join(root, "alias");
    await symlink("../outside", link);
    await assert.rejects(checkReleaseLinks(root), /nonportable link/);
    await rm(link);
    await symlink("missing", link);
    await assert.rejects(checkReleaseLinks(root), /broken link/);
    await rm(link);
    await symlink(path.join(tmpdir(), "outside"), link);
    await assert.rejects(
      makeReleaseLinksPortable(path.join(root, "build"), root),
      /outside standalone output/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
