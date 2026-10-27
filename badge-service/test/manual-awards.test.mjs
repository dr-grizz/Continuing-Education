import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { BadgeStore } from "../core.mjs";
import { initializeDrafts, saveDraft, defaultDesign } from "../designs.mjs";
import { PublishingCatalog } from "../publishing.mjs";
import { ManualAwards, parseAwardCsv, reportCsv } from "../manual-awards.mjs";
import { createApp } from "../server.mjs";
import { readRegister } from "../register.mjs";
import { LearnerAwards } from "../learners.mjs";
const config = JSON.parse(
  readFileSync(new URL("../config.example.json", import.meta.url)),
);
function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), "cu-manual-awards-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
async function setup(t) {
  const dir = temp(t),
    store = await BadgeStore.open(dir, config, "http://127.0.0.1:4178");
  t.after(async () => await store.close());
  initializeDrafts(store.db);
  const catalog = new PublishingCatalog(store),
    draft = await saveDraft(store.db, {
      ...defaultDesign,
      title: "Fictional staff award",
      criteria: "Staff verifies the required project.",
    }),
    v = await catalog.approve(draft.id, 1, "test"),
    learners = structuredClone(config.learners),
    manual = new ManualAwards(store, catalog, learners);
  return { dir, store, catalog, draft, v, learners, manual };
}
const one = (v, extra = {}) => ({
  method: "manual",
  versionId: v.id,
  learner: "demo-jordan",
  reason: "Verified required project.",
  evidenceUrl: "https://example.edu/project",
  ...extra,
});
test("CSV supports BOM, CRLF, quoted commas, escaped quotes and line breaks; rejects malformed/oversized input", async () => {
  const rows = parseAwardCsv(
    '\uFEFFlearner_id,reason,evidence_url\r\ndemo-alex,"Reviewed, including ""practice""\nwork",https://example.edu/a\r\n',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reason, 'Reviewed, including "practice"\nwork');
  for (const s of [
    "email,reason,evidence_url\na,b,c",
    'learner_id,reason,evidence_url\na,"unfinished,',
    'learner_id,reason,evidence_url\na,"ok"x,',
    "learner_id,reason,evidence_url\na,why,,extra",
    "learner_id,reason,evidence_url\n",
  ])
    await assert.rejects(async () => parseAwardCsv(s));
  await assert.rejects(
    async () => parseAwardCsv("x".repeat(1024 * 1024 + 1)),
    /1 MB/,
  );
  await assert.rejects(
    async () =>
      parseAwardCsv("learner_id,reason,evidence_url\n" + "a,b,\n".repeat(501)),
    /500/,
  );
});
test("preview is read-only; staff awards freeze signed artwork and private attestation, and appear in learner/register views", async (t) => {
  const { dir, store, manual, v, draft } = await setup(t);
  const p = await manual.preview(one(v), "wp:5");
  assert.equal((await store.list("demo-jordan")).length, 0);
  assert.equal(p.counts.ready, 1);
  await assert.rejects(
    async () => await manual.commit(p.id, "wp:5", false),
    /Confirm/,
  );
  const result = await manual.commit(p.id, "wp:5", true),
    row = await store.get(result.rows[0].badgeId);
  assert.equal(result.counts.issued, 1);
  assert.equal(row.shared, 0);
  assert.equal(store.summary(row).signatureValid, true);
  assert.equal(row.course_mapping_id, null);
  const credential = JSON.parse(row.credential),
    evidence = JSON.parse(row.evidence);
  assert.equal(credential.achievement.image, v.artwork);
  assert.equal(credential.achievement.criteria, draft.design.criteria);
  assert.equal(credential.issuance.method, "staff-manual");
  assert.equal(credential.demonstration, true);
  assert.equal(credential.actor, undefined);
  assert.equal(credential.reason, undefined);
  assert.equal(evidence.source, "manual-attestation");
  assert.equal(evidence.actor, "wp:5");
  assert.equal(evidence.reason, "Verified required project.");
  assert.equal(evidence.canvasUserId, undefined);
  const sources = [{ id: "workspace", name: "Test", directory: dir }],
    learner = new LearnerAwards(sources, "http://127.0.0.1:4178");
  assert.equal((await learner.list("demo-jordan")).badges.length, 1);
  assert.equal((await learner.list("demo-alex")).badges.length, 0);
  assert.equal(await learner.public("workspace", row.id), null);
  const reg = (await readRegister(sources)).records[0];
  assert.equal(reg.evidence.batchId, p.id);
  assert.equal(reg.evidence.actor, "wp:5");
  assert.deepEqual(await manual.commit(p.id, "wp:5", true), result);
  assert.equal((await store.list("demo-jordan")).length, 1);
});
test("CSV reports row errors, file duplicates and existing awards; only ready rows issue", async (t) => {
  const { store, manual, v } = await setup(t);
  await manual.commit((await manual.preview(one(v), "wp:1")).id, "wp:1", true);
  const csv =
    "learner_id,reason,evidence_url\ndemo-alex,Reviewed,\ndemo-alex,Again,\ndemo-jordan,Reviewed,\nunknown,Reviewed,\ndemo-jordan,,\ndemo-alex,Reviewed,http://unsafe.example\ndemo-jordan,Reason\n";
  const p = await manual.preview(
    { method: "csv", versionId: v.id, csv },
    "wp:1",
  );
  assert.deepEqual(p.counts, {
    ready: 1,
    error: 4,
    duplicate: 1,
    existing: 1,
    issued: 0,
  });
  const done = await manual.commit(p.id, "wp:1", true);
  assert.equal(done.counts.issued, 1);
  assert.equal((await store.list("demo-alex")).length, 1);
  assert.equal(
    JSON.parse((await store.list("demo-alex"))[0].credential).issuance.method,
    "staff-csv",
  );
  assert.equal((await store.list("demo-jordan")).length, 1);
  assert.match(
    reportCsv({
      ...done,
      rows: [
        {
          row: 2,
          learner: "=HYPERLINK(1)",
          status: "error",
          message: "@untrusted",
        },
      ],
    }),
    /"'=HYPERLINK/,
  );
});
test("competing previews and new design revisions never duplicate an achievement; revoked awards are retained", async (t) => {
  const { store, manual, catalog, v, draft } = await setup(t);
  const a = await manual.preview(one(v), "wp:1"),
    b = await manual.preview(one(v), "wp:2");
  const issued = await manual.commit(a.id, "wp:1", true);
  const other = await manual.commit(b.id, "wp:2", true);
  assert.equal(other.counts.existing, 1);
  assert.equal(other.rows[0].badgeId, issued.rows[0].badgeId);
  await store.revoke(issued.rows[0].badgeId, "Test revocation", "test");
  await saveDraft(
    store.db,
    { ...draft.design, title: "Updated design" },
    draft.id,
    1,
  );
  const v2 = await catalog.approve(draft.id, 2, "test");
  const duplicate = await manual.preview(one(v2), "wp:1");
  assert.equal(duplicate.counts.existing, 1);
  assert.match(duplicate.rows[0].message, /revoked/);
  assert.equal((await store.list("demo-jordan")).length, 1);
});
test("archived badge, changed identity, expired preview and cross-staff access cannot issue", async (t) => {
  const { store, manual, catalog, v, learners } = await setup(t);
  const a = await manual.preview(one(v), "wp:1");
  await assert.rejects(
    async () => await manual.get(a.id, "wp:2"),
    /staff account/,
  );
  await assert.rejects(
    async () => await manual.commit(a.id, "wp:2", true),
    /staff account/,
  );
  learners["demo-jordan"].canvasUserId = 99;
  await assert.rejects(
    async () => await manual.commit(a.id, "wp:1", true),
    /mapping changed/,
  );
  learners["demo-jordan"].canvasUserId = null;
  await store.db
    .prepare("UPDATE award_batches SET expires_at=? WHERE id=?")
    .run("2000-01-01T00:00:00Z", a.id);
  await assert.rejects(
    async () => await manual.commit(a.id, "wp:1", true),
    /expired/,
  );
  const b = await manual.preview(one(v), "wp:1");
  await catalog.archive(v.id, "test");
  await assert.rejects(
    async () => await manual.commit(b.id, "wp:1", true),
    /non-archived/,
  );
  assert.equal((await store.list("demo-jordan")).length, 0);
});
test("batch insertion failure rolls back all badges and results; retry is safe", async (t) => {
  const { store, manual, v } = await setup(t);
  const p = await manual.preview(
    {
      method: "csv",
      versionId: v.id,
      csv: "learner_id,reason,evidence_url\ndemo-alex,Reason,\ndemo-jordan,Reason,\n",
    },
    "wp:1",
  );
  await store.db.query(
    `CREATE OR REPLACE FUNCTION fail_second() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.workspace='${store.db.workspace}' AND NEW.learner='demo-jordan' THEN RAISE EXCEPTION 'simulated write failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_second BEFORE INSERT ON credential_badges FOR EACH ROW EXECUTE FUNCTION fail_second()`,
  );
  await assert.rejects(
    async () => await manual.commit(p.id, "wp:1", true),
    /simulated/,
  );
  assert.equal((await store.list("demo-alex")).length, 0);
  assert.equal((await manual.get(p.id, "wp:1")).state, "preview");
  await store.db.query(
    "DROP TRIGGER fail_second ON credential_badges; DROP FUNCTION fail_second()",
  );
  assert.equal((await manual.commit(p.id, "wp:1", true)).counts.issued, 2);
});
test("manual attestation does not bypass Canvas checks and avoids later Canvas duplicate", async (t) => {
  const { store, manual, catalog, v, learners } = await setup(t);
  learners["demo-jordan"].canvasUserId = 123;
  learners["demo-jordan"].demonstration = false;
  const p = await manual.preview(one(v), "wp:1");
  const result = await manual.commit(p.id, "wp:1", true);
  assert.equal(
    JSON.parse((await store.get(result.rows[0].badgeId)).credential)
      .demonstration,
    false,
  );
  const rule = {
      canvasCourseId: 42,
      canvasAssignmentId: 77,
      requiredModuleIds: [8],
      minimumPercent: 80,
    },
    verification = {
      valid: true,
      checkedAt: new Date().toISOString(),
      canvasCourseId: 42,
      courseName: "A course",
      assignmentId: 77,
      assignmentName: "Final",
      pointsPossible: 10,
      modules: [
        {
          id: 8,
          name: "Required module",
          published: true,
          requirementType: "all",
          requiredItems: [
            { id: 80, type: "min_score", min_score: 8, contentId: 77 },
          ],
        },
      ],
    };
  const mapping = await catalog.saveMapping(v.id, rule, verification, "test");
  await catalog.activate(mapping.id, verification, "test");
  const selected = await catalog.resolve(mapping.id);
  const e = {
    source: "canvas-readback",
    canvasUserId: 123,
    modules: [
      {
        ...verification.modules[0],
        state: "completed",
        requiredItems: [
          { ...verification.modules[0].requiredItems[0], completed: true },
        ],
      },
    ],
    assessment: { graded: true, excused: false, score: 7, pointsPossible: 10 },
  };
  assert.equal(
    (await store.issueMapped("demo-jordan", e, "test", selected, learners))
      .eligible,
    false,
  );
  e.assessment.score = 9;
  const duplicate = await store.issueMapped(
    "demo-jordan",
    e,
    "test",
    selected,
    learners,
  );
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.badge.id, result.rows[0].badgeId);
});
test("HTTP staff award scope is separate from reader/writer scope, rejects spoofed actor and enforces CSRF/ownership", async (t) => {
  const reservation = createServer();
  await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
  const port = reservation.address().port;
  await new Promise((r) => reservation.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const app = await createApp({
    directory: temp(t),
    baseUrl: origin,
    writerToken: "writer",
    readerToken: "reader",
    awardToken: "award",
  });
  await new Promise((r) => app.server.listen(port, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.server.close(r));
    await app.store.close();
  });
  const draft = await saveDraft(app.store.db, {
      ...defaultDesign,
      criteria: "Verified project.",
    }),
    v = await app.catalog.approve(draft.id, 1, "test");
  const headers = { Authorization: "Bearer award", "X-CU-Staff-Id": "wp:5" };
  const post = (path, body, h = headers) =>
    fetch(origin + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...h },
      body: JSON.stringify(body),
    });
  const path = "/api/portal-staff/awards";
  for (const token of ["reader", "writer"])
    assert.equal(
      (
        await fetch(origin + path + "/catalog", {
          headers: {
            Authorization: "Bearer " + token,
            "X-CU-Staff-Id": "wp:5",
          },
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await fetch(origin + path + "/catalog", {
        headers: { Authorization: "Bearer award" },
      })
    ).status,
    400,
  );
  assert.equal(
    (await post("/api/admin/versions/approve", {}, headers)).status,
    403,
  );
  const preview = await (
    await post(path + "/preview", {
      ...one(v),
      actor: "wp:999",
      confirmed: true,
    })
  ).json();
  assert.equal(preview.actor, "wp:5");
  assert.equal((await app.store.list("demo-jordan")).length, 0);
  const wrong = { ...headers, "X-CU-Staff-Id": "wp:6" };
  assert.equal(
    (
      await post(
        path + "/" + preview.id + "/commit",
        { confirmed: true },
        wrong,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        path + "/" + preview.id + "/commit",
        { confirmed: true, learner: "demo-alex", reason: "spoof" },
        headers,
      )
    ).status,
    200,
  );
  assert.equal((await app.store.list("demo-alex")).length, 0);
  assert.equal((await app.store.list("demo-jordan")).length, 1);
  const login = await post(
    "/api/admin/login",
    { key: "writer" },
    { Origin: origin },
  );
  const cookie = { Cookie: login.headers.get("set-cookie").split(";")[0] };
  assert.equal(
    (await post("/api/admin/awards/preview", one(v), cookie)).status,
    403,
  );
  assert.equal(
    (
      await post("/api/admin/awards/preview", one(v), {
        ...cookie,
        Origin: origin,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(origin + path + "/" + preview.id + "/report.csv", { headers })
    ).headers.get("content-type"),
    "text/csv; charset=utf-8",
  );
});
test("manual-only real learners do not require a Canvas identity or receive a fictional label", async (t) => {
  const { store, manual, v, learners } = await setup(t);
  learners["manual-only"] = {
    canvasUserId: null,
    displayName: "Approved portal learner",
    demonstration: false,
  };
  const p = await manual.preview(one(v, { learner: "manual-only" }), "wp:1");
  assert.equal(p.counts.ready, 1);
  const done = await manual.commit(p.id, "wp:1", true);
  assert.equal(
    JSON.parse((await store.get(done.rows[0].badgeId)).credential)
      .demonstration,
    false,
  );
  assert.equal(
    (
      await (
        await manual.catalogView()
      ).learners.find((l) => l.id === "manual-only")
    ).demonstration,
    false,
  );
});
test("saved preview and committed results survive a service/store restart", async (t) => {
  const directory = temp(t);
  let store = await BadgeStore.open(directory, config, "http://127.0.0.1:4178");
  t.after(async () => await store.close());
  initializeDrafts(store.db);
  let catalog = new PublishingCatalog(store);
  const draft = await saveDraft(store.db, {
      ...defaultDesign,
      criteria: "Reviewed project.",
    }),
    v = await catalog.approve(draft.id, 1, "test");
  let manual = new ManualAwards(store, catalog, config.learners);
  const p = await manual.preview(one(v), "wp:1");
  await store.close();
  store = await BadgeStore.open(directory, config, "http://127.0.0.1:4178");
  catalog = new PublishingCatalog(store);
  manual = new ManualAwards(store, catalog, config.learners);
  assert.equal((await manual.get(p.id, "wp:1")).counts.ready, 1);
  const done = await manual.commit(p.id, "wp:1", true);
  await store.close();
  store = await BadgeStore.open(directory, config, "http://127.0.0.1:4178");
  catalog = new PublishingCatalog(store);
  manual = new ManualAwards(store, catalog, config.learners);
  assert.deepEqual(await manual.commit(p.id, "wp:1", true), done);
  assert.equal((await store.list("demo-jordan")).length, 1);
});
