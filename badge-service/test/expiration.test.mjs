import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { BadgeStore, fixture } from "../core.mjs";
import { defaultDesign, saveDraft, validateDesign } from "../designs.mjs";
import {
  Certificates,
  defaultCertificate,
  validateCertificateDesign,
} from "../certificates.mjs";
import { LearnerAwards } from "../learners.mjs";
import { PublishingCatalog } from "../publishing.mjs";
import { ManualAwards } from "../manual-awards.mjs";
import { readRegister } from "../register.mjs";
import { CredentialDistribution } from "../distribution.mjs";
import { CertificateEmail, emailDefaults } from "../certificate-email.mjs";
import {
  expirationDate,
  expirationFields,
  isExpired,
  credentialStatus,
} from "../expiration.mjs";
const config = JSON.parse(
  readFileSync(new URL("../config.example.json", import.meta.url)),
);
const date = "2099-06-30";
async function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), "ce-expiration-"));
  const store = await BadgeStore.open(
    directory,
    structuredClone(config),
    "http://127.0.0.1:4178",
  );
  t.after(async () => {
    await store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const sources = [
    { id: "workspace", name: "Test", directory, pool: store.db.pool },
  ];
  const awards = new LearnerAwards(
    sources,
    "http://127.0.0.1:4178",
    store.db.pool,
  );
  const certificates = new Certificates(store, awards, config.learners);
  const catalog = new PublishingCatalog(store);
  const manual = new ManualAwards(
    store,
    catalog,
    config.learners,
    certificates,
  );
  const contacts = new Map([
    [
      "demo-alex",
      {
        active: true,
        portalId: "10000000-0000-4000-8000-000000000001",
        address: "alex@example.test",
      },
    ],
  ]);
  const directorySource = {
    directory: async () => ({ contacts, cohorts: [] }),
  };
  const distribution = new CredentialDistribution({
    store,
    certificates,
    learners: config.learners,
    sources,
    recipients: directorySource,
    secret: "test-only",
    origin: () => "https://portal.example.test",
  });
  const calls = [];
  const email = new CertificateEmail({
    store,
    certificates,
    secret: "test-only",
    directory: directorySource,
    configuration: () => ({
      sender: "continuinged@cedarville.edu",
      ready: true,
      origin: "https://portal.example.test",
      allowDemo: true,
      provider: "resend",
    }),
    transport: async (...args) => {
      calls.push(args);
      return "provider-test";
    },
  });
  async function pair(badgeExpiry = date, certificateExpiry = "2099-07-31") {
    const draft = await saveDraft(store.db, {
      ...defaultDesign,
      expirationDate: badgeExpiry,
    });
    const version = await catalog.approve(draft.id, 1, "staff");
    const template = await certificates.save(
      {
        name: "Expiry test",
        design: { ...defaultCertificate, expirationDate: certificateExpiry },
      },
      "staff",
    );
    const preview = await manual.preview(
      {
        method: "manual",
        versionId: version.id,
        learner: "demo-alex",
        reason: "Staff verified the accomplishment.",
        certificateTemplateId: template.id,
        recipientName: "Alex Morgan",
      },
      "staff",
    );
    await manual.preflight(preview.id, "staff");
    const result = await manual.commit(preview.id, "staff", true);
    const badgeId = result.rows[0].badgeId;
    return {
      draft,
      version,
      template,
      preview,
      badgeId,
      row: await store.get(badgeId),
      certificate: await certificates.find("workspace", badgeId),
    };
  }
  return {
    directory,
    store,
    sources,
    awards,
    certificates,
    catalog,
    manual,
    distribution,
    email,
    calls,
    pair,
  };
}

test("expiration accepts blank or a real calendar date and has a precise UTC day boundary", () => {
  for (const blank of [undefined, null, ""]) {
    assert.equal(expirationDate(blank), null);
    assert.deepEqual(expirationFields(blank), {});
  }
  assert.equal(expirationDate("2028-02-29"), "2028-02-29");
  for (const bad of [
    "2027-02-29",
    "2026-02-30",
    "2099-13-01",
    "0000-01-01",
    "2099-1-1",
    "2099-01-01T12:00:00Z",
    [],
    {},
    123,
    " ",
  ]) {
    assert.throws(() => expirationDate(bad), /valid expiration date/);
    assert.throws(
      () => validateDesign({ ...defaultDesign, expirationDate: bad }),
      /valid expiration date/,
    );
    assert.throws(
      () =>
        validateCertificateDesign({
          ...defaultCertificate,
          expirationDate: bad,
        }),
      /valid expiration date/,
    );
  }
  const fields = expirationFields(date),
    end = Date.parse(fields.validUntil);
  assert.equal(fields.validUntil, "2099-06-30T23:59:59.999Z");
  assert.equal(isExpired(fields, end), false);
  assert.equal(isExpired(fields, end + 1), true);
  assert.equal(isExpired({}, end + 1), false);
  assert.equal(
    credentialStatus({ credential: JSON.stringify(fields) }, end + 1),
    "expired",
  );
  assert.equal(
    credentialStatus(
      { credential: JSON.stringify(fields), revoked_at: date },
      end + 1,
    ),
    "revoked",
  );
});

test("manual paired awards freeze independent expiration dates; revisions preserve signed bytes and historical downloads", async (t) => {
  const s = await setup(t),
    p = await s.pair();
  const badgeBytes = p.row.credential,
    certificateBytes = p.certificate.snapshot_json;
  assert.equal(JSON.parse(badgeBytes).validUntil, date + "T23:59:59.999Z");
  assert.equal(JSON.parse(certificateBytes).expirationDate, "2099-07-31");
  assert.equal(s.awards.summary("workspace", p.row).expirationDate, date);
  const changed = await saveDraft(
    s.store.db,
    { ...p.draft.design, expirationDate: "2100-01-01" },
    p.draft.id,
    1,
  );
  assert.equal(changed.design.expirationDate, "2100-01-01");
  await s.certificates.save(
    {
      id: p.template.id,
      revision: 1,
      name: "Revised",
      design: { ...p.template.design, expirationDate: "2100-12-31" },
    },
    "staff",
  );
  assert.equal((await s.store.get(p.badgeId)).credential, badgeBytes);
  assert.equal(
    (await s.certificates.find("workspace", p.badgeId)).snapshot_json,
    certificateBytes,
  );
  await s.awards.share("workspace", p.badgeId, "demo-alex", true);
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2099-07-01T00:00:00Z"),
  });
  assert.equal(s.store.summary(p.row).status, "expired");
  assert.equal(s.store.summary(p.row).signatureValid, true);
  assert.equal(
    (await s.awards.public("workspace", p.badgeId)).status,
    "expired",
  );
  assert.equal((await s.awards.list("demo-alex")).badges[0].status, "expired");
  assert.equal((await readRegister(s.sources)).records[0].status, "expired");
  assert.equal(s.certificates.summary(p.certificate).status, "issued");
  await s.awards.share("workspace", p.badgeId, "demo-alex", false);
  await assert.rejects(
    () => s.awards.share("workspace", p.badgeId, "demo-alex", true),
    /valid, active/,
  );
  const downloaded = await s.certificates.download(
    "workspace",
    p.badgeId,
    "demo-alex",
  );
  assert.equal(
    Buffer.from(downloaded.data, "base64").subarray(0, 5).toString(),
    "%PDF-",
  );
  assert.equal(
    (await s.manual.commit(p.preview.id, "staff", true)).rows[0].badgeId,
    p.badgeId,
  );
  t.mock.timers.setTime(new Date("2099-08-01T00:00:00Z").getTime());
  assert.equal(s.certificates.summary(p.certificate).status, "expired");
  s.certificates.verify(p.certificate); // Signature integrity is independent of current validity.
  assert.throws(() => s.certificates.verify(p.certificate, true), /expired/);
  assert.equal((await s.store.get(p.badgeId)).credential, badgeBytes);
  assert.equal(
    (await s.certificates.find("workspace", p.badgeId)).snapshot_json,
    certificateBytes,
  );
});

