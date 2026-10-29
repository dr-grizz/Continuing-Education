import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { db } from "../src/domain/db";
async function main() {
  if (
    process.env.PROTOTYPE_MODE !== "true" ||
    process.env.BADGE_DEMO === "false" ||
    process.env.LEARNER_AUTH_MODE === "canvas" ||
    process.env.HOSTED_DEMO === "true" ||
    process.env.NODE_ENV === "production"
  )
    throw new Error(
      "Sample records are restricted to the local mock-identity prototype.",
    );
  const { BadgeStore } = require("../badge-service/core.mjs");
  const { LearnerAwards } = require("../badge-service/learners.mjs");
  const { Certificates } = require("../badge-service/certificates.mjs");
  const { PublishingCatalog } = require("../badge-service/publishing.mjs");
  const { ManualAwards } = require("../badge-service/manual-awards.mjs");
  const {
    CredentialDistribution,
  } = require("../badge-service/distribution.mjs");
  const {
    CertificateRecipients,
  } = require("../badge-service/certificate-email.mjs");
  const {
    seedDistributionDemo,
  } = require("../badge-service/demo-distribution.mjs");
  const directory = resolve(process.env.BADGE_DATA_DIR || "badge-service/data");
  const config = JSON.parse(
    readFileSync(
      process.env.BADGE_CONFIG || "badge-service/config.example.json",
      "utf8",
    ),
  );
  const origin = `http://127.0.0.1:${process.env.API_PORT || 3051}`;
  const store = await BadgeStore.open(directory, config, origin, "demo", db);
  try {
    const sources = [
      { id: "workspace", name: "Local demo", directory, pool: db },
    ];
    // Sample generation deliberately performs no email-provider or Canvas calls.
    const certificates = new Certificates(
      store,
      new LearnerAwards(sources, origin, db),
      config.learners,
    );
    const catalog = new PublishingCatalog(store),
      manual = new ManualAwards(store, catalog, config.learners, certificates);
    const linksFile = resolve(
      process.env.BADGE_LEARNER_MAP_FILE ||
        join(directory, "portal-learners.json"),
    );
    mkdirSync(resolve(linksFile, ".."), { recursive: true, mode: 0o700 });
    const key = join(directory, "claim-code-key");
    const { existsSync } = require("node:fs"),
      { randomBytes } = require("node:crypto");
    if (!existsSync(key))
      writeFileSync(key, randomBytes(32).toString("hex"), {
        flag: "wx",
        mode: 0o600,
      });
    const distribution = new CredentialDistribution({
      store,
      certificates,
      learners: config.learners,
      sources,
      secret: readFileSync(key, "utf8").trim(),
      recipients: new CertificateRecipients(store.db, linksFile),
    });
    const result = await seedDistributionDemo({
      store,
      certificates,
      catalog,
      manual,
      distribution,
      linksFile,
    });
    writeFileSync(
      join(directory, "distribution-demo-records.json"),
      JSON.stringify(result, null, 2) + "\n",
      { mode: 0o600 },
    );
    console.log(
      "Demo ready: two fictional learners, two badges with attached certificates, and three recipient-bound distributions. No email was sent.",
    );
    console.log(
      "Demo learner sign-in emails: ce-qr-alex@example.test and ce-qr-jordan@example.test",
    );
  } finally {
    await store.close();
  }
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
