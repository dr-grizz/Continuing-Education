import { createHash, randomUUID, sign } from "node:crypto";
export class AwardError extends Error {}
const fail = (message) => {
  throw new AwardError(message);
};
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const CSV_TEMPLATE =
  'learner_id,reason,evidence_url,recipient_name\r\ndemo-jordan,"Staff reviewed the required work.",,Jordan Morgan\r\n';
export const MAX_ROWS = 500;
// Strict RFC 4180-style reader: quoted commas, escaped quotes, CRLF and embedded newlines.
export function parseAwardCsv(input) {
  if (
    typeof input !== "string" ||
    Buffer.byteLength(input) > 1024 * 1024 ||
    input.includes("\0")
  )
    fail("Upload a UTF-8 CSV file no larger than 1 MB.");
  const text = input.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    field = "",
    quoted = false,
    closed = false;
  const cell = () => {
    row.push(field);
    field = "";
    closed = false;
    if (row.length > 4)
      fail(
        "CSV needs learner_id,reason,evidence_url and optional recipient_name as the fourth column.",
      );
  };
  const line = () => {
    cell();
    if (row.some((v) => v !== "")) rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS + 1)
      fail("A batch can contain at most 500 recipients.");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === ",") cell();
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      line();
    } else if (c === '"' && !field && !closed) quoted = true;
    else {
      if (closed || c === '"') fail("CSV contains an invalid quoted field.");
      field += c;
    }
  }
  if (quoted) fail("CSV contains an unclosed quoted field.");
  if (field || row.length || closed) line();
  const header = rows.shift(),
    certificateHeader = [
      "learner_id",
      "reason",
      "evidence_url",
      "recipient_name",
    ];
  if (
    ![
      JSON.stringify(certificateHeader.slice(0, 3)),
      JSON.stringify(certificateHeader),
    ].includes(JSON.stringify(header))
  )
    fail(
      "CSV needs learner_id,reason,evidence_url and optional recipient_name as the fourth column.",
    );
  if (rows.some((r) => r.length > header.length))
    fail("CSV row contains more columns than its header.");
  if (!rows.length) fail("Add at least one recipient to the CSV.");
  return rows.map((r, i) => ({
    row: i + 2,
    learner: r[0],
    reason: r[1],
    evidenceUrl: r[2],
    recipientName: r[3] || "",
    malformed: r.length !== header.length,
  }));
}
export function reportCsv(batch) {
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^\s*[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      [
        "row",
        "learner_id",
        "status",
        "message",
        "badge_id",
        "batch_id",
        "recipient_name",
        "certificate_id",
      ],
      ...batch.rows.map((r) => [
        r.row,
        r.learner,
        r.status,
        r.message,
        r.badgeId,
        batch.id,
        r.recipientName,
        r.certificateId,
      ]),
    ]
      .map((r) => r.map(cell).join(","))
      .join("\r\n")
  );
}
export class ManualAwards {
  constructor(store, catalog, learners, certificates = null) {
    Object.assign(this, { store, catalog, learners, certificates });
  }
  async version(id) {
    const v = await (
      await this.catalog.versions()
    ).find((v) => v.id === id && ["approved", "active"].includes(v.status));
    if (!v) fail("Select an approved, non-archived badge version.");
    return v;
  }
  fingerprint(version) {
    return digest([
      version.id,
      version.draftId,
      version.revision,
      version.design,
      version.artwork,
    ]);
  }
  async existing(learner, draftId) {
    // A staff attestation never silently creates a second award for the same achievement,
    // even after a design revision or revocation. Course-specific Canvas awards retain their rules.
    return await this.store.db
      .prepare(
        "SELECT * FROM badges WHERE learner=? AND course=? ORDER BY issued_at,id LIMIT 1",
      )
      .get(learner, `badge:${draftId}`);
  }
  async catalogView() {
    return {
      versions: (await this.catalog.versions())
        .filter((v) => ["approved", "active"].includes(v.status))
        .map((v) => ({
          id: v.id,
          title: v.design.title,
          revision: v.revision,
          status: v.status,
          criteria: v.design.criteria,
          artwork: v.artwork,
        })),
      learners: Object.entries(this.learners).map(([id, l]) => ({
        id,
        name: l.displayName || id,
        demonstration: l.demonstration === true,
      })),
      certificateTemplates:
        ((await this.certificates?.templates()) || []).map((t) => ({
          id: t.id,
          name: t.name,
          revision: t.revision,
        })) || [],
      maxRows: MAX_ROWS,
    };
  }
  async preview(body, actor) {
    const v = await this.version(body.versionId);
    const method = body.method;
    const certificate = body.certificateTemplateId
      ? await this.certificates?.template(body.certificateTemplateId)
      : null;
    if (body.certificateTemplateId && !certificate)
      fail("Certificate template not found.");
    if (!["manual", "csv"].includes(method))
      fail("Choose manual entry or CSV upload.");
    let inputs;
    if (method === "csv") inputs = parseAwardCsv(body.csv);
    else
      inputs = [
        {
          row: 1,
          learner: body.learner,
          reason: body.reason,
          evidenceUrl: body.evidenceUrl ?? "",
          recipientName: body.recipientName ?? "",
        },
      ];
    const seen = new Set();
    const rows = await Promise.all(
      inputs.map(async (input) => {
        const r = {
          row: input.row,
          learner:
            typeof input.learner === "string" ? input.learner.trim() : "",
          reason: typeof input.reason === "string" ? input.reason.trim() : "",
          evidenceUrl:
            typeof input.evidenceUrl === "string"
              ? input.evidenceUrl.trim()
              : "",
          recipientName:
            typeof input.recipientName === "string"
              ? input.recipientName.trim()
              : "",
          status: "ready",
          message: "Ready to award",
          badgeId: null,
        };
        if (input.malformed) {
          r.status = "error";
          r.message = "This row must match the CSV header columns.";
        } else if (
          !r.learner ||
          r.learner.length > 200 ||
          !Object.hasOwn(this.learners, r.learner)
        ) {
          r.status = "error";
          r.message = "Unknown learner ID; link the account before awarding.";
        } else if (
          typeof input.reason !== "string" ||
          !r.reason ||
          r.reason.length > 1000
        ) {
          r.status = "error";
          r.message = "Provide an award reason of 1–1,000 characters.";
        } else if (
          typeof input.evidenceUrl !== "string" ||
          r.evidenceUrl.length > 2000 ||
          (r.evidenceUrl && !this.validUrl(r.evidenceUrl))
        ) {
          r.status = "error";
          r.message = "Evidence URL must be an HTTPS link without credentials.";
        } else if (seen.has(r.learner)) {
          r.status = "duplicate";
          r.message =
            "Repeated learner in this file; only the first valid row can issue.";
        } else {
          seen.add(r.learner);
          const existing = await this.existing(r.learner, v.draftId);
          if (existing) {
            r.status = "existing";
            r.badgeId = existing.id;
            r.message = existing.revoked_at
              ? "Existing award is revoked; no replacement will be issued."
              : "Already awarded; no additional badge will be issued.";
          }
        }
        if (r.status === "ready" && certificate) {
          r.recipientName =
            r.recipientName || this.learners[r.learner].displayName || "";
          if (
            !r.recipientName ||
            r.recipientName.length > 120 ||
            /[\u0000-\u001f\u007f]/.test(r.recipientName)
          ) {
            r.status = "error";
            r.message =
              "Add the recipient’s printed name (1–120 characters) for the certificate.";
          }
        }
        if (r.status === "ready")
          r.identityHash = digest(this.learners[r.learner]);
        return r;
      }),
    );
    const id = randomUUID(),
      at = new Date(),
      expires = new Date(+at + 30 * 60 * 1000);
    await this.store.transaction(async () => {
      await this.store.db
        .prepare(
          "INSERT INTO award_batches(id,actor,method,created_at,expires_at,version_id,snapshot_hash,state,rows_json) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          actor,
          method,
          at.toISOString(),
          expires.toISOString(),
          v.id,
          this.fingerprint(v),
          "preview",
          JSON.stringify(rows),
        );
      if (certificate)
        await this.store.db
          .prepare("UPDATE award_batches SET certificate_json=? WHERE id=?")
          .run(JSON.stringify(certificate), id);
      await this.store.audit("award-preview", null, actor);
    });
    return await this.get(id, actor);
  }
  async preflight(id, actor) {
    const b = await this.get(id, actor);
    if (b.state === "completed" || !b.certificate || !b.counts.ready) return;
    const v = await this.version(b.versionId);
    await this.certificates.validateBatch(
      b.certificate,
      b.rows.filter((r) => r.status === "ready").map((r) => r.recipientName),
      v.design.title,
      v.design.issuer,
    );
  }
  validUrl(text) {
    try {
      const u = new URL(text);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }
  async get(id, actor) {
    const b = await this.store.db
      .prepare("SELECT * FROM award_batches WHERE id=? AND actor=?")
      .get(id, actor);
    if (!b) fail("Award preview not found for this staff account.");
    const v = await (
      await this.catalog.versions()
    ).find((v) => v.id === b.version_id);
    const rows = JSON.parse(b.rows_json).map(({ identityHash, ...r }) => r);
    return {
      id: b.id,
      actor: b.actor,
      method: b.method,
      state: b.state,
      createdAt: b.created_at,
      expiresAt: b.expires_at,
      completedAt: b.completed_at,
      versionId: b.version_id,
      title: v?.design.title,
      revision: v?.revision,
      certificate: b.certificate_json ? JSON.parse(b.certificate_json) : null,
      rows,
      counts: Object.fromEntries(
        ["ready", "error", "duplicate", "existing", "issued"].map((s) => [
          s,
          rows.filter((r) => r.status === s).length,
        ]),
      ),
    };
  }
  async history(actor) {
    return await Promise.all(
      (
        await this.store.db
          .prepare(
            "SELECT id FROM award_batches WHERE actor=? ORDER BY created_at DESC,rowid DESC LIMIT 20",
          )
          .all(actor)
      ).map(async (b) => {
        const { rows, certificate, ...summary } = await this.get(b.id, actor);
        return {
          ...summary,
          certificate: certificate
            ? {
                id: certificate.id,
                name: certificate.name,
                revision: certificate.revision,
              }
            : null,
        };
      }),
    );
  }
  async commit(id, actor, confirmed) {
    if (confirmed !== true)
      fail(
        "Confirm that you reviewed the ready recipients and earning criteria.",
      );
    return await this.store.transaction(async () => {
      const b = await this.store.db
        .prepare("SELECT * FROM award_batches WHERE id=? AND actor=?")
        .get(id, actor);
      if (!b) fail("Award preview not found for this staff account.");
      if (b.state === "completed") return await this.get(id, actor);
      if (Date.parse(b.expires_at) <= Date.now())
        fail("This preview expired. Create a new preview.");
      const v = await this.version(b.version_id);
      if (this.fingerprint(v) !== b.snapshot_hash)
        fail("Badge changed. Create a new preview.");
      const rows = JSON.parse(b.rows_json),
        certificate = b.certificate_json
          ? JSON.parse(b.certificate_json)
          : null;
      if (
        certificate &&
        (await this.certificates?.template(certificate.id)).revision !==
          certificate.revision
      )
        fail("Certificate template changed. Create a new preview.");
      for (const r of rows.filter((r) => r.status === "ready")) {
        if (
          !Object.hasOwn(this.learners, r.learner) ||
          digest(this.learners[r.learner]) !== r.identityHash
        )
          fail("A learner mapping changed. Create a new preview.");
        const existing = await this.existing(r.learner, v.draftId);
        if (existing) {
          r.status = "existing";
          r.badgeId = existing.id;
          r.message = "Already awarded; no additional badge issued.";
          await this.store.audit("duplicate-skipped", existing.id, actor);
          continue;
        }
        const badgeId = randomUUID(),
          issuedAt = new Date().toISOString();
        const evidence = {
          source: "manual-attestation",
          observedAt: issuedAt,
          method: b.method,
          actor,
          reason: r.reason,
          evidenceUrl: r.evidenceUrl || null,
          batchId: id,
        };
        const credential = JSON.stringify({
          format: "cu-pilot-credential-v1",
          id: `${this.store.baseUrl}/verify/${badgeId}`,
          issuer: {
            name: v.design.issuer,
            publicKey: `${this.store.baseUrl}/.well-known/jwks.json`,
            kid: this.store.kid,
          },
          subject: `urn:uuid:${randomUUID()}`,
          issuedAt,
          demonstration: this.learners[r.learner].demonstration === true,
          achievement: {
            id: `badge:${v.draftId}`,
            version: v.id,
            revision: v.revision,
            name: v.design.title,
            description: v.design.description,
            criteria: v.design.criteria,
            image: v.artwork,
            design: v.design,
          },
          issuance: {
            method: b.method === "csv" ? "staff-csv" : "staff-manual",
          },
        });
        const signature = sign(
          null,
          Buffer.from(credential),
          this.store.privateKey,
        ).toString("base64url");
        const awardKey = digest(["manual", r.learner, v.draftId]);
        await this.store.db
          .prepare(
            "INSERT INTO badges(id,learner,course,rule_version,issued_at,credential,signature,evidence,badge_version_id,award_key) VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            badgeId,
            r.learner,
            `badge:${v.draftId}`,
            "manual-v1",
            issuedAt,
            credential,
            signature,
            JSON.stringify(evidence),
            v.id,
            awardKey,
          );
        if (certificate)
          r.certificateId = (
            await this.certificates.insert(
              "workspace",
              await this.store.get(badgeId),
              certificate,
              r.recipientName,
              actor,
            )
          ).id;
        await this.store.audit("issued", badgeId, actor);
        r.status = "issued";
        r.badgeId = badgeId;
        r.message = "Issued privately; available in My Badges.";
      }
      await this.store.db
        .prepare(
          "UPDATE award_batches SET state='completed',rows_json=?,completed_at=? WHERE id=?",
        )
        .run(JSON.stringify(rows), new Date().toISOString(), id);
      await this.store.audit("award-batch-completed", null, actor);
      return await this.get(id, actor);
    });
  }
}
