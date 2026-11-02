import { createHash, createHmac, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { AwardError } from "./manual-awards.mjs";
import { readRegister } from "./register.mjs";
const fail = (message) => {
  throw new AwardError(message);
};
const now = () => new Date().toISOString();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const invalid =
  "This claim code is invalid, expired, revoked, or belongs to another learner. Sign in with the intended learner account or contact Continuing Education.";
export function claimOrigin(value = process.env.WEB_URL) {
  try {
    const url = new URL(value);
    if (
      !url.username &&
      !url.password &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)))
    )
      return url.origin;
  } catch {
    /* No browser-controlled or private API origin fallback. */
  }
  return null;
}
export function normalizeClaim(value) {
  if (typeof value !== "string" || value.length > 100) return null;
  const code = value.toUpperCase().replace(/[\s-]/g, "");
  return /^[0-9A-HJKMNP-TV-Z]{20}$/.test(code) ? code : null;
}
const hash = (code) => createHash("sha256").update(code).digest("hex");
export class CredentialDistribution {
  constructor({
    store,
    certificates,
    learners,
    sources,
    secret,
    origin = () => claimOrigin(),
    recipients,
  }) {
    Object.assign(this, {
      store,
      certificates,
      learners,
      sources,
      secret,
      origin,
      recipients,
    });
  }
  code(id) {
    const bytes = createHmac("sha256", this.secret)
      .update(`${this.store.db.workspace}:claim:${id}`)
      .digest();
    // Twenty independently distributed five-bit groups: 100 bits of code entropy.
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let bits = 0,
      value = 0,
      result = "";
    for (const byte of bytes) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5 && result.length < 20) {
        bits -= 5;
        result += alphabet[(value >>> bits) & 31];
      }
      if (result.length === 20) break;
    }
    return result;
  }
  async event(id, action, actor) {
    await this.store.db
      .prepare(
        "INSERT INTO claim_events(id,claim_id,at,action,actor) VALUES(?,?,?,?,?)",
      )
      .run(randomUUID(), id, now(), action, actor);
  }
  summary(row) {
    return {
      id: row.id,
      sourceId: row.source_id,
      badgeId: row.badge_id,
      learnerId: row.learner,
      recipientName: this.learners[row.learner]?.displayName || row.learner,
      kind: row.kind,
      certificateId: row.certificate_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      state:
        row.state === "active" && row.expires_at <= now()
          ? "expired"
          : row.state,
      claimedAt: row.claimed_at,
      revokedAt: row.revoked_at,
    };
  }
  async valid(row) {
    if (row.code_hash && hash(this.code(row.id)) !== row.code_hash)
      fail(
        "The claim-code key changed. Restore the original private claim-code-key file or revoke and replace this distribution.",
      );
    if (!Object.hasOwn(this.learners, row.learner))
      fail("The learner account is no longer approved.");
    const contact = (await this.recipients.directory()).contacts.get(
      row.learner,
    );
    if (!contact?.active) fail("The linked learner account is unavailable.");
    const award = await this.certificates.row(
      row.source_id,
      row.badge_id,
      row.learner,
    );
    if (row.kind !== "badge") {
      const certificate = await this.certificates.find(
        row.source_id,
        row.badge_id,
      );
      if (
        !certificate ||
        certificate.id !== row.certificate_id ||
        certificate.learner !== row.learner
      )
        fail("The certificate is no longer available.");
      // Full signature check without running the PDF renderer for every claim read.
      this.certificates.verify(certificate);
    }
    return award;
  }
  async catalog() {
    const register = await readRegister(this.sources),
      directory = await this.recipients.directory(),
      records = [];
    for (const row of register.records) {
      const contact = directory.contacts.get(row.learnerId),
        cert = await this.certificates.find(row.sourceId, row.id);
      records.push({
        ...row,
        recipientName: cert
          ? this.certificates.summary(cert).recipientName
          : this.learners[row.learnerId]?.displayName || row.learnerId,
        certificateId: cert?.id || null,
        linked: !!contact?.active,
      });
    }
    return {
      awards: records,
      errors: register.errors,
      origin: this.origin(),
      local: !!this.origin() && new URL(this.origin()).protocol === "http:",
    };
  }
  async create(body, actor) {
    if (body.confirmed !== true)
      fail(
        "Confirm the intended learner and issued accomplishment before creating a claim code.",
      );
    const origin = this.origin();
    if (!origin)
      fail(
        "Configure WEB_URL with the public HTTPS portal origin (or localhost for a local demo).",
      );
    if (
      typeof body.sourceId !== "string" ||
      !/^[a-z0-9-]{1,80}$/.test(body.sourceId) ||
      typeof body.badgeId !== "string" ||
      !uuid.test(body.badgeId) ||
      !["badge", "certificate", "both"].includes(body.kind) ||
      !Number.isInteger(body.days) ||
      body.days < 1 ||
      body.days > 30
    )
      fail(
        "Choose an issued award, distribution format, and expiry of 1–30 days.",
      );
    return this.store.transaction(async () => {
      const award = await this.certificates.row(body.sourceId, body.badgeId),
        cert = await this.certificates.find(body.sourceId, body.badgeId);
      const contact = (await this.recipients.directory()).contacts.get(
        award.learner,
      );
      if (!contact?.active)
        fail(
          "Link an active portal learner to this badge account before creating a claim code.",
        );
      const row = {
        id: randomUUID(),
        source_id: body.sourceId,
        badge_id: body.badgeId,
        learner: award.learner,
        kind: body.kind,
        certificate_id: body.kind === "badge" ? null : cert?.id,
      };
      await this.valid(row);
      const existing = await this.store.db
        .prepare(
          "SELECT * FROM claims WHERE source_id=? AND badge_id=? AND kind=? AND state='active' AND expires_at>? ORDER BY created_at DESC LIMIT 1",
        )
        .get(body.sourceId, body.badgeId, body.kind, now());
      if (existing) return this.summary(existing);
      await this.store.db
        .prepare(
          "INSERT INTO claims(id,source_id,badge_id,learner,kind,certificate_id,code_hash,origin,created_at,expires_at,created_by,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,'active')",
        )
        .run(
          row.id,
          row.source_id,
          row.badge_id,
          row.learner,
          row.kind,
          row.certificate_id || null,
          hash(this.code(row.id)),
          origin,
          now(),
          new Date(Date.now() + body.days * 86400000).toISOString(),
          actor,
        );
      await this.event(row.id, "created", actor);
      await this.store.audit("claim-created", row.badge_id, actor);
      return this.summary(await this.find(row.id));
    });
  }
  async find(id) {
    return this.store.db.prepare("SELECT * FROM claims WHERE id=?").get(id);
  }
  async detail(id) {
    const row = uuid.test(id || "") && (await this.find(id));
    if (!row) fail("Claim distribution not found.");
    const summary = this.summary(row);
    const events = await this.store.db
      .prepare(
        "SELECT at,action,actor FROM claim_events WHERE claim_id=? ORDER BY at,CASE action WHEN 'created' THEN 0 ELSE 1 END,id",
      )
      .all(row.id);
    if (summary.state !== "active")
      return { ...summary, events, code: null, url: null, qr: null };
    try {
      await this.valid(row);
    } catch {
      return {
        ...summary,
        state: "unavailable",
        events,
        code: null,
        url: null,
        qr: null,
      };
    }
    const code = this.code(id).match(/.{5}/g).join("-"),
      url = `${row.origin}/credential-tools/claim.html#${code}`;
    return {
      ...summary,
      events,
      code,
      url,
      qr: await QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        margin: 4,
        width: 360,
      }),
    };
  }
  async history() {
    const distributions = [];
    for (const row of await this.store.db
      .prepare(
        "SELECT * FROM claims ORDER BY created_at DESC,id DESC LIMIT 250",
      )
      .all()) {
      const summary = this.summary(row);
      if (summary.state === "active")
        try {
          await this.valid(row);
        } catch {
          summary.state = "unavailable";
        }
      distributions.push(summary);
    }
    return { distributions, limit: 250 };
  }
  async revoke(id, body, actor) {
    if (body.confirmed !== true || !uuid.test(id || ""))
      fail("Confirm revoking this claim code.");
    return this.store.transaction(async () => {
      const row = await this.find(id);
      if (!row) fail("Claim distribution not found.");
      if (row.state !== "revoked") {
        await this.store.db
          .prepare(
            "UPDATE claims SET state='revoked',revoked_at=?,revoked_by=? WHERE id=?",
          )
          .run(now(), actor, id);
        await this.event(id, "revoked", actor);
        await this.store.audit("claim-revoked", row.badge_id, actor);
      }
      return this.summary(await this.find(id));
    });
  }
  async redeem(body, learner) {
    // Trusted learner identity is supplied exclusively by the portal broker.
    const actor = `learner:${learner}`;
    const outcome = await this.store.transaction(async () => {
      const attempts = await this.store.db
        .prepare(
          "SELECT count(*) AS n FROM claim_events WHERE actor=? AND at>? AND action IN ('denied','redeemed','replayed')",
        )
        .get(actor, new Date(Date.now() - 5 * 60000).toISOString());
      if (attempts.n >= 10)
        return {
          error:
            "Too many claim attempts. Wait five minutes before trying again.",
        };
      const code = normalizeClaim(body.code),
        row =
          code &&
          (await this.store.db
            .prepare("SELECT * FROM claims WHERE code_hash=?")
            .get(hash(code)));
      let allowed =
        row &&
        row.learner === learner &&
        row.state !== "revoked" &&
        row.expires_at > now() &&
        Object.hasOwn(this.learners, learner);
      const contact = (await this.recipients.directory()).contacts.get(learner);
      allowed = allowed && contact?.active;
      if (allowed)
        try {
          await this.valid(row);
        } catch {
          allowed = false;
        }
      if (!allowed) {
        await this.event(row?.id || null, "denied", actor);
        return { error: invalid };
      }
      const replay = row.state === "claimed";
      if (!replay) {
        await this.store.db
          .prepare(
            "UPDATE claims SET state='claimed',claimed_at=?,claimed_by=? WHERE id=? AND state='active'",
          )
          .run(now(), learner, row.id);
        await this.store.audit("claim-redeemed", row.badge_id, actor);
      }
      await this.event(row.id, replay ? "replayed" : "redeemed", actor);
      const award = await this.certificates.row(
          row.source_id,
          row.badge_id,
          learner,
        ),
        credential = JSON.parse(award.credential);
      return {
        claimId: row.id,
        replayed: replay,
        kind: row.kind,
        sourceId: row.source_id,
        badgeId: row.badge_id,
        title: credential.achievement.name,
        demonstration: credential.demonstration === true,
        certificateId: row.certificate_id,
        recipientName: this.learners[learner]?.displayName || learner,
      };
    });
    if (outcome.error) fail(outcome.error);
    return outcome;
  }
}