test("certificate PDF prints the frozen expiration and legacy certificates remain undated", async (t) => {
  const s = await setup(t),
    p = await s.pair(null, date);
  const download = await s.certificates.download(
    "workspace",
    p.badgeId,
    "demo-alex",
  );
  const file = join(s.directory, "expiry.pdf");
  writeFileSync(file, Buffer.from(download.data, "base64"));
  const python =
    process.env.CERTIFICATE_PYTHON ||
    join(
      homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3",
    );
  const inspected = spawnSync(
    python,
    [
      "-c",
      "import sys;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);assert len(r.pages)==1;print(r.pages[0].extract_text())",
      file,
    ],
    { encoding: "utf8" },
  );
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.match(inspected.stdout, /Valid through 2099-06-30 \(UTC\)/);
  assert.equal(s.store.summary(p.row).expirationDate, null);
  const legacy = await s.store.issue(
    "demo-jordan",
    fixture("complete"),
    "staff",
  );
  assert.equal(legacy.badge.validUntil, null);
  const template = await s.certificates.save(
    { name: "No expiry", design: defaultCertificate },
    "staff",
  );
  const legacyCertificate = await s.certificates.create(
    {
      sourceId: "workspace",
      badgeId: legacy.badge.id,
      templateId: template.id,
      recipientName: "Jordan Morgan",
      confirmed: true,
    },
    "staff",
  );
  assert.equal(legacyCertificate.expirationDate, null);
  assert.equal(legacyCertificate.status, "issued");
  assert.equal(
    Object.hasOwn(
      JSON.parse(
        (await s.certificates.find("workspace", legacy.badge.id)).snapshot_json,
      ),
      "validUntil",
    ),
    false,
  );
});

