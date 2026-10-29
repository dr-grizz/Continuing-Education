import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AwardError } from "./manual-awards.mjs";

const fail = (message) => {
  throw new AwardError(message);
};
const now = () => new Date().toISOString();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const email =
  /^[^\s<>@,;\u0000-\u001f\u007f]+@[^\s<>@,;\u0000-\u001f\u007f]+\.[^\s<>@,;\u0000-\u001f\u007f]+$/;
export const emailDefaults = {
  mode: "attachment",
  subject: "Your certificate: {{achievement}}",
  message:
    "Hello {{name}},\n\nCongratulations on completing {{achievement}}. Your certificate is included below.\n\nContinuing Education\nCedarville University",
};
export function emailConfiguration(env = process.env) {
  let origin = null;
  try {
    const url = new URL(env.WEB_URL);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      origin = url.origin;
  } catch {
    /* Links require an explicitly configured public HTTPS origin. */
  }
  const sender = env.CERTIFICATE_EMAIL_FROM || "continuinged@cedarville.edu";
  const ready =
    env.CERTIFICATE_EMAIL_ENABLED === "true" &&
    env.CERTIFICATE_EMAIL_PROVIDER === "resend" &&
    !!env.RESEND_API_KEY &&
    email.test(sender) &&
    sender.length <= 254;
  return {
    sender,
    ready,
    origin,
    provider: env.CERTIFICATE_EMAIL_PROVIDER || null,
    allowDemo: env.CERTIFICATE_EMAIL_ALLOW_DEMO === "true",
    reason: ready
      ? null
      : "Sending is disabled. Configure an email provider, its credentials, and explicitly enable certificate email.",
  };
}

// Identity comes from the existing private account link, never a printed name,
// email match, or browser-supplied recipient. Missing/ambiguous links fail closed.
export class CertificateRecipients {
  constructor(
    db,
    file = process.env.BADGE_LEARNER_MAP_FILE ||
      "badge-service/data/portal-learners.json",
  ) {
    this.db = db;
    this.file = resolve(file);
  }
  async directory() {
    let links;
    try {
      links = JSON.parse(await readFile(this.file, "utf8"));
    } catch {
      links = {};
    }
    if (!links || typeof links !== "object" || Array.isArray(links)) links = {};
    const rows = (
      await this.db.query(
        "SELECT id,email,active FROM learners WHERE id=ANY($1::uuid[])",
        [Object.keys(links).filter((id) => uuid.test(id))],
      )
    ).rows;
    const contacts = new Map();
    for (const row of rows) {
      const badge = links[row.id];
      if (typeof badge !== "string") continue;
      const ambiguous =
        Object.values(links).filter((value) => value === badge).length !== 1;
      contacts.set(badge, {
        portalId: row.id,
        address: row.email?.trim() || "",
        active: row.active && !ambiguous,
      });
    }
    const cohorts = (
      await this.db
        .query(`SELECT c.id,c.name,coalesce(array_agg(p.learner_id) FILTER (WHERE m.active),ARRAY[]::uuid[]) AS learners
      FROM progress_cohorts c LEFT JOIN progress_cohort_members m ON m.cohort_id=c.id
      LEFT JOIN progress_participants p ON p.id=m.participant_id GROUP BY c.id,c.name ORDER BY c.name`)
    ).rows;
    return { contacts, cohorts };
  }
}

