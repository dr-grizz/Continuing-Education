import { randomUUID } from "node:crypto";
import { resolveSkillSelections } from "./skills.mjs";
export const defaultDesign = {
  title: "Faithful Leadership",
  description:
    "Recognizes the application of biblical principles to thoughtful, effective leadership and service.",
  criteria:
    "Complete the required learning activities and demonstrate the course outcomes.",
  issuer: "Cedarville University",
  label: "CONTINUING EDUCATION",
  footer: "FAITH · LEARNING · SERVICE",
  shape: "shield",
  icon: "book",
  font: "serif",
  primary: "#003A63",
  accent: "#FDB813",
  text: "#FFFFFF",
  border: 12,
  iconSize: 92,
  logo: null,
  artworkImage: null,
};
export function validateDesign(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid badge design");
  const design = {};
  for (const [key, limit] of Object.entries({
    title: 100,
    description: 2000,
    criteria: 2000,
    issuer: 120,
    label: 50,
    footer: 60,
  })) {
    if (
      typeof input[key] !== "string" ||
      input[key].length > limit ||
      (["title", "description", "issuer"].includes(key) && !input[key].trim())
    )
      throw new Error("Invalid badge design");
    design[key] = input[key].trim();
  }
  for (const [key, choices] of Object.entries({
    shape: ["shield", "circle", "hexagon", "seal"],
    icon: ["book", "star", "laurel", "cross", "torch"],
    font: ["serif", "sans"],
  })) {
    if (!choices.includes(input[key])) throw new Error("Invalid badge design");
    design[key] = input[key];
  }
  for (const key of ["primary", "accent", "text"]) {
    if (typeof input[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(input[key]))
      throw new Error("Invalid badge design");
    design[key] = input[key].toUpperCase();
  }
  for (const [key, min, max] of [
    ["border", 2, 24],
    ["iconSize", 50, 130],
  ]) {
    if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max)
      throw new Error("Invalid badge design");
    design[key] = input[key];
  }
  for (const key of ["logo", "artworkImage"]) {
    design[key] = null;
    if (input[key] === null || input[key] === undefined) continue;
    if (typeof input[key] !== "string" || input[key].length > 2800000)
      throw new Error("Invalid badge design");
    const match = input[key].match(
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
    );
    if (!match) throw new Error("Invalid badge design");
    const bytes = Buffer.from(match[2], "base64");
    const valid =
      match[1] === "png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : match[1] === "jpeg"
          ? bytes[0] === 255 && bytes[1] === 216
          : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP";
    if (!valid || bytes.length > 2 * 1024 * 1024)
      throw new Error("Invalid badge design");
    design[key] = input[key];
  }
  if (input.skills !== undefined) {
    if (
      !Array.isArray(input.skills) ||
      input.skills.length > 20 ||
      input.skills.some(
        (s) =>
          !s ||
          typeof s.id !== "string" ||
          typeof s.releaseId !== "string" ||
          typeof s.name !== "string" ||
          s.source !== "O*NET" ||
          typeof s.assessment !== "string" ||
          s.assessment.trim().length < 10,
      )
    )
      throw new Error("Invalid assessed skill alignment");
    if (input.skills.length) design.skills = structuredClone(input.skills);
  }
  return design;
}
// Schema changes belong to the portal's Prisma migrations.
export function initializeDrafts() {}
export async function listDrafts(db) {
  return (
    await db
      .prepare("SELECT * FROM badge_drafts ORDER BY updated_at DESC")
      .all()
  ).map((row) => ({
    id: row.id,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    design: JSON.parse(row.design),
  }));
}
export async function saveDraft(db, input, id = null, revision = null) {
  const skills = await resolveSkillSelections(db, input?.skills);
  const design = validateDesign({
    ...input,
    ...(skills.length ? { skills } : { skills: undefined }),
  });
  const at = new Date().toISOString();
  if (!id) {
    id = randomUUID();
    await db
      .prepare(
        "INSERT INTO badge_drafts(id,revision,created_at,updated_at,design) VALUES(?,1,?,?,?)",
      )
      .run(id, at, at, JSON.stringify(design));
  } else {
    const row = await db
      .prepare("SELECT revision FROM badge_drafts WHERE id=?")
      .get(id);
    if (!row) throw new Error("Badge draft not found");
    if (!Number.isInteger(revision) || row.revision !== revision)
      throw new Error("Draft changed elsewhere; reload before saving");
    const result = await db
      .prepare(
        "UPDATE badge_drafts SET revision=revision+1,updated_at=?,design=? WHERE id=? AND revision=?",
      )
      .run(at, JSON.stringify(design), id, revision);
    if (result.changes !== 1)
      throw new Error("Draft changed elsewhere; reload before saving");
  }
  return (await listDrafts(db)).find((row) => row.id === id);
}
