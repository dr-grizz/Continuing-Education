import "reflect-metadata";
import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { migrate } from "../scripts/db-migrate";
let db: typeof import("../src/domain/db").db;
let prisma: typeof import("../src/domain/prisma").prisma;
import type { PortalService } from "../src/server/service";
import type { ManagedRecordsService } from "../src/server/managed-records";
import type { ProgressService } from "../src/server/progress";
import { canvasStaffConfig } from "../src/server/staff-auth-config";
import {
  courseConnectionConfig,
  courseFingerprint,
} from "../src/server/canvas-course-config";
let portal: PortalService,
  records: ManagedRecordsService,
  progress: ProgressService;
const mainDatabaseUrl = process.env.DATABASE_URL!;
const testDatabase = `ce_managed_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({
  connectionString: Object.assign(new URL(mainDatabaseUrl), {
    pathname: "/postgres",
  }).href,
});
let created = false;
const token = randomUUID(),
  actor = `management-test:${token}`,
  workspace = `test-${token}`,
  made: { target: string; id: string }[] = [];
const principal = {
  actor,
  scopes: ["staff:manage", "progress:manage", "badges:manage", "canvas:sync"],
  staffId: randomUUID(),
};
const originalEnv = { ...process.env };
let staffId = "",
  offeringId = "",
  learnerId = "",
  hash = "";
const track = (target: string, id: string) => {
  made.push({ target, id });
  return id;
};
async function action(
  target: string,
  id: string,
  action: "archive" | "restore" | "delete",
  key = randomUUID(),
  version?: number,
) {
  const current = (await records.list(target)).find((r) => r.id === id);
  return records.change(principal, key, target, id, {
    action,
    version: version ?? current!.version,
    reason: "Synthetic management verification",
  });
}
async function cycle(target: string, id: string, deletable = true) {
  await assert.rejects(action(target, id, "delete"));
  const before = (await records.list(target)).find((r) => r.id === id)!;
  const key = randomUUID();
  const result = await action(target, id, "archive", key);
  assert.deepEqual(
    await records.change(principal, key, target, id, {
      action: "archive",
      version: before.version,
      reason: "Synthetic management verification",
    }),
    result,
  );
  assert.equal(
    (await records.list(target)).find((r) => r.id === id)?.archived,
    true,
  );
  await assert.rejects(
    action(target, id, "restore", randomUUID(), before.version),
  );
  await action(target, id, "restore");
  assert.equal(
    (await records.list(target)).find((r) => r.id === id)?.archived,
    false,
  );
  await action(target, id, "archive");
  if (deletable) {
    await action(target, id, "delete");
    assert.ok(!(await records.list(target)).some((r) => r.id === id));
  } else await assert.rejects(action(target, id, "delete"));
}
async function main() {
  try {
    const staff = await prisma.staff_members.create({
      data: {
        email: `archive-${token}@example.test`,
        display_name: "Synthetic archived staff",
        roles: ["support"],
      },
    });
    staffId = track("staff", staff.id);
    await assert.rejects(
      records.change(
        { ...principal, staffId },
        randomUUID(),
        "staff",
        staffId,
        {
          action: "archive",
          version: 1,
          reason: "Synthetic self archive check",
        },
      ),
    );
    await action("staff", staffId, "archive");
    assert.equal(
      (await prisma.staff_members.findUniqueOrThrow({ where: { id: staffId } }))
        .active,
      false,
    );
    await assert.rejects(
      portal.updateStaff(principal, randomUUID(), staffId, {
        version: 2,
        displayName: staff.display_name,
        roles: ["support"],
        active: true,
      }),
    );
    await action("staff", staffId, "restore");
    assert.equal(
      (await prisma.staff_members.findUniqueOrThrow({ where: { id: staffId } }))
        .active,
      false,
    );
    await action("staff", staffId, "archive");
    await action("staff", staffId, "delete");
    for (const role of await records.list("role")) {
      assert.ok(role.protectedReason);
      await assert.rejects(action("role", role.id, "archive"));
    }
    const offering = await db.query(
      "INSERT INTO offerings(title,category,summary,description,format,course_type,start_date,end_date,price_cents,capacity) VALUES ('Management test','Technology','Synthetic management summary','Synthetic management description','Online','self_paced',NULL,NULL,100,10) RETURNING id",
    );
    offeringId = offering.rows[0].id;
    const plan: any = await progress.createPlan(principal, randomUUID(), {
      offeringId,
      previousRevision: 0,
      steps: [{ title: "Documented completion", required: true }],
    });
    track("progress-plan", plan.id);
    const cohort: any = await progress.createCohort(principal, randomUUID(), {
      planId: plan.id,
      name: "Synthetic management cohort",
    });
    track("cohort", cohort.id);
    await cycle("cohort", cohort.id);
    await cycle("progress-plan", plan.id);
    const usedPlan: any = await progress.createPlan(principal, randomUUID(), {
      offeringId,
      previousRevision: 0,
      steps: [{ title: "Documented history", required: true }],
    });
    track("progress-plan", usedPlan.id);
    const learner = await prisma.learners.create({
      data: { email: `management-${token}@example.test` },
    });
    learnerId = learner.id;
    await progress.addParticipant(principal, randomUUID(), usedPlan.id, {
      learnerId,
    });
    await action("progress-plan", usedPlan.id, "archive");
    assert.ok(
      !(await progress.catalog()).plans.some((p: any) => p.id === usedPlan.id),
    );
    await assert.rejects(
      progress.addParticipant(principal, randomUUID(), usedPlan.id, {
        learnerId,
      }),
    );
    await assert.rejects(action("progress-plan", usedPlan.id, "delete"));
    assert.equal((await progress.report(usedPlan.id)).participants.length, 1);
    await prisma.credential_workspaces.create({
      data: { id: workspace, key_id: "synthetic-test-key" },
    });
    const draft = await prisma.credential_badge_drafts.create({
      data: {
        workspace,
        id: randomUUID(),
        revision: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        design: JSON.stringify({ title: "Synthetic draft" }),
      },
    });
    const draftKey = track("badge-draft", `${workspace}--${draft.id}`);
    await cycle("badge-draft", draftKey);
    const sourceDraft = await prisma.credential_badge_drafts.create({
      data: {
        workspace,
        id: randomUUID(),
        revision: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        design: JSON.stringify({ title: "Synthetic approved draft" }),
      },
    });
    track("badge-draft", `${workspace}--${sourceDraft.id}`);
    const version = await prisma.credential_badge_versions.create({
      data: {
        workspace,
        id: randomUUID(),
        draft_id: sourceDraft.id,
        draft_revision: 1,
        status: "approved",
        design_json: JSON.stringify({ title: "Synthetic version" }),
        artwork_svg: "<svg/>",
        approved_at: new Date().toISOString(),
        approved_by: actor,
      },
    });
    const versionKey = track("badge-version", `${workspace}--${version.id}`);
    const mapping = await prisma.credential_course_mappings.create({
      data: {
        workspace,
        id: randomUUID(),
        badge_version_id: version.id,
        rule_json: "{}",
        rule_hash: token,
        verification_json: "{}",
        enabled: 1,
        created_at: new Date().toISOString(),
        created_by: actor,
      },
    });
    const mappingKey = track("badge-mapping", `${workspace}--${mapping.id}`);
    await action("badge-version", versionKey, "archive");
    assert.equal(
      (
        await prisma.credential_course_mappings.findUniqueOrThrow({
          where: { workspace_id: { workspace, id: mapping.id } },
        })
      ).enabled,
      0,
    );
    await action("badge-version", versionKey, "restore");
    assert.equal(
      (
        await prisma.credential_badge_versions.findUniqueOrThrow({
          where: { workspace_id: { workspace, id: version.id } },
        })
      ).status,
      "approved",
    );
    await cycle("badge-mapping", mappingKey);
    await cycle("badge-version", versionKey);
    await cycle("badge-draft", `${workspace}--${sourceDraft.id}`);
    const template = await prisma.credential_certificate_templates.create({
      data: {
        workspace,
        id: randomUUID(),
        revision: 1,
        name: "Synthetic certificate template",
        design_json: "{}",
        updated_at: new Date().toISOString(),
      },
    });
    await cycle(
      "certificate-template",
      track("certificate-template", `${workspace}--${template.id}`),
    );
    const award = await prisma.credential_badges.create({
      data: {
        workspace,
        id: randomUUID(),
        learner: "synthetic-learner",
        course: "synthetic-course",
        rule_version: "1",
        issued_at: new Date().toISOString(),
        credential: "{}",
        signature: "synthetic-signature",
        evidence: "{}",
      },
    });
    await cycle(
      "badge-award",
      track("badge-award", `${workspace}--${award.id}`),
      false,
    );
    const certificate = await prisma.credential_certificates.create({
      data: {
        workspace,
        id: randomUUID(),
        source_id: "workspace",
        badge_id: award.id,
        learner: "synthetic-learner",
        created_at: new Date().toISOString(),
        created_by: actor,
        snapshot_json: "{}",
        signature: "synthetic-signature",
      },
    });
    await cycle(
      "certificate",
      track("certificate", `${workspace}--${certificate.id}`),
      false,
    );
    const staffToken = process.env.STAFF_API_TOKEN!;
    const source = new Pool({ connectionString: mainDatabaseUrl });
    const approver = (
      await source.query(
        "SELECT id FROM staff_members WHERE email='approver@cuce.test'",
      )
    ).rows[0];
    await source.end();

    for (const target of [
      "staff",
      "role",
      "progress-plan",
      "cohort",
      "canvas-course",
      "badge-draft",
      "badge-version",
      "badge-award",
      "certificate-template",
      "certificate",
    ]) {
      const response = await fetch(
        `http://127.0.0.1:3051/api/v1/staff/records/${target}`,
        {
          headers: {
            Authorization: `Bearer ${staffToken}`,
            "X-Prototype-Staff-Id": approver.id,
          },
        },
      );
      assert.equal(response.status, 403, target);
    }
    Object.assign(process.env, {
      STAFF_AUTH_MODE: "canvas",
      CANVAS_BASE_URL: "https://canvas.example.test",
      CANVAS_STAFF_CLIENT_ID: "archive-test-client",
      CANVAS_STAFF_CLIENT_SECRET: "synthetic-client-secret",
      CANVAS_STAFF_REDIRECT_URI:
        "http://localhost:3050/api/auth/canvas/callback",
      CANVAS_COURSES_ENABLED: "true",
      CANVAS_COURSES_SUBACCOUNT_ID: "989898",
      CANVAS_COURSES_INCLUDE_SUBACCOUNTS: "false",
      CANVAS_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    });
    const auth = canvasStaffConfig(),
      connection = courseConnectionConfig();
    hash = courseFingerprint(
      auth.fingerprint,
      connection.accountId,
      connection.nested,
    );
    await prisma.canvas_course_snapshots.create({
      data: {
        configuration_hash: hash,
        run_id: randomUUID(),
        observed_at: new Date(),
        courses: [{ id: "989898", name: "Synthetic Canvas source" }],
      },
    });
    await cycle("canvas-course", track("canvas-course", `${hash}-989898`));
    assert.equal(
      (
        await prisma.canvas_course_snapshots.findUniqueOrThrow({
          where: { configuration_hash: hash },
        })
      ).courses instanceof Array,
      true,
    );
    console.log(
      "PASS: archive/restore/delete across staff, progress plans/cohorts, Canvas inventory, badge designs/versions/rules, issued badges, certificate templates/certificates; stale versions, idempotency, self-account/role protection, retained history and permissions",
    );
  } finally {
    await prisma.$disconnect();
    await db.end();
  }
}
async function isolated() {
  try {
    await admin.query(`CREATE DATABASE ${testDatabase}`);
    created = true;
    process.env.DATABASE_URL = Object.assign(new URL(mainDatabaseUrl), {
      pathname: `/${testDatabase}`,
    }).href;
    await migrate(process.env.DATABASE_URL, { quiet: true });
    db = (await import("../src/domain/db")).db;
    prisma = (await import("../src/domain/prisma")).prisma;
    portal = new (await import("../src/server/service")).PortalService();
    records = new (
      await import("../src/server/managed-records")
    ).ManagedRecordsService(portal);
    progress = new (await import("../src/server/progress")).ProgressService(
      portal,
    );
    await main();
  } finally {
    Object.assign(process.env, originalEnv);
    if (created) {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1",
        [testDatabase],
      );
      await admin.query(`DROP DATABASE ${testDatabase}`);
    }
    await admin.end();
  }
}

isolated().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
