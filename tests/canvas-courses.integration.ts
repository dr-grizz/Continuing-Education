import "reflect-metadata";
import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { migrate } from "../scripts/db-migrate";

const base = new URL(process.env.DATABASE_URL!);
const database = `ce_coursestest_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({
  connectionString: Object.assign(new URL(base), { pathname: "/postgres" })
    .href,
});
let created = false;
let previewDirectory: string | undefined;
let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
let prisma: typeof import("../src/domain/prisma").prisma | undefined;
let pool: typeof import("../src/domain/db").db | undefined;

async function main() {
  previewDirectory = await mkdtemp(path.join(tmpdir(), "ce-preview-test-"));
  process.env.CANVAS_COURSES_PREVIEW_DIRECTORY = previewDirectory;
  await admin.query(`CREATE DATABASE ${database}`);
  created = true;
  Object.assign(process.env, {
    DATABASE_URL: Object.assign(new URL(base), { pathname: `/${database}` })
      .href,
    PROTOTYPE_MODE: "true",
    STAFF_AUTH_MODE: "canvas",
    STAFF_API_TOKEN: "course-test-broker",
    CANVAS_BASE_URL: "https://canvas.example.test",
    CANVAS_STAFF_CLIENT_ID: "course-test-client",
    CANVAS_STAFF_CLIENT_SECRET: "course-test-secret",
    CANVAS_STAFF_REDIRECT_URI: "http://localhost:3050/api/auth/canvas/callback",
    CANVAS_COURSES_ENABLED: "true",
    CANVAS_COURSES_SUBACCOUNT_ID: "50",
    CANVAS_COURSES_INCLUDE_SUBACCOUNTS: "false",
    CANVAS_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    CANVAS_USER_AGENT: "CE-Course-Tests/1.0",
  });
  delete process.env.CANVAS_STAFF_AUTHORIZE_URL;
  delete process.env.CANVAS_STAFF_TOKEN_URL;
  await migrate(process.env.DATABASE_URL, { quiet: true });
  prisma = (await import("../src/domain/prisma")).prisma;
  pool = (await import("../src/domain/db")).db;
  const { CanvasStaffAuthService, secretDigest } =
    await import("../src/server/canvas-staff-auth");
  const { CanvasCoursesService } = await import("../src/server/canvas-courses");
  const { CanvasCoursesController } =
    await import("../src/server/canvas-courses-controller");
  const { PrototypeGuard } = await import("../src/server/auth");
  const { CanvasCourseClient } =
    await import("../src/server/canvas-course-client");
  const { canvasStaffConfig } = await import("../src/server/staff-auth-config");
  const { openCanvasTokens, grantBinding } =
    await import("../src/server/canvas-tokens");
  const { courseConnectionConfig } =
    await import("../src/server/canvas-course-config");
  const auth = new CanvasStaffAuthService();
  const courses = new CanvasCoursesService();
  const staff = await prisma.staff_members.findUniqueOrThrow({
    where: { email: "admin@cuce.test" },
  });
  await prisma.staff_members.update({
    where: { id: staff.id },
    data: {
      auth_provider: "canvas:https://canvas.example.test",
      external_subject: "42",
    },
  });
  let providerUser = 42;
  auth.request = async (_, init) => {
    assert.equal(
      new Headers(init?.headers).get("User-Agent"),
      "CE-Course-Tests/1.0",
    );
    assert.equal(
      new URLSearchParams(init?.body as URLSearchParams).get("grant_type"),
      "authorization_code",
    );
    return Response.json({
      access_token:
        providerUser === 96 ? "test-access-token-second" : "test-access-token",
      refresh_token: "test-refresh-token",
      expires_in: 3600,
      user: { id: providerUser, name: "Test staff" },
    });
  };
  const login = async () => {
    const browserNonce = randomBytes(32).toString("base64url");
    const start = await auth.begin(browserNonce);
    const url = new URL(start.authorizationUrl);
    const scopes = url.searchParams.get("scope")!;
    assert.ok(scopes.includes("url:GET|/api/v1/accounts/:account_id/courses"));
    assert.ok(!scopes.includes("/auth/userinfo"));
    assert.ok(!scopes.includes("POST"));
    return auth.complete({
      browserNonce,
      state: url.searchParams.get("state")!,
      code: "mock-code",
    });
  };
  const session = await login();
  const principal = await auth.principal(session.token);
  const grant = await prisma.staff_canvas_grants.findUniqueOrThrow({
    where: { staff_id: staff.id },
  });
  assert.ok(!grant.encrypted_tokens.includes("test-access-token"));
  assert.ok(!grant.encrypted_tokens.includes("test-refresh-token"));
  assert.throws(() =>
    openCanvasTokens(grant.encrypted_tokens, "wrong-staff-binding"),
  );
  const config = canvasStaffConfig();
  assert.equal(
    openCanvasTokens(
      grant.encrypted_tokens,
      grantBinding(staff.id, grant.provider, grant.subject, config.fingerprint),
    ).refreshToken,
    "test-refresh-token",
  );
  console.log(
    "PASS: existing OAuth requests read scopes; API grants are encrypted and bound to the verified staff identity",
  );

  let cardImage: string | null = "https://images.example.test/course-101.jpg";
  let mode = "good";
  let refreshes = 0;
  let reads = 0;
  let unauthorized = false;
  const row = (id: number, account_id = 50) => ({
    id,
    account_id,
    name: `Course ${id}`,
    course_code: `CE-${id}`,
    image_download_url: id === 101 ? cardImage : null,
    workflow_state: id === 102 ? "completed" : "available",
    start_at: id === 101 ? "2026-10-02T02:00:00Z" : null,
    end_at: id === 101 ? "2026-10-31T23:00:00Z" : null,
  });
  courses.request = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://canvas.example.test");
    assert.equal(init?.redirect, "error");
    assert.equal(
      new Headers(init?.headers).get("User-Agent"),
      "CE-Course-Tests/1.0",
    );
    if (url.pathname === "/login/oauth2/token") {
      refreshes++;
      const body = new URLSearchParams(init?.body as URLSearchParams);
      assert.equal(body.get("grant_type"), "refresh_token");
      assert.equal(body.get("refresh_token"), "test-refresh-token");
      if (mode === "revoked")
        return Response.json(
          { error: "invalid_grant", secret: "must-not-leak" },
          { status: 400 },
        );
      return Response.json({
        access_token: "refreshed-test-token",
        expires_in: 3600,
      });
    }
    assert.equal(init?.method || "GET", "GET");
    assert.match(
      new Headers(init?.headers).get("Authorization")!,
      /^Bearer (test-access-token(?:-second)?|refreshed-test-token)$/,
    );
    reads++;
    if (mode === "forbidden")
      return Response.json({ secret: "must-not-leak" }, { status: 403 });
    if (unauthorized) {
      unauthorized = false;
      return Response.json({}, { status: 401 });
    }
    if (url.pathname === "/api/v1/accounts/50")
      return Response.json({ id: 50 });
    if (url.pathname === "/api/v1/accounts/60")
      return Response.json({
        id: 60,
        parent_account_id: mode === "outside" ? 70 : 50,
      });
    if (url.pathname === "/api/v1/accounts/70")
      return Response.json({ id: 70, parent_account_id: null });
    if (url.pathname.endsWith("/courses")) {
      assert.equal(url.searchParams.get("include[]"), "course_image");
      assert.equal(url.searchParams.get("published"), "true");
    }
    if (url.searchParams.get("page") === "2") {
      if (mode === "partial")
        return Response.json({ secret: "must-not-leak" }, { status: 400 });
      return Response.json([row(102)]);
    }
    if (mode === "empty") return Response.json([]);
    if (mode === "nested") return Response.json([row(101), row(103, 60)]);
    const target =
      mode === "hostile"
        ? "https://evil.example.test/api/v1/accounts/50/courses?page=2"
        : "https://canvas.example.test/api/v1/accounts/50/courses?page=2";
    return Response.json([row(101), row(103, 60)], {
      headers: { Link: `<${target}>; rel="next"` },
    });
  };
  @Module({
    controllers: [CanvasCoursesController],
    providers: [
      PrototypeGuard,
      { provide: CanvasStaffAuthService, useValue: auth },
      { provide: CanvasCoursesService, useValue: courses },
    ],
  })
  class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(0, "127.0.0.1");
  const origin = await app.getUrl();
  const call = (
    path: string,
    body?: object,
    key = randomUUID(),
    token = session.token,
  ) =>
    fetch(`${origin}/api/v1/staff/canvas/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer course-test-broker",
        "X-Staff-Session": token,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const key = randomUUID();
  const queued = await Promise.all([
    call("sync", {}, key),
    call("sync", {}, key),
  ]);
  assert.ok(queued.every((response) => response.status === 202));
  const run = await queued[0].json();
  assert.equal((await queued[1].json()).id, run.id);
  assert.equal(await prisma.canvas_course_runs.count(), 1);
  assert.equal(
    (await call("schedule", { enabled: true, intervalMinutes: 60, version: 0 }))
      .status,
    409,
  );
  let view = await (await call("courses")).json();
  assert.equal(view.latest_run.status, "succeeded");
  assert.deepEqual(
    view.courses.map((c: any) => c.id),
    ["101", "102"],
  );
  assert.equal(view.total, 2);
  assert.equal(view.source, "preview");
  assert.equal(view.preview.run_id, run.id);
  assert.equal(await prisma.canvas_course_snapshots.count(), 0);
  assert.ok(
    !JSON.stringify(await prisma.canvas_course_runs.findMany()).includes(
      "Course 101",
    ),
  );
  const selectionRevision = view.saved_revision;
  const selectedPath = `sync-runs/${run.id}/sync-courses`;
  for (const courseIds of [[], ["101", "101"], ["999"], [101]])
    assert.equal(
      (
        await call(selectedPath, {
          courseIds,
          savedRevision: selectionRevision,
        })
      ).status,
      400,
    );
  const parallelImports = await Promise.all(
    [1, 2].map(() =>
      call(selectedPath, {
        courseIds: ["101"],
        savedRevision: selectionRevision,
      }),
    ),
  );
  assert.ok(parallelImports.every((response) => response.status === 200));
  assert.deepEqual(
    (await Promise.all(parallelImports.map((r) => r.json())))
      .map((r) => r.created_count)
      .sort(),
    [0, 1],
  );
  const { PortalService } = await import("../src/server/service");
  const portal = new PortalService();
  const mapping = await prisma.canvas_offering_mappings.findFirstOrThrow({
    where: { course_id: "101" },
    include: { offering: true },
  });
  const imported = mapping.offering;
  assert.equal(mapping.installation_url, "https://canvas.example.test");
  assert.equal(imported.title, "Course 101");
  assert.equal(imported.published, false);
  assert.equal(imported.imported_from_canvas, true);
  assert.equal((mapping.source as any).image_url, cardImage);
  assert.equal(
    (await portal.list({}, true)).find((o) => o.id === imported.id)!
      .canvas_image_url,
    cardImage,
  );
  assert.equal(
    imported.unlimited_seats,
    false,
    "blank imported capacity must not imply unlimited",
  );
  for (const field of ["price_cents", "capacity", "course_type"] as const)
    assert.equal(imported[field], null);
  assert.equal(imported.start_date?.toISOString().slice(0, 10), "2026-10-01");
  assert.equal(
    await prisma.offering_prices.count({ where: { offering_id: imported.id } }),
    0,
  );
  await assert.rejects(
    portal.publish(principal, randomUUID(), imported.id, imported.version),
    /Complete required.*Price/,
  );
  await assert.rejects(
    prisma.offerings.update({
      where: { id: imported.id },
      data: { published: true },
    }),
  );
  await assert.rejects(
    portal.register(
      { actor: "draft-test", scopes: ["learner"] },
      randomUUID(),
      imported.id,
    ),
    /not available/,
  );
  await assert.rejects(
    portal.updateSettings(principal, randomUUID(), imported.id, {
      version: imported.version,
      approvalValidDays: 7,
      enrollmentCloseDays: 7,
      canvasCourseUrl: null,
    }),
    /cannot be removed or changed/,
  );
  await portal.updateSettings(principal, randomUUID(), imported.id, {
    version: imported.version,
    approvalValidDays: 14,
    enrollmentCloseDays: 7,
    canvasCourseUrl: imported.canvas_course_url,
  });
  const editFields = {
    title: "Staff-written course title",
    category: "Technology",
    summary: "Summary written by the course manager.",
    description:
      "Description written by the course manager for portal learners.",
    format: "Online",
    courseType: "self_paced" as const,
    priceCents: 7500,
    capacity: 25,
    approvalRequired: false,
    canvasCourseUrl: imported.canvas_course_url!,
  };
  await assert.rejects(
    portal.create(principal, randomUUID(), editFields),
    /already has an offering/,
  );
  await assert.rejects(
    portal.edit(principal, randomUUID(), imported.id, {
      ...editFields,
      version: imported.version + 1,
      canvasCourseUrl: "https://canvas.example.test/courses/999",
    }),
    /cannot be removed or changed/,
  );
  await portal.edit(principal, randomUUID(), imported.id, {
    ...editFields,
    version: imported.version + 1,
  });
  const complete = await prisma.offerings.findUniqueOrThrow({
    where: { id: imported.id },
  });
  assert.equal(
    await prisma.offering_prices.count({ where: { offering_id: imported.id } }),
    1,
  );
  await portal.edit(principal, randomUUID(), imported.id, {
    ...editFields,
    version: complete.version,
    capacity: null,
    unlimitedSeats: true,
  });
  const unlimitedDraft = await prisma.offerings.findUniqueOrThrow({
    where: { id: imported.id },
  });
  await portal.publish(
    principal,
    randomUUID(),
    imported.id,
    unlimitedDraft.version,
  );
  const staffEdited = await prisma.offerings.findUniqueOrThrow({
    where: { id: imported.id },
  });
  const selectedSnapshot =
    await prisma.canvas_course_snapshots.findFirstOrThrow();
  const selectedRows = selectedSnapshot.courses as any[];
  assert.deepEqual(
    selectedRows.map((row) => row.id),
    ["101"],
  );
  assert.ok(selectedRows[0].synced_at);
  assert.equal(
    (
      await call(selectedPath, {
        courseIds: ["101"],
        savedRevision: selectionRevision,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(selectedPath, {
        courseIds: ["102"],
        savedRevision: selectionRevision,
      })
    ).status,
    409,
  );
  let selectedView = await (await call("courses?view=preview")).json();
  assert.equal(selectedView.total, 2);
  assert.equal(
    selectedView.courses.find((row: any) => row.id === "101").sync_status,
    "synced",
  );
  assert.equal(
    selectedView.courses.find((row: any) => row.id === "102").sync_status,
    "not_synced",
  );
  assert.equal((await (await call("courses?view=synced")).json()).total, 1);
  assert.equal(
    selectedView.courses.find((row: any) => row.id === "101").offering_id,
    imported.id,
  );
  assert.deepEqual(
    selectedView.courses.find((row: any) => row.id === "101")
      .offering_missing_fields,
    [],
  );
  // An existing manual link prevents an import; the failed batch saves neither snapshots nor drafts.
  const duplicate = await prisma.offerings.create({
    data: {
      ...staffEdited,
      outcomes: [],
      id: randomUUID(),
      title: "Existing manual offering",
      imported_from_canvas: false,
      canvas_course_url: "https://canvas.example.test/courses/102/?from=manual",
    },
  });
  const conflict = await call(selectedPath, {
    courseIds: ["101", "102"],
    savedRevision: selectedView.saved_revision,
  });
  assert.equal(conflict.status, 409);
  assert.match((await conflict.json()).message, /already has an offering/);
  assert.equal(await prisma.canvas_offering_mappings.count(), 1);
  assert.deepEqual(
    (await prisma.canvas_course_snapshots.findFirstOrThrow()).courses,
    selectedSnapshot.courses,
  );
  await prisma.offerings.delete({ where: { id: duplicate.id } });
  await prisma.canvas_course_snapshots.update({
    where: { configuration_hash: selectedSnapshot.configuration_hash },
    data: {
      courses: [
        ...selectedRows,
        { ...selectedRows[0], id: "999", name: "Earlier synced course" },
      ],
    },
  });
  selectedView = await (await call("courses?view=preview")).json();
  assert.equal(
    (
      await call(selectedPath, {
        courseIds: ["102"],
        savedRevision: selectedView.saved_revision,
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await (await call("courses?view=synced")).json()).courses.map(
      (row: any) => row.id,
    ),
    ["101", "999", "102"],
  );
  assert.equal((await (await call("courses?view=preview")).json()).total, 2);
  const beforeUpdate = await prisma.canvas_course_snapshots.findFirstOrThrow();
  const beforeRows = beforeUpdate.courses as any[];
  await prisma.canvas_course_snapshots.update({
    where: { configuration_hash: beforeUpdate.configuration_hash },
    data: {
      courses: beforeRows.map((row) =>
        row.id === "101"
          ? {
              ...row,
              name: "Different saved title",
              source_observed_at: "2100-01-01T00:00:00Z",
            }
          : row,
      ),
    },
  });
  let changes = await (await call("courses?view=preview")).json();
  assert.equal(
    changes.courses.find((row: any) => row.id === "101").sync_status,
    "changes",
  );
  assert.equal(
    (
      await call(selectedPath, {
        courseIds: ["101"],
        savedRevision: changes.saved_revision,
      })
    ).status,
    409,
  );
  await prisma.canvas_course_snapshots.update({
    where: { configuration_hash: beforeUpdate.configuration_hash },
    data: {
      courses: beforeRows.map((row) =>
        row.id === "101"
          ? {
              ...row,
              name: "Different saved title",
              source_observed_at: "2000-01-01T00:00:00Z",
            }
          : row,
      ),
    },
  });
  changes = await (await call("courses?view=preview")).json();
  assert.equal(
    (
      await call(selectedPath, {
        courseIds: ["101"],
        savedRevision: changes.saved_revision,
      })
    ).status,
    200,
  );
  assert.deepEqual(
    await prisma.offerings.findUniqueOrThrow({ where: { id: imported.id } }),
    staffEdited,
    "resync must preserve every staff-owned offering field, publication, price, dates and version",
  );
  assert.equal(await prisma.canvas_offering_mappings.count(), 2);
  assert.equal(await prisma.offerings.count(), 8);
  const secondDraft = await prisma.canvas_offering_mappings.findFirstOrThrow({
    where: { course_id: "102" },
    include: { offering: true },
  });
  assert.equal(secondDraft.offering.price_cents, null);
  assert.ok(
    (await (await call("courses?view=preview")).json()).courses
      .find((row: any) => row.id === "102")
      .offering_missing_fields.includes("Price"),
  );
  console.log(
    "PASS: first sync creates incomplete unpublished drafts; repeated sync prevents duplicates; staff edits and publication survive source refresh; existing manual links block import atomically; mapped links are protected; settings save independently; required fields gate publishing and registration",
  );
  const afterUpdate = await (await call("courses?view=synced")).json();
  assert.equal(
    afterUpdate.courses.find((row: any) => row.id === "101").name,
    "Course 101",
  );
  assert.deepEqual(
    afterUpdate.courses
      .filter((row: any) => row.id !== "101")
      .map((row: any) => row.id),
    ["999", "102"],
  );
  // Restore the empty disposable fixture for the existing full-preview compatibility checks.
  await prisma.canvas_course_snapshots.deleteMany();
  console.log(
    "PASS: selected-course sync, per-course timestamps/status, idempotent retries, stale revision and invalid selections; unrelated synced courses preserved",
  );
  assert.equal(
    (await call(`sync-runs/${run.id}/save`, { previousSavedRunId: null }))
      .status,
    200,
  );
  assert.equal(
    (await call(`sync-runs/${run.id}/save`, { previousSavedRunId: null }))
      .status,
    200,
  );
  view = await (await call("courses")).json();
  assert.equal(view.source, "saved");
  assert.equal(view.preview, null);
  assert.equal(await prisma.canvas_course_snapshots.count(), 1);
  assert.ok(!JSON.stringify(view).includes("test-access-token"));
  assert.equal((await call("courses?page=0")).status, 400);
  const filtered = await (
    await call(
      "courses?title=101%20COURSE&startFrom=2026-10-01&startTo=2026-10-01&endFrom=2026-10-31&endTo=2026-10-31&status=published&pageSize=10",
    )
  ).json();
  assert.deepEqual(
    filtered.courses.map((course: any) => course.id),
    ["101"],
  );
  assert.equal(filtered.total, 1);
  assert.equal(filtered.source_total, 2);
  assert.equal(filtered.page_size, 10);
  assert.deepEqual(
    (await (await call("courses?status=concluded")).json()).courses.map(
      (course: any) => course.id,
    ),
    ["102"],
  );
  assert.equal(
    (await (await call("courses?status=unpublished")).json()).total,
    0,
  );
  for (const query of [
    "startFrom=2026-02-30",
    "endFrom=2026-10-31&endTo=2026-10-01",
    "status=invalid",
    "pageSize=500",
    "title=a&title=b",
  ])
    assert.equal((await call(`courses?${query}`)).status, 400);
  const saved = await prisma.canvas_course_snapshots.findFirstOrThrow();
  const fullList = Array.from({ length: 125 }, (_, index) => ({
    ...view.courses[0],
    id: String(index + 1000),
    name: index === 124 ? "Last page needle" : `Fixture ${index}`,
  }));
  await prisma.canvas_course_snapshots.update({
    where: { configuration_hash: saved.configuration_hash },
    data: { courses: fullList },
  });
  const lastPageMatch = await (
    await call("courses?title=needle&pageSize=25")
  ).json();
  assert.equal(lastPageMatch.total, 1);
  assert.equal(lastPageMatch.source_total, 125);
  assert.equal(lastPageMatch.courses[0].id, "1124");
  await prisma.canvas_course_snapshots.update({
    where: { configuration_hash: saved.configuration_hash },
    data: { courses: saved.courses! },
  });
  console.log(
    "PASS: full-list filtering before pagination, keyword matching, inclusive Eastern date ranges, missing dates, publish state and filter validation",
  );
  assert.equal(await prisma.offerings.count(), 8);
  console.log(
    "PASS: authorized versioned API, duplicate requests, full pagination, account boundary and read-only preview",
  );
  console.log(
    "PASS: course details stay outside the database until explicit Save preview; repeated saves are idempotent",
  );
  const second = await prisma.staff_members.create({
    data: {
      email: "second-reader@example.test",
      display_name: "Second reader",
      roles: ["catalog_manager"],
      auth_provider: config.provider,
      external_subject: "96",
    },
  });
  providerUser = 96;
  const secondSession = await login();
  assert.equal(
    (
      await call(
        selectedPath,
        { courseIds: ["101"], savedRevision: selectionRevision },
        randomUUID(),
        secondSession.token,
      )
    ).status,
    404,
  );
  providerUser = 42;
  await courses.enqueue(staff.id, randomUUID());
  const beforeSecond = reads;
  assert.equal(
    (await call("sync", {}, randomUUID(), secondSession.token)).status,
    409,
  );
  assert.equal(reads, beforeSecond);
  await courses.readPendingPreview();
  mode = "forbidden";
  const secondRun = await courses.enqueue(second.id, randomUUID());
  await courses.readPendingPreview();
  assert.equal((await courses.runStatus(secondRun.id)).status, "failed");
  assert.match(
    (await courses.runStatus(secondRun.id)).error!,
    /Your Canvas account/,
  );
  mode = "good";
  const privateRun = await courses.enqueue(staff.id, randomUUID());
  await courses.readPendingPreview();
  assert.equal(
    (
      await call(
        `sync-runs/${privateRun.id}/save`,
        { previousSavedRunId: run.id },
        randomUUID(),
        secondSession.token,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(`sync-runs/${privateRun.id}/save`, {
        previousSavedRunId: null,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(`sync-runs/${privateRun.id}/save`, {
        previousSavedRunId: run.id,
      })
    ).status,
    200,
  );
  console.log(
    "PASS: manual reads never borrow another staff member's grant; Canvas denies insufficient account permissions",
  );

  await prisma.staff_canvas_grants.update({
    where: { staff_id: staff.id },
    data: { expires_at: new Date(0) },
  });
  await Promise.all([
    courses.accessToken(staff.id),
    courses.accessToken(staff.id),
  ]);
  assert.equal(refreshes, 1);
  unauthorized = true;
  await courses.enqueue(staff.id, randomUUID());
  await courses.readPendingPreview();
  assert.equal(refreshes, 2);
  await courses.accessToken(staff.id, true);
  assert.equal(refreshes, 3);
  console.log(
    "PASS: serialized refresh, omitted refresh-token preservation, and one refresh after Canvas 401",
  );

  const preserved = (await courses.view(principal)).courses;
  for (mode of ["partial", "hostile", "empty"]) {
    await courses.enqueue(staff.id, randomUUID());
    await courses.readPendingPreview();
    const failed = await courses.view(principal);
    assert.equal(failed.latest_run!.status, "failed", mode);
    assert.deepEqual(failed.courses, preserved, mode);
    assert.ok(!JSON.stringify(failed).includes("must-not-leak"));
  }
  console.log(
    "PASS: failed later page, hostile pagination and unexpected empty scan preserve the previous snapshot and safe errors",
  );

  mode = "good";
  const recovered = await courses.enqueue(staff.id, randomUUID());
  await prisma.canvas_course_runs.update({
    where: { id: recovered.id },
    data: {
      status: "running",
      lease: "abandoned",
      lease_expires_at: new Date(0),
      attempts: 1,
    },
  });
  await courses.readPendingPreview();
  assert.equal((await courses.runStatus(recovered.id)).status, "succeeded");
  assert.equal(
    (await call("schedule", { enabled: true, intervalMinutes: 60, version: 0 }))
      .status,
    409,
  );
  // Historical enabled schedules are ignored; page requests cannot launch them.
  await prisma.canvas_course_schedule.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      enabled: true,
      owner_staff_id: staff.id,
      next_run_at: new Date(0),
    },
    update: {
      enabled: true,
      owner_staff_id: staff.id,
      next_run_at: new Date(0),
    },
  });
  const before = reads;
  await courses.readPendingPreview(staff.id);
  assert.equal(reads, before);
  assert.equal((await courses.view(principal)).schedule.enabled, false);
  assert.equal(
    await prisma.canvas_course_runs.count({ where: { trigger: "scheduled" } }),
    0,
  );
  await auth.logout(session.token);
  console.log(
    "PASS: request-driven recovery; schedules are deferred and never execute after logout",
  );

  const approver = await prisma.staff_members.findUniqueOrThrow({
    where: { email: "approver@cuce.test" },
  });
  await prisma.staff_members.update({
    where: { id: approver.id },
    data: { auth_provider: config.provider, external_subject: "84" },
  });
  providerUser = 84;
  const limited = await login();
  assert.equal(
    (await call("courses", undefined, randomUUID(), limited.token)).status,
    403,
  );
  assert.equal(
    await prisma.staff_canvas_grants.count({
      where: { staff_id: approver.id },
    }),
    0,
  );
  providerUser = 42;
  const again = await login();
  const updatedPrincipal = await auth.principal(again.token);
  await prisma.canvas_course_schedule.update({
    where: { id: "default" },
    data: { enabled: true },
  });
  mode = "revoked";
  await prisma.staff_canvas_grants.update({
    where: { staff_id: staff.id },
    data: { expires_at: new Date(0) },
  });
  await courses.enqueue(staff.id, randomUUID());
  await courses.readPendingPreview();
  assert.equal((await courses.view(updatedPrincipal)).connected, false);
  assert.equal((await courses.view(updatedPrincipal)).schedule.enabled, false);
  mode = "good";
  await login();
  const expiring = await courses.enqueue(staff.id, randomUUID());
  await courses.readPendingPreview();
  const expiringRecord = await prisma.canvas_course_runs.findUniqueOrThrow({
    where: { id: expiring.id },
  });
  const { readCoursePreview, writeCoursePreview } =
    await import("../src/server/canvas-course-previews");
  const privatePreview = await readCoursePreview(
    expiring.id,
    expiringRecord.lease!,
    staff.id,
    expiringRecord.configuration_hash,
  );
  assert.ok(privatePreview);
  assert.equal(
    await readCoursePreview(
      expiring.id,
      expiringRecord.lease!,
      second.id,
      expiringRecord.configuration_hash,
    ),
    null,
  );
  const encrypted = await readFile(
    path.join(
      previewDirectory!,
      `${expiring.id}-${expiringRecord.lease}.preview`,
    ),
  );
  assert.ok(!encrypted.toString("utf8").includes("Course 101"));
  await writeCoursePreview(
    { ...privatePreview, expiresAt: new Date(0).toISOString() },
    expiringRecord.lease!,
  );
  const savedId = (await courses.view(updatedPrincipal)).saved_run_id;
  await assert.rejects(
    courses.savePreview(updatedPrincipal, expiring.id, savedId),
    /expired/,
  );
  assert.equal((await courses.view(updatedPrincipal)).saved_run_id, savedId);
  await assert.rejects(
    courses.syncCourses(updatedPrincipal, expiring.id, ["101"], "0".repeat(64)),
    /expired/,
  );
  assert.equal((await courses.view(updatedPrincipal)).preview_expired, true);
  const normalRequest = courses.request;
  let release!: () => void;
  let started!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    started = resolve;
  });
  let blockOnce = true;
  courses.request = async (input, init) => {
    if (
      blockOnce &&
      new URL(String(input)).pathname === "/api/v1/accounts/50"
    ) {
      blockOnce = false;
      started();
      await blocked;
    }
    return normalRequest(input, init);
  };
  const interrupted = await courses.enqueue(staff.id, randomUUID());
  const lateWorker = courses.readPendingPreview();
  await reached;
  await courses.disconnect(updatedPrincipal);
  release();
  await lateWorker;
  assert.equal((await courses.runStatus(interrupted.id)).status, "failed");
  courses.request = normalRequest;
  assert.ok(await auth.principal(again.token));
  assert.equal((await courses.view(updatedPrincipal)).connected, false);
  assert.deepEqual((await courses.view(updatedPrincipal)).courses, preserved);
  console.log(
    "PASS: denied portal role, revoked authorization pauses scheduling, and disconnect preserves staff session and source history",
  );

  // Cover metadata refreshes independently from all staff-owned offering fields.
  await login();
  const { courseImage, CU_CE_IMAGE } =
    await import("../src/web/components/course-images");
  const uploadImage = {
    fileName: "portal-cover.png",
    contentType: "image/png",
    data: (
      await readFile(
        "src/web/public/brand/cedarville-continuing-education-white.png",
      )
    ).toString("base64"),
  };
  for (const mode of ["upload", "fallback"] as const) {
    const currentOffering = await prisma.offerings.findUniqueOrThrow({
      where: { id: imported.id },
    });
    await portal.changeOfferingImage(
      updatedPrincipal,
      randomUUID(),
      imported.id,
      {
        mode,
        version: currentOffering.version,
        reason: "Staff chose a portal course image",
        ...(mode === "upload" ? uploadImage : {}),
      },
    );
    const imageOwned: typeof staffEdited =
      await prisma.offerings.findUniqueOrThrow({
        where: { id: imported.id },
      });
    for (cardImage of [
      "https://images.example.test/new-cover.jpg",
      null,
      "http://unsafe.example.test/cover.jpg",
    ]) {
      const imageRun = await courses.enqueue(staff.id, randomUUID());
      await courses.readPendingPreview(staff.id);
      const imageView = await courses.view(updatedPrincipal);
      await courses.syncCourses(
        updatedPrincipal,
        imageRun.id,
        ["101"],
        imageView.saved_revision,
      );
      const expectedImage = cardImage?.startsWith("https:") ? cardImage : null;
      assert.equal(
        (await portal.detail(imported.id)).canvas_image_url,
        expectedImage,
      );
      assert.equal(
        (await portal.list({})).find((o) => o.id === imported.id)!
          .canvas_image_url,
        expectedImage,
      );
      assert.deepEqual(
        await prisma.offerings.findUniqueOrThrow({
          where: { id: imported.id },
        }),
        imageOwned,
      );
    }

    const displayed = courseImage(await portal.detail(imported.id));
    assert.equal(
      displayed,
      mode === "upload" ? `/media/${imageOwned.image_media_id}` : CU_CE_IMAGE,
    );
  }
  const overridden = await prisma.offerings.findUniqueOrThrow({
    where: { id: imported.id },
  });
  await portal.changeOfferingImage(
    updatedPrincipal,
    randomUUID(),
    imported.id,
    {
      mode: "source",
      version: overridden.version,
      reason: "Explicitly restore Canvas course image",
    },
  );
  assert.equal((await portal.detail(imported.id)).image_override, false);
  console.log(
    "PASS: uploaded portal images and explicit CU CE choice survive source replacement/removal; only explicit reset follows Canvas again",
  );
  const { safeCourseImageUrl } = await import("../src/domain/course-images");
  assert.equal(
    safeCourseImageUrl(
      "/files/12/download?verifier=public-cover",
      "https://canvas.example.test",
    ),
    "https://canvas.example.test/files/12/download?verifier=public-cover",
  );
  for (const unsafe of [
    "javascript:alert(1)",
    "data:image/svg+xml,unsafe",
    "https://user:password@example.test/x",
    "https://example.test/x?access_token=private",
    "https://example.test/x?refresh_token=private",
    "https://127.0.0.1/x",
    "https://localhost/x",
    "https://host.internal/x",
  ])
    assert.equal(safeCourseImageUrl(unsafe), null, unsafe);
  console.log(
    "PASS: Canvas card images are requested on every page, imported and refreshed independently; absent/unsafe images use no source URL; OAuth credentials never enter image URLs",
  );

  process.env.CANVAS_COURSES_INCLUDE_SUBACCOUNTS = "true";
  mode = "nested";
  const nestedClient = new CanvasCourseClient(
    "https://canvas.example.test",
    "CE-Course-Tests/1.0",
    async () => "test-access-token",
    AbortSignal.timeout(5000),
    courses.request,
  );
  assert.equal((await nestedClient.discover("50", true)).length, 2);
  assert.equal(canvasStaffConfig().scopes.length, 3);
  mode = "outside";
  await assert.rejects(nestedClient.discover("50", true));
  assert.throws(() =>
    courseConnectionConfig({
      ...process.env,
      CANVAS_COURSES_SUBACCOUNT_ID: "https://evil.test",
    }),
  );
  assert.throws(() =>
    canvasStaffConfig({
      ...process.env,
      CANVAS_TOKEN_ENCRYPTION_KEY: "invalid",
    }),
  );
  assert.throws(() =>
    canvasStaffConfig({ ...process.env, CANVAS_COURSES_ENABLED: "yes" }),
  );
  console.log("PASS: nested-account opt-in and fail-closed configuration");
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await pool?.end();
    if (previewDirectory)
      await rm(previewDirectory, { recursive: true, force: true });
    if (created) {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
        [database],
      );
      await admin.query(`DROP DATABASE ${database}`);
    }
    await admin.end();
  });
