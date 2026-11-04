import { BadRequestException } from "@nestjs/common";
import {
  OfferingSkill,
  OfferingSkillReference,
} from "../domain/offering-skills";
import { sql, Tx } from "../domain/prisma";

export async function resolveOfferingSkills(
  tx: Tx,
  selections: OfferingSkillReference[],
): Promise<OfferingSkill[]> {
  if (!Array.isArray(selections) || selections.length > 20)
    throw new BadRequestException("Choose up to 20 skills for the offering.");
  const seen = new Set<string>();
  for (const item of selections) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      item.id.length > 100 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        item.releaseId || "",
      )
    )
      throw new BadRequestException("Select a valid O*NET skill reference.");
    const key = item.releaseId + ":" + item.id;
    if (seen.has(key))
      throw new BadRequestException("Choose each offering skill only once.");
    seen.add(key);
  }
  if (!selections.length) return [];
  const rows = await sql<OfferingSkill>(
    tx,
    `
    SELECT s.id,s.release_id::text AS "releaseId",s.name,s.description,s.category,s.url,
      'O*NET' AS source,r.version,'https://creativecommons.org/licenses/by/4.0/' AS license
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS x(item,position)
    JOIN labor_skills s ON s.release_id=(x.item->>'releaseId')::uuid AND s.id=x.item->>'id'
    JOIN labor_releases r ON r.id=s.release_id AND r.kind='onet'
    ORDER BY x.position`,
    JSON.stringify(selections),
  );
  if (rows.length !== selections.length)
    throw new BadRequestException(
      "A selected skill is unavailable. Refresh the skills search and try again.",
    );
  return rows;
}