test("certificate-only expiration blocks pending email confirmation and claim redemption without expiring its badge", async (t) => {
  const s = await setup(t),
    p = await s.pair(null, date);
  t.mock.timers.enable({ apis: ["Date"], now: new Date(date + "T23:59:50Z") });
  const email = await s.email.preview(
    { ...emailDefaults, certificateIds: [p.certificate.id] },
    "staff",
  );
  const claimBody = {
    sourceId: "workspace",
    badgeId: p.badgeId,
    kind: "both",
    days: 7,
    confirmed: true,
  };
  const claim = await s.distribution.create(claimBody, "staff");
  const claimRow = await s.store.db
    .prepare("SELECT * FROM claims WHERE id=?")
    .get(claim.id);
  t.mock.timers.setTime(new Date("2099-07-01T00:00:01Z").getTime());
  assert.equal(s.awards.summary("workspace", p.row).status, "issued");
  await assert.rejects(
    () => s.email.confirm({ batchId: email.batchId, confirmed: true }, "staff"),
    /certificate has expired/,
  );
  await assert.rejects(
    () =>
      s.email.preview(
        { ...emailDefaults, certificateIds: [p.certificate.id] },
        "staff",
      ),
    /certificate has expired/,
  );
  await assert.rejects(
    () => s.distribution.valid(claimRow),
    /certificate has expired/,
  );
  await assert.rejects(
    () => s.distribution.create(claimBody, "staff"),
    /certificate has expired/,
  );
  assert.equal(s.calls.length, 0);
  const badgeOnly = await s.distribution.create(
    { ...claimBody, kind: "badge" },
    "staff",
  );
  assert.equal(badgeOnly.kind, "badge");
  await s.certificates.download("workspace", p.badgeId, "demo-alex");
});

