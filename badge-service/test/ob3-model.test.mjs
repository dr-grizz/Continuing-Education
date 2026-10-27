import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildUnsignedOpenBadge,
  validateUnsignedOpenBadge,
  loadPinnedOb3Document,
  OB3_CONTEXTS,
} from "../ob3-model.mjs";
import { syntheticModelInput } from "../standards/ob3/synthetic-input.mjs";
import { BadgeStore, fixture } from "../core.mjs";
import { initializeDrafts, saveDraft } from "../designs.mjs";
import { PublishingCatalog } from "../publishing.mjs";
const config = JSON.parse(
  readFileSync(new URL("../config.example.json", import.meta.url)),
);
function temporary(t) {
  const dir = mkdtempSync(join(tmpdir(), "cu-ob3-model-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test("canonical unsigned model maps approved metadata, embedded artwork and opaque subject without leaking internal input", async () => {
  const input = syntheticModelInput();
  input.recipientRegistry[input.learnerId].canvasUserId = 123;
  input.recipientRegistry[input.learnerId].email =
    "synthetic-person@example.invalid";
  input.privateEvidence = { score: 9 };
  const original = JSON.stringify(input),
    model = buildUnsignedOpenBadge(input);
  assert.equal(JSON.stringify(input), original);
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.credentialSubject.achievement), true);
  assert.equal(model.name, input.badgeVersion.design.title);
  assert.equal(model.description, input.badgeVersion.design.description);
  assert.equal(
    model.credentialSubject.achievement.criteria.narrative,
    input.badgeVersion.design.criteria,
  );
  assert.equal(model.issuer.name, input.badgeVersion.design.issuer);
  assert.equal(
    model.credentialSubject.id,
    input.recipientRegistry[input.learnerId].subjectId,
  );
  assert.equal(
    Buffer.from(model.image.id.split(",")[1], "base64").toString(),
    input.badgeVersion.artwork,
  );
  assert.deepEqual(model["@context"], OB3_CONTEXTS);
  const raw = JSON.stringify(model);
  for (const privateValue of [
    "synthetic-learner-001",
    "synthetic-person@example.invalid",
    "canvasUserId",
    "privateEvidence",
    "score",
    "verifiedAt",
  ])
    assert.equal(raw.includes(privateValue), false);
  const result = await validateUnsignedOpenBadge(model);
  assert.equal(result.valid, true);
  assert.equal(result.schemaValid, true);
  assert.equal(result.jsonLdValid, true);
  assert.equal(result.proofVerified, false);
  assert.equal(result.statusChecked, false);
  assert.equal(result.issuerAuthorityVerified, false);
});
test("model uses actual frozen catalogue version after draft revision and never modifies an existing award", async (t) => {
  const store = await BadgeStore.open(
    temporary(t),
    config,
    "http://127.0.0.1:4178",
  );
  t.after(async () => await store.close());
  initializeDrafts(store.db);
  const catalogue = new PublishingCatalog(store),
    input = syntheticModelInput();
  const draft = await saveDraft(store.db, input.badgeVersion.design),
    version = await catalogue.approve(draft.id, 1, "test");
  const old = (await store.issue("demo-alex", fixture("complete"), "test"))
    .badge;
  const before = JSON.stringify(await store.get(old.id));
  const from = new Date(Date.parse(version.approvedAt) + 1000).toISOString();
  const original = buildUnsignedOpenBadge({
    ...input,
    badgeVersion: version,
    validFrom: from,
  });
  await saveDraft(
    store.db,
    {
      ...draft.design,
      title: "A later unpublished design",
      description: "Not the approved description",
    },
    draft.id,
    1,
  );
  const changes = (
    await store.db.prepare("SELECT COUNT(*) AS n FROM audit").get()
  ).n;
  const replay = buildUnsignedOpenBadge({
    ...input,
    badgeVersion: await (
      await catalogue.versions()
    ).find((v) => v.id === version.id),
    validFrom: from,
  });
  assert.deepEqual(replay, original);
  assert.equal(replay.credentialSubject.achievement.version, "1");
  assert.ok(replay.credentialSubject.achievement.id.endsWith(version.id));
  assert.equal(
    (await store.db.prepare("SELECT COUNT(*) AS n FROM audit").get()).n,
    changes,
  );
  assert.equal(JSON.stringify(await store.get(old.id)), before);
  assert.equal((await validateUnsignedOpenBadge(replay)).valid, true);
  await catalogue.archive(version.id, "test");
  await assert.rejects(
    async () =>
      buildUnsignedOpenBadge({
        ...input,
        badgeVersion: (await catalogue.versions())[0],
        validFrom: from,
      }),
    /approved/,
  );
});
test("unapproved versions, mismatched issuer and unverified or unstable recipients are rejected", async () => {
  const bad = [
    (i) => (i.badgeVersion.status = "draft"),
    (i) => (i.badgeVersion.revision = 0),
    (i) => (i.badgeVersion.artwork = ""),
    (i) => (i.badgeVersion.design.criteria = ""),
    (i) => (i.issuer.name = "A different issuer"),
    (i) => (i.issuer.id = "http://example.invalid/issuer"),
    (i) =>
      (i.credentialId =
        "https://other.example.invalid/credentials/b3a10000-0000-4000-8000-000000000003"),
    (i) =>
      (i.credentialId =
        "https://badges.example.invalid/credentials/private-sis-id"),
    (i) => delete i.recipientRegistry[i.learnerId],
    (i) => (i.recipientRegistry[i.learnerId].verified = false),
    (i) =>
      (i.recipientRegistry[i.learnerId].subjectId =
        "mailto:synthetic@example.invalid"),
    (i) =>
      (i.recipientRegistry[i.learnerId].method = "unverified-browser-input"),
    (i) =>
      (i.recipientRegistry[i.learnerId].verifiedAt = "2027-01-01T00:00:00Z"),
  ];
  for (const change of bad) {
    const input = syntheticModelInput();
    change(input);
    await assert.rejects(async () => buildUnsignedOpenBadge(input));
  }
});
test("schema validation rejects missing required structures, invalid dates and malformed image types", async () => {
  const mutations = [
    (m) => delete m.validFrom,
    (m) => delete m.credentialSubject,
    (m) => delete m.credentialSubject.achievement.description,
    (m) => (m.validFrom = "2026-02-30T12:00:00Z"),
    (m) => (m.validFrom = "2026-10-14"),
    (m) => (m.credentialSubject.achievement.image.type = "Logo"),
  ];
  for (const change of mutations) {
    const model = structuredClone(
      buildUnsignedOpenBadge(syntheticModelInput()),
    );
    change(model);
    const result = await validateUnsignedOpenBadge(model);
    assert.equal(result.valid, false);
    assert.equal(result.schemaValid, false);
    assert.ok(result.errors.some((e) => e.source === "official-schema"));
  }
});
test("canonical profile closes schema gaps for recipient IDs, context changes, extra private fields and fake proofs", async () => {
  const changes = [
    (m) => delete m.credentialSubject.id,
    (m) => (m.type = "UnrecognisedCredential"),
    (m) => (m.credentialSubject.type = "WrongSubjectType"),
    (m) => (m.credentialSubject.achievement.type = "WrongAchievementType"),
    (m) => m["@context"].push("https://untrusted.example.invalid/context"),
    (m) => (m.evidence = { narrative: "Private grades" }),
    (m) => (m.credentialSubject.canvasUserId = 123),
    (m) => (m.proof = {}),
    (m) =>
      (m.credentialSubject.achievement.image.id =
        "https://somewhere.example.invalid/a-new-draft.svg"),
    (m) => (m.credentialSubject.achievement.name = "Wrong badge title"),
  ];
  for (const change of changes) {
    const model = structuredClone(
      buildUnsignedOpenBadge(syntheticModelInput()),
    );
    change(model);
    const result = await validateUnsignedOpenBadge(model);
    assert.equal(result.valid, false);
    assert.equal(result.jsonLdValid, false);
    assert.ok(result.errors.some((e) => e.source === "cu-model-profile"));
  }
});
test("validity periods and prior approval are enforced without claiming present-day verification", async () => {
  const input = syntheticModelInput();
  input.validFrom = "2026-10-14T14:00:00+02:00";
  input.validUntil = "2027-10-14T12:00:00Z";
  const model = buildUnsignedOpenBadge(input);
  assert.equal(model.validFrom, "2026-10-14T12:00:00.000Z");
  assert.equal((await validateUnsignedOpenBadge(model)).valid, true);
  for (const until of [
    "2026-10-14T12:00:00Z",
    "2025-10-14T12:00:00Z",
    "invalid",
  ])
    await assert.rejects(async () =>
      buildUnsignedOpenBadge({ ...input, validUntil: until }),
    );
  await assert.rejects(
    async () =>
      buildUnsignedOpenBadge({ ...input, validFrom: "2020-01-01T00:00:00Z" }),
    /before/,
  );
  const copy = structuredClone(model);
  copy.validUntil = "2025-10-14T12:00:00Z";
  assert.equal((await validateUnsignedOpenBadge(copy)).valid, false);
});
test("JSON-LD validation resolves only checksum-pinned local documents and works without network fetch", async () => {
  await assert.rejects(
    async () =>
      loadPinnedOb3Document("https://untrusted.example.invalid/context"),
    /Unpinned/,
  );
  const context = await loadPinnedOb3Document(OB3_CONTEXTS[1]);
  context.document["@context"].name = "changed";
  const fresh = await loadPinnedOb3Document(OB3_CONTEXTS[1]);
  assert.notEqual(fresh.document["@context"].name, "changed");
  const previous = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Network access is forbidden in this test");
  };
  try {
    assert.equal(
      (
        await validateUnsignedOpenBadge(
          buildUnsignedOpenBadge(syntheticModelInput()),
        )
      ).jsonLdValid,
      true,
    );
  } finally {
    globalThis.fetch = previous;
  }
});
test("CLI saves a round-trippable unsigned fixture and exits nonzero on invalid models", (t) => {
  const directory = temporary(t),
    cli = fileURLToPath(new URL("../ob3-model-cli.mjs", import.meta.url));
  const example = spawnSync(process.execPath, [cli, "example", directory], {
    encoding: "utf8",
  });
  assert.equal(example.status, 0, example.stderr);
  const file = join(directory, "synthetic-unsigned-credential.json"),
    report = JSON.parse(
      readFileSync(join(directory, "validation-report.json")),
    );
  assert.equal(report.synthetic, true);
  assert.equal(report.proofVerified, false);
  assert.equal(spawnSync(process.execPath, [cli, "validate", file]).status, 0);
  const malformed = JSON.parse(readFileSync(file));
  delete malformed.issuer;
  writeFileSync(file, JSON.stringify(malformed));
  assert.equal(spawnSync(process.execPath, [cli, "validate", file]).status, 1);
});
