import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { badgeProxy, badgeRoute } from "../src/web/server/badges";
const { createApp } = require("../badge-service/server.mjs");
const { defaultDesign } = require("../badge-service/designs.mjs");
const { defaultCertificate } = require("../badge-service/certificates.mjs");
const staffId = "10000000-0000-4000-8000-000000000001";
const otherStaffId = "10000000-0000-4000-8000-000000000002";
const learnerId = "20000000-0000-4000-8000-000000000001";
const otherLearnerId = "20000000-0000-4000-8000-000000000002";
const unlinkedId = "20000000-0000-4000-8000-000000000003";
const listen = async (server: any) => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${server.address().port}`;
};
let checks = 0;
function equal(actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected);
  checks++;
}
async function main() {
  const directory = mkdtempSync(join(tmpdir(), "ce-badge-integration-"));
  let scope = true,
    active = true,
    authMode = "mock",
    learnerActive = true,
    learnerMode = "mock",
    learnerConfigured = true,
    learnerSecureCookies = false,
    mismatchedLearner = false;
  // Explicitly mocked identity-provider boundary; the real pilot service, SQLite,
  // cryptographic signing, certificate renderer and Next broker run below.
  const identity = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/v1/auth/staff/config")
      return res.end(
        JSON.stringify({
          mode: authMode,
          configured: true,
          secureCookies: false,
          portalOrigin: "http://127.0.0.1:3052",
        }),
      );
    if (req.url === "/api/v1/auth/learner/config")
      return res.end(
        JSON.stringify({
          mode: learnerMode,
          configured: learnerConfigured,
          secureCookies: learnerSecureCookies,
          portalOrigin: "http://127.0.0.1:3052",
        }),
      );
    if (
      req.url === "/api/v1/staff/me" &&
      (req.headers["x-prototype-staff-id"] ||
        req.headers["x-staff-session"] === "verified-canvas-session")
    )
      return res.end(
        JSON.stringify({
          id: req.headers["x-prototype-staff-id"] || staffId,
          active,
          scopes: scope ? ["staff:read", "badges:manage"] : ["staff:read"],
        }),
      );
    if (
      req.url === "/api/v1/me" &&
      learnerActive &&
      (learnerMode === "mock"
        ? req.headers["x-prototype-learner-id"]
        : req.headers["x-learner-session"] === "verified-learner-session")
    )
      return res.end(
        JSON.stringify({
          id: mismatchedLearner
            ? otherLearnerId
            : learnerMode === "canvas"
              ? learnerId
              : req.headers["x-prototype-learner-id"],
          email: null,
        }),
      );
    res.writeHead(401);
    res.end(JSON.stringify({ message: "Sign-in required" }));
  });
  const api = await listen(identity);
  // Reserve a port so the service's Host validation uses the actual listener.
  const reservation = createServer();
  const reserved = await listen(reservation);
  await new Promise<void>((r) => reservation.close(() => r()));
  const app = await createApp({
    directory,
    baseUrl: reserved,
    writerToken: "test-writer",
    readerToken: "test-reader",
    awardToken: "test-awarder",
    onetOptions: {
      apiKey: "private-onet-test-key",
      fetcher: async (url: string) =>
        Response.json(
          url.includes("online/search")
            ? {
                occupation: [
                  { code: "25-9031.00", title: "Instructional Coordinators" },
                ],
              }
            : {
                outlook: {
                  category: "Bright",
                  description: "Original provider wording.",
                },
              },
        ),
    },
  });
  await new Promise<void>((r) =>
    app.server.listen(Number(new URL(reserved).port), "127.0.0.1", r),
  );
  writeFileSync(join(directory, "portal-award-token"), "test-awarder");
  writeFileSync(join(directory, "portal-token"), "test-reader");
  writeFileSync(
    join(directory, "portal-learners.json"),
    JSON.stringify({
      [learnerId]: "demo-alex",
      [otherLearnerId]: "demo-jordan",
    }),
  );
  Object.assign(process.env, {
    PROTOTYPE_MODE: "true",
    BADGES_ENABLED: "true",
    BADGE_SERVICE_URL: reserved,
    BADGE_DATA_DIR: directory,
    BADGE_LEARNER_MAP_FILE: join(directory, "portal-learners.json"),
    API_URL: api,
    STAFF_API_TOKEN: "test-portal-staff",
    LEARNER_API_TOKEN: "test-portal-learner",
    WEB_URL: "http://127.0.0.1:3052",
  });
  const call = (
    route: string,
    body?: unknown,
    cookie = `ce-demo-staff=${staffId}`,
    origin = "http://127.0.0.1:3052",
  ) =>
    badgeProxy(
      new NextRequest(`http://127.0.0.1:3052/api/badges/${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { cookie, origin, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      route.split("/"),
    );
  try {
    const officialLogo = await fetch(`${reserved}/onet-in-it.svg`);
    equal(officialLogo.status, 200);
    equal(
      officialLogo.headers.get("content-type"),
      "image/svg+xml; charset=utf-8",
    );
    equal((await call("public/skills/catalog", undefined, "")).status, 200);
    equal((await call("admin/skills/catalog", undefined, "")).status, 401);
    equal((await call("admin/skills/catalog")).status, 200);
    const onetStatus = await call("public/skills/onet/status", undefined, "");
    equal(onetStatus.status, 200);
    equal((await onetStatus.json()).configured, true);
    const careerSearch = await call(
      "public/skills/onet/search",
      { query: "teaching" },
      "",
    );
    equal(careerSearch.status, 200);
    equal((await careerSearch.json()).occupations[0].code, "25-9031.00");
    const outlook = await call(
      "public/skills/onet/outlook",
      { code: "25-9031.00" },
      "",
    );
    equal(outlook.status, 200);
    equal(
      (await outlook.json()).outlook.description,
      "Original provider wording.",
    );
    equal(
      (await call("public/skills/onet/outlook", { code: "../private" }, ""))
        .status,
      400,
    );
    equal(
      (
        await call(
          "public/skills/onet/search",
          { query: "teaching" },
          "",
          "https://outside.example",
        )
      ).status,
      403,
    );
    equal((await call("public/skills/onet/arbitrary", {}, "")).status, 404);
    equal(
      (await call("public/skills/search", { query: "Critical" }, "")).status,
      200,
    );
    equal(
      (
        await call(
          "public/skills/occupations",
          { skills: [null], region: "US" },
          "",
        )
      ).status,
      400,
    );
    equal(
      (
        await call(
          "public/skills/occupations",
          { skills: [], region: "US" },
          "",
        )
      ).status,
      200,
    );
    equal((await call("admin/catalog", undefined, "")).status, 401);
    scope = false;
    equal((await call("admin/catalog")).status, 403);
    scope = true;
    active = false;
    equal((await call("admin/catalog")).status, 403);
    active = true;
    equal((await call("admin/login", {})).status, 404);
    equal((await call("admin/learner-preview", {})).status, 404);
    equal((await call("../health")).status, 404);
    equal(
      (
        await call(
          "admin/versions/approve",
          {},
          undefined,
          "https://outside.example",
        )
      ).status,
      403,
    );
    equal(
      (await call("admin/versions/approve", {}, undefined, "")).status,
      403,
    );
    equal(
      (await call("admin/catalog", undefined, `ce-demo-learner=${learnerId}`))
        .status,
      401,
    );
    authMode = "canvas";
    equal((await call("admin/catalog")).status, 401);
    equal(
      (
        await call(
          "admin/catalog",
          undefined,
          "ce-staff-session=verified-canvas-session",
        )
      ).status,
      200,
    );
    authMode = "mock";
    equal((await fetch(reserved + "/api/portal-admin/catalog")).status, 401);
    equal(
      (
        await fetch(reserved + "/api/portal-admin/catalog", {
          headers: {
            Authorization: "Bearer test-reader",
            "X-CU-Staff-Id": `portal:${staffId}`,
          },
        })
      ).status,
      401,
    );
    equal((await call("admin/catalog")).status, 200);
    const draftResponse = await call("designer/drafts", {
      design: {
        ...defaultDesign,
        title: "Portal integration test",
        description: "Synthetic integration badge",
        criteria: "Staff verified the synthetic activity.",
      },
    });
    equal(draftResponse.status, 201);
    const draft = await draftResponse.json();
    const approved = await call("admin/versions/approve", {
      draftId: draft.id,
      revision: draft.revision,
      actor: "forged",
    });
    equal(approved.status, 201);
    const version = await approved.json();
    equal(version.approvedBy, `portal:${staffId}`);
    const preview = await (
      await call("admin/awards/preview", {
        method: "manual",
        versionId: version.id,
        learner: "demo-alex",
        reason: "Completed synthetic integration exercise",
        actor: "forged",
      })
    ).json();
    equal(preview.counts.ready, 1);
    equal(
      (
        await call(
          `admin/awards/${preview.id}`,
          undefined,
          `ce-demo-staff=${otherStaffId}`,
        )
      ).status,
      400,
    );
    const committed = await (
      await call(`admin/awards/${preview.id}/commit`, {
        confirmed: true,
        actor: "forged",
      })
    ).json();
    equal(committed.counts.issued, 1);
    equal(
      await (
        await call(`admin/awards/${preview.id}/commit`, { confirmed: true })
      ).json(),
      committed,
    );
    const mine = `ce-demo-learner=${learnerId}`,
      other = `ce-demo-learner=${otherLearnerId}`;
    equal((await call("me/badges", undefined, "")).status, 401);
    equal(
      (await call("me/badges", undefined, `ce-demo-learner=${unlinkedId}`))
        .status,
      403,
    );
    learnerActive = false;
    equal((await call("me/badges", undefined, mine)).status, 401);
    ((learnerActive = true),
      (learnerMode = "mock"),
      (learnerConfigured = true),
      (learnerSecureCookies = false),
      (mismatchedLearner = false));
    mismatchedLearner = true;
    equal((await call("me/badges", undefined, mine)).status, 403);
    mismatchedLearner = false;
    learnerMode = "canvas";
    equal((await call("me/badges", undefined, mine)).status, 401);
    equal(
      (await call("me/badges", undefined, `ce-demo-staff=${staffId}`)).status,
      401,
    );
    const canvas = "ce-learner-session=verified-learner-session";
    equal((await call("me/badges", undefined, canvas)).status, 200);
    equal(
      (await (await call("me/badges", undefined, canvas)).json()).badges.length,
      1,
    );
    equal(
      (await call("me/badges", undefined, "ce-learner-session=revoked")).status,
      401,
    );
    learnerActive = false;
    equal((await call("me/badges", undefined, canvas)).status, 401);
    learnerActive = true;
    learnerConfigured = false;
    equal((await call("me/badges", undefined, canvas)).status, 503);
    learnerConfigured = true;
    learnerSecureCookies = true;
    equal((await call("me/badges", undefined, canvas)).status, 401);
    equal(
      (
        await call(
          "me/badges",
          undefined,
          "__Host-ce-learner-session=verified-learner-session",
        )
      ).status,
      200,
    );
    learnerSecureCookies = false;
    learnerMode = "mock";
    const collection = await (await call("me/badges", undefined, mine)).json();
    equal(collection.badges.length, 1);
    const badge = collection.badges[0];
    equal(badge.signatureValid, true);
    equal(badge.shared, false);
    equal(
      (await (await call("me/badges", undefined, other)).json()).badges.length,
      0,
    );
    equal(
      (await call(`me/badges/workspace/${badge.id}/download`, undefined, other))
        .status,
      404,
    );
    equal(
      (await call(`me/badges/workspace/${badge.id}/download`, undefined, mine))
        .status,
      200,
    );
    equal(
      (await call(`public/workspace/${badge.id}`, undefined, "")).status,
      404,
    );
    const shared = await (
      await call(
        `me/badges/workspace/${badge.id}/sharing`,
        { shared: true },
        mine,
      )
    ).json();
    equal(
      shared.verificationUrl,
      `http://127.0.0.1:3052/verify/badges/workspace/${badge.id}`,
    );
    const publicBadge = await (
      await call(`public/workspace/${badge.id}`, undefined, "")
    ).json();
    equal(Object.hasOwn(publicBadge, "learnerId"), false);
    equal(
      (
        await call(
          `me/badges/workspace/${badge.id}/sharing`,
          { shared: false, learner: "demo-jordan" },
          mine,
        )
      ).status,
      400,
    );
    await call(
      `me/badges/workspace/${badge.id}/sharing`,
      { shared: false },
      mine,
    );
    equal(
      (await call(`public/workspace/${badge.id}`, undefined, "")).status,
      404,
    );
    const templateResponse = await call("admin/certificates/templates", {
      name: "Portal certificate",
      design: { ...defaultCertificate, header: "Continuing Education" },
    });
    equal(templateResponse.status, 200);
    const template = await templateResponse.json();
    const certResponse = await call("admin/certificates/create", {
      sourceId: "workspace",
      badgeId: badge.id,
      templateId: template.id,
      recipientName: "Alex Morgan",
      confirmed: true,
      actor: "forged",
    });
    equal(certResponse.status, 200);
    const emailCertificate = await certResponse.json();
    equal(
      (await call("admin/certificates/email/catalog", undefined, "")).status,
      401,
    );
    scope = false;
    equal((await call("admin/certificates/email/catalog")).status, 403);
    scope = true;
    equal((await call("admin/certificates/email/catalog")).status, 200);
    equal((await call("admin/certificates/email/history")).status, 200);
    const emailBody = {
      certificateIds: [emailCertificate.id],
      mode: "attachment",
      subject: "Your certificate: {{achievement}}",
      message: "Hello {{name}}, your certificate is attached.",
      recipient: "forged@example.test",
      actor: "forged",
    };
    equal(
      (
        await call(
          "admin/certificates/email/preview",
          emailBody,
          undefined,
          "https://outside.example",
        )
      ).status,
      403,
    );
    equal(
      (
        await call(
          "admin/certificates/email/preview",
          emailBody,
          `ce-demo-learner=${learnerId}`,
        )
      ).status,
      401,
    );
    const emailPreviewResponse = await call(
      "admin/certificates/email/preview",
      emailBody,
    );
    equal(emailPreviewResponse.status, 200);
    const emailPreview = await emailPreviewResponse.json();
    equal(emailPreview.emails[0].recipient.includes("forged"), false);
    equal(
      (
        await call("admin/certificates/email/send", {
          batchId: emailPreview.batchId,
          confirmed: true,
        })
      ).status,
      400,
    );
    equal(
      (await call("certificate-download", { token: "invalid" }, "")).status,
      400,
    );
    equal(
      (
        await call(
          "certificate-download",
          { token: "invalid" },
          "",
          "https://outside.example",
        )
      ).status,
      403,
    );
    equal((await call("certificate-download", undefined, "")).status, 404);
    equal(
      (await call("admin/distribution/catalog", undefined, "")).status,
      401,
    );
    scope = false;
    equal((await call("admin/distribution/catalog")).status, 403);
    scope = true;
    app.distribution.recipients.directory = async () => ({
      contacts: new Map([
        ["demo-alex", { active: true, portalId: learnerId }],
        ["demo-jordan", { active: true, portalId: otherLearnerId }],
      ]),
      cohorts: [],
    });
    equal((await call("admin/distribution/catalog")).status, 200);
    const claimBody = {
      sourceId: "workspace",
      badgeId: badge.id,
      kind: "both",
      days: 7,
      confirmed: true,
      actor: "forged",
    };
    equal(
      (
        await call(
          "admin/distribution/create",
          claimBody,
          undefined,
          "https://outside.example",
        )
      ).status,
      403,
    );
    equal(
      (await call("admin/distribution/create", claimBody, mine)).status,
      401,
    );
    const createClaim = await call("admin/distribution/create", claimBody);
    equal(createClaim.status, 200);
    const claim = await createClaim.json();
    equal(
      (
        await app.store.db
          .prepare("SELECT created_by FROM claims WHERE id=?")
          .get(claim.id)
      ).created_by,
      `portal:${staffId}`,
    );
    const claimDetail = await (
      await call(`admin/distribution/${claim.id}`)
    ).json();
    equal(typeof claimDetail.code, "string");
    equal(claimDetail.qr.startsWith("data:image/png;base64,"), true);
    equal(
      (await call("me/claims/redeem", { code: claimDetail.code }, "")).status,
      401,
    );
    equal(
      (
        await call(
          "me/claims/redeem",
          { code: claimDetail.code, learner: "demo-alex" },
          other,
        )
      ).status,
      400,
    );
    equal(
      (await call("me/claims/redeem", { code: claimDetail.code }, other))
        .status,
      400,
    );
    equal(
      (
        await call(
          "me/claims/redeem",
          { code: claimDetail.code },
          mine,
          "https://outside.example",
        )
      ).status,
      403,
    );
    const receipt = await (
      await call("me/claims/redeem", { code: claimDetail.code }, mine)
    ).json();
    equal(receipt.badgeId, badge.id);
    equal(receipt.certificateId, emailCertificate.id);
    equal(receipt.kind, "both");
    equal(
      (
        await (
          await call("me/claims/redeem", { code: claimDetail.code }, mine)
        ).json()
      ).replayed,
      true,
    );
    equal(
      (await call(`admin/distribution/${claim.id}/revoke`, { confirmed: true }))
        .status,
      200,
    );
    equal(
      (await call("me/claims/redeem", { code: claimDetail.code }, mine)).status,
      400,
    );
    equal(
      (
        await call(
          `me/badges/workspace/${badge.id}/certificate`,
          undefined,
          mine,
        )
      ).status,
      200,
    );
    equal((await call("admin/distribution/history")).status, 200);
    equal((await call(`public/claims/${claim.id}`, undefined, "")).status, 404);
    const register = await (await call("admin/issuances")).json();
    equal(register.records[0].certificate.recipientName, "Alex Morgan");
    equal(
      (await app.certificates.find("workspace", badge.id)).created_by,
      `portal:${staffId}`,
    );
    const pdf = await (
      await call(`me/badges/workspace/${badge.id}/certificate`, undefined, mine)
    ).json();
    equal(pdf.contentType, "application/pdf");
    equal(Buffer.from(pdf.data, "base64").subarray(0, 5).toString(), "%PDF-");
    equal(
      (
        await call(
          `me/badges/workspace/${badge.id}/certificate`,
          undefined,
          other,
        )
      ).status,
      404,
    );
    equal(
      (await call("admin/awards/template.csv")).headers
        .get("content-type")
        ?.includes("text/csv"),
      true,
    );
    const batch = await (
      await call("admin/awards/preview", {
        method: "csv",
        versionId: version.id,
        csv: "learner_id,reason,evidence_url\ndemo-jordan,Completed synthetic cohort activity,\n",
      })
    ).json();
    equal(batch.counts.ready, 1);
    equal(
      (
        await (
          await call(`admin/awards/${batch.id}/commit`, { confirmed: true })
        ).json()
      ).counts.issued,
      1,
    );
    equal(
      (await (await call("me/badges", undefined, other)).json()).badges.length,
      1,
    );
    equal(
      (await call(`admin/awards/${batch.id}/report.csv`)).headers
        .get("content-type")
        ?.includes("text/csv"),
      true,
    );
    process.env.BADGES_ENABLED = "false";
    equal((await call("admin/catalog")).status, 503);
    process.env.BADGES_ENABLED = "true";
    for (const route of [
      "admin/session",
      "admin/catalog",
      "admin/issuances",
      "designer/drafts",
      "me/badges",
    ])
      equal(typeof badgeRoute("GET", route), "string");
    console.log(
      `Badge portal integration: ${checks} checks passed (mocked identity-provider boundary, real badge service and PDF renderer).`,
    );
  } finally {
    await new Promise<void>((r) => app.server.close(() => r()));
    await app.store.close();
    await new Promise<void>((r) => identity.close(() => r()));
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
