import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { BadgeStore, fixture } from "../core.mjs";
import { LearnerAwards } from "../learners.mjs";
import { Certificates, defaultCertificate } from "../certificates.mjs";
import {
  CredentialDistribution,
  claimOrigin,
  normalizeClaim,
} from "../distribution.mjs";
import { PublishingCatalog } from "../publishing.mjs";
import { ManualAwards } from "../manual-awards.mjs";
import { CertificateRecipients } from "../certificate-email.mjs";
import {
  seedDistributionDemo,
  distributionSamples,
} from "../demo-distribution.mjs";
const config = JSON.parse(
  readFileSync(new URL("../config.example.json", import.meta.url)),
);
async function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), "ce-claims-")),
    store = await BadgeStore.open(directory, config, "http://127.0.0.1:4178");
  t.after(async () => {
    await store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const sources = [
      { id: "workspace", name: "Test", directory, pool: store.db.pool },
    ],
    certificates = new Certificates(
      store,
      new LearnerAwards(sources, "http://127.0.0.1:4178", store.db.pool),
      config.learners,
    );
  const contacts = new Map([
    ["demo-alex", { portalId: randomUUID(), active: true }],
    ["demo-jordan", { portalId: randomUUID(), active: true }],
  ]);
  const options = {
    store,
    certificates,
    learners: config.learners,
    sources,
    secret: "private-test-claim-key",
    origin: () => "https://portal.example.test",
    recipients: { directory: async () => ({ contacts, cohorts: [] }) },
  };
  const distribution = new CredentialDistribution(options);
  const badge = (await store.issue("demo-alex", fixture("complete"), "staff"))
    .badge;
  const template = await certificates.save(
    { name: "Test", design: defaultCertificate },
    "staff",
  );
  const certificate = await certificates.create(
    {
      sourceId: "workspace",
      badgeId: badge.id,
      templateId: template.id,
      recipientName: "Alex Morgan",
      confirmed: true,
    },
    "staff",
  );
  const create = (kind = "both", extra = {}) =>
    distribution.create(
      {
        sourceId: "workspace",
        badgeId: badge.id,
        kind,
        days: 7,
        confirmed: true,
        ...extra,
      },
      "staff",
    );
  return {
    store,
    directory,
    certificates,
    badge,
    certificate,
    distribution,
    options,
    contacts,
    create,
  };
}
test("distribution packages retain the same learner/accomplishment and QR images decode independently", async (t) => {
  const s = await setup(t),
    original = await s.store.get(s.badge.id),
    snapshot = (await s.certificates.find("workspace", s.badge.id))
      .snapshot_json;
  for (const kind of ["badge", "certificate", "both"]) {
    const row = await s.create(kind),
      detail = await s.distribution.detail(row.id);
    assert.equal(detail.kind, kind);
    assert.equal(detail.learnerId, "demo-alex");
    assert.equal(
      detail.certificateId,
      kind === "badge" ? null : s.certificate.id,
    );
    assert.match(detail.code, /^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    const image = PNG.sync.read(Buffer.from(detail.qr.split(",")[1], "base64"));
    const decoded = jsQR(
      new Uint8ClampedArray(image.data),
      image.width,
      image.height,
    );
    assert.equal(decoded.data, detail.url);
    assert.equal(new URL(detail.url).search, "");
    assert.ok(detail.url.endsWith("#" + detail.code));
  }
  assert.equal((await s.store.get(s.badge.id)).credential, original.credential);
  assert.equal((await s.store.get(s.badge.id)).signature, original.signature);
  assert.equal(
    (await s.certificates.find("workspace", s.badge.id)).snapshot_json,
    snapshot,
  );
  assert.equal(
    (await s.store.db.prepare("SELECT count(*) AS n FROM badges").get()).n,
    1,
  );
});
test("claims reject another learner and replay safely across concurrent instances without duplicate awards", async (t) => {
  const s = await setup(t),
    row = await s.create(),
    detail = await s.distribution.detail(row.id),
    restart = new CredentialDistribution(s.options);
  await assert.rejects(
    () => s.distribution.redeem({ code: detail.code }, "demo-jordan"),
    /invalid, expired, revoked, or belongs/,
  );
  const receipts = await Promise.all([
    s.distribution.redeem(
      { code: detail.code.toLowerCase().replaceAll("-", " ") },
      "demo-alex",
    ),
    restart.redeem({ code: detail.code }, "demo-alex"),
  ]);
  assert.deepEqual(receipts.map((r) => r.replayed).sort(), [false, true]);
  assert.ok(
    receipts.every(
      (r) =>
        r.badgeId === s.badge.id &&
        r.certificateId === s.certificate.id &&
        r.kind === "both",
    ),
  );
  assert.equal((await restart.detail(row.id)).state, "claimed");
  assert.equal((await restart.detail(row.id)).code, null);
  assert.equal(
    (await s.store.db.prepare("SELECT count(*) AS n FROM badges").get()).n,
    1,
  );
  assert.equal(
    (await s.store.db.prepare("SELECT count(*) AS n FROM certificates").get())
      .n,
    1,
  );
  await assert.rejects(
    () =>
      s.store.db.query(
        "UPDATE credential_claims SET learner='demo-jordan' WHERE workspace=$1",
        [s.store.db.workspace],
      ),
    /immutable/,
  );
  await assert.rejects(
    () =>
      s.store.db.query(
        "UPDATE credential_claim_events SET action='forged' WHERE workspace=$1",
        [s.store.db.workspace],
      ),
    /immutable/,
  );
});
test("duplicate create requests serialize and code material is not stored as plaintext", async (t) => {
  const s = await setup(t),
    other = new CredentialDistribution(s.options),
    [a, b] = await Promise.all([
      s.create(),
      other.create(
        {
          sourceId: "workspace",
          badgeId: s.badge.id,
          kind: "both",
          days: 7,
          confirmed: true,
        },
        "other-staff",
      ),
    ]);
  assert.equal(a.id, b.id);
  const detail = await s.distribution.detail(a.id),
    stored = await s.distribution.find(a.id);
  assert.match(stored.code_hash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(stored).includes(normalizeClaim(detail.code)));
  assert.equal((await s.distribution.history()).distributions.length, 1);
  const changedKey = new CredentialDistribution({
    ...s.options,
    secret: "a-different-private-key",
  });
  assert.equal((await changedKey.detail(a.id)).state, "unavailable");
  assert.equal((await changedKey.detail(a.id)).qr, null);
});
test("expiry, code revocation, account deactivation and award revocation prevent claims without deleting credentials", async (t) => {
  const s = await setup(t),
    a = await s.create(),
    d = await s.distribution.detail(a.id);
  s.contacts.get("demo-alex").active = false;
  await assert.rejects(
    () => s.distribution.redeem({ code: d.code }, "demo-alex"),
    /invalid/,
  );
  s.contacts.get("demo-alex").active = true;
  await s.distribution.revoke(a.id, { confirmed: true }, "staff");
  await assert.rejects(
    () => s.distribution.redeem({ code: d.code }, "demo-alex"),
    /invalid/,
  );
  assert.equal((await s.distribution.detail(a.id)).qr, null);
  const b = await s.create(),
    bd = await s.distribution.detail(b.id);
  await s.store.revoke(s.badge.id, "Fictional revocation", "staff");
  await assert.rejects(
    () => s.distribution.redeem({ code: bd.code }, "demo-alex"),
    /invalid/,
  );
  const expired = await setup(t),
    realNow = Date.now;
  let past;
  try {
    Date.now = () => realNow() - 3 * 86400000;
    past = await expired.create("badge", { days: 1 });
  } finally {
    Date.now = realNow;
  }
  assert.equal((await expired.distribution.detail(past.id)).state, "expired");
  await assert.rejects(
    () =>
      expired.distribution.redeem(
        { code: expired.distribution.code(past.id) },
        "demo-alex",
      ),
    /invalid/,
  );
  assert.equal(
    (await s.store.db.prepare("SELECT count(*) AS n FROM certificates").get())
      .n,
    1,
  );
});
test("claim attempt limits persist across instances and invalid codes disclose no award details", async (t) => {
  const s = await setup(t);
  for (let n = 0; n < 10; n++)
    await assert.rejects(
      () => s.distribution.redeem({ code: "not-a-code" }, "demo-alex"),
      (error) =>
        /invalid/.test(error.message) && !error.message.includes(s.badge.id),
    );
  const restart = new CredentialDistribution(s.options);
  await assert.rejects(
    () => restart.redeem({ code: "not-a-code" }, "demo-alex"),
    /Wait five minutes/,
  );
  assert.equal(
    (
      await s.store.db
        .prepare("SELECT count(*) AS n FROM claim_events WHERE action='denied'")
        .get()
    ).n,
    10,
  );
});
test("configuration, account linking, issued certificate existence and explicit confirmation are required", async (t) => {
  assert.equal(claimOrigin("http://public.example.test"), null);
  assert.equal(claimOrigin("https://user:pass@example.test"), null);
  assert.equal(
    claimOrigin("http://localhost:3050/path"),
    "http://localhost:3050",
  );
  assert.equal(normalizeClaim(null), null);
  const s = await setup(t);
  await assert.rejects(() => s.create("both", { confirmed: false }), /Confirm/);
  await assert.rejects(() => s.create("both", { days: 31 }), /1–30/);
  s.contacts.clear();
  await assert.rejects(() => s.create(), /Link an active/);
  const noOrigin = new CredentialDistribution({
    ...s.options,
    origin: () => null,
  });
  await assert.rejects(
    () => noOrigin.create({ confirmed: true }, "staff"),
    /Configure WEB_URL/,
  );
});
test("fictional demo records are repeatable and issue a badge plus attached certificate for each accomplishment", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ce-claims-seed-")),
    store = await BadgeStore.open(directory, config, "http://127.0.0.1:4178");
  t.after(async () => {
    await store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const sources = [
      { id: "workspace", name: "Demo", directory, pool: store.db.pool },
    ],
    certificates = new Certificates(
      store,
      new LearnerAwards(sources, "http://127.0.0.1:4178", store.db.pool),
      config.learners,
    ),
    catalog = new PublishingCatalog(store),
    manual = new ManualAwards(store, catalog, config.learners, certificates),
    linksFile = join(directory, "links.json"),
    existingId = randomUUID();
  writeFileSync(
    linksFile,
    JSON.stringify({ [existingId]: "unrelated-preserved-account" }),
  );
  const distribution = new CredentialDistribution({
    store,
    certificates,
    learners: config.learners,
    sources,
    secret: "private-seed-key",
    origin: () => "https://portal.example.test",
    recipients: new CertificateRecipients(store.db, linksFile),
  });
  const options = {
      store,
      certificates,
      catalog,
      manual,
      distribution,
      linksFile,
    },
    first = await seedDistributionDemo(options),
    second = await seedDistributionDemo(options);
  assert.deepEqual(first.awards, second.awards);
  assert.equal(first.claims.length, 3);
  assert.deepEqual(
    new Set(first.claims.map((c) => c.kind)),
    new Set(["badge", "certificate", "both"]),
  );
  assert.equal(
    JSON.parse(readFileSync(linksFile))[existingId],
    "unrelated-preserved-account",
  );
  for (const award of first.awards) {
    const row = await store.get(award.badgeId),
      certificate = await certificates.find("workspace", award.badgeId);
    assert.equal(JSON.parse(row.credential).demonstration, true);
    assert.equal(certificate.learner, row.learner);
    assert.equal(JSON.parse(certificate.snapshot_json).badgeId, row.id);
    assert.ok(
      (await certificates.download("workspace", row.id)).data.startsWith(
        "JVBER",
      ),
    );
  }
  assert.equal(
    (await store.db.prepare("SELECT count(*) AS n FROM badges").get()).n,
    2,
  );
  assert.equal(
    (await store.db.prepare("SELECT count(*) AS n FROM certificates").get()).n,
    2,
  );
  assert.equal(
    (await store.db.prepare("SELECT count(*) AS n FROM email_deliveries").get())
      .n,
    0,
  );
  assert.ok(
    first.learners.every((l) =>
      distributionSamples.some((sample) => sample.email === l.email),
    ),
  );
});