// Deliberately one recipient per provider request. No CC/BCC or bulk envelope.
export async function sendWithResend(
  payload,
  id,
  env = process.env,
  fetcher = fetch,
) {
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `certificate/${id}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    // Provider bodies can contain addresses/content/credentials. Never persist them.
    const error = new Error(
      response.status < 500 && ![408, 409].includes(response.status)
        ? `Email provider rejected the request (HTTP ${response.status}).`
        : "Email provider outcome is uncertain; inspect the provider before resending.",
    );
    error.definite =
      response.status < 500 && ![408, 409].includes(response.status);
    throw error;
  }
  const result = await response.json();
  if (
    typeof result.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(result.id)
  )
    throw new Error("Uncertain provider response.");
  return result.id;
}

export class CertificateEmail {
  constructor({
    store,
    certificates,
    directory,
    secret,
    configuration = () => emailConfiguration(),
    transport = sendWithResend,
  }) {
    Object.assign(this, {
      store,
      certificates,
      directory,
      secret,
      configuration,
      transport,
    });
    this.running = false;
  }
  async settings() {
    const row = await this.store.db
      .prepare("SELECT * FROM email_settings")
      .get();
    return row
      ? {
          automatic: row.automatic === 1,
          mode: row.mode,
          subject: row.subject,
          message: row.message,
          revision: row.revision,
        }
      : { ...emailDefaults, automatic: false, revision: 0 };
  }
  templates(body) {
    if (!["attachment", "link", "both"].includes(body.mode))
      fail("Choose a PDF attachment, secure link, or both.");
    if (
      typeof body.subject !== "string" ||
      !body.subject.trim() ||
      body.subject.length > 180 ||
      /[\u0000-\u001f\u007f]/.test(body.subject)
    )
      fail("Enter an email subject (1–180 characters, one line).");
    if (
      typeof body.message !== "string" ||
      !body.message.trim() ||
      body.message.length > 5000 ||
      /[\u0000-\u0008\u000b-\u001f\u007f]/.test(body.message)
    )
      fail("Enter a message (1–5,000 characters).");
    for (const text of [body.subject, body.message])
      if (/{{(?!(name|achievement|awardDate)}})[\s\S]*?}}/.test(text))
        fail(
          "Use only {{name}}, {{achievement}}, and {{awardDate}} placeholders.",
        );
    return {
      mode: body.mode,
      subject: body.subject.trim(),
      message: body.message.trim(),
    };
  }
  async saveSettings(body, actor) {
    const t = this.templates(body);
    if (typeof body.automatic !== "boolean")
      fail("Choose whether automatic email is enabled.");
    const config = this.configuration();
    if (
      body.automatic &&
      (!config.ready || (t.mode !== "attachment" && !config.origin))
    )
      fail(
        "Configure the provider and public HTTPS link origin before enabling automatic delivery.",
      );
    return this.store.transaction(async () => {
      const current = await this.settings();
      if (body.revision !== current.revision)
        fail("Email settings changed. Reload before saving.");
      if (!current.revision)
        await this.store.db
          .prepare(
            "INSERT INTO email_settings(automatic,mode,subject,message,revision,updated_at,updated_by) VALUES(?,?,?,?,1,?,?)",
          )
          .run(
            Number(body.automatic),
            t.mode,
            t.subject,
            t.message,
            now(),
            actor,
          );
      else
        await this.store.db
          .prepare(
            "UPDATE email_settings SET automatic=?,mode=?,subject=?,message=?,revision=revision+1,updated_at=?,updated_by=? WHERE revision=?",
          )
          .run(
            Number(body.automatic),
            t.mode,
            t.subject,
            t.message,
            now(),
            actor,
            current.revision,
          );
      await this.store.audit("certificate-email-settings", null, actor);
      return this.settings();
    });
  }
  async event(id, state, detail, actor) {
    await this.store.db
      .prepare(
        "INSERT INTO email_events(id,delivery_id,at,state,detail,actor) VALUES(?,?,?,?,?,?)",
      )
      .run(randomUUID(), id, now(), state, detail, actor);
  }
  contact(cert, directory) {
    const c = directory.contacts.get(cert.learner);
    const address =
      typeof c?.address === "string" ? c.address.trim().toLowerCase() : "";
    if (!c?.active || !email.test(address) || address.length > 254) return null;
    return { ...c, address };
  }
  token(id) {
    return `${id}.${createHmac("sha256", this.secret).update(`${this.store.db.workspace}:${id}`).digest("base64url")}`;
  }
  link(row) {
    const snapshot = JSON.parse(row.snapshot_json);
    return snapshot.origin
      ? `${snapshot.origin}/credential-tools/certificate-download.html#${this.token(row.id)}`
      : "[secure download link — configure the public HTTPS portal address]";
  }
  view(row) {
    const s = JSON.parse(row.snapshot_json);
    return {
      id: row.id,
      batchId: row.batch_id,
      certificateId: row.certificate_id,
      recipient: row.recipient,
      recipientName: s.name,
      achievement: s.achievement,
      sender: s.sender,
      subject: s.subject,
      message:
        s.message +
        (s.mode === "attachment"
          ? ""
          : `\n\nDownload your certificate (expires ${s.linkExpiresAt}):\n${this.link(row)}`),
      mode: s.mode,
      state: row.state,
      createdAt: row.created_at,
      resendOf: row.resend_of,
      resendReason: s.resendReason || null,
      providerId: row.provider_id || null,
      sourceId: s.sourceId,
      badgeId: s.badgeId,
      expiresAt: row.expires_at,
      automatic: s.automatic,
      reason: s.blocked || null,
    };
  }
  async catalog() {
    await this.recover();
    const directory = await this.directory.directory(),
      list = await this.certificates.list(),
      contacts = {};
    for (const cert of list) {
      const c = this.contact({ learner: cert.learnerId }, directory);
      contacts[cert.id] = {
        address: c?.active && email.test(c.address) ? c.address : null,
        cohortIds: c?.active
          ? directory.cohorts
              .filter((group) => group.learners.includes(c.portalId))
              .map((group) => group.id)
          : [],
      };
    }
    const config = this.configuration();
    return {
      settings: await this.settings(),
      configuration: {
        sender: config.sender,
        ready: config.ready,
        linksReady: !!config.origin,
        reason: config.reason,
        provider: config.provider,
      },
      contacts,
      cohorts: directory.cohorts.map(({ id, name }) => ({ id, name })),
    };
  }
  async history() {
    await this.recover();
    const rows = await this.store.db
      .prepare(
        "SELECT * FROM email_deliveries WHERE state<>'preview' ORDER BY created_at DESC LIMIT 250",
      )
      .all();
    const result = [];
    for (const row of rows)
      result.push({
        ...this.view(row),
        events: await this.store.db
          .prepare(
            "SELECT at,state,detail,actor FROM email_events WHERE delivery_id=? ORDER BY at,CASE state WHEN 'preview' THEN 0 WHEN 'queued' THEN 1 WHEN 'sending' THEN 2 ELSE 3 END,id",
          )
          .all(row.id),
      });
    return { deliveries: result, limit: 250 };
  }
  async previous(cert, address) {
    return this.store.db
      .prepare(
        "SELECT * FROM email_deliveries WHERE certificate_id=? AND recipient=? AND state NOT IN ('preview','blocked','cancelled') ORDER BY created_at DESC,id DESC LIMIT 1",
      )
      .get(cert.id, address);
  }
  async build(cert, body, actor, directory, batchId, automatic = false) {
    const config = this.configuration(),
      snapshot = JSON.parse(cert.snapshot_json),
      contact = this.contact(cert, directory),
      t = this.templates(body);
    const id = randomUUID(),
      created = now(),
      expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const fill = (text) =>
      text.replace(
        /{{(name|achievement|awardDate)}}/g,
        (_, key) =>
          ({
            name: snapshot.recipientName,
            achievement: snapshot.achievement,
            awardDate: snapshot.awardDate,
          })[key],
      );
    const subject = fill(t.subject),
      message = fill(t.message);
    if (subject.length > 998 || /[\r\n\u0000-\u001f\u007f]/.test(subject))
      fail("The personalized subject is too long or contains a line break.");
    let blocked = !contact
      ? "No active, unambiguous badge-account link and valid portal email address. Correct the learner record/account link first."
      : snapshot.demo && !config.allowDemo
        ? "This is a fictional demonstration certificate. Live delivery of demonstration awards is disabled."
        : null;
    const parent = contact ? await this.previous(cert, contact.address) : null;
    let resend = null;
    if (body.resendOf) {
      if (
        typeof body.resendReason !== "string" ||
        body.resendReason.trim().length < 10 ||
        body.resendReason.length > 500
      )
        fail("Explain the resend (10–500 characters).");
      if (
        !parent ||
        parent.id !== body.resendOf ||
        ["queued", "sending"].includes(parent.state)
      )
        fail(
          "The previous delivery changed or is still pending. Refresh its history.",
        );
      resend = parent.id;
    } else if (parent)
      blocked = `Duplicate protected: previous delivery ${parent.id} (${parent.state}). Use an explicit resend after reviewing history.`;
    const row = {
      id,
      certificate_id: cert.id,
      recipient: contact?.address || "",
      learner_id: cert.learner,
      batch_id: batchId,
      actor,
      created_at: created,
      expires_at: expires,
      state: "preview",
      resend_of: resend,
      snapshot_json: JSON.stringify({
        name: snapshot.recipientName,
        achievement: snapshot.achievement,
        sourceId: cert.source_id,
        badgeId: cert.badge_id,
        subject,
        message,
        mode: t.mode,
        sender: config.sender,
        origin: config.origin,
        linkExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        automatic,
        blocked,
        resendReason: resend ? body.resendReason.trim() : null,
      }),
    };
    await this.store.db
      .prepare(
        "INSERT INTO email_deliveries(id,certificate_id,recipient,learner_id,batch_id,actor,created_at,expires_at,state,snapshot_json,resend_of) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        row.id,
        row.certificate_id,
        row.recipient,
        row.learner_id,
        row.batch_id,
        actor,
        created,
        expires,
        row.state,
        row.snapshot_json,
        resend,
      );
    await this.event(
      id,
      "preview",
      automatic
        ? "Automatic email prepared using the saved settings."
        : "Personalized email preview created.",
      actor,
    );
    return row;
  }
  async preview(body, actor) {
    this.templates(body);
    if (
      !Array.isArray(body.certificateIds) ||
      !body.certificateIds.length ||
      body.certificateIds.length > 100 ||
      body.certificateIds.some((id) => !uuid.test(id)) ||
      new Set(body.certificateIds).size !== body.certificateIds.length
    )
      fail("Select 1–100 different issued certificates.");
    if (body.resendOf && body.certificateIds.length !== 1)
      fail("Review resends individually.");
    return this.store.transaction(async () => {
      const directory = await this.directory.directory(),
        batchId = randomUUID(),
        rows = [];
      for (const id of body.certificateIds) {
        const cert = await this.store.db
          .prepare("SELECT * FROM certificates WHERE id=?")
          .get(id);
        if (!cert) fail("Certificate not found.");
        await this.certificates.row(
          cert.source_id,
          cert.badge_id,
          cert.learner,
        );
        rows.push(
          this.view(await this.build(cert, body, actor, directory, batchId)),
        );
      }
      return { batchId, expiresAt: rows[0].expiresAt, emails: rows };
    });
  }
  async validate(row) {
    const config = this.configuration(),
      s = JSON.parse(row.snapshot_json);
    if (s.blocked) fail(s.blocked);
    if (
      !config.ready ||
      config.sender !== s.sender ||
      (s.mode !== "attachment" &&
        (!config.origin || config.origin !== s.origin))
    )
      fail(
        "Email configuration is incomplete or changed. Create a new preview.",
      );
    const cert = await this.store.db
      .prepare("SELECT * FROM certificates WHERE id=?")
      .get(row.certificate_id);
    await this.certificates.row(s.sourceId, s.badgeId, row.learner_id);
    const contact = this.contact(cert, await this.directory.directory());
    if (!contact || contact.address !== row.recipient)
      fail("Learner contact or account link changed. Create a new preview.");
    const prior = await this.previous(cert, row.recipient);
    // The row itself is expected after queueing; preflight must not block itself.
    if (prior && prior.id !== row.id && prior.id !== row.resend_of)
      fail("Another delivery already exists. Review history before resending.");
    if (
      row.resend_of &&
      (!prior || ![row.resend_of, row.id].includes(prior.id))
    )
      fail("The prior delivery changed. Review history.");
    return s;
  }
  async confirm(body, actor) {
    if (body.confirmed !== true || !uuid.test(body.batchId))
      fail("Review the personalized previews and confirm before sending.");
    return this.store.transaction(async () => {
      const rows = await this.store.db
        .prepare("SELECT * FROM email_deliveries WHERE batch_id=? ORDER BY id")
        .all(body.batchId);
      if (!rows.length || rows.some((row) => row.actor !== actor))
        fail("Email preview not found for this staff session.");
      for (const row of rows) {
        if (row.state !== "preview") continue; // Durable confirmation idempotency, including lost responses.
        if (row.expires_at < now())
          fail("Email preview expired. Create a new preview.");
        await this.validate(row);
        await this.store.db
          .prepare(
            "UPDATE email_deliveries SET state='queued' WHERE id=? AND state='preview'",
          )
          .run(row.id);
        await this.event(
          row.id,
          "queued",
          "Staff confirmed recipient, content, and certificate.",
          actor,
        );
      }
      await this.store.audit("certificate-email-confirmed", null, actor);
      return { batchId: body.batchId, queued: rows.length };
    });
  }
  // Inside certificate issuance's transaction: queue intent only, never network I/O.
  async afterIssuance(cert, actor) {
    const settings = await this.settings();
    if (!settings.automatic) return;
    const row = await this.build(
        cert,
        settings,
        actor,
        await this.directory.directory(),
        randomUUID(),
        true,
      ),
      s = JSON.parse(row.snapshot_json);
    let reason = s.blocked;
    if (!reason)
      try {
        await this.validate(row);
      } catch (error) {
        reason = error.message;
      }
    await this.store.db
      .prepare("UPDATE email_deliveries SET state=? WHERE id=?")
      .run(reason ? "blocked" : "queued", row.id);
    await this.event(
      row.id,
      reason ? "blocked" : "queued",
      reason || "Automatic delivery queued after certificate issuance.",
      actor,
    );
  }
  async recover() {
    return this.store.transaction(async () => {
      const rows = await this.store.db
        .prepare(
          "SELECT * FROM email_deliveries WHERE state='sending' AND send_started_at<?",
        )
        .all(new Date(Date.now() - 2 * 60000).toISOString());
      for (const row of rows) {
        await this.store.db
          .prepare(
            "UPDATE email_deliveries SET state='unknown' WHERE id=? AND state='sending'",
          )
          .run(row.id);
        await this.event(
          row.id,
          "unknown",
          "Sending was interrupted. Check the provider before an explicit resend; no automatic retry.",
          "email-worker",
        );
      }
    });
  }
  async processOne() {
    if (!this.configuration().ready) return false;
    const row = await this.store.transaction(async () => {
      const row = await this.store.db
        .prepare(
          "SELECT * FROM email_deliveries WHERE state='queued' ORDER BY created_at,id LIMIT 1",
        )
        .get();
      if (!row) return null;
      const s = JSON.parse(row.snapshot_json);
      if (s.automatic && !(await this.settings()).automatic) {
        await this.store.db
          .prepare("UPDATE email_deliveries SET state='cancelled' WHERE id=?")
          .run(row.id);
        await this.event(
          row.id,
          "cancelled",
          "Automatic email was disabled before this job was sent.",
          "email-worker",
        );
        return { cancelled: true };
      }
      try {
        await this.validate(row);
      } catch (error) {
        await this.store.db
          .prepare("UPDATE email_deliveries SET state='failed' WHERE id=?")
          .run(row.id);
        await this.event(
          row.id,
          "failed",
          error instanceof AwardError
            ? error.message
            : "Delivery preflight failed.",
          "email-worker",
        );
        return { cancelled: true };
      }
      await this.store.db
        .prepare(
          "UPDATE email_deliveries SET state='sending',send_started_at=? WHERE id=? AND state='queued'",
        )
        .run(now(), row.id);
      await this.event(
        row.id,
        "sending",
        "Sending attempt started; provider outcome pending.",
        "email-worker",
      );
      return row;
    });
    if (!row) return false;
    if (row.cancelled) return true;
    let state,
      detail,
      providerId = null,
      contacted = false;
    try {
      // Rendering also verifies the original certificate signature and active award.
      const s = JSON.parse(row.snapshot_json),
        pdf = await this.certificates.download(
          s.sourceId,
          s.badgeId,
          row.learner_id,
        );
      const payload = {
        from: s.sender,
        to: [row.recipient],
        subject: s.subject,
        text: this.view(row).message,
        ...(s.mode === "link"
          ? {}
          : { attachments: [{ filename: pdf.filename, content: pdf.data }] }),
      };
      contacted = true;
      providerId = await this.transport(payload, row.id);
      state = "accepted";
      detail =
        "Provider accepted the email. Inbox delivery has not been verified.";
    } catch (error) {
      state = !contacted || error.definite === true ? "failed" : "unknown";
      detail =
        state === "unknown"
          ? "Provider outcome is uncertain. Check the provider before resending; no automatic retry."
          : !contacted
            ? "Certificate could not be verified or rendered; nothing was sent."
            : "Provider rejected the email. Check provider configuration before an explicit resend.";
    }
    await this.store.transaction(async () => {
      await this.store.db
        .prepare(
          "UPDATE email_deliveries SET state=?,provider_id=? WHERE id=? AND state='sending'",
        )
        .run(state, providerId, row.id);
      await this.event(row.id, state, detail, "email-worker");
    });
    return true;
  }
  start() {
    if (this.timer) return;
    const tick = async () => {
      if (this.running || !this.configuration().ready) return;
      this.running = true;
      try {
        await this.recover();
        for (let n = 0; n < 2; n++) if (!(await this.processOne())) break;
      } catch {
        /* Durable sending state is recovered as unknown, never blindly resent. */
      } finally {
        this.running = false;
      }
    };
    this.timer = setInterval(tick, 2000);
    this.timer.unref();
  }
  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
  async download(token) {
    const match =
      typeof token === "string" &&
      token.match(/^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/);
    if (!match || !uuid.test(match[1]))
      fail("Certificate link is invalid or expired.");
    const expected = Buffer.from(this.token(match[1])),
      candidate = Buffer.from(token);
    if (
      expected.length !== candidate.length ||
      !timingSafeEqual(expected, candidate)
    )
      fail("Certificate link is invalid or expired.");
    const row = await this.store.db
      .prepare("SELECT * FROM email_deliveries WHERE id=?")
      .get(match[1]);
    if (!row) fail("Certificate link is invalid or expired.");
    const s = JSON.parse(row.snapshot_json);
    if (
      !["sending", "accepted", "unknown"].includes(row.state) ||
      s.mode === "attachment" ||
      s.linkExpiresAt < now()
    )
      fail("Certificate link is invalid or expired.");
    const cert = await this.store.db
        .prepare("SELECT * FROM certificates WHERE id=?")
        .get(row.certificate_id),
      contact = this.contact(cert, await this.directory.directory());
    if (!contact || contact.address !== row.recipient)
      fail("Certificate link is unavailable. Contact Continuing Education.");
    return this.certificates.download(s.sourceId, s.badgeId, row.learner_id);
  }
}
