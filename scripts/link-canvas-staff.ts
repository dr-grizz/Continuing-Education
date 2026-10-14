import "dotenv/config";
import { prisma } from "../src/domain/prisma";
import { db } from "../src/domain/db";
import { canvasSubject } from "../src/server/canvas-staff-auth";

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length !== 4 ||
    args[0] !== "--email" ||
    args[2] !== "--canvas-user-id"
  )
    throw new Error(
      "Usage: npm run staff:link-canvas -- --email staff@example.edu --canvas-user-id 12345",
    );
  const origin = new URL(process.env.CANVAS_BASE_URL || "");
  if (
    origin.protocol !== "https:" ||
    origin.pathname !== "/" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  )
    throw new Error("Set CANVAS_BASE_URL to the HTTPS Canvas origin first.");
  const provider = `canvas:${origin.origin}`;
  const subject = canvasSubject(args[3]);
  const email = args[1].trim().toLowerCase();
  await prisma.$transaction(async (tx) => {
    const member = await tx.staff_members.findUnique({ where: { email } });
    if (!member?.active)
      throw new Error(
        "Create an active portal staff member with this email before linking.",
      );
    if (
      member.external_subject &&
      (member.auth_provider !== provider || member.external_subject !== subject)
    )
      throw new Error(
        "This staff member already has a different identity link. Refusing to replace it.",
      );
    const used = await tx.staff_members.findUnique({
      where: {
        auth_provider_external_subject: {
          auth_provider: provider,
          external_subject: subject,
        },
      },
    });
    if (used && used.id !== member.id)
      throw new Error(
        "This Canvas identity is already linked to another staff member.",
      );
    if (
      member.auth_provider === provider &&
      member.external_subject === subject
    )
      return;
    const changed = await tx.staff_members.updateMany({
      where: { id: member.id, version: member.version },
      data: {
        auth_provider: provider,
        external_subject: subject,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1)
      throw new Error("Staff record changed concurrently. Check it and retry.");
    await tx.staff_sessions.deleteMany({ where: { staff_id: member.id } });
    await tx.audit_events.create({
      data: {
        actor: "local:staff-link-cli",
        action: "staff.canvas_identity_linked",
        object_id: member.id,
        details: { provider, subject },
      },
    });
  });
  console.log(
    `Canvas user ${subject} is linked to ${email}. Portal roles were preserved.`,
  );
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Unable to link staff identity.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await db.end();
  });
