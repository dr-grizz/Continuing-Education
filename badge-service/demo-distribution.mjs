import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { saveDraft, defaultDesign } from "./designs.mjs";
import { defaultCertificate } from "./certificates.mjs";
export const distributionSamples = [
  {
    badgeLearner: "demo-distribution-alex",
    name: "Alex Morgan (Demo)",
    email: "ce-qr-alex@example.test",
  },
  {
    badgeLearner: "demo-distribution-jordan",
    name: "Jordan Rivera (Demo)",
    email: "ce-qr-jordan@example.test",
  },
];
export async function seedDistributionDemo({
  store,
  certificates,
  catalog,
  manual,
  distribution,
  linksFile,
}) {
  for (const sample of distributionSamples) {
    const approved = store.config.learners[sample.badgeLearner];
    if (
      !approved ||
      approved.demonstration !== true ||
      approved.canvasUserId !== null
    )
      throw new Error(
        "Demo learner IDs must be explicitly approved as fictional and have no Canvas identity.",
      );
  }
  let original = null,
    links = {};
  try {
    original = readFileSync(linksFile, "utf8");
    links = JSON.parse(original);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!links || typeof links !== "object" || Array.isArray(links))
    throw new Error("Invalid private learner-link file; source preserved.");
  const result = await store.transaction(async () => {
    const learners = [];
    for (const sample of distributionSamples) {
      await store.db.query(
        "INSERT INTO learners(email,display_name) VALUES($1,$2) ON CONFLICT(email) DO NOTHING",
        [sample.email, sample.name],
      );
      const learner = (
        await store.db.query(
          "SELECT id,active,auth_provider,display_name FROM learners WHERE email=$1",
          [sample.email],
        )
      ).rows[0];
      if (
        !learner?.active ||
        learner.auth_provider !== "mock" ||
        learner.display_name !== sample.name
      )
        throw new Error(
          "A sample email belongs to a different or inactive account; no existing account will be modified.",
        );
      if (
        (links[learner.id] && links[learner.id] !== sample.badgeLearner) ||
        Object.entries(links).some(
          ([id, value]) => id !== learner.id && value === sample.badgeLearner,
        )
      )
        throw new Error(
          "A sample learner already has a conflicting identity link; source preserved.",
        );
      links[learner.id] = sample.badgeLearner;
      learners.push({ ...sample, portalId: learner.id });
    }
    let marker = await store.db
      .prepare("SELECT value FROM metadata WHERE key='distribution-demo-v1'")
      .get();
    if (marker) marker = JSON.parse(marker.value);
    else {
      const draft = await saveDraft(store.db, {
        ...defaultDesign,
        title: "DEMO · Foundations of Faith and Work",
        issuer: "Cedarville University · Demonstration",
        label: "DEMO",
        description:
          "Fictional records for demonstrating credential distribution.",
        criteria: "Demonstration only: no real course completion is asserted.",
      });
      const version = await catalog.approve(
        draft.id,
        draft.revision,
        "local-demo-seed",
      );
      const template = await certificates.save(
        {
          name: "DEMO · Completion certificate",
          design: {
            ...defaultCertificate,
            header: "FICTIONAL DEMONSTRATION",
            title: "Demo Certificate of Completion",
            footer: "SAMPLE ONLY · Not evidence of real course completion",
          },
        },
        "local-demo-seed",
      );
      marker = { versionId: version.id, templateId: template.id };
      await store.db
        .prepare(
          "INSERT INTO metadata(key,value) VALUES('distribution-demo-v1',?)",
        )
        .run(JSON.stringify(marker));
    }
    const csv =
      "learner_id,reason,evidence_url,recipient_name\n" +
      learners
        .map(
          (l) =>
            `${l.badgeLearner},Fictional fixture for demonstrating badge and certificate distribution.,,${l.name}`,
        )
        .join("\n");
    const preview = await manual.preview(
      {
        method: "csv",
        versionId: marker.versionId,
        certificateTemplateId: marker.templateId,
        csv,
      },
      "local-demo-seed",
    );
    await manual.preflight(preview.id, "local-demo-seed");
    const batch = await manual.commit(preview.id, "local-demo-seed", true),
      awards = [];
    for (const row of batch.rows) {
      const cert = await certificates.find("workspace", row.badgeId);
      if (!cert)
        throw new Error(
          "The sample accomplishment must retain its attached certificate.",
        );
      awards.push({
        learner: row.learner,
        badgeId: row.badgeId,
        certificateId: cert.id,
      });
    }
    return { learners, awards, ...marker };
  });
  // Database seed is retryable if the private file write is interrupted. Never
  // overwrite an identity map that changed while the records were being seeded.
  let latest = null;
  try {
    latest = readFileSync(linksFile, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (latest !== original)
    throw new Error(
      "The private learner map changed during seeding. Rerun to reconcile; it was not overwritten.",
    );
  const temporary = linksFile + "." + randomBytes(8).toString("hex") + ".tmp";
  try {
    writeFileSync(temporary, JSON.stringify(links, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, linksFile);
  } finally {
    try {
      unlinkSync(temporary);
    } catch {}
  }
  const claims = [];
  for (const [index, kind] of [
    [0, "both"],
    [1, "badge"],
    [1, "certificate"],
  ])
    claims.push(
      await distribution.create(
        {
          sourceId: "workspace",
          badgeId: result.awards[index].badgeId,
          kind,
          days: 7,
          confirmed: true,
        },
        "local-demo-seed",
      ),
    );
  return {
    ...result,
    claims: claims.map((c) => ({
      id: c.id,
      kind: c.kind,
      learner: c.learnerId,
    })),
  };
}
