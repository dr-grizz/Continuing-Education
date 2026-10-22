import { readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/domain/prisma";
import { db } from "../src/domain/db";
// Explicit operator mapping only: no email matching or browser-selected learner ID.
async function main() {
  const [id, external] = process.argv.slice(2);
  if (
    !id ||
    !/^[0-9a-f-]{36}$/.test(id) ||
    !external ||
    !/^[a-zA-Z0-9_@.:-]{1,200}$/.test(external)
  )
    throw new Error(
      "Usage: npm run badges:link-learner -- <portal-learner-uuid> <approved-badge-learner-id>",
    );
  const learner = await prisma.learners.findUnique({
    where: { id },
    select: { id: true, active: true },
  });
  if (!learner?.active)
    throw new Error("The portal learner must exist and be active.");
  const config = JSON.parse(
    readFileSync(
      process.env.BADGE_CONFIG || "badge-service/config.example.json",
      "utf8",
    ),
  );
  if (!Object.hasOwn(config.learners, external))
    throw new Error(
      "The badge learner ID must be in the service's approved configuration.",
    );
  const file = path.resolve(
    process.env.BADGE_LEARNER_MAP_FILE ||
      "badge-service/data/portal-learners.json",
  );
  let links: Record<string, string> = {};
  try {
    links = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (links[id] && links[id] !== external)
    throw new Error(
      "A different link already exists. Review the identity change before replacing it manually.",
    );
  if (
    Object.entries(links).some(
      ([key, value]) => key !== id && value === external,
    )
  )
    throw new Error(
      "That badge account is already linked to another portal learner.",
    );
  links[id] = external;
  const temporary = file + `.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(links, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  renameSync(temporary, file);
  console.log("Approved learner identity link saved. No award was created.");
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await db.end();
  });
