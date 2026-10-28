import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { BadgeStore, fixture } from "../core.mjs";
import { LearnerAwards } from "../learners.mjs";
import { Certificates, defaultCertificate } from "../certificates.mjs";
import {
  CertificateEmail,
  CertificateRecipients,
  emailConfiguration,
  emailDefaults,
  sendWithResend,
} from "../certificate-email.mjs";

const config = JSON.parse(
  readFileSync(new URL("../config.example.json", import.meta.url)),
);
async function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), "ce-email-"));
  const store = await BadgeStore.open(
    directory,
    config,
    "http://127.0.0.1:4178",
  );
  t.after(async () => {
    await store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const awards = new LearnerAwards(
      [{ id: "workspace", name: "Test", directory }],
      "http://127.0.0.1:4178",
    ),
    certificates = new Certificates(store, awards, config.learners);
  let contacts = new Map([
    [
      "demo-alex",
      { portalId: randomUUID(), address: "alex@example.test", active: true },
    ],
    [
      "demo-jordan",
      { portalId: randomUUID(), address: "jordan@example.test", active: true },
    ],
  ]);
  let ready = true,
    allowDemo = true,
    mode = "accepted",
    calls = [];
  const options = {
    store,
    certificates,
    secret: "private-test-link-key",
    directory: { directory: async () => ({ contacts, cohorts: [] }) },
    configuration: () => ({
      sender: "continuinged@cedarville.edu",
      ready,
      origin: "https://portal.example.test",
      allowDemo,
      provider: "resend",
      reason: ready ? null : "Provider not configured.",
    }),
    transport: async (payload, id) => {
      calls.push({ payload, id });
      if (mode === "unknown")
        throw new Error(
          "private provider URL/token that must never be recorded",
        );
      if (mode === "rejected") {
        const e = new Error("private provider body");
        e.definite = true;
        throw e;
      }
      return "provider_" + id;
    },
  };
  const email = new CertificateEmail(options);
  certificates.email = email;
  const template = await certificates.save(
    { name: "Test", design: defaultCertificate },
    "staff",
  );
  async function issue(learner = "demo-alex") {
    const badge = (await store.issue(learner, fixture("complete"), "staff"))
      .badge;
    return certificates.create(
      {
        sourceId: "workspace",
        badgeId: badge.id,
        templateId: template.id,
        recipientName:
          learner === "demo-alex" ? "Alex Morgan" : "Jordan Morgan",
        confirmed: true,
      },
      "staff",
    );
  }
  const preview = (ids, extra = {}) =>
    email.preview({ ...emailDefaults, certificateIds: ids, ...extra }, "staff");
  const confirm = (p) =>
    email.confirm({ batchId: p.batchId, confirmed: true }, "staff");
  return {
    directory,
    store,
    certificates,
    email,
    options,
    contacts,
    calls,
    issue,
    preview,
    confirm,
    setReady: (v) => (ready = v),
    setAllowDemo: (v) => (allowDemo = v),
    setOutcome: (v) => (mode = v),
  };
}

test("certificate email remains disabled without explicit provider configuration and uses the requested sender", async (t) => {
  assert.equal(emailConfiguration({}).sender, "continuinged@cedarville.edu");
  assert.equal(emailConfiguration({}).ready, false);
  assert.equal(
    emailConfiguration({
      CERTIFICATE_EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "secret",
    }).ready,
    false,
  );
  assert.equal(
    emailConfiguration({ WEB_URL: "http://localhost:3050" }).origin,
    null,
  );
  assert.equal(
    emailConfiguration({ WEB_URL: "https://portal.example.test/path" }).origin,
    "https://portal.example.test",
  );
  const s = await setup(t),
    cert = await s.issue();
  s.setReady(false);
  const p = await s.preview([cert.id]);
  assert.equal(p.emails[0].recipient, "alex@example.test");
  await assert.rejects(() => s.confirm(p), /configuration/);
  await assert.rejects(
    () =>
      s.email.saveSettings(
        { ...emailDefaults, automatic: true, revision: 0 },
        "staff",
      ),
    /Configure/,
  );
  assert.equal(await s.email.processOne(), false);
  assert.equal(s.calls.length, 0);
});

test("individual and cohort emails are separate, personalized, PDF-bound, and durable across API instances", async (t) => {
  const s = await setup(t),
    a = await s.issue(),
    b = await s.issue("demo-jordan"),
    p = await s.preview([a.id, b.id], { mode: "both" });
  assert.match(p.emails[0].message, /Hello Alex Morgan/);
  assert.match(p.emails[1].message, /Hello Jordan Morgan/);
  assert.ok(p.emails.every((e) => e.sender === "continuinged@cedarville.edu"));
  assert.equal(s.calls.length, 0);
  await assert.rejects(
    () =>
      s.email.confirm({ batchId: p.batchId, confirmed: true }, "other-staff"),
    /staff session/,
  );
  await assert.rejects(
    () => s.email.confirm({ batchId: p.batchId, confirmed: false }, "staff"),
    /Review/,
  );
  await s.confirm(p);
  await s.confirm(p);
  const restarted = new CertificateEmail(s.options);
  await Promise.all([
    s.email.processOne(),
    restarted.processOne(),
    s.email.processOne(),
  ]);
  assert.equal(s.calls.length, 2);
  for (const { payload } of s.calls) {
    assert.equal(payload.to.length, 1);
    assert.equal(payload.cc, undefined);
    assert.equal(payload.bcc, undefined);
    assert.ok(payload.attachments[0].content.startsWith("JVBER"));
    assert.match(
      payload.text,
      /https:\/\/portal\.example\.test\/credential-tools\/certificate-download\.html#/,
    );
  }
  assert.deepEqual(
    new Set(s.calls.map((c) => c.payload.to[0])),
    new Set(["alex@example.test", "jordan@example.test"]),
  );
  const h = await restarted.history();
  assert.equal(h.deliveries.length, 2);
  assert.ok(h.deliveries.every((d) => d.state === "accepted"));
  const link = p.emails[0].message.split("#")[1];
  assert.ok((await restarted.download(link)).data.startsWith("JVBER"));
  await assert.rejects(
    () =>
      restarted.download(link.slice(0, -1) + (link.endsWith("A") ? "B" : "A")),
    /invalid/,
  );
  await assert.rejects(
    () =>
      s.store.db.query(
        "UPDATE credential_email_events SET detail='changed' WHERE workspace=$1",
        [s.store.db.workspace],
      ),
    /immutable/,
  );
  await assert.rejects(
    () =>
      s.store.db.query(
        "UPDATE credential_email_deliveries SET recipient='other@example.test' WHERE workspace=$1",
        [s.store.db.workspace],
      ),
    /immutable/,
  );
});

test("duplicate confirmations, concurrent previews, explicit resends and uncertain outcomes cannot silently resend", async (t) => {
  const s = await setup(t),
    cert = await s.issue(),
    p = await s.preview([cert.id]),
    other = await s.preview([cert.id]);
  await s.confirm(p);
  await assert.rejects(() => s.confirm(other), /Another delivery/);
  s.setOutcome("unknown");
  await s.email.processOne();
  const h = await s.email.history();
  assert.equal(h.deliveries[0].state, "unknown");
  assert.ok(!JSON.stringify(h).includes("private provider"));
  assert.equal(await s.email.processOne(), false);
  assert.equal(s.calls.length, 1);
  const duplicate = await s.preview([cert.id]);
  assert.match(duplicate.emails[0].reason, /Duplicate protected/);
  s.contacts.get("demo-alex").address = "Alex@Example.Test";
  assert.match(
    (await s.preview([cert.id])).emails[0].reason,
    /Duplicate protected/,
  );
  await assert.rejects(() => s.confirm(duplicate), /Duplicate/);
  await assert.rejects(
    () =>
      s.preview([cert.id], { resendOf: p.emails[0].id, resendReason: "short" }),
    /Explain/,
  );
  const retry = await s.preview([cert.id], {
    resendOf: p.emails[0].id,
    resendReason: "Provider reviewed; retry authorized.",
  });
  await s.confirm(retry);
  s.setOutcome("accepted");
  await s.email.processOne();
  assert.equal(s.calls.length, 2);
  assert.notEqual(s.calls[0].id, s.calls[1].id);
  assert.equal((await s.email.history()).deliveries.length, 2);
});

test("preview and send recheck account links, recipient changes and active certificates", async (t) => {
  const s = await setup(t),
    cert = await s.issue(),
    p = await s.preview([cert.id]);
  s.contacts.get("demo-alex").address = "changed@example.test";
  await assert.rejects(() => s.confirm(p), /contact or account link changed/);
  s.contacts.get("demo-alex").active = false;
  const blocked = await s.preview([cert.id]);
  assert.match(blocked.emails[0].reason, /No active/);
  s.contacts.get("demo-alex").active = true;
  s.contacts.get("demo-alex").address = "alex@example.test";
  await s.confirm(p);
  await s.store.revoke(cert.badgeId, "Synthetic revocation", "staff");
  await s.email.processOne();
  assert.equal(s.calls.length, 0);
  assert.equal((await s.email.history()).deliveries[0].state, "failed");
});

test("link-only delivery omits attachment; link expiry, invalid tokens and revocation deny download", async (t) => {
  const s = await setup(t),
    cert = await s.issue(),
    p = await s.preview([cert.id], { mode: "link" });
  const token = p.emails[0].message.split("#")[1];
  await assert.rejects(() => s.email.download(token), /invalid/);
  await s.confirm(p);
  await s.email.processOne();
  assert.equal(s.calls[0].payload.attachments, undefined);
  assert.ok((await s.email.download(token)).data.startsWith("JVBER"));
  await s.store.revoke(cert.badgeId, "Synthetic revocation", "staff");
  await assert.rejects(() => s.email.download(token), /valid, active/);
  await assert.rejects(() => s.email.download("invalid"), /invalid/);
  const expired = await setup(t),
    c = await expired.issue(),
    realNow = Date.now;
  let old;
  try {
    Date.now = () => realNow() - 8 * 86400000;
    old = await expired.preview([c.id], { mode: "link" });
  } finally {
    Date.now = realNow;
  }
  await expired.store.db
    .prepare("UPDATE email_deliveries SET state='accepted' WHERE id=?")
    .run(old.emails[0].id);
  await assert.rejects(
    () => expired.email.download(old.emails[0].message.split("#")[1]),
    /expired/,
  );
});

test("automatic delivery is opt-in, queues only new certificates, and disabling cancels pending automatic messages", async (t) => {
  const s = await setup(t),
    existing = await s.issue();
  assert.equal((await s.email.history()).deliveries.length, 0);
  await s.email.saveSettings(
    { ...emailDefaults, automatic: true, revision: 0 },
    "staff",
  );
  assert.equal((await s.email.history()).deliveries.length, 0);
  const cert = await s.issue("demo-jordan");
  let h = await s.email.history();
  assert.equal(h.deliveries.length, 1);
  assert.equal(h.deliveries[0].certificateId, cert.id);
  await s.email.saveSettings(
    { ...emailDefaults, automatic: false, revision: 1 },
    "staff",
  );
  await s.email.processOne();
  assert.equal(s.calls.length, 0);
  assert.equal((await s.email.history()).deliveries[0].state, "cancelled");
  await assert.rejects(
    () =>
      s.email.saveSettings(
        { ...emailDefaults, automatic: false, revision: 1 },
        "staff",
      ),
    /changed/,
  );
  assert.ok(existing.id);
});

test("missing contacts and fictional awards block automatic sending without losing issued certificates", async (t) => {
  const s = await setup(t);
  await s.email.saveSettings(
    { ...emailDefaults, automatic: true, revision: 0 },
    "staff",
  );
  s.contacts.clear();
  const cert = await s.issue();
  assert.ok(cert.id);
  let h = await s.email.history();
  assert.equal(h.deliveries[0].state, "blocked");
  assert.equal(s.calls.length, 0);
  s.contacts.set("demo-jordan", {
    portalId: randomUUID(),
    address: "jordan@example.test",
    active: true,
  });
  s.setAllowDemo(false);
  await s.issue("demo-jordan");
  h = await s.email.history();
  assert.equal(h.deliveries.length, 2);
  assert.ok(h.deliveries.every((d) => d.state === "blocked"));
});

test("automatic outbox intent rolls back with certificate issuance", async (t) => {
  const s = await setup(t);
  await s.email.saveSettings(
    { ...emailDefaults, automatic: true, revision: 0 },
    "staff",
  );
  const badge = (await s.store.issue("demo-alex", fixture("complete"), "staff"))
    .badge;
  const template = (await s.certificates.templates())[0];
  await assert.rejects(
    () =>
      s.store.transaction(async () => {
        await s.certificates.create(
          {
            sourceId: "workspace",
            badgeId: badge.id,
            templateId: template.id,
            recipientName: "Alex Morgan",
            confirmed: true,
          },
          "staff",
        );
        throw new Error("synthetic issuance rollback");
      }),
    /synthetic issuance rollback/,
  );
  assert.equal(await s.certificates.find("workspace", badge.id), undefined);
  assert.equal((await s.email.history()).deliveries.length, 0);
  assert.equal(s.calls.length, 0);
});

test("interrupted sending recovers as unknown after restart and frozen previews expire", async (t) => {
  const s = await setup(t),
    cert = await s.issue(),
    p = await s.preview([cert.id]);
  await s.confirm(p);
  await s.store.db
    .prepare(
      "UPDATE email_deliveries SET state='sending',send_started_at=? WHERE id=?",
    )
    .run("2000-01-01T00:00:00.000Z", p.emails[0].id);
  const restarted = new CertificateEmail(s.options);
  await restarted.recover();
  assert.equal((await restarted.history()).deliveries[0].state, "unknown");
  assert.equal(await restarted.processOne(), false);
  assert.equal(s.calls.length, 0);
  // A fresh workspace, advanced preview creation time, then restore clock.
  const other = await setup(t),
    c = await other.issue(),
    realNow = Date.now;
  let old;
  try {
    Date.now = () => realNow() - 60 * 60000;
    old = await other.preview([c.id]);
  } finally {
    Date.now = realNow;
  }
  await assert.rejects(() => other.confirm(old), /expired/);
});

test("portal recipient resolver requires explicit unique account links and active directory records", async (t) => {
  const s = await setup(t),
    one = randomUUID(),
    two = randomUUID(),
    file = join(s.directory, "links.json");
  await s.store.db.query(
    "INSERT INTO learners(id,email) VALUES($1,$2),($3,$4)",
    [one, "first@example.test", two, "second@example.test"],
  );
  const resolver = new CertificateRecipients(s.store.db, file);
  writeFileSync(file, JSON.stringify({ [one]: "demo-alex" }));
  assert.equal(
    (await resolver.directory()).contacts.get("demo-alex").address,
    "first@example.test",
  );
  const plan = randomUUID(),
    participant = randomUUID(),
    cohort = randomUUID();
  const offering = (
    await s.store.db.query("SELECT id FROM offerings ORDER BY id LIMIT 1")
  ).rows[0].id;
  await s.store.db.query(
    "INSERT INTO progress_plans(id,offering_id,revision,created_by) VALUES($1,$2,1,'email-test')",
    [plan, offering],
  );
  await s.store.db.query(
    "INSERT INTO progress_participants(id,plan_id,learner_id,assigned_by) VALUES($1,$2,$3,'email-test')",
    [participant, plan, one],
  );
  await s.store.db.query(
    "INSERT INTO progress_cohorts(id,name,plan_id,created_by) VALUES($1,'Email test cohort',$2,'email-test')",
    [cohort, plan],
  );
  await s.store.db.query(
    "INSERT INTO progress_cohort_members(cohort_id,participant_id,plan_id,changed_by) VALUES($1,$2,$3,'email-test')",
    [cohort, participant, plan],
  );
  assert.deepEqual(
    (await resolver.directory()).cohorts.find((c) => c.id === cohort).learners,
    [one],
  );
  await s.store.db.query(
    "UPDATE progress_cohort_members SET active=false WHERE cohort_id=$1",
    [cohort],
  );
  assert.deepEqual(
    (await resolver.directory()).cohorts.find((c) => c.id === cohort).learners,
    [],
  );
  writeFileSync(
    file,
    JSON.stringify({ [one]: "demo-alex", [two]: "demo-alex" }),
  );
  assert.equal(
    (await resolver.directory()).contacts.get("demo-alex").active,
    false,
  );
  writeFileSync(file, JSON.stringify({ [one]: "demo-alex" }));
  await s.store.db.query(
    "UPDATE learners SET active=false,deactivated_at=now() WHERE id=$1",
    [one],
  );
  assert.equal(
    (await resolver.directory()).contacts.get("demo-alex").active,
    false,
  );
  rmSync(file);
  assert.equal((await resolver.directory()).contacts.size, 0);
});

test("provider adapter sends one address with an idempotency key and does not expose provider bodies", async () => {
  let call;
  const transport = async (url, options) => {
    call = { url, options };
    return new Response(JSON.stringify({ id: "synthetic-provider-id" }));
  };
  const payload = {
    from: "continuinged@cedarville.edu",
    to: ["alex@example.test"],
    subject: "Certificate",
    text: "Hello Alex",
  };
  assert.equal(
    await sendWithResend(
      payload,
      "test-job",
      { RESEND_API_KEY: "private-test-key" },
      transport,
    ),
    "synthetic-provider-id",
  );
  assert.equal(call.url, "https://api.resend.com/emails");
  assert.equal(call.options.headers["Idempotency-Key"], "certificate/test-job");
  assert.deepEqual(JSON.parse(call.options.body), payload);
  for (const status of [400, 401, 429, 500, 408, 409])
    await assert.rejects(
      () =>
        sendWithResend(
          payload,
          "test-job",
          { RESEND_API_KEY: "private-test-key" },
          async () => new Response("PRIVATE", { status }),
        ),
      (error) =>
        !error.message.includes("PRIVATE") &&
        error.definite === (status < 500 && ![408, 409].includes(status)),
    );
});