test("badge expiration blocks new issuance, new certificates, claims and email, including a preview crossing midnight", async (t) => {
  const s = await setup(t),
    p = await s.pair(date, null);
  t.mock.timers.enable({ apis: ["Date"], now: new Date(date + "T23:59:50Z") });
  const preview = await s.manual.preview(
    {
      method: "manual",
      versionId: p.version.id,
      learner: "demo-jordan",
      reason: "Staff verified this project.",
    },
    "staff",
  );
  const claimBody = {
    sourceId: "workspace",
    badgeId: p.badgeId,
    kind: "badge",
    days: 7,
    confirmed: true,
  };
  const claim = await s.distribution.create(claimBody, "staff");
  const claimRow = await s.store.db
    .prepare("SELECT * FROM claims WHERE id=?")
    .get(claim.id);
  t.mock.timers.setTime(new Date("2099-07-01T00:00:01Z").getTime());
  await assert.rejects(
    () => s.manual.commit(preview.id, "staff", true),
    /expiration date has passed/,
  );
  await assert.rejects(
    () =>
      s.manual.preview(
        {
          method: "manual",
          versionId: p.version.id,
          learner: "demo-jordan",
          reason: "Verified",
        },
        "staff",
      ),
    /expiration date has passed/,
  );
  await assert.rejects(
    () =>
      s.certificates.create(
        {
          sourceId: "workspace",
          badgeId: p.badgeId,
          templateId: p.template.id,
          recipientName: "Alex Morgan",
          confirmed: true,
        },
        "staff",
      ),
    /valid, active award/,
  );
  await assert.rejects(
    () => s.distribution.valid(claimRow),
    /valid, active award/,
  );
  await assert.rejects(
    () => s.distribution.create(claimBody, "staff"),
    /valid, active award/,
  );
  await assert.rejects(
    () =>
      s.email.preview(
        { ...emailDefaults, certificateIds: [p.certificate.id] },
        "staff",
      ),
    /valid, active award/,
  );
  assert.equal((await s.store.list("demo-jordan")).length, 0);
  assert.equal(s.certificates.summary(p.certificate).status, "issued");
});

test("past certificate dates and badge approval are rejected without partial awards", async (t) => {
  const s = await setup(t);
  const draft = await saveDraft(s.store.db, {
    ...defaultDesign,
    expirationDate: "2000-01-01",
  });
  await assert.rejects(
    () => s.catalog.approve(draft.id, 1, "staff"),
    /expiration date has passed/,
  );
  const current = await saveDraft(s.store.db, defaultDesign),
    v = await s.catalog.approve(current.id, 1, "staff");
  const template = await s.certificates.save(
    {
      name: "Past",
      design: { ...defaultCertificate, expirationDate: "2000-01-01" },
    },
    "staff",
  );
  const preview = await s.manual.preview(
    {
      method: "manual",
      versionId: v.id,
      learner: "demo-alex",
      reason: "Verified project.",
      certificateTemplateId: template.id,
      recipientName: "Alex Morgan",
    },
    "staff",
  );
  await assert.rejects(
    () => s.manual.preflight(preview.id, "staff"),
    /expiration date has passed/,
  );
  await assert.rejects(
    () => s.manual.commit(preview.id, "staff", true),
    /expiration date has passed/,
  );
  assert.equal((await s.store.list("demo-alex")).length, 0);
});

test("Canvas-mapped issuance freezes expiration and rejects an expired version for another learner", async (t) => {
  const s = await setup(t);
  const draft = await saveDraft(s.store.db, {
    ...defaultDesign,
    expirationDate: date,
  });
  const version = await s.catalog.approve(draft.id, 1, "staff");
  const rule = {
    canvasCourseId: 42,
    canvasAssignmentId: 77,
    requiredModuleIds: [8],
    minimumPercent: 80,
  };
  const verification = {
    valid: true,
    checkedAt: new Date().toISOString(),
    canvasCourseId: 42,
    courseName: "Course",
    assignmentId: 77,
    assignmentName: "Final",
    pointsPossible: 10,
    modules: [
      {
        id: 8,
        name: "Module",
        published: true,
        requirementType: "all",
        requiredItems: [
          { id: 80, type: "min_score", min_score: 8, contentId: 77 },
        ],
      },
    ],
  };
  const evidence = {
    source: "canvas-readback",
    observedAt: new Date().toISOString(),
    canvasCourseId: 42,
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
    assessment: {
      assignmentId: 77,
      graded: true,
      excused: false,
      score: 9,
      pointsPossible: 10,
    },
  };
  const mapping = await s.catalog.saveMapping(
    version.id,
    rule,
    verification,
    "staff",
  );
  await s.catalog.activate(mapping.id, verification, "staff");
  const resolved = await s.catalog.resolve(mapping.id);
  const learners = { a: { canvasUserId: 123 }, b: { canvasUserId: 456 } };
  const issued = await s.store.issueMapped(
    "a",
    evidence,
    "staff",
    resolved,
    learners,
  );
  assert.equal(issued.badge.expirationDate, date);
  const bytes = (await s.store.get(issued.badge.id)).credential;
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2099-07-01T00:00:01Z"),
  });
  await assert.rejects(
    () =>
      s.store.issueMapped(
        "b",
        { ...evidence, canvasUserId: 456 },
        "staff",
        resolved,
        learners,
      ),
    /expiration date has passed/,
  );
  const retry = await s.store.issueMapped(
    "a",
    evidence,
    "staff",
    resolved,
    learners,
  );
  assert.equal(retry.duplicate, true);
  assert.equal(retry.badge.status, "expired");
  assert.equal((await s.store.get(issued.badge.id)).credential, bytes);
});

