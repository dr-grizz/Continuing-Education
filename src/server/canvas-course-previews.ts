import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  mkdir,
  open,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { tokenEncryptionKey } from "./canvas-course-config";
import type { CanvasCourse } from "./canvas-course-client";

export const PREVIEW_TTL_MS = 30 * 60_000;
export type CoursePreview = {
  runId: string;
  staffId: string;
  configurationHash: string;
  observedAt: string;
  expiresAt: string;
  courses: CanvasCourse[];
};
const binding = (runId: string, staffId: string, hash: string) =>
  Buffer.from(JSON.stringify(["canvas-course-preview", runId, staffId, hash]));
const directory = () =>
  process.env.CANVAS_COURSES_PREVIEW_DIRECTORY ||
  path.join(tmpdir(), "ce-course-previews");
const identifier =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function filename(runId: string, lease: string) {
  if (!identifier.test(runId) || !identifier.test(lease))
    throw new Error("Invalid preview identifier.");
  return path.join(directory(), `${runId}-${lease}.preview`);
}
export async function writeCoursePreview(
  preview: CoursePreview,
  lease: string,
) {
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenEncryptionKey(), nonce);
  cipher.setAAD(
    binding(preview.runId, preview.staffId, preview.configurationHash),
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(preview), "utf8"),
    cipher.final(),
  ]);
  const bytes = Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
  if (bytes.length > 12_000_000)
    throw new Error("Course preview exceeds its temporary storage limit.");
  const destination = filename(preview.runId, lease);
  const temporary = `${destination}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
export async function readCoursePreview(
  runId: string,
  lease: string,
  staffId: string,
  hash: string,
): Promise<CoursePreview | null> {
  const file = filename(runId, lease);
  try {
    const handle = await open(file, "r");
    let bytes: Buffer;
    try {
      const info = await handle.stat();
      if (
        !info.isFile() ||
        info.size > 12_000_000 ||
        info.mtimeMs + PREVIEW_TTL_MS <= Date.now()
      )
        return null;
      bytes = await handle.readFile();
    } finally {
      await handle.close();
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      tokenEncryptionKey(),
      bytes.subarray(0, 12),
      { authTagLength: 16 },
    );
    decipher.setAAD(binding(runId, staffId, hash));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const preview = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    ) as CoursePreview;
    if (
      preview.runId !== runId ||
      preview.staffId !== staffId ||
      preview.configurationHash !== hash ||
      !Number.isFinite(Date.parse(preview.expiresAt)) ||
      Date.parse(preview.expiresAt) <= Date.now() ||
      !Array.isArray(preview.courses)
    )
      return null;
    return preview;
  } catch {
    return null;
  }
}
export async function removeCoursePreview(runId: string, lease: string) {
  await unlink(filename(runId, lease)).catch(() => {});
}
let lastCleanup = 0;
export async function expireCoursePreviews() {
  if (Date.now() - lastCleanup < 60_000) return;
  lastCleanup = Date.now();
  const files = await readdir(directory()).catch(() => [] as string[]);
  await Promise.all(
    files
      .filter((name) =>
        /^[0-9a-f-]+\.preview(?:\.[0-9a-f]+\.tmp)?$/i.test(name),
      )
      .map(async (name) => {
        const file = path.join(directory(), name);
        const info = await stat(file).catch(() => null);
        if (info && info.mtimeMs + PREVIEW_TTL_MS <= Date.now())
          await unlink(file).catch(() => {});
      }),
  );
}
