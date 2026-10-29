import { readdir, readlink, realpath, symlink, unlink } from "node:fs/promises";
import path from "node:path";

function inside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

async function visitLinks(root, action) {
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) await action(file);
      else if (entry.isDirectory()) await visit(file);
    }
  }
  await visit(root);
}

// Next's standalone aliases can point at absolute paths in the build checkout.
// Preserve aliases, but make their targets relative to the shipped directory.
export async function makeReleaseLinksPortable(source, destination) {
  source = path.resolve(source);
  destination = path.resolve(destination);
  await visitLinks(destination, async (file) => {
    const link = await readlink(file);
    if (!path.isAbsolute(link)) return;
    if (!inside(source, link))
      throw new Error(
        `Release link points outside standalone output: ${path.relative(destination, file)}`,
      );
    const target = path.join(destination, path.relative(source, link));
    await unlink(file);
    await symlink(path.relative(path.dirname(file), target), file);
  });
  await checkReleaseLinks(destination);
}

export async function checkReleaseLinks(root) {
  root = await realpath(root);
  await visitLinks(root, async (file) => {
    const relative = path.relative(root, file);
    const link = await readlink(file);
    if (
      path.isAbsolute(link) ||
      !inside(root, path.resolve(path.dirname(file), link))
    )
      throw new Error(`Release has a nonportable link: ${relative}`);
    const target = await realpath(file).catch(() => {
      throw new Error(`Release has a broken link: ${relative}`);
    });
    if (!inside(root, target))
      throw new Error(`Release link escapes package: ${relative}`);
  });
}