test("email worker and previously accepted email links recheck credential expiration", async (t) => {
  const s = await setup(t),
    p = await s.pair(null, date);
  t.mock.timers.enable({ apis: ["Date"], now: new Date(date + "T23:59:50Z") });
  const preview = await s.email.preview(
    { ...emailDefaults, mode: "link", certificateIds: [p.certificate.id] },
    "staff",
  );
  await s.email.confirm({ batchId: preview.batchId, confirmed: true }, "staff");
  await s.email.processOne();
  assert.equal(s.calls.length, 1);
  const history = await s.email.history();
  const accepted = history.deliveries.find(
    (r) => r.id === preview.emails[0].id,
  );
  assert.equal(accepted.state, "accepted");
  const token = s.email.token(accepted.id);
  await s.email.download(token);
  const queued = await s.email.preview(
    {
      ...emailDefaults,
      mode: "attachment",
      certificateIds: [p.certificate.id],
      resendOf: accepted.id,
      resendReason: "Reviewed a requested second copy.",
    },
    "staff",
  );
  await s.email.confirm({ batchId: queued.batchId, confirmed: true }, "staff");
  t.mock.timers.setTime(new Date("2099-07-01T00:00:01Z").getTime());
  await s.email.processOne();
  assert.equal(s.calls.length, 1);
  const after = await s.email.history();
  assert.equal(
    after.deliveries.find((r) => r.id === queued.emails[0].id).state,
    "failed",
  );
  await assert.rejects(
    () => s.email.download(token),
    /certificate has expired/,
  );
});

test("expiration dates persist through authenticated HTTP routes and invalid dates have actionable errors", async (t) => {
  const { createApp } = await import("../server.mjs");
  const { createServer } = await import("node:net");
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = "http://127.0.0.1:" + port;
  const directory = mkdtempSync(join(tmpdir(), "ce-expiration-http-"));
  const app = await createApp({
    directory,
    baseUrl: origin,
    writerToken: "writer",
    readerToken: "reader",
    awardToken: "award",
  });
  await new Promise((resolve) => app.server.listen(port, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    await app.store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const post = (path, body, token = "award") =>
    fetch(origin + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        "X-CU-Staff-Id": "portal:10000000-0000-4000-8000-000000000001",
      },
      body: JSON.stringify(body),
    });
  const bad = await post(
    "/api/portal-admin/designer/drafts",
    { design: { ...defaultDesign, expirationDate: "2099-02-30" } },
    "award",
  );
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /valid expiration date/);
  const good = await post(
    "/api/portal-admin/designer/drafts",
    { design: { ...defaultDesign, expirationDate: date } },
    "award",
  );
  assert.equal(good.status, 201);
  const draft = await good.json();
  assert.equal(draft.design.expirationDate, date);
  assert.equal(
    (
      await post(
        "/api/portal-staff/certificates/templates",
        {
          name: "Expiry",
          design: { ...defaultCertificate, expirationDate: date },
        },
        "reader",
      )
    ).status,
    401,
  );
  const template = await post("/api/portal-staff/certificates/templates", {
    name: "Expiry",
    design: { ...defaultCertificate, expirationDate: date },
  });
  assert.equal(template.status, 200);
  assert.equal((await template.json()).design.expirationDate, date);
});
