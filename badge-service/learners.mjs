import { PostgresBadgeDatabase } from "./postgres.mjs";
import { createPrivateKey, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
export class LearnerAwards {
  constructor(sources, origin, pool) {
    this.sources = sources;
    this.origin = origin;
    this.pool = pool;
  }
  source(id) {
    const source = this.sources.find((s) => s.id === id);
    if (!source) throw new Error("Badge not found");
    return source;
  }
  async open(id, write = false) {
    const db = new PostgresBadgeDatabase(this.source(id).directory, this.pool);
    try {
      await db.checkWorkspace();
      return db;
    } catch (error) {
      await db.close();
      throw error;
    }
  }
  valid(source, row) {
    const key = createPublicKey(
      createPrivateKey(
        readFileSync(join(this.source(source).directory, "issuer-private.pem")),
      ),
    );
    return verify(
      null,
      Buffer.from(row.credential),
      key,
      Buffer.from(row.signature, "base64url"),
    );
  }
  summary(source, row) {
    const credential = JSON.parse(row.credential),
      valid = this.valid(source, row);
    return {
      id: row.id,
      sourceId: source,
      title: credential.achievement.name,
      description: credential.achievement.description || null,
      criteria: credential.achievement.criteria,
      issuer: credential.issuer.name,
      artwork: valid ? credential.achievement.image || null : null,
      issuedAt: row.issued_at,
      status: row.revoked_at ? "revoked" : "issued",
      signatureValid: valid,
      demo: credential.demonstration === true,
      shared: Boolean(row.shared),
      verificationUrl: row.shared
        ? `${this.origin}/verify/${source}/${row.id}`
        : null,
      format: credential.format,
      badgeVersionId: row.badge_version_id || null,
      skills: valid
        ? credential.achievement?.skills ||
          credential.achievement?.design?.skills ||
          []
        : [],
    };
  }
  async list(learner) {
    const badges = [],
      errors = [];
    for (const source of this.sources) {
      let db;
      try {
        db = await this.open(source.id);
        for (const row of await db
          .prepare(
            "SELECT * FROM badges WHERE learner=? ORDER BY issued_at DESC",
          )
          .all(learner))
          badges.push(this.summary(source.id, row));
      } catch {
        errors.push({
          sourceId: source.id,
          message: "Some badges could not be loaded. Please try again.",
        });
      } finally {
        await db?.close();
      }
    }
    badges.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    return { badges, errors, retrievedAt: new Date().toISOString() };
  }
  async owned(source, id, learner) {
    const db = await this.open(source);
    try {
      const row = await db
        .prepare("SELECT * FROM badges WHERE id=? AND learner=?")
        .get(id, learner);
      if (!row) throw new Error("Badge not found");
      return row;
    } finally {
      await db.close();
    }
  }
  async envelope(source, id, learner) {
    const row = await this.owned(source, id, learner),
      credential = JSON.parse(row.credential);
    return {
      format: "cu-pilot-signed-envelope-v1",
      algorithm: "Ed25519",
      kid: credential.issuer.kid,
      payload: Buffer.from(row.credential).toString("base64url"),
      signature: row.signature,
      notice:
        "Local pilot format; not a certified Open Badges credential. Check current issuer status separately.",
    };
  }
  async share(source, id, learner, shared) {
    if (typeof shared !== "boolean")
      throw new Error("shared must be a boolean");
    const db = await this.open(source, true);
    try {
      return await db.transaction(async () => {
        const row = await db
          .prepare("SELECT * FROM badges WHERE id=? AND learner=?")
          .get(id, learner);
        if (!row) throw new Error("Badge not found");
        if (shared && (row.revoked_at || !this.valid(source, row)))
          throw new Error("Only valid, active badges can be shared");
        if (Boolean(row.shared) !== shared) {
          await db
            .prepare("UPDATE badges SET shared=? WHERE id=? AND learner=?")
            .run(shared ? 1 : 0, id, learner);
          await db
            .prepare(
              "INSERT INTO audit(at,action,badge_id,actor) VALUES(?,?,?,?)",
            )
            .run(
              new Date().toISOString(),
              shared ? "sharing-enabled" : "sharing-disabled",
              id,
              "learner:" + learner,
            );
        }
        return this.summary(
          source,
          await db
            .prepare("SELECT * FROM badges WHERE id=? AND learner=?")
            .get(id, learner),
        );
      });
    } finally {
      await db.close();
    }
  }
  async public(source, id) {
    let db;
    try {
      db = await this.open(source);
      const row = await db
        .prepare("SELECT * FROM badges WHERE id=? AND shared=1")
        .get(id);
      return row ? this.summary(source, row) : null;
    } finally {
      await db?.close();
    }
  }
}
