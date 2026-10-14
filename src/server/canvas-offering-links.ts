import { ConflictException } from "@nestjs/common";
import { sql, Tx } from "../domain/prisma";

function courseKey(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const course = /^\/courses\/(\d+)\/?$/.exec(url.pathname);
    return course ? `${url.origin}/courses/${course[1]}` : null;
  } catch {
    return null;
  }
}

// Share the sync transaction lock so a manual create/edit cannot race an import.
export async function protectCanvasOfferingLink(
  tx: Tx,
  url: string | null,
  offeringId?: string,
) {
  await sql(
    tx,
    "SELECT 1 FROM (SELECT pg_advisory_xact_lock(21001018)) AS locked",
  );
  const key = courseKey(url);
  if (offeringId) {
    const mapping = await tx.canvas_offering_mappings.findUnique({
      where: { offering_id: offeringId },
    });
    if (
      mapping &&
      key !== `${mapping.installation_url}/courses/${mapping.course_id}`
    )
      throw new ConflictException(
        "This offering is mapped to a Canvas course. Its course link cannot be removed or changed.",
      );
  }
  if (!key) return;
  const offerings = await tx.offerings.findMany({
    where: {
      canvas_course_url: { not: null },
      ...(offeringId ? { id: { not: offeringId } } : {}),
    },
    select: { id: true, title: true, canvas_course_url: true },
  });
  const duplicate = offerings.find(
    (o) => courseKey(o.canvas_course_url) === key,
  );
  if (duplicate)
    throw new ConflictException(
      `This Canvas course already has an offering: ${duplicate.title} (${duplicate.id}). No duplicate was created.`,
    );
}
