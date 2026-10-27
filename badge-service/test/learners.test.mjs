import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { createPublicKey, verify } from "node:crypto";
import { BadgeStore, fixture } from "../core.mjs";
import { createApp } from "../server.mjs";
import { LearnerAwards } from "../learners.mjs";
const config = JSON.parse(
  readFileSync(new URL("../config.example.json", import.meta.url)),
);
function temporary(t) {
  const dir = mkdtempSync(join(tmpdir(), "cu-learner-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
async function setup(t, extra = {}) {
  const reservation = createServer();
  await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
  const port = reservation.address().port;
  await new Promise((r) => reservation.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const app = await createApp({
    directory: temporary(t),
    baseUrl: origin,
    writerToken: "writer",
    readerToken: "reader",
    ...extra,
  });
  await new Promise((r) => app.server.listen(port, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.server.close(r));
    await app.store.close();
  });
  const request = (path, body, headers = {}) =>
    fetch(origin + path, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { Origin: origin, "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  return { app, request, origin };
}
async function preview(request, learner) {
  const login = await request("/api/admin/login", { key: "writer" });
  const staff = { Cookie: login.headers.get("set-cookie").split(";")[0] };
  const response = await request(
    "/api/admin/learner-preview",
    { learner },
    staff,
  );
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Path=\/api\/me/);
  return { Cookie: cookie.split(";")[0] };
}
test("learner session owns its identity, list/download/sharing and cannot use staff actions", async (t) => {
  const { app, request } = await setup(t);
  const award = (
    await app.store.issue("demo-alex", fixture("complete"), "test")
  ).badge;
  const other = (
    await app.store.issue("demo-jordan", fixture("complete"), "test")
  ).badge;
  const original = await app.store.envelope(award.id);
  assert.equal((await request("/api/me/badges")).status, 401);
  assert.equal(
    (await request("/api/admin/learner-preview", { learner: "demo-alex" }))
      .status,
    401,
  );
  const headers = await preview(request, "demo-alex");
  const records = await (
    await request("/api/me/badges?learner=demo-jordan", null, headers)
  ).json();
  assert.equal(records.badges.length, 1);
  assert.equal(records.badges[0].id, award.id);
  assert.equal(
    (
      await request(
        `/api/me/badges/workspace/${other.id}/download`,
        null,
        headers,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/me/badges/workspace/${other.id}/sharing`,
        { shared: true, learner: "demo-jordan" },
        headers,
      )
    ).status,
    404,
  );
  assert.equal(
    (await request("/api/admin/catalog", null, headers)).status,
    401,
  );
  assert.equal(
    (await request("/api/admin/versions/approve", {}, headers)).status,
    401,
  );
  const downloaded = await (
    await request(
      `/api/me/badges/workspace/${award.id}/download`,
      null,
      headers,
    )
  ).json();
  assert.deepEqual(downloaded, original);
  const key = createPublicKey({ key: app.store.jwk, format: "jwk" });
  assert.equal(
    verify(
      null,
      Buffer.from(downloaded.payload, "base64url"),
      key,
      Buffer.from(downloaded.signature, "base64url"),
    ),
    true,
  );
  assert.equal(
    (
      await request(
        `/api/me/badges/workspace/${award.id}/sharing`,
        { shared: true },
        { ...headers, Origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  assert.equal((await request("/api/me/logout", {}, headers)).status, 200);
  assert.equal((await request("/api/me/badges", null, headers)).status, 401);
});
test("learner sharing publishes only safe fields and removal denies the link without rewriting signatures", async (t) => {
  const { app, request, origin } = await setup(t);
  const award = (
    await app.store.issue("demo-alex", fixture("complete"), "test")
  ).badge;
  const bytes = (await app.store.get(award.id)).credential;
  const headers = await preview(request, "demo-alex");
  const path = `/api/me/badges/workspace/${award.id}/sharing`,
    publicPath = `/api/public/workspace/${award.id}`;
  assert.equal((await request(publicPath)).status, 404);
  assert.equal((await request(path, { shared: "true" }, headers)).status, 400);
  const shared = await (await request(path, { shared: true }, headers)).json();
  assert.equal(shared.shared, true);
  assert.equal(
    shared.verificationUrl,
    `${origin}/verify/workspace/${award.id}`,
  );
  const publicData = await (await request(publicPath)).json();
  for (const key of [
    "learner",
    "learnerId",
    "evidence",
    "assessment",
    "history",
    "revocationReason",
  ])
    assert.equal(Object.hasOwn(publicData, key), false);
  assert.equal((await request(`/verify/workspace/${award.id}`)).status, 200);
  await request(path, { shared: true }, headers);
  assert.equal(
    (
      await app.store.db
        .prepare(
          "SELECT COUNT(*) AS n FROM audit WHERE action='sharing-enabled'",
        )
        .get()
    ).n,
    1,
  );
  await request(path, { shared: false }, headers);
  assert.equal((await request(publicPath)).status, 404);
  assert.equal((await app.store.get(award.id)).credential, bytes);
  assert.equal(
    (await app.store.get(award.id)).signature,
    (await app.store.envelope(award.id)).signature,
  );
  const audit = await app.store.db
    .prepare("SELECT actor FROM audit WHERE action='sharing-enabled'")
    .get();
  assert.equal(audit.actor, "learner:demo-alex");
});
test("portal bridge role checks ownership across historical sources and keeps original signing keys", async (t) => {
  const directory = temporary(t);
  const source = await BadgeStore.open(
    directory,
    config,
    "http://127.0.0.1:4179",
  );
  const award = (await source.issue("demo-alex", fixture("complete"), "test"))
    .badge;
  const envelope = await source.envelope(award.id);
  await source.close();
  const { app, request } = await setup(t, {
    registerSources: [
      { id: "historical", name: "Historical source", directory },
    ],
  });
  const path = `/api/learners/demo-alex/badges/historical/${award.id}`;
  const headers = { Authorization: "Bearer reader" };
  const listed = await (
    await request("/api/learners/demo-alex/badges", null, headers)
  ).json();
  assert.equal(listed.badges[0].sourceId, "historical");
  assert.deepEqual(
    await (await request(path + "/download", null, headers)).json(),
    envelope,
  );
  assert.equal(
    (
      await request(path + "/download", null, {
        Authorization: "Bearer writer",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        `/api/learners/demo-jordan/badges/historical/${award.id}/download`,
        null,
        headers,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/learners/demo-jordan/badges/historical/${award.id}/sharing`,
        { shared: true },
        headers,
      )
    ).status,
    404,
  );
  assert.equal(
    (await request(path + "/sharing", { shared: true }, headers)).status,
    200,
  );
  assert.equal(
    (await request(`/api/public/historical/${award.id}`)).status,
    200,
  );
  await request(path + "/sharing", { shared: false }, headers);
  assert.deepEqual(
    await (await request(path + "/download", null, headers)).json(),
    envelope,
  );
  assert.equal((await app.store.list("demo-alex")).length, 0);
});
test("revoked or tampered awards cannot be newly shared and unreadable sources are reported", async (t) => {
  const dir = temporary(t),
    store = await BadgeStore.open(dir, config, "http://127.0.0.1:4178");
  t.after(async () => await store.close());
  const a = (await store.issue("demo-alex", fixture("complete"), "test")).badge;
  const awards = new LearnerAwards(
    [
      { id: "workspace", directory: dir },
      { id: "missing", directory: join(temporary(t), "absent") },
    ],
    "http://127.0.0.1:4178",
  );
  await store.revoke(a.id, "Correction", "test");
  await assert.rejects(
    async () => await awards.share("workspace", a.id, "demo-alex", true),
    /active/,
  );
  const b = (await store.issue("demo-jordan", fixture("complete"), "test"))
    .badge;
  await store.db
    .prepare("UPDATE badges SET credential=? WHERE id=?")
    .run((await store.get(b.id)).credential + " ", b.id);
  await assert.rejects(
    async () => await awards.share("workspace", b.id, "demo-jordan", true),
    /valid/,
  );
  const result = await awards.list("demo-alex");
  assert.equal(result.badges.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.badges[0].status, "revoked");
});
test("learner display uses only the signed published artwork and description, without raw learning evidence", async (t) => {
  const { PublishingCatalog } = await import("../publishing.mjs");
  const { initializeDrafts, saveDraft, defaultDesign } =
    await import("../designs.mjs");
  const dir = temporary(t),
    store = await BadgeStore.open(dir, config, "http://127.0.0.1:4178");
  t.after(async () => await store.close());
  initializeDrafts(store.db);
  const catalog = new PublishingCatalog(store);
  const draft = await saveDraft(store.db, {
      ...defaultDesign,
      title: "A published achievement",
      description: "The approved achievement description.",
      criteria: "Finish module 8 and earn 80%.",
    }),
    version = await catalog.approve(draft.id, 1, "test");
  const rule = {
      canvasCourseId: 42,
      canvasAssignmentId: 77,
      requiredModuleIds: [8],
      minimumPercent: 80,
    },
    definition = {
      valid: true,
      canvasCourseId: 42,
      assignmentId: 77,
      pointsPossible: 10,
      modules: [
        {
          id: 8,
          published: true,
          requirementType: "all",
          requiredItems: [{ id: 80, type: "min_score", min_score: 8 }],
        },
      ],
    };
  const mapping = await catalog.saveMapping(
    version.id,
    rule,
    definition,
    "test",
  );
  await catalog.activate(mapping.id, definition, "test");
  const evidence = {
    source: "canvas-readback",
    observedAt: new Date().toISOString(),
    canvasCourseId: 42,
    canvasUserId: 123,
    modules: [
      {
        ...definition.modules[0],
        state: "completed",
        requiredItems: [
          { ...definition.modules[0].requiredItems[0], completed: true },
        ],
      },
    ],
    assessment: {
      assignmentId: 77,
      graded: true,
      excused: false,
      score: 9,
      pointsPossible: 10,
    },
  };
  const issued = await store.issueMapped(
    "demo-alex",
    evidence,
    "test",
    await catalog.resolve(mapping.id),
    { "demo-alex": { canvasUserId: 123 } },
  );
  await saveDraft(
    store.db,
    { ...draft.design, title: "Changed later", description: "A later draft" },
    draft.id,
    1,
  );
  const awards = new LearnerAwards(
    [{ id: "workspace", directory: dir }],
    "http://127.0.0.1:4178",
  );
  const badge = (await awards.list("demo-alex")).badges[0];
  assert.equal(badge.id, issued.badge.id);
  assert.equal(badge.title, version.design.title);
  assert.equal(badge.description, version.design.description);
  assert.equal(badge.artwork, version.artwork);
  assert.equal(badge.signatureValid, true);
  assert.equal(badge.shared, false);
  for (const field of [
    "learnerId",
    "evidence",
    "assessment",
    "score",
    "canvasUserId",
  ])
    assert.equal(Object.hasOwn(badge, field), false);
});
