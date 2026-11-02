import AxeBuilder from "@axe-core/playwright";
import { expect, Page, test } from "@playwright/test";

test.describe("credential claims", () => {
  const claimId = "70000000-0000-4000-8000-000000000001",
    badgeId = "70000000-0000-4000-8000-000000000002",
    certificateId = "70000000-0000-4000-8000-000000000003",
    code = "01234-56789-ABCDE-FGHJK";
  async function setupStaff(page: Page, linked = true) {
    await page.request.post("/api/staff-session", {
      data: { email: "admin@cuce.test" },
    });
    const qr = await require("qrcode").toDataURL(
      "https://portal.example.test/credential-tools/claim.html#" + code,
    );
    let state = "active",
      created = false;
    const summary = () => ({
      id: claimId,
      badgeId,
      sourceId: "workspace",
      recipientName: "Alex Morgan (Demo)",
      learnerId: "demo-distribution-alex",
      kind: "both",
      certificateId,
      state,
      createdAt: "2026-10-28T12:00:00.000Z",
      expiresAt: "2026-11-04T12:00:00.000Z",
    });
    await page.route("**/api/badges/admin/distribution/**", async (route) => {
      const path = new URL(route.request().url()).pathname.split(
        "/distribution/",
      )[1];
      if (path === "catalog")
        return route.fulfill({
          json: {
            origin: "https://portal.example.test",
            local: false,
            errors: [],
            awards: [
              {
                id: badgeId,
                sourceId: "workspace",
                title: "DEMO learning accomplishment",
                recipientName: "Alex Morgan (Demo)",
                certificateId,
                linked,
                status: "issued",
                signatureValid: true,
                demo: true,
              },
            ],
          },
        });
      if (path === "history")
        return route.fulfill({
          json: { distributions: created ? [summary()] : [], limit: 250 },
        });
      if (path === "create") {
        expect(route.request().postDataJSON()).toEqual({
          sourceId: "workspace",
          badgeId,
          kind: "both",
          days: 7,
          confirmed: true,
        });
        created = true;
        return route.fulfill({ json: summary() });
      }
      if (path === claimId + "/revoke") {
        expect(route.request().postDataJSON()).toEqual({ confirmed: true });
        state = "revoked";
        return route.fulfill({ json: summary() });
      }
      if (path === claimId)
        return route.fulfill({
          json: {
            ...summary(),
            code: state === "active" ? code : null,
            url:
              state === "active"
                ? "https://portal.example.test/credential-tools/claim.html#" +
                  code
                : null,
            qr: state === "active" ? qr : null,
            events: [
              {
                at: "2026-10-28T12:00:00.000Z",
                action: state === "active" ? "created" : "revoked",
                actor: "portal:synthetic-staff",
              },
            ],
          },
        });
      return route.fulfill({
        status: 404,
        json: { error: "Unknown test route" },
      });
    });
    await page.goto("/staff/certificates");
    const frame = page.frameLocator("iframe");
    await expect(frame.locator("#cd-award option")).toHaveCount(2);
    return frame;
  }
  test("staff creates paired QR/code distribution, reviews it, downloads QR and revokes it with keyboard access", async ({
    page,
  }) => {
    const frame = await setupStaff(page);
    await frame
      .getByLabel("Issued accomplishment and recipient")
      .selectOption("workspace/" + badgeId);
    await expect(frame.getByLabel("Distribute", { exact: true })).toHaveValue(
      "both",
    );
    const confirm = frame.getByLabel(
      "I confirm the recipient and the issued accomplishment selected above.",
    );
    await confirm.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await expect(
      frame.getByRole("button", {
        name: "Create QR and claim code",
        exact: true,
      }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(frame.locator("#cd-detail")).toBeFocused();
    await expect(frame.getByLabel("Claim code", { exact: true })).toHaveValue(
      code,
    );
    await expect(
      frame.getByRole("img", { name: /Claim QR code for Alex/ }),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await frame.getByRole("button", { name: "Download QR image" }).click();
    expect((await download).suggestedFilename()).toBe(
      "credential-claim-" + claimId + ".png",
    );
    await scan(page, "Paired credential claim distribution");
    await frame.getByLabel("I confirm revoking this claim code.").check();
    await frame
      .getByRole("button", { name: "Revoke claim code", exact: true })
      .click();
    await expect(frame.locator("#cd-status")).toContainText(
      "Claim code revoked",
    );
    await expect(frame.locator("#cd-detail img")).toHaveCount(0);
    await expect(frame.locator("#cd-history")).toContainText("revoked");
    await page.setViewportSize({ width: 320, height: 800 });
    expect(
      await frame
        .locator("html")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  });
  test("staff cannot distribute to an unlinked learner", async ({ page }) => {
    const frame = await setupStaff(page, false);
    await expect(frame.locator("#cd-award option").last()).toBeDisabled();
    await expect(
      frame.getByRole("button", {
        name: "Create QR and claim code",
        exact: true,
      }),
    ).toBeDisabled();
    await scan(page, "Unlinked credential claim recipient");
  });
  test("QR claim code survives sign-in without appearing in request URLs and opens both downloads", async ({
    page,
  }) => {
    let signedIn = false;
    await page.route("**/api/demo-session", async (route) => {
      if (route.request().method() === "POST") signedIn = true;
      return route.fulfill({
        json: {
          id: signedIn ? "70000000-0000-4000-8000-000000000010" : null,
          email: signedIn ? "claim-learner@example.test" : null,
          display_name: signedIn ? "Demo Claim Learner" : null,
          auth: { mode: "mock", configured: true },
        },
      });
    });
    await page.route("**/api/badges/me/claims/redeem", async (route) => {
      expect(route.request().url()).not.toContain(code);
      expect(route.request().postDataJSON()).toEqual({ code });
      return route.fulfill({
        json: {
          claimId,
          kind: "both",
          sourceId: "workspace",
          badgeId,
          certificateId,
          title: "DEMO learning accomplishment",
          demonstration: true,
          replayed: false,
        },
      });
    });
    await page.route("**/api/badges/me/badges/**/download", (route) =>
      route.fulfill({
        json: { format: "cu-pilot-credential-v1", demonstration: true },
      }),
    );
    await page.route("**/api/badges/me/badges/**/certificate", (route) =>
      route.fulfill({
        json: {
          filename: "demo-certificate.pdf",
          contentType: "application/pdf",
          data: Buffer.from("%PDF-1.4 synthetic").toString("base64"),
        },
      }),
    );
    await page.goto("/credential-tools/claim.html#" + code);
    await expect(page).not.toHaveURL(/#/);
    await expect(page.getByLabel("Claim code", { exact: true })).toHaveValue(
      code,
    );
    await page
      .getByRole("link", { name: "Sign in to claim", exact: true })
      .click();
    await page.getByLabel(/^Email/).fill("claim-learner@example.test");
    await page.getByLabel(/^Password/).fill("demo-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/credential-tools\/claim\.html$/);
    await expect(page.getByLabel("Claim code", { exact: true })).toHaveValue(
      code,
    );
    await page.getByRole("button", { name: "Claim accomplishment" }).click();
    await expect(
      page.getByRole("heading", { name: "DEMO learning accomplishment" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Your badge and certificate recognize the same accomplishment.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      await page.evaluate(() => sessionStorage.getItem("ce-pending-claim")),
    ).toBeNull();
    await expect(page.locator("#claim-receipt")).toBeFocused();
    const badge = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download badge credential" })
      .click();
    expect((await badge).suggestedFilename()).toBe(
      "badge-" + badgeId + ".json",
    );
    const pdf = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download certificate PDF" })
      .click();
    expect((await pdf).suggestedFilename()).toBe("demo-certificate.pdf");
    await scan(page, "Claimed paired accomplishment");
  });
  test("claim failures retain the code and do not reveal another learner or award", async ({
    page,
  }) => {
    await page.route("**/api/demo-session", (route) =>
      route.fulfill({
        json: {
          id: "70000000-0000-4000-8000-000000000010",
          email: "claim-learner@example.test",
        },
      }),
    );
    await page.route("**/api/badges/me/claims/redeem", (route) =>
      route.fulfill({
        status: 400,
        json: {
          error:
            "This claim code is invalid, expired, revoked, or belongs to another learner.",
        },
      }),
    );
    await page.goto("/credential-tools/claim.html#" + code);
    await page.getByRole("button", { name: "Claim accomplishment" }).click();
    await expect(page.locator("#claim-status")).toContainText(
      "invalid, expired, revoked",
    );
    await expect(page.getByLabel("Claim code", { exact: true })).toHaveValue(
      code,
    );
    await expect(page.locator("#claim-receipt")).not.toBeVisible();
    await scan(page, "Unavailable credential claim");
  });
});

test.describe("certificate email", () => {
  const ids = [
    "60000000-0000-4000-8000-000000000001",
    "60000000-0000-4000-8000-000000000002",
    "60000000-0000-4000-8000-000000000003",
  ];
  async function setupEmail(page: Page, ready = true) {
    await page.request.post("/api/staff-session", {
      data: { email: "admin@cuce.test" },
    });
    const records = ids.map((id, i) => ({
      id,
      badgeId: id,
      sourceId: "workspace",
      learnerId: `synthetic-${i}`,
      recipientName: ["Alex Morgan", "Jordan Morgan", "Missing Contact"][i],
      achievement: "Synthetic learning",
      createdAt: "2026-10-28T12:00:00.000Z",
    }));
    const settings = {
      automatic: false,
      mode: "attachment",
      subject: "Your certificate: {{achievement}}",
      message: "Hello {{name}},\n\nYour certificate is attached.",
      revision: 0,
    };
    let emails: any[] = [],
      sent = false,
      history: any[] = [];
    await page.route("**/api/badges/admin/certificates/catalog", (route) =>
      route.fulfill({
        json: {
          templates: [],
          defaults: {
            style: "classic",
            primary: "#003A63",
            accent: "#FDB813",
            title: "Certificate of Completion",
            introduction: "Presented to",
            completionText: "for completing",
            closing: "Congratulations",
            department: "Continuing Education",
            signerName: "Staff",
            signerTitle: "University",
            footer: "Learning",
            paper: "letter",
            header: "",
          },
          certificates: records,
          awards: records.map((r) => ({
            ...r,
            id: r.badgeId,
            title: r.achievement,
            issuer: "University",
            issuedAt: r.createdAt,
            status: "issued",
            signatureValid: true,
            certificate: r,
          })),
          errors: [],
        },
      }),
    );
    await page.route(
      "**/api/badges/admin/certificates/email/catalog",
      (route) =>
        route.fulfill({
          json: {
            settings,
            configuration: {
              sender: "continuinged@cedarville.edu",
              ready,
              linksReady: true,
              provider: ready ? "resend" : null,
              reason: ready
                ? null
                : "Sending is disabled. Configure an email provider and credentials.",
            },
            contacts: Object.fromEntries(
              records.map((r, i) => [
                r.id,
                {
                  address:
                    i < 2
                      ? `${i === 0 ? "alex" : "jordan"}@example.test`
                      : null,
                  cohortIds: i < 2 ? ["cohort-test"] : [],
                },
              ]),
            ),
            cohorts: [{ id: "cohort-test", name: "Synthetic cohort" }],
          },
        }),
    );
    await page.route(
      "**/api/badges/admin/certificates/email/history",
      (route) => route.fulfill({ json: { deliveries: history, limit: 250 } }),
    );
    await page.route(
      "**/api/badges/admin/certificates/email/preview",
      async (route) => {
        const body = route.request().postDataJSON();
        emails = body.certificateIds.map((id: string) => {
          const r = records.find((r) => r.id === id)!;
          return {
            id,
            certificateId: id,
            sourceId: "workspace",
            badgeId: id,
            recipientName: r.recipientName,
            recipient: `${id === ids[0] ? "alex" : "jordan"}@example.test`,
            sender: "continuinged@cedarville.edu",
            subject: body.subject.replace("{{achievement}}", r.achievement),
            message: body.message.replace("{{name}}", r.recipientName),
            mode: body.mode,
            state: "preview",
            reason: null,
          };
        });
        await route.fulfill({
          json: {
            batchId: "60000000-0000-4000-8000-000000000010",
            emails,
            expiresAt: "2026-10-28T12:30:00.000Z",
          },
        });
      },
    );
    await page.route(
      "**/api/badges/admin/certificates/email/send",
      async (route) => {
        sent = true;
        history = emails.map((item) => ({
          ...item,
          state: "accepted",
          createdAt: "2026-10-28T12:00:00.000Z",
          events: [
            {
              at: "2026-10-28T12:00:00.000Z",
              state: "accepted",
              detail:
                "Provider accepted. Inbox delivery has not been verified.",
              actor: "email-worker",
            },
          ],
        }));
        await route.fulfill({ json: { queued: emails.length } });
      },
    );
    await page.route("**/api/badges/admin/certificates/pdf/**", (route) =>
      route.fulfill({
        json: {
          filename: "synthetic-certificate.pdf",
          data: Buffer.from("%PDF-1.4 synthetic").toString("base64"),
          contentType: "application/pdf",
        },
      }),
    );
    await page.goto("/staff/certificates");
    const frame = page.frameLocator("iframe");
    await expect(frame.locator("#ce-sender")).toHaveText(
      "Sender: continuinged@cedarville.edu",
    );
    return { frame, sent: () => sent };
  }
  test("individual preview, PDF review, keyboard focus and deliberate send", async ({
    page,
  }) => {
    const { frame, sent } = await setupEmail(page);
    const button = frame
      .locator("#cc-records .cc-record")
      .first()
      .getByRole("button", { name: "Email certificate", exact: true });
    await button.focus();
    await page.keyboard.press("Enter");
    const dialog = frame.getByRole("region", {
      name: "Preview certificate emails",
    });
    await expect(dialog).toBeVisible();
    await expect(frame.locator("#ce-mode")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(frame.locator("#ce-subject")).toBeFocused();
    await expect(
      dialog.getByRole("button", { name: "Send emails", exact: true }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "Build personalized previews" })
      .click();
    await expect(
      dialog.getByText("To: alex@example.test", { exact: true }),
    ).toBeVisible();
    await expect(dialog.locator("pre")).toContainText("Hello Alex Morgan");
    const download = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Review certificate PDF" })
      .click();
    expect((await download).suggestedFilename()).toBe(
      "synthetic-certificate.pdf",
    );
    await scan(page, "Certificate email individual preview");
    await dialog.locator("#ce-confirm").check();
    await dialog
      .getByRole("button", { name: "Send emails", exact: true })
      .click();
    await expect(dialog.locator("#ce-dialog-status")).toContainText(
      "1 email queued",
    );
    expect(sent()).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(button).toBeFocused();
    await expect(frame.locator("#ce-history")).toContainText(
      "Provider accepted",
    );
  });
  test("cohort selection personalizes separately and changing content invalidates confirmation", async ({
    page,
  }) => {
    const { frame } = await setupEmail(page);
    await frame
      .getByLabel("Filter certificates by cohort")
      .selectOption("cohort-test");
    await expect(frame.locator("#ce-choices input")).toHaveCount(2);
    await frame
      .getByRole("button", { name: "Select visible certificates" })
      .click();
    await frame
      .getByRole("button", { name: "Preview selected emails" })
      .click();
    const dialog = frame.getByRole("region", {
      name: "Preview certificate emails",
    });
    await dialog
      .getByLabel("Delivery format", { exact: true })
      .selectOption("both");
    await dialog
      .getByRole("button", { name: "Build personalized previews" })
      .click();
    await expect(dialog.locator(".cc-email-preview")).toHaveCount(2);
    await expect(dialog.locator("pre").nth(0)).toContainText(
      "Hello Alex Morgan",
    );
    await expect(dialog.locator("pre").nth(1)).toContainText(
      "Hello Jordan Morgan",
    );
    await dialog.locator("#ce-confirm").check();
    await dialog.getByLabel("Subject", { exact: true }).fill("Updated subject");
    await expect(
      dialog.getByRole("button", { name: "Send emails", exact: true }),
    ).toBeDisabled();
    await expect(dialog.locator(".cc-email-preview")).toHaveCount(0);
    await dialog
      .getByRole("button", { name: "Build personalized previews" })
      .click();
    await scan(page, "Certificate email cohort preview");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.setViewportSize({ width: 320, height: 800 });
    await expect(frame.locator("html")).toHaveJSProperty(
      "scrollWidth",
      await frame.locator("html").evaluate((el) => el.clientWidth),
    );
  });
  test("unconfigured sender provider permits previews but blocks sending and automatic delivery", async ({
    page,
  }) => {
    const { frame, sent } = await setupEmail(page, false);
    await frame
      .getByText("Email settings and automatic delivery", { exact: true })
      .click();
    await expect(
      frame.getByLabel("Automatically email newly issued certificates"),
    ).toBeDisabled();
    await expect(frame.locator("#ce-choices input").last()).toBeDisabled();
    await frame
      .locator("#cc-records .cc-record")
      .first()
      .getByRole("button", { name: "Email certificate", exact: true })
      .click();
    const dialog = frame.getByRole("region", {
      name: "Preview certificate emails",
    });
    await dialog
      .getByRole("button", { name: "Build personalized previews" })
      .click();
    await expect(dialog.locator("#ce-dialog-status")).toContainText(
      "Sending is disabled",
    );
    await expect(dialog.locator("#ce-confirm")).toBeDisabled();
    expect(sent()).toBe(false);
    await scan(page, "Unconfigured certificate email preview");
  });
  test("secure download capability stays out of request URLs and page history", async ({
    page,
  }) => {
    const token = ids[0] + "." + "A".repeat(43);
    let posted = false;
    await page.route("**/api/badges/certificate-download", async (route) => {
      expect(route.request().url()).not.toContain(token);
      expect(route.request().postDataJSON()).toEqual({ token });
      posted = true;
      await route.fulfill({
        status: 400,
        json: { error: "Certificate link is invalid or expired." },
      });
    });
    await page.goto("/credential-tools/certificate-download.html#" + token);
    await expect(page).not.toHaveURL(/#/);
    await page
      .getByRole("button", { name: "Download certificate PDF" })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Certificate link is invalid or expired.",
    );
    expect(posted).toBe(true);
    await scan(page, "Expired private certificate download");
  });
});
// WCAG 2.2 A/AA rules on the key learner and staff screens, in light, dark and
// phone layouts. Uses synthetic accounts only: a demo learner on example.test
// and the seeded demo staff administrator on cuce.test.
const tags = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
];

test.describe("T01 offering visibility", () => {
  const id = "00000000-0000-4000-8000-000000000301";
  const listingName = "Listed in course discovery";
  async function setup(
    page: Page,
    {
      published = true,
      listed = true,
      editable = true,
      incomplete = false,
    } = {},
  ) {
    const offering = {
      id,
      title: "Visibility test course",
      category: "Technology",
      summary: "A synthetic course for visibility checks.",
      description:
        "A synthetic course description used to verify independent visibility settings.",
      format: "Online",
      course_type: incomplete ? null : "self_paced",
      start_date: null,
      end_date: null,
      capacity: incomplete ? null : 20,
      unlimited_seats: false,
      price_cents: incomplete ? null : 1000,
      published,
      listed,
      version: 1,
      approval_required: false,
      approval_valid_days: 7,
      enrollment_close_days: 7,
      canvas_course_url: null,
      imported_from_canvas: incomplete,
      unpublished_at: null,
      seats_available: incomplete ? null : 20,
      seats_in_use: 0,
      active_registrations: 0,
      sales_page_status: "none",
      enrollment_open: true,
      outcomes: [],
      collections: [],
      sales_page: null,
    };
    await page.route("**/api/demo-session", (route) =>
      route.fulfill({
        json: {
          id: null,
          email: null,
          auth: { mode: "mock", configured: true },
        },
      }),
    );
    await page.route("**/api/staff-session", (route) =>
      route.fulfill({
        json: {
          member: {
            id: "00000000-0000-4000-8000-000000000302",
            email: "visibility@example.test",
            display_name: "Visibility tester",
            active: true,
            version: 1,
            roles: [editable ? "catalog_manager" : "support"],
            scopes: editable ? ["catalog:write"] : [],
          },
          auth: { mode: "canvas", configured: true },
        },
      }),
    );
    await page.route("**/api/staff/offerings", (route) =>
      route.fulfill({ json: [offering] }),
    );
    await page.route(`**/api/staff/offerings/${id}`, (route) =>
      route.fulfill({ json: { offering, registrations: {}, activity: [] } }),
    );
    await page.route(`**/api/offerings/${id}/prices`, (route) =>
      route.fulfill({ json: [] }),
    );
    for (const endpoint of ["approval-requests", "exceptions"])
      await page.route(`**/api/${endpoint}`, (route) =>
        route.fulfill({ json: [] }),
      );
    await page.route("**/api/reconciliation", (route) =>
      route.fulfill({ json: { audit: [] } }),
    );
    await page.route("**/api/prototype/simulation", (route) =>
      route.fulfill({ json: { provisioningOutcome: "normal" } }),
    );
    return offering;
  }
  test("keyboard listing control saves independently and requires an audit reason", async ({
    page,
  }) => {
    const offering = await setup(page);
    const writes: any[] = [];
    await page.route(`**/api/offerings/${id}/edit`, async (route) => {
      const body = route.request().postDataJSON();
      writes.push(body);
      expect(body.version).toBe(offering.version);
      expect(body.reason).toBe("Share course only by its direct link");
      expect(body.priceCents).toBe(offering.price_cents);
      Object.assign(offering, {
        listed: body.listed,
        version: offering.version + 1,
      });
      await route.fulfill({ json: { id } });
    });
    await page.goto(`/staff/offerings/${id}/settings`);
    const listing = page.getByRole("switch", { name: listingName });
    await expect(listing).toBeChecked();
    await listing.focus();
    await page.keyboard.press("Space");
    await expect(listing).not.toBeChecked();
    await expect(page.getByText(/Unlisted: published courses/)).toBeVisible();
    const save = page.getByRole("button", {
      name: "Save changes",
      exact: true,
    });
    await save.click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Fix these fields" }),
    ).toBeFocused();
    expect(writes).toHaveLength(0);
    await page
      .getByRole("textbox", { name: "Reason for change", exact: true })
      .fill("Share course only by its direct link");
    await save.click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].listed).toBe(false);
    await expect(
      page.getByText("Published · Unlisted", { exact: true }),
    ).toBeVisible();
    await scan(page, "Published unlisted settings");
    await page.reload();
    await expect(listing).not.toBeChecked();
    await listing.focus();
    await page.keyboard.press("Space");
    await page
      .getByRole("textbox", { name: "Reason for change", exact: true })
      .fill("Share course only by its direct link");
    await save.click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1].listed).toBe(true);
    await expect(listing).toBeChecked();
    await scan(page, "Relisted offering settings");
  });
  test("stale visibility save preserves input and announces the conflict", async ({
    page,
  }) => {
    await setup(page);
    await page.route(`**/api/offerings/${id}/edit`, (route) =>
      route.fulfill({
        status: 409,
        json: { message: "Offering changed. Refresh and retry." },
      }),
    );
    await page.goto(`/staff/offerings/${id}/settings`);
    const listing = page.getByRole("switch", { name: listingName });
    await listing.uncheck();
    await page
      .getByRole("textbox", { name: "Reason for change", exact: true })
      .fill("Restrict discovery to direct course links");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Offering changed" }),
    ).toBeFocused();
    await expect(listing).not.toBeChecked();
    await scan(page, "Stale listing preference save");
  });
  test("incomplete imported draft saves listing without publishing or filling sales details", async ({
    page,
  }) => {
    const offering = await setup(page, { published: false, incomplete: true });
    let saved = false;
    await page.route(`**/api/offerings/${id}/settings`, async (route) => {
      const body = route.request().postDataJSON();
      expect(body.listed).toBe(false);
      expect(body.priceCents).toBeUndefined();
      expect(body.version).toBe(1);
      saved = true;
      Object.assign(offering, { listed: false, version: 2 });
      await route.fulfill({ json: { id } });
    });
    await page.goto(`/staff/offerings/${id}/settings`);
    await page.getByRole("switch", { name: listingName }).uncheck();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect.poll(() => saved).toBe(true);
    await expect(
      page.getByText("Draft · Unlisted", { exact: true }),
    ).toBeVisible();
    await scan(page, "Incomplete draft listing settings");
  });
  test("view-only staff see unlisted state without an edit control", async ({
    page,
  }) => {
    await setup(page, { listed: false, editable: false });
    await page.goto(`/staff/offerings/${id}/settings`);
    await expect(
      page.getByText("Published · Unlisted", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("switch", { name: listingName })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "Unlisted — published courses are available by direct link",
        { exact: true },
      ),
    ).toBeVisible();
    await scan(page, "Read-only offering visibility");
  });
  async function collectionSetup(
    page: Page,
    kind = "collection",
    editable = true,
  ) {
    const offering = await setup(page, { editable });
    const collection = {
      id: "00000000-0000-4000-8000-000000000304",
      kind,
      slug: "visibility-group",
      title: "Visibility group",
      summary: "A synthetic group for independent listing checks.",
      published: true,
      listed: true,
      version: 2,
      followers: kind === "pathway" ? 1 : 0,
      courses: [{ id, title: offering.title, published: true, listed: true }],
    };
    await page.route("**/api/staff/collections", (route) =>
      route.fulfill({ json: [collection] }),
    );
    await page.route("**/api/staff/explore", (route) =>
      route.fulfill({
        json: {
          courses: [],
          collections: kind === "collection" ? [collection] : [],
          pathways: kind === "pathway" ? [collection] : [],
        },
      }),
    );
    return collection;
  }
  for (const kind of ["collection", "pathway"]) {
    test(`collection visibility ${kind} keyboard save, reload and retained Explore pick`, async ({
      page,
    }) => {
      const collection = await collectionSetup(page, kind);
      const writes: any[] = [];
      await page.route(
        `**/api/collections/${collection.id}/edit`,
        async (route) => {
          const body = route.request().postDataJSON();
          expect(body.version).toBe(collection.version);
          expect(body.offeringIds).toEqual([id]);
          writes.push(body);
          Object.assign(collection, {
            listed: body.listed,
            version: collection.version + 1,
          });
          await route.fulfill({ json: collection });
        },
      );
      await page.goto("/staff/collections");
      const edit = page.getByRole("button", {
        name: "Edit Visibility group",
        exact: true,
      });
      await edit.click();
      const dialog = page.getByRole("dialog");
      const control = dialog.getByRole("switch", { name: listingName });
      await expect(control).toBeChecked();
      await control.focus();
      await page.keyboard.press("Space");
      await expect(control).not.toBeChecked();
      await expect(dialog.getByText(/Unlisted: when published/)).toBeVisible();
      await scan(page, `Unlisted ${kind} edit dialog`);
      const save = dialog.getByRole("button", {
        name: "Save changes",
        exact: true,
      });
      await save.focus();
      await page.keyboard.press("Enter");
      await expect(dialog).not.toBeVisible();
      expect(writes).toHaveLength(1);
      expect(writes[0].listed).toBe(false);
      await expect(edit).toBeFocused();
      await expect(
        page
          .getByText("Published · Unlisted", { exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      await page.reload();
      await edit.click();
      await expect(control).not.toBeChecked();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(edit).toBeFocused();
      await page.goto("/staff/explore");
      await expect(
        page.getByText("Unlisted; hidden from Explore until listed", {
          exact: true,
        }),
      ).toBeVisible();
      await scan(page, `Retained unlisted ${kind} pick`);
      await page.goto("/staff/collections");
      await edit.click();
      await control.focus();
      await page.keyboard.press("Space");
      await save.click();
      await expect(dialog).not.toBeVisible();
      expect(writes).toHaveLength(2);
      expect(writes[1].listed).toBe(true);
      await scan(page, `Relisted ${kind} staff list`);
    });
  }
  test("collection visibility stale save retains listing and returns focus on cancel", async ({
    page,
  }) => {
    const collection = await collectionSetup(page);
    await page.route(`**/api/collections/${collection.id}/edit`, (route) =>
      route.fulfill({
        status: 409,
        json: { message: "Collection changed. Refresh and retry." },
      }),
    );
    await page.goto("/staff/collections");
    const edit = page.getByRole("button", {
      name: "Edit Visibility group",
      exact: true,
    });
    await edit.click();
    const dialog = page.getByRole("dialog");
    const control = dialog.getByRole("switch", { name: listingName });
    await control.focus();
    await page.keyboard.press("Space");
    await dialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toBeFocused();
    await expect(control).not.toBeChecked();
    await scan(page, "Collection listing conflict");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(edit).toBeFocused();
  });
  test("collection visibility read-only state and new draft defaults", async ({
    page,
  }) => {
    const collection = await collectionSetup(page, "collection", false);
    collection.listed = false;
    await page.goto("/staff/collections");
    await expect(
      page
        .getByText("Published · Unlisted", { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit Visibility group", exact: true }),
    ).toHaveCount(0);
    await scan(page, "Read-only unlisted collection");
    await collectionSetup(page);
    await page.reload();
    await page
      .getByRole("button", { name: "New collection", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("switch", { name: listingName }),
    ).toBeChecked();
    await scan(page, "Collection draft listing default");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });
  test("staff curation retains hidden membership and explains unlisted featured picks", async ({
    page,
  }) => {
    const offering = await setup(page, { listed: false });
    await page.route("**/api/staff/collections", (route) =>
      route.fulfill({
        json: [
          {
            id: "00000000-0000-4000-8000-000000000303",
            kind: "collection",
            slug: "visibility-group",
            title: "Visibility group",
            summary: "A collection with an unlisted course",
            published: true,
            version: 1,
            followers: 0,
            courses: [
              { id, title: offering.title, published: true, listed: false },
            ],
          },
        ],
      }),
    );
    await page.route("**/api/staff/explore", (route) =>
      route.fulfill({
        json: {
          courses: [{ id, title: offering.title, published: true }],
          collections: [],
          pathways: [],
        },
      }),
    );
    await page.goto("/staff/collections");
    await expect(
      page.locator("li:visible").filter({ hasText: offering.title }),
    ).toContainText("unlisted, hidden from this list");
    await scan(page, "Staff collection unlisted membership");
    await page.goto("/staff/explore");
    await expect(
      page.getByText("Unlisted; hidden from Explore until listed", {
        exact: true,
      }),
    ).toBeVisible();
    await scan(page, "Staff retained unlisted featured pick");
  });
});

test.describe("CU learner OAuth", () => {
  async function sessions(page: Page, signedIn = false, staff = false) {
    await page.route("**/api/demo-session", (route) =>
      route.fulfill({
        json: {
          id: signedIn ? "00000000-0000-4000-8000-000000000099" : null,
          email: null,
          display_name: signedIn ? "CU Test Learner" : null,
          auth: { mode: "canvas", configured: true },
        },
      }),
    );
    await page.route("**/api/staff-session", (route) =>
      route.fulfill({
        json: {
          member: staff
            ? {
                id: "test-staff",
                email: "test@example.test",
                display_name: "Test Staff",
                roles: ["staff_admin"],
                scopes: [],
              }
            : null,
          auth: { mode: "canvas", configured: true },
        },
      }),
    );
  }
  test("existing-account sign-in and error are accessible without password fields", async ({
    page,
  }) => {
    await sessions(page);
    await page.goto("/sign-in?returnTo=%2Flearning");
    const link = page.getByRole("link", {
      name: "Sign in with CU account",
      exact: true,
    });
    await expect(link).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
    await expect(link).toHaveAttribute(
      "href",
      "/api/auth/learner/canvas/start?returnTo=%2Flearning",
    );
    for (
      let i = 0;
      i < 25 &&
      !(await link.evaluate((element) => element === document.activeElement));
      i++
    )
      await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    await scan(page, "CU learner sign-in");
    await page.goto("/sign-in?authError=invalid");
    await expect(
      page.getByRole("alert").filter({ hasText: "Sign-in expired" }),
    ).toBeVisible();
    await scan(page, "CU learner sign-in error");
  });
  test("Canvas identity without email stays signed in after checkout return", async ({
    page,
  }) => {
    await sessions(page, true, true);
    await page.route("**/api/me/**", (route) => route.fulfill({ json: [] }));
    await page.goto("/settings");
    await expect(
      page.getByText("Your CU account is linked through Canvas.", {
        exact: false,
      }),
    ).toBeVisible();
    await scan(page, "CU learner account settings");
    await page.goto("/learning?checkout=success");
    await expect(
      page.getByRole("heading", { name: "My learning", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    await scan(page, "CU learner checkout return");
  });
  test("staff can reach the separate learner login", async ({
    page,
    isMobile,
  }) => {
    await sessions(page, false, true);
    await page.goto("/settings");
    if (isMobile)
      await page.getByRole("button", { name: "Open navigation menu" }).click();
    const link = page.getByRole(isMobile ? "menuitem" : "link", {
      name: "Use as learner",
      exact: true,
    });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/sign-in");
    if (isMobile) await page.keyboard.press("Escape");
    await scan(page, "staff-to-learner navigation");
  });
  test("staff learner list identifies Canvas learners by name without email", async ({
    page,
  }) => {
    await sessions(page, false, true);
    await page.route("**/api/staff/learners", (route) =>
      route.fulfill({
        json: [
          {
            id: "00000000-0000-4000-8000-000000000099",
            email: null,
            display_name: "CU Test Learner",
            created_at: "2026-10-21T12:00:00Z",
            active: true,
            version: 1,
            registrations: 0,
            enrolled: 0,
            in_progress: 0,
            last_activity: null,
          },
        ],
      }),
    );
    await page.goto("/staff/learners");
    await expect(
      page
        .getByRole("button", { name: "View learner CU Test Learner" })
        .first(),
    ).toBeVisible();
    const search = page.getByRole("textbox", { name: "Search learners" });
    await search.fill("CU Test");
    await expect(
      page
        .getByRole("button", { name: "View learner CU Test Learner" })
        .first(),
    ).toBeVisible();
    await scan(page, "Canvas learner name in staff directory");
  });
});
async function scan(page: Page, name: string) {
  // Wait for loading placeholders to be replaced before scanning.
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".MuiSkeleton-root")).toHaveCount(0, {
    timeout: 15_000,
  });
  // Let dialog fades and other transitions finish: mid-fade text is partly
  // transparent, which axe reports as low contrast (seen in WebKit on CI).
  // Endless animations, such as the keyboard focus pulse on radio buttons,
  // never finish and are skipped.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getComputedTiming().iterations === Infinity,
      ),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(tags)
    .analyze();
  const summary = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
        .slice(0, 5)
        .map((n) => n.target.join(" "))
        .join("\n  ")}`,
  );
  expect(summary, `${name} accessibility violations`).toEqual([]);
}
// Staff sections have their own addresses (/staff/offerings, ...).
// Opens the sales page editor for a sample course and fills the rich text
// editor with a heading, a paragraph and a video, without saving, so the scans
// cover the editor, its toolbar and the preview.
async function openEditorWithRichContent(page: Page) {
  await page.request.post("/api/staff-session", {
    data: { email: "content@cuce.test" },
  });
  await page.goto(
    "/staff/offerings/10000000-0000-4000-8000-000000000001/sales-page",
  );
  const editor = page.getByRole("textbox", { name: "Page content" });
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type("Why take this course");
  await page.getByRole("combobox", { name: "Styles" }).click();
  await page.getByRole("option", { name: "Heading 2" }).click();
  await editor.press("End");
  await editor.press("Enter");
  await page.keyboard.type("Turn everyday spreadsheets into clear answers.");
  await editor.press("Enter");
  await page.getByRole("button", { name: "Add a video" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a video" });
  await dialog
    .getByRole("textbox", { name: "Video link or embed code" })
    .fill("https://vimeo.com/76979871");
  await dialog
    .getByRole("textbox", { name: "Video title" })
    .fill("Course introduction");
  await dialog.getByRole("button", { name: "Add video" }).click();
  await expect(dialog).toBeHidden();
  await expect(editor.locator("[data-video-embed]")).toHaveCount(1);
}
const staffSlugs: Record<string, string> = {
  Dashboard: "",
  Offerings: "offerings",
  Collections: "collections",
  "Explore page": "explore",
  Approvals: "approvals",
  Exceptions: "exceptions",
  Activity: "activity",
  Transactions: "transactions",
  Learners: "learners",
  Staff: "staff",
  Roles: "roles",
};
test.describe("learner pages", () => {
  test("catalog", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, "Catalog");
  });
  for (const tab of ["courses", "collections", "pathways"])
    test(`catalog ${tab} tab`, async ({ page }) => {
      await page.goto(`/?tab=${tab}`);
      await expect(page.getByRole("tab", { selected: true })).toBeVisible();
      await scan(page, `Catalog ${tab} tab`);
    });
  test("my learning with pathways and saved courses", async ({ page }) => {
    await page.request.post("/api/demo-session", {
      data: { email: "a11y-scan@example.test" },
    });
    const pathway = await (
      await page.request.get("/api/collections/data-informed-leader")
    ).json();
    const command = (path: string, data: object) =>
      page.request.post(`/api/${path}`, {
        data,
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
    await command(`me/pathways/${pathway.id}`, { following: true });
    await command(`me/saved-courses/${pathway.offerings[0].id}`, {
      saved: true,
    });
    await page.goto("/learning");
    await expect(
      page.getByRole("heading", { level: 2, name: "Pathways you follow" }),
    ).toBeVisible();
    await scan(page, "My learning with pathways and saved courses");
  });
  test("catalog filtered by a pathway", async ({ page }) => {
    await page.goto("/?collection=data-informed-leader");
    await expect(
      page.getByRole("heading", { level: 2, name: "Data-Informed Leader" }),
    ).toBeVisible();
    await scan(page, "Catalog with collection filter");
  });
  test("pathway page", async ({ page }) => {
    await page.request.post("/api/demo-session", {
      data: { email: "a11y-scan@example.test" },
    });
    await page.goto("/collections/data-informed-leader");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, "Pathway page");
  });
  test("sign-in", async ({ page }) => {
    await page.goto("/sign-in");
    await scan(page, "Sign-in");
  });
  test("course detail", async ({ page }) => {
    await page.goto("/");
    const course = page.locator('a[href^="/courses/"]').first();
    await page.goto((await course.getAttribute("href")) as string);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, "Course detail");
  });
  test("my learning", async ({ page }) => {
    const signIn = await page.request.post("/api/demo-session", {
      data: { email: "a11y-scan@example.test" },
    });
    expect(signIn.ok()).toBeTruthy();
    await page.goto("/learning");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, "My learning");
  });
});
test("placeholder Canvas link dialog", async ({ page }) => {
  // Enroll the scan's synthetic learner in a sample course (placeholder Canvas
  // address) through the normal flow; later runs reuse the same registration.
  await page.request.post("/api/demo-session", {
    data: { email: "a11y-scan@example.test" },
  });
  const command = (path: string, data: object) =>
    page.request.post(`/api/${path}`, {
      data,
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
  const registration = await (
    await command("registrations", {
      offeringId: "10000000-0000-4000-8000-000000000001",
    })
  ).json();
  if (registration.status === "reserved")
    await command(
      `prototype/registrations/${registration.id}/simulate-payment`,
      {},
    );
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/me/learning")).json()).find(
          (row: { id: string }) => row.id === registration.id,
        )?.status,
      { timeout: 30_000 },
    )
    .toBe("enrolled");
  await page.goto("/learning");
  await page
    .getByRole("button", { name: "Open Practical Data Analysis in Canvas" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await scan(page, "Placeholder Canvas link dialog");
});
test("text fields show focus with a thicker border, not an outline over the label", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const field = page.getByRole("textbox").first();
  await field.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(field).toBeFocused();
  expect(await field.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    "none",
  );
  expect(
    await field.evaluate(
      (el) =>
        getComputedStyle(
          el
            .closest(".MuiOutlinedInput-root")!
            .querySelector(".MuiOutlinedInput-notchedOutline")!,
        ).borderWidth,
    ),
  ).toBe("3px");
});
test("settings page: color theme choice and memory", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  const group = page.getByRole("radiogroup", { name: "Color theme" });
  await expect(
    group.getByRole("radio", { name: /^Match device/ }),
  ).toBeChecked();
  await scan(page, "Settings");
  // Choosing the opposite of the device's setting overrides it, from the keyboard.
  const device = await page.evaluate(() =>
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const other = device === "dark" ? "light" : "dark";
  await group.getByRole("radio", { name: /^Match device/ }).focus();
  // Light is next, Dark after it (Safari does not wrap arrow keys).
  await page.keyboard.press("ArrowDown");
  if (other === "dark") await page.keyboard.press("ArrowDown");
  await expect(
    group.getByRole("radio", { name: new RegExp(`^${other}`, "i") }),
  ).toBeChecked();
  await expect(page.locator("html")).toHaveClass(new RegExp(other));
  await scan(page, `Settings in the ${other} theme`);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(new RegExp(other));
  await expect(
    group.getByRole("radio", { name: new RegExp(`^${other}`, "i") }),
  ).toBeChecked();
});
test("Stripe test cards dialog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Test Payment Info" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Stripe sandbox test cards",
  });
  await expect(dialog).toBeVisible();
  await scan(page, "Stripe test cards dialog");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Test Payment Info" }),
  ).toBeFocused();
});
test.describe("staff workspace", () => {
  test("staff sign-in", async ({ page }) => {
    await page.request.delete("/api/staff-session");
    await page.goto("/staff");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, "Staff sign-in");
  });
  const tabs = [
    "Dashboard",
    "Offerings",
    "Collections",
    "Explore page",
    "Approvals",
    "Exceptions",
    "Activity",
    "Transactions",
    "Learners",
    "Staff",
    "Roles",
  ];
  for (const tab of tabs)
    test(`${tab} tab`, async ({ page }) => {
      const signIn = await page.request.post("/api/staff-session", {
        data: { email: "admin@cuce.test" },
      });
      expect(signIn.ok()).toBeTruthy();
      await page.goto(`/staff/${staffSlugs[tab]}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(tab);
      await scan(page, `Staff ${tab} tab`);
    });
});
// Each tab of an offering's page, as a catalog manager (editable forms) and as
// an approver (read-only views).
const offeringTabs = ["", "details", "settings", "sales-page", "activity"];
for (const who of ["catalog@cuce.test", "approver@cuce.test"])
  test(`offering page tabs as ${who.split("@")[0]}`, async ({ page }) => {
    await page.request.post("/api/staff-session", { data: { email: who } });
    for (const tab of offeringTabs) {
      await page.goto(
        `/staff/offerings/10000000-0000-4000-8000-000000000001${tab ? `/${tab}` : ""}`,
      );
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Practical Data Analysis",
        }),
      ).toBeVisible();
      await expect(page.locator("#offering-panel-heading")).toBeVisible();
      await scan(page, `Offering page ${tab || "overview"} as ${who}`);
    }
  });
test("unsaved changes: the staff sidebar asks before leaving", async ({
  page,
}) => {
  await page.request.post("/api/staff-session", {
    data: { email: "catalog@cuce.test" },
  });
  await page.goto(
    "/staff/offerings/10000000-0000-4000-8000-000000000001/settings",
  );
  const field = page.getByRole("textbox", { name: "Canvas course URL" });
  await field.fill("https://canvas.example.edu/courses/changed");
  // On phones the sidebar is in a drawer behind the "Staff sections" button.
  const sections = page.getByRole("button", { name: "Staff sections" });
  const clickCollections = async () => {
    if (await sections.isVisible()) await sections.click();
    await page
      .getByRole("navigation", { name: "Staff sections" })
      .getByRole("link", { name: "Collections" })
      .filter({ visible: true })
      .click();
  };
  await clickCollections();
  const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await scan(page, "Leave without saving dialog");
  await dialog.getByRole("button", { name: "Stay" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/settings$/);
  // Stay returns to the open drawer on phones; Escape closes it.
  if (await page.locator(".MuiDrawer-paper").isVisible())
    await page.keyboard.press("Escape");
  await expect(field).toHaveValue("https://canvas.example.edu/courses/changed");
  await clickCollections();
  await dialog.getByRole("button", { name: "Discard changes" }).click();
  await expect(page).toHaveURL(/\/staff\/collections$/);
});
test("sales page editor and preview", async ({ page }) => {
  await openEditorWithRichContent(page);
  await scan(page, "Sales page editor");
  // Choosing an image asks for its description first (cancelled: nothing is uploaded).
  await page.locator('input[type="file"]').setInputFiles({
    name: "chart.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
        "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
      "hex",
    ),
  });
  const describe = page.getByRole("dialog", { name: "Describe the image" });
  await expect(describe).toBeVisible();
  await expect(
    describe.getByRole("textbox", { name: "Image description" }),
  ).toBeFocused();
  await scan(page, "Image description dialog");
  await describe.getByRole("button", { name: "Cancel" }).click();
  await expect(describe).toBeHidden();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await scan(page, "Sales page preview");
});
test.describe("staff dialogs", () => {
  // Opens each dialog and scans it; nothing is submitted.
  const dialogs: [string, string, RegExp][] = [
    ["New offering", "Offerings", /^New offering$/],
    ["Unpublish offering", "Offerings", /^Unpublish /],
    ["Learner details", "Learners", /^View learner /],
    ["New collection", "Collections", /^New collection$/],
    ["Edit collection", "Collections", /^Edit /],
    ["Add staff member", "Staff", /^Add staff member$/],
  ];
  for (const [name, tab, button] of dialogs)
    test(`${name} dialog`, async ({ page }) => {
      if (tab === "Staff") {
        const member = {
          id: "00000000-0000-4000-8000-000000000001",
          email: "staff-dialog@example.test",
          display_name: "Staff dialog test",
          roles: ["staff_admin"],
          scopes: ["staff:read", "staff:manage"],
          active: true,
          version: 1,
          auth_provider: "canvas:https://canvas.example.test",
        };
        await page.route("**/api/staff-session", (route) =>
          route.fulfill({
            json: { member, auth: { mode: "canvas", configured: true } },
          }),
        );
        await page.route("**/api/staff/members", (route) =>
          route.fulfill({ json: [member] }),
        );
      } else {
        await page.request.post("/api/staff-session", {
          data: { email: "admin@cuce.test" },
        });
      }
      await page.goto(`/staff/${staffSlugs[tab]}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(tab);
      await page.getByRole("button", { name: button }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await scan(page, `${name} dialog`);
      if (tab === "Staff") {
        const dialog = page.getByRole("dialog");
        await expect(
          dialog.getByRole("checkbox", { name: "Finance", exact: true }),
        ).toHaveCount(0);
        await dialog.getByRole("button", { name: "Cancel" }).press("Enter");
        const edit = page.getByRole("button", {
          name: "Edit Staff dialog test",
        });
        await edit.press("Enter");
        await expect(dialog).toHaveAccessibleName("Edit staff member");
        await expect(
          dialog.getByRole("checkbox", { name: "Finance", exact: true }),
        ).toHaveCount(0);
        await expect(dialog.getByRole("checkbox")).toHaveCount(6);
        await scan(page, "Edit staff member dialog");
        await page.screenshot({
          path: `/tmp/ce-staff-roles-edit-${test.info().project.name}.png`,
        });
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(edit).toBeFocused();
      }
    });
});

test.describe("Canvas course connector", () => {
  const sourceCourse = {
    id: "101",
    account_id: "50",
    name: "Working with Data",
    course_code: "CE-101",
    workflow_state: "available",
    start_at: null,
    end_at: null,
    url: "https://canvas.example.test/courses/101",
    sync_status: "not_synced" as string,
    synced_at: null as string | null,
  };
  function preview() {
    return {
      enabled: true,
      configured: true,
      connected: true,
      subaccount_id: "50",
      include_subaccounts: false,
      last_success_at: null as string | null,
      saved_run_id: null as string | null,
      saved_revision: "0".repeat(64),
      synced_total: 0,
      source: "saved",
      preview: null as {
        run_id: string;
        expires_at: string;
        observed_at: string;
        total: number;
      } | null,
      preview_expired: false,
      latest_run: null as {
        id: string;
        status: string;
        trigger: string;
        course_count: number;
        error: string | null;
      } | null,
      schedule: {
        enabled: false,
        interval_minutes: 60,
        owner_name: null as string | null,
        owner_active: true,
        next_run_at: null as string | null,
        version: 0,
      },
      courses: [] as (typeof sourceCourse)[],
      total: 0,
      page: 1,
      page_size: 100,
    };
  }
  async function staff(
    page: Page,
    scopes = ["canvas:read", "canvas:sync", "canvas:manage"],
  ) {
    await page.route("**/api/staff/canvas/sync", (route) =>
      route.fulfill({
        status: 503,
        json: { message: "No Canvas read fixture configured." },
      }),
    );
    await page.route("**/api/staff-session", (route) =>
      route.fulfill({
        json: {
          member: {
            id: "00000000-0000-4000-8000-000000000001",
            email: "connector@example.test",
            display_name: "Course connector test",
            roles: ["staff_admin"],
            active: true,
            version: 1,
            scopes,
          },
          auth: { mode: "canvas", configured: true },
        },
      }),
    );
  }
  test("unlimited seats require an explicit choice and display correctly for staff and learners", async ({
    page,
  }, testInfo) => {
    await staff(page, [
      "canvas:read",
      "canvas:sync",
      "catalog:read",
      "catalog:write",
    ]);
    const id = "00000000-0000-4000-8000-000000000202";
    const offering = {
      id,
      title: "Unlimited learning workshop",
      category: "Technology",
      summary: "A synthetic offering for unlimited-seat testing.",
      description:
        "This synthetic workshop verifies explicit unlimited capacity without changing live offerings.",
      format: "Online",
      course_type: "self_paced",
      start_date: null,
      end_date: null,
      capacity: null as number | null,
      unlimited_seats: false,
      price_cents: 7500,
      published: false,
      imported_from_canvas: true,
      unpublished_at: null,
      canvas_course_url: "https://canvas.example.test/courses/202",
      approval_required: false,
      approval_valid_days: 7,
      enrollment_close_days: 7,
      version: 1,
      seats_available: null as number | null,
      seats_in_use: 0,
      active_registrations: 0,
      sales_page_status: "none",
      enrollment_open: true,
      outcomes: [],
      collections: [],
      sales_page: null,
    };
    await page.route("**/api/staff/offerings", (route) =>
      route.fulfill({ json: [offering] }),
    );
    await page.route(`**/api/staff/offerings/${id}`, (route) =>
      route.fulfill({ json: { offering, registrations: {}, activity: [] } }),
    );
    await page.route(`**/api/offerings/${id}/prices`, (route) =>
      route.fulfill({ json: [] }),
    );
    for (const endpoint of ["approval-requests", "exceptions"])
      await page.route(`**/api/${endpoint}`, (route) =>
        route.fulfill({ json: [] }),
      );
    await page.route("**/api/reconciliation", (route) =>
      route.fulfill({ json: { audit: [] } }),
    );
    await page.route("**/api/prototype/simulation", (route) =>
      route.fulfill({ json: { provisioningOutcome: "normal" } }),
    );
    await page.route("**/api/demo-session", (route) =>
      route.fulfill({ json: { email: null } }),
    );
    let saves = 0;
    await page.route(`**/api/offerings/${id}/edit`, async (route) => {
      const data = route.request().postDataJSON();
      expect(data.version).toBe(offering.version);
      expect(data.unlimitedSeats).toBe(saves === 0);
      expect(data.capacity).toBe(saves === 0 ? null : 25);
      saves++;
      Object.assign(offering, {
        unlimited_seats: data.unlimitedSeats,
        capacity: data.capacity,
        seats_available: data.capacity,
        version: offering.version + 1,
      });
      await route.fulfill({ json: { id } });
    });
    await page.goto(`/staff/offerings/${id}/details`);
    const unlimited = page.getByRole("checkbox", {
      name: "Unlimited seats",
      exact: true,
    });
    const capacity = page.getByRole("textbox", {
      name: "Seat capacity",
      exact: true,
    });
    const save = page.getByRole("button", {
      name: "Save changes",
      exact: true,
    });
    await expect(unlimited).not.toBeChecked();
    await expect(capacity).toHaveValue("");
    await save.press("Enter");
    await expect(
      page.getByRole("alert").filter({ hasText: "Fix these fields" }),
    ).toBeFocused();
    await unlimited.press("Space");
    await expect(unlimited).toBeChecked();
    await expect(capacity).toBeDisabled();
    await save.press("Enter");
    await expect.poll(() => saves).toBe(1);
    await expect(
      page.getByText(/Draft missing required information:/),
    ).toHaveCount(0);
    await expect(unlimited).toBeChecked();
    await scan(
      page,
      "Unlimited seats form, explicit choice and blank disabled capacity",
    );
    if (testInfo.project.name === "light")
      await page.screenshot({
        path: "artifacts/unlimited-seats.png",
        fullPage: true,
      });
    await page.reload();
    await expect(unlimited).toBeChecked();
    await unlimited.press("Space");
    await expect(capacity).toBeEnabled();
    await expect(capacity).toHaveValue("");
    await save.press("Enter");
    await expect(
      page.getByRole("alert").filter({ hasText: "Seat capacity" }),
    ).toBeFocused();
    await capacity.fill("25");
    await save.press("Enter");
    await expect.poll(() => saves).toBe(2);
    // Present an unlimited source response to check every display surface.
    Object.assign(offering, {
      unlimited_seats: true,
      capacity: null,
      seats_available: null,
      seats_in_use: 12,
    });
    await page.goto(`/staff/offerings/${id}`);
    await expect(
      page.getByRole("button", { name: "Publish", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByText("Unlimited seats · 12 in use", { exact: true }),
    ).toBeVisible();
    await page.goto("/staff/offerings");
    await expect(
      page
        .getByText(/Unlimited/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await scan(page, "Staff offering list with unlimited capacity");
    await page.route("**/api/staff/dashboard?*", (route) =>
      route.fulfill({
        json: {
          range: {
            days: 30,
            from: "2026-09-14",
            to: "2026-10-14",
            bucket: "day",
          },
          simulated: true,
          enrollment: {
            registrations: 12,
            enrolled: 0,
            in_progress: 12,
            awaiting_approval: 0,
            exceptions: 0,
            not_continuing: 0,
            seats_capacity: 0,
            seats_in_use: 12,
            limited_seats_in_use: 0,
            unlimited_offerings: 1,
            unlimited_seats_in_use: 12,
            trend: [],
            by_offering: [
              {
                ...offering,
                registrations: 12,
                enrolled: 0,
                in_progress: 12,
                awaiting_approval: 0,
              },
            ],
          },
          sales: null,
          completion: {
            available: false,
            reason: "Canvas completion is not connected.",
          },
        },
      }),
    );
    await page.goto("/staff");
    await expect(
      page.getByText(/1 unlimited offering · 12 seats in use/),
    ).toBeVisible();
    await scan(
      page,
      "Dashboard separates unlimited seats from finite occupancy",
    );
    await page.route(`**/api/offerings/${id}`, (route) =>
      route.fulfill({ json: { ...offering, published: true } }),
    );
    await page.goto(`/courses/${id}`);
    await expect(
      page.getByText("Unlimited seats", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in to register", exact: true }),
    ).toBeEnabled();
    await scan(
      page,
      "Learner offering with unlimited availability and enabled registration",
    );
  });
  test("imported drafts warn about missing fields, keep inputs blank and protect the Canvas link", async ({
    page,
  }, testInfo) => {
    await staff(page, [
      "canvas:read",
      "canvas:sync",
      "catalog:read",
      "catalog:write",
    ]);
    const id = "00000000-0000-4000-8000-000000000101";
    const draft = {
      id,
      title: "Imported Canvas workshop",
      category: "",
      summary: "",
      description: "",
      format: "",
      course_type: null as string | null,
      start_date: null,
      end_date: null,
      capacity: null as number | null,
      price_cents: null as number | null,
      published: false,
      imported_from_canvas: true,
      unpublished_at: null,
      canvas_course_url: "https://canvas.example.test/courses/101",
      approval_required: true,
      approval_valid_days: 7,
      enrollment_close_days: 7,
      version: 1,
      seats_available: null,
      seats_in_use: 0,
      active_registrations: 0,
      sales_page_status: "none",
      enrollment_open: false,
    };
    await page.route("**/api/staff/offerings", (route) =>
      route.fulfill({ json: [draft] }),
    );
    await page.route(`**/api/staff/offerings/${id}`, (route) =>
      route.fulfill({
        json: { offering: draft, registrations: {}, activity: [] },
      }),
    );
    for (const endpoint of ["approval-requests", "exceptions"])
      await page.route(`**/api/${endpoint}`, (route) =>
        route.fulfill({ json: [] }),
      );
    await page.route("**/api/reconciliation", (route) =>
      route.fulfill({ json: { audit: [] } }),
    );
    await page.route("**/api/prototype/simulation", (route) =>
      route.fulfill({ json: { provisioningOutcome: "normal" } }),
    );
    await page.goto(`/staff/offerings/${id}`);
    await expect(
      page.getByText(/Draft missing required information:/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Not set", { exact: true }).first(),
    ).toBeVisible();
    await scan(
      page,
      "Imported offering overview and required-information warning",
    );
    if (testInfo.project.name === "light")
      await page.screenshot({
        path: "artifacts/canvas-offering-draft-warning.png",
        fullPage: true,
      });

    await page
      .getByRole("navigation", { name: "Offering sections" })
      .getByRole("link", { name: "Details", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Price (USD)" }),
    ).toHaveValue("");
    await expect(
      page.getByRole("textbox", { name: "Seat capacity" }),
    ).toHaveValue("");
    await expect(
      page.getByRole("combobox", { name: "Course type" }),
    ).toHaveText(/Not set/);
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    const summary = page
      .getByRole("alert")
      .filter({ hasText: "Fix these fields" });
    await expect(summary).toBeFocused();
    await summary
      .getByRole("link", {
        name: "Course type: Choose a course type.",
        exact: true,
      })
      .press("Enter");
    await expect(
      page.getByRole("combobox", { name: "Course type" }),
    ).toBeFocused();
    await scan(
      page,
      "Imported offering details, blank fields and validation focus",
    );
    // Settings remain independently saveable while Details are incomplete.
    let settingsSaved = false;
    await page.route(`**/api/offerings/${id}/settings`, async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        version: 1,
        approvalValidDays: 14,
        enrollmentCloseDays: 7,
        listed: true,
        canvasCourseUrl: draft.canvas_course_url,
      });
      settingsSaved = true;
      await route.fulfill({ json: { id } });
    });
    await page
      .getByRole("navigation", { name: "Offering sections" })
      .getByRole("link", { name: "Settings", exact: true })
      .click();
    const canvasUrl = page.getByRole("textbox", { name: "Canvas course URL" });
    await expect(canvasUrl).toHaveAttribute("readonly");
    await page
      .getByRole("textbox", { name: "Approval valid for (days)" })
      .fill("14");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect.poll(() => settingsSaved).toBe(true);
    await scan(page, "Incomplete offering settings and protected Canvas link");
    await page.goto("/staff/offerings");
    await expect(
      page
        .getByText(/Missing required information:/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("button", { name: `Publish ${draft.title}`, exact: true })
        .filter({ visible: true }),
    ).toBeDisabled();
    await scan(page, "Offerings list with incomplete imported drafts");
    await page.route("**/api/staff/dashboard?*", (route) =>
      route.fulfill({
        json: {
          range: {
            days: 30,
            from: "2026-09-14",
            to: "2026-10-14",
            bucket: "day",
          },
          simulated: true,
          enrollment: {
            registrations: 0,
            enrolled: 0,
            in_progress: 0,
            awaiting_approval: 0,
            exceptions: 0,
            not_continuing: 0,
            seats_capacity: 0,
            seats_in_use: 0,
            trend: [],
            by_offering: [
              {
                ...draft,
                registrations: 0,
                enrolled: 0,
                in_progress: 0,
                awaiting_approval: 0,
              },
            ],
          },
          sales: null,
          completion: {
            available: false,
            reason: "Canvas completion is not connected.",
          },
        },
      }),
    );
    await page.goto("/staff");
    await expect(
      page
        .getByText(/Seat capacity not set|^Not set$/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await scan(page, "Dashboard with an unset draft capacity");
  });
  test("setup needed and reauthorization states", async ({ page }) => {
    await staff(page);
    const data = preview();
    data.enabled = false;
    data.configured = false;
    data.connected = false;
    await page.route("**/api/staff/canvas/courses?*", (route) =>
      route.fulfill({ json: data }),
    );
    await page.goto("/staff/canvas");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Canvas courses",
    );
    await expect(
      page.getByText("Canvas course reads are not configured yet.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh from Canvas", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "Authorize course reads" }),
    ).toHaveCount(0);
    await scan(page, "Canvas courses setup");
    data.enabled = true;
    data.configured = true;
    await page
      .getByRole("button", { name: "Connection details", exact: true })
      .press("Enter");
    await page.getByRole("button", { name: "Refresh status" }).click();
    await expect(
      page.getByRole("link", { name: "Authorize course reads" }),
    ).toHaveAttribute("href", "/api/auth/canvas/start");
    await scan(page, "Canvas courses reauthorization");
  });
  test("sync status, course preview and schedule keyboard controls", async ({
    page,
  }) => {
    await staff(page);
    const data = preview();
    let polls = 0;
    let commands = 0;
    await page.route("**/api/staff/canvas/courses?*", (route) => {
      if (data.latest_run?.status === "pending" && ++polls >= 2) {
        data.latest_run.status = "succeeded";
        data.latest_run.course_count = 1;
        data.source = "preview";
        data.preview = {
          run_id: data.latest_run.id,
          expires_at: "2099-10-14T12:30:00Z",
          observed_at: "2026-10-14T12:00:00Z",
          total: 1,
        };
        data.courses = [sourceCourse];
        data.total = 1;
      }
      return route.fulfill({ json: data });
    });
    await page.route("**/api/staff/canvas/sync", (route) => {
      commands++;
      expect(route.request().headers()["idempotency-key"]).toBeTruthy();
      data.latest_run = {
        id: "00000000-0000-4000-8000-000000000002",
        status: "pending",
        trigger: "manual",
        course_count: 0,
        error: null,
      };
      return route.fulfill({ status: 202, json: data.latest_run });
    });
    await page.route("**/api/staff/canvas/schedule", (route) => {
      const body = route.request().postDataJSON();
      expect(body.version).toBe(data.schedule.version);
      data.schedule = {
        enabled: body.enabled,
        interval_minutes: body.intervalMinutes,
        owner_name: "Course connector test",
        owner_active: true,
        next_run_at: body.enabled ? "2026-10-14T13:00:00Z" : null,
        version: data.schedule.version + 1,
      };
      return route.fulfill({ json: { saved: true } });
    });
    let saves = 0;
    await page.route(
      "**/api/staff/canvas/sync-runs/*/sync-courses",
      (route) => {
        saves++;
        expect(route.request().postDataJSON()).toEqual({
          courseIds: ["101"],
          savedRevision: "0".repeat(64),
        });
        data.last_success_at = "2026-10-14T12:00:00Z";
        data.saved_run_id = data.preview!.run_id;
        data.synced_total = 1;
        data.saved_revision = "1".repeat(64);
        data.courses = [
          {
            ...sourceCourse,
            sync_status: "synced",
            synced_at: "2026-10-14T12:00:00Z",
          },
        ] as typeof data.courses;
        return route.fulfill({ json: { synced: true } });
      },
    );
    await page.goto("/staff/canvas");

    await expect(
      page.getByRole("button", { name: "Reading courses…", exact: true }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Course preview (1)" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Course preview (1)" }),
    ).not.toBeFocused();
    await expect(
      page.getByRole("table", { name: "Published Canvas courses" }),
    ).toBeVisible();
    expect(commands).toBe(1);
    expect(saves).toBe(0);
    await expect(
      page.getByRole("button", { name: "Import selected", exact: true }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole("region", { name: "Canvas connection" })
        .getByRole("button", { name: "Sync Now", exact: true }),
    ).toHaveCount(0);
    await scan(page, "Unsaved Canvas course preview");
    await page
      .getByRole("checkbox", {
        name: "Select Working with Data (Canvas ID 101)",
        exact: true,
      })
      .press("Space");
    await page
      .getByRole("button", { name: "Import selected", exact: true })
      .press("Enter");
    await expect(
      page.getByRole("button", { name: "Import selected", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "Course preview (1)" }),
    ).toBeFocused();
    await expect(
      page.getByRole("cell", { name: "Imported", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("tab", { name: "Imported courses (1)", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Imported courses (1)", exact: true }),
    ).toBeVisible();
    expect(saves).toBe(1);
    await expect(
      page.getByRole("link", { name: /Working with Data/ }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    const settings = page.getByRole("button", {
      name: "Schedule settings",
      exact: true,
    });
    await expect(
      page.getByRole("region", { name: "Scheduled course reads" }),
    ).toHaveCount(0);
    await settings.press("Enter");
    await expect(
      page.getByRole("button", { name: "Hide schedule settings" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByText("Scheduled synchronization is deferred in this demo.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enable using my Canvas account" }),
    ).toHaveCount(0);
    await scan(page, "Canvas course preview and deferred schedule");
  });
  test("cached preview is reused and refresh stays in the filter toolbar", async ({
    page,
  }) => {
    await staff(page);
    const data = preview();
    data.preview = {
      run_id: "00000000-0000-4000-8000-000000000002",
      expires_at: "2099-10-14T12:30:00Z",
      observed_at: "2026-10-14T12:00:00Z",
      total: 1,
    };
    data.courses = [sourceCourse];
    data.total = 1;
    let commands = 0;
    await page.route("**/api/staff/canvas/courses?*", (route) =>
      route.fulfill({ json: data }),
    );
    await page.route("**/api/staff/canvas/sync", (route) => {
      commands++;
      data.latest_run = {
        id: data.preview!.run_id,
        status: "succeeded",
        trigger: "manual",
        course_count: 1,
        error: null,
      };
      return route.fulfill({ status: 202, json: { id: data.preview!.run_id } });
    });
    await page.goto("/staff/canvas");
    await expect(
      page.getByRole("table", { name: "Published Canvas courses" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(
      page.getByText("1 matching courses of 1", { exact: true }),
    ).toBeVisible();
    expect(commands).toBe(0);
    await expect(
      page
        .getByRole("region", { name: "Canvas connection" })
        .getByRole("button", { name: "Refresh from Canvas", exact: true }),
    ).toHaveCount(0);
    const refresh = page
      .getByRole("form", { name: "Filter Canvas courses" })
      .getByRole("button", { name: "Refresh from Canvas", exact: true });
    const buttonBox = await refresh.boundingBox();
    const toolbarBox = await page
      .getByRole("form", { name: "Filter Canvas courses" })
      .boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(toolbarBox).not.toBeNull();
    expect(
      Math.abs(
        buttonBox!.x + buttonBox!.width - toolbarBox!.x - toolbarBox!.width,
      ),
    ).toBeLessThanOrEqual(2);
    await refresh.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Course preview (1)" }),
    ).toBeFocused();
    expect(commands).toBe(1);
    await scan(page, "Cached course preview and refresh toolbar");
  });
  test("expired preview automatically reads once and a failure requires explicit retry", async ({
    page,
  }) => {
    await staff(page);
    const data = preview();
    data.preview_expired = true;
    let attempts = 0,
      reads = 0;
    await page.route("**/api/staff/canvas/courses?*", (route) => {
      reads++;
      if (attempts === 2) {
        data.preview = {
          run_id: "00000000-0000-4000-8000-000000000002",
          expires_at: "2099-10-14T12:30:00Z",
          observed_at: "2026-10-14T12:00:00Z",
          total: 1,
        };
        data.preview_expired = false;
        data.courses = [sourceCourse];
        data.total = 1;
        data.latest_run = {
          id: data.preview.run_id,
          status: "succeeded",
          trigger: "manual",
          course_count: 1,
          error: null,
        };
      }
      return route.fulfill({ json: data });
    });
    await page.route("**/api/staff/canvas/sync", (route) => {
      attempts++;
      if (attempts === 1)
        return route.fulfill({
          status: 503,
          json: {
            message:
              "Automatic course read failed. Refresh from Canvas to retry.",
          },
        });
      return route.fulfill({
        status: 202,
        json: { id: "00000000-0000-4000-8000-000000000002" },
      });
    });
    await page.goto("/staff/canvas");
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Automatic course read failed" }),
    ).toBeVisible();
    expect(attempts).toBe(1);
    const before = reads;
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect.poll(() => reads).toBeGreaterThan(before);
    expect(attempts).toBe(1);
    await page
      .getByRole("button", { name: "Refresh from Canvas", exact: true })
      .press("Enter");
    await expect(
      page.getByRole("table", { name: "Published Canvas courses" }),
    ).toBeVisible();
    expect(attempts).toBe(2);
    await expect(
      page.getByRole("button", { name: "Import selected", exact: true }),
    ).toBeDisabled();
    await scan(page, "Automatic preview retry");
  });
  test("an existing failed background read is followed without another automatic request", async ({
    page,
  }) => {
    await staff(page);
    const data = preview();
    let gets = 0,
      commands = 0;
    let complete = false;
    data.latest_run = {
      id: "00000000-0000-4000-8000-000000000002",
      status: "running",
      trigger: "manual",
      course_count: 0,
      error: null,
    };
    await page.route("**/api/staff/canvas/courses?*", (route) => {
      gets++;
      if (complete) {
        data.latest_run!.status = "failed";
        data.latest_run!.error =
          "Canvas read failed. Refresh from Canvas to retry.";
      }
      return route.fulfill({ json: data });
    });
    await page.route("**/api/staff/canvas/sync", (route) => {
      commands++;
      return route.fulfill({
        status: 503,
        json: { message: "Unexpected duplicate read" },
      });
    });
    await page.goto("/staff/canvas");
    await expect(
      page.getByRole("button", { name: "Reading courses…", exact: true }),
    ).toHaveAttribute("aria-disabled", "true");
    complete = true;
    await expect(
      page.getByRole("alert").filter({ hasText: "Canvas read failed" }),
    ).toBeVisible();
    expect(commands).toBe(0);
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect.poll(() => gets).toBeGreaterThanOrEqual(3);
    expect(commands).toBe(0);
  });
  test("select courses across pages, retry failures and find imported courses", async ({
    page,
  }, testInfo) => {
    await staff(page);
    const data = preview();
    const all = Array.from({ length: 26 }, (_, i) => ({
      ...sourceCourse,
      id: String(101 + i),
      name: `Selection course ${101 + i}`,
    }));
    const synced = new Set<string>();
    data.preview = {
      run_id: "00000000-0000-4000-8000-000000000002",
      expires_at: "2099-10-14T12:30:00Z",
      observed_at: "2026-10-14T12:00:00Z",
      total: 26,
    };
    await page.route("**/api/staff/canvas/courses?*", (route) => {
      const q = new URL(route.request().url()).searchParams;
      const rows =
        q.get("view") === "synced" ? all.filter((c) => synced.has(c.id)) : all;
      const pageNumber = Number(q.get("page") || 1),
        size = Number(q.get("pageSize") || 25);
      return route.fulfill({
        json: {
          ...data,
          saved_revision: "0".repeat(64),
          synced_total: synced.size,
          last_success_at: synced.size ? "2026-10-14T12:00:00Z" : null,
          total: rows.length,
          source_total: rows.length,
          courses: rows
            .slice((pageNumber - 1) * size, pageNumber * size)
            .map((c) => ({
              ...c,
              sync_status: synced.has(c.id) ? "synced" : "not_synced",
              synced_at: synced.has(c.id) ? "2026-10-14T12:00:00Z" : null,
              offering_id: synced.has(c.id)
                ? `00000000-0000-4000-8000-000000000${c.id}`
                : null,
              offering_title: c.name,
              offering_missing_fields: synced.has(c.id)
                ? ["Price", "Seat capacity", "Course type"]
                : [],
            })),
        },
      });
    });
    let requests = 0;
    await page.route(
      "**/api/staff/canvas/sync-runs/*/sync-courses",
      (route) => {
        requests++;
        if (requests === 1)
          return route.fulfill({
            status: 503,
            json: { message: "Temporary sync failure. Try again." },
          });
        const ids = route.request().postDataJSON().courseIds;
        expect(ids).toEqual(requests === 2 ? ["101", "126"] : ["126"]);
        ids.forEach((id: string) => synced.add(id));
        return route.fulfill({
          json: {
            synced: true,
            course_count: ids.length,
            created_count: requests === 2 ? ids.length : 0,
            existing_count: requests === 2 ? 0 : ids.length,
          },
        });
      },
    );
    await page.goto("/staff/canvas");
    const bulk = page.getByRole("button", {
      name: "Import selected",
      exact: true,
    });
    await expect(bulk).toBeDisabled();
    await expect(bulk).toHaveAccessibleDescription(
      "Creates drafts for new courses and refreshes Canvas source details for existing mappings. Staff edits are preserved.",
    );
    await expect(
      page.getByRole("button", {
        name: "Create offering draft for Selection course 101 (Canvas ID 101)",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Import status", exact: true }),
    ).toBeVisible();
    const header = page.getByRole("checkbox", {
      name: "Select all courses on this page",
      exact: true,
    });
    await header.check();
    await expect(page.getByText("25 selected", { exact: true })).toBeVisible();
    await header.uncheck();
    await page
      .getByRole("checkbox", {
        name: "Select Selection course 101 (Canvas ID 101)",
        exact: true,
      })
      .check();
    await expect(header).toHaveAttribute("aria-checked", "mixed");
    await page
      .getByRole("button", { name: "Go to next page", exact: true })
      .click();
    await page
      .getByRole("checkbox", {
        name: "Select Selection course 126 (Canvas ID 126)",
        exact: true,
      })
      .check();
    await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
    await bulk.click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Temporary sync failure" }),
    ).toBeVisible();
    await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
    await bulk.click();
    await expect(page.getByText("0 selected", { exact: true })).toBeVisible();
    if (testInfo.project.name === "light") {
      await page
        .getByRole("button", {
          name: "Refresh source details for Selection course 126 (Canvas ID 126)",
          exact: true,
        })
        .waitFor({ state: "visible" });
      await page.screenshot({
        path: "artifacts/canvas-import-controls.png",
        fullPage: true,
      });
    }
    await page
      .getByRole("button", {
        name: "Refresh source details for Selection course 126 (Canvas ID 126)",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Course preview (26)" }),
    ).toBeFocused();
    await page
      .getByRole("tab", { name: "Imported courses (2)", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: /^Selection course 101/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Selection course 126/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "Open offering Selection course 101",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Missing required information: Price, Seat capacity, Course type",
        { exact: true },
      ),
    ).toHaveCount(2);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Import selected", exact: true }),
    ).toHaveCount(0);
    await scan(page, "Imported Canvas courses");
  });
  test("course dates, filters, pagination and compact staff details", async ({
    page,
  }) => {
    await staff(page);
    const data = preview();
    const courses = [
      {
        ...sourceCourse,
        name: "Advanced Data Workshop",
        start_at: "2026-10-01T04:00:00Z",
        end_at: "2026-10-31T23:00:00Z",
      },
      {
        ...sourceCourse,
        id: "102",
        name: "Data Basics",
        workflow_state: "completed",
        start_at: null,
        end_at: null,
      },
    ];
    data.courses = courses as typeof data.courses;
    data.preview = {
      run_id: "00000000-0000-4000-8000-000000000002",
      expires_at: "2099-10-14T12:30:00Z",
      observed_at: "2026-10-14T12:00:00Z",
      total: 2,
    };
    data.total = 2;
    data.last_success_at = "2026-10-14T12:00:00Z";
    let query = new URLSearchParams();
    await page.route("**/api/staff/canvas/courses?*", (route) => {
      query = new URL(route.request().url()).searchParams;
      const filtered = courses.filter(
        (course) =>
          (!query.get("title") ||
            course.name
              .toLowerCase()
              .includes(query.get("title")!.toLowerCase())) &&
          (!query.get("startFrom") || Boolean(course.start_at)) &&
          (!query.get("endTo") || Boolean(course.end_at)) &&
          (query.get("status") !== "concluded" ||
            course.workflow_state === "completed"),
      );
      return route.fulfill({
        json: {
          ...data,
          courses: filtered,
          total: filtered.length,
          source_total: 2,
        },
      });
    });
    await page.goto("/staff/canvas");
    await expect(
      page.getByRole("table", { name: "Published Canvas courses" }),
    ).toBeVisible();
    const connectionDetails = page.getByRole("button", {
      name: "Connection details",
      exact: true,
    });
    await expect(connectionDetails).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByText("Subaccount: 50 · Direct courses only", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Refresh status", exact: true }),
    ).toHaveCount(0);
    await connectionDetails.press("Enter");
    await expect(
      page.getByText("Subaccount: 50 · Direct courses only", { exact: true }),
    ).toBeVisible();
    const hideConnection = page.getByRole("button", {
      name: "Hide connection details",
      exact: true,
    });
    await expect(hideConnection).toHaveAttribute("aria-expanded", "true");
    await scan(page, "Expanded Canvas connection");
    await hideConnection.press("Enter");
    await expect(connectionDetails).toBeFocused();
    await expect(connectionDetails).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("columnheader", { name: "Start date", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "End date", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "10/01/2026", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Not set", exact: true }),
    ).toHaveCount(2);
    const details = page.getByRole("button", {
      name: "Staff details",
      exact: true,
    });
    await expect(details).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByText("connector@example.test", { exact: true }),
    ).toHaveCount(0);
    await details.press("Enter");
    await expect(
      page.getByText("connector@example.test", { exact: true }),
    ).toBeVisible();
    await scan(page, "Expanded staff session");
    await page
      .getByRole("button", { name: "Hide staff details" })
      .press("Enter");
    await page
      .getByRole("textbox", { name: "Course title keywords" })
      .fill("advanced");
    await page
      .getByLabel("Start date from", { exact: true })
      .fill("2026-10-01");
    await page.getByLabel("End date to", { exact: true }).fill("2026-10-31");
    await page.getByRole("button", { name: "Apply filters" }).press("Enter");
    await expect(
      page.getByText("1 matching courses of 2", { exact: true }),
    ).toBeVisible();
    expect(query.get("title")).toBe("advanced");
    expect(query.get("startFrom")).toBe("2026-10-01");
    expect(query.get("endTo")).toBe("2026-10-31");
    expect(query.get("page")).toBe("1");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(
      page.getByText("2 matching courses of 2", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Publish status" })
      .selectOption("concluded");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("link", { name: /Data Basics/ })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Advanced Data Workshop/ }),
    ).toHaveCount(0);
    await scan(page, "Canvas course filters");
    await page
      .getByRole("textbox", { name: "Course title keywords" })
      .fill("no match");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(
      page.getByText(/No courses match these filters/),
    ).toBeVisible();
    await scan(page, "Empty filtered Canvas courses");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(
      page.getByRole("table", { name: "Published Canvas courses" }),
    ).toBeVisible();
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
      overflowing: [...document.querySelectorAll("main *")]
        .filter(
          (el) => el.getBoundingClientRect().right > window.innerWidth + 1,
        )
        .slice(0, 12)
        .map((el) => ({
          tag: el.tagName,
          cls: el.className,
          width: el.getBoundingClientRect().width,
          text: el.textContent?.slice(0, 60),
        })),
    }));
    expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(
      layout.width,
    );
  });
  test("failed read retains preview and read-only role has no write controls", async ({
    page,
  }) => {
    await staff(page, ["canvas:read"]);
    const data = preview();
    data.courses = [sourceCourse];
    data.total = 1;
    data.last_success_at = "2026-10-14T12:00:00Z";
    data.latest_run = {
      id: "00000000-0000-4000-8000-000000000002",
      status: "failed",
      trigger: "manual",
      course_count: 0,
      error:
        "Canvas could not complete the course read. The previous preview was retained.",
    };
    await page.route("**/api/staff/canvas/courses?*", (route) =>
      route.fulfill({ json: data }),
    );
    await page.goto("/staff/canvas");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "previous preview was retained",
    );
    await expect(
      page.getByRole("link", { name: /Working with Data/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh from Canvas", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Enable using my Canvas account" }),
    ).toHaveCount(0);
    await scan(page, "Canvas course read failure");
  });
});

test.describe("Canvas staff sign-in", () => {
  test("authenticated staff can retry a failed sign-out and return to Canvas login", async ({
    page,
  }) => {
    let attempts = 0;
    await page.route("**/api/staff-session", async (route) => {
      if (route.request().method() === "DELETE") {
        attempts++;
        return route.fulfill(
          attempts === 1
            ? { status: 503, json: { message: "Unavailable" } }
            : { json: { member: null } },
        );
      }
      return route.fulfill({
        json: {
          member: {
            id: "00000000-0000-4000-8000-000000000001",
            email: "header@cuce.test",
            display_name: "Header test staff",
            roles: ["staff_admin"],
            active: true,
            version: 1,
            scopes: [],
          },
          auth: { mode: "canvas", configured: true },
        },
      });
    });
    await page.goto("/staff");
    const signOut = page.getByRole("button", { name: "Sign out", exact: true });
    await expect(signOut).toBeVisible();
    const navigationMenu = page.getByRole("button", {
      name: "Open navigation menu",
    });
    if (await navigationMenu.isVisible()) {
      await navigationMenu.press("Enter");
      await expect(page.getByRole("menu")).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: "Sign in", exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(navigationMenu).toBeFocused();
    }
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    await scan(page, "Authenticated staff navigation");
    await signOut.click();
    await expect(
      page
        .getByRole("main")
        .getByRole("alert")
        .filter({ hasText: "Unable to sign out" }),
    ).toBeVisible();
    await expect(signOut).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    await signOut.click();
    await expect(
      page.getByRole("link", { name: "Sign in with Canvas" }),
    ).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    if (await navigationMenu.isVisible()) {
      await navigationMenu.press("Enter");
      await expect(
        page.getByRole("menuitem", { name: "Sign in", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(navigationMenu).toBeFocused();
    } else {
      await expect(
        page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("link", {
            name: "Sign in",
            exact: true,
          }),
      ).toBeVisible();
    }
  });
  async function canvasScreen(page: Page, configured: boolean, error = "") {
    await page.route("**/api/staff-session", (route) =>
      route.fulfill({
        json: { member: null, auth: { mode: "canvas", configured } },
      }),
    );
    await page.goto(`/staff${error ? `?authError=${error}` : ""}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Staff sign-in" }),
    ).toBeVisible();
  }
  test("configured: keyboard reaches and activates Canvas login", async ({
    page,
  }) => {
    await canvasScreen(page, true);
    const login = page.getByRole("link", { name: "Sign in with Canvas" });
    await expect(login).toHaveAttribute("href", "/api/auth/canvas/start");
    await expect(page.getByRole("radio")).toHaveCount(0);
    // Start at the skip link and use only Tab to reach the login action.
    await page.keyboard.press("Tab");
    for (
      let count = 0;
      count < 20 &&
      !(await login.evaluate((el) => el === document.activeElement));
      count++
    )
      await page.keyboard.press("Tab");
    await expect(login).toBeFocused();
    expect(
      await login.evaluate((el) => {
        const style = getComputedStyle(el);
        return style.outlineStyle !== "none" || style.boxShadow !== "none";
      }),
    ).toBeTruthy();
    await scan(page, "Canvas staff sign-in");
    await page.route("**/api/auth/canvas/start", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<html><body>Mock Canvas authorization boundary</body></html>",
      }),
    );
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/api\/auth\/canvas\/start$/);
    await page.goto("/staff?authError=denied");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "cancelled or denied",
    );
    await expect(login).toBeVisible();
  });
  test("missing configuration: accessible notice and no mock fallback", async ({
    page,
  }) => {
    await canvasScreen(page, false);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "not configured yet",
    );
    await expect(
      page.getByRole("link", { name: "Sign in with Canvas" }),
    ).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    await scan(page, "Canvas sign-in awaiting configuration");
  });
  test("callback errors are announced and allow another attempt", async ({
    page,
  }) => {
    await canvasScreen(page, true, "unauthorized");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "not been authorized",
    );
    await expect(
      page.getByRole("link", { name: "Sign in with Canvas" }),
    ).toBeVisible();
    await scan(page, "Canvas identity not authorized");
  });
});

test("manual Stripe reconciliation keyboard action and status", async ({
  page,
}) => {
  await page.route("**/api/staff-session", (route) =>
    route.fulfill({
      json: {
        member: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "support@example.test",
          display_name: "Payment test",
          roles: ["support"],
          active: true,
          version: 1,
          scopes: [
            "staff:read",
            "payments:read",
            "payments:reconcile",
            "refunds:request",
          ],
        },
        auth: { mode: "canvas", configured: true },
      },
    }),
  );
  for (const endpoint of ["staff/offerings", "approval-requests", "exceptions"])
    await page.route(`**/api/${endpoint}`, (route) =>
      route.fulfill({ json: [] }),
    );
  await page.route("**/api/reconciliation", (route) =>
    route.fulfill({
      json: {
        audit: [],
        simulated_orders: 0,
        simulated_enrollments: 0,
        pending_operations: 0,
        open_exceptions: 0,
      },
    }),
  );
  await page.route("**/api/prototype/simulation", (route) =>
    route.fulfill({ json: { provisioningOutcome: "normal" } }),
  );
  await page.route("**/api/staff/transactions", (route) =>
    route.fulfill({ json: [] }),
  );
  let checks = 0;
  await page.route("**/api/staff/transactions/reconcile", (route) => {
    checks++;
    if (checks === 1)
      return route.fulfill({
        status: 503,
        json: { message: "Stripe check unavailable. Try again." },
      });
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    return route.fulfill({ json: { checked: 2, failed: 1 } });
  });
  await page.goto("/staff/transactions");
  const check = page.getByRole("button", {
    name: "Check Stripe payments",
    exact: true,
  });
  await check.focus();
  await check.press("Enter");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Stripe check unavailable. Try again." }),
  ).toBeVisible();
  await expect(check).toBeFocused();
  await scan(page, "Manual Stripe recovery error");
  await check.press("Enter");
  await expect(
    page.getByRole("status").filter({
      hasText: "2 Checkout sessions reconciled; 1 could not be verified",
    }),
  ).toBeVisible();
  await expect(check).toBeFocused();
  expect(checks).toBe(2);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await scan(page, "Manual Stripe reconciliation");
  await page.screenshot({
    path: `/tmp/ce-request-demo-transactions-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("portal offering image editor keyboard, upload, validation and reset", async ({
  page,
}) => {
  const id = "00000000-0000-4000-8000-000000000601";
  const mediaId = "00000000-0000-4000-8000-000000000602";
  let offering = {
    id,
    title: "Portal image test",
    category: "Technology",
    summary: "Synthetic course summary for image checks",
    description: "Synthetic description for course image verification.",
    outcomes: [],
    format: "Online",
    course_type: "self_paced",
    start_date: null,
    end_date: null,
    price_cents: 100,
    capacity: 25,
    unlimited_seats: false,
    seats_available: 25,
    published: true,
    version: 1,
    approval_required: false,
    approval_valid_days: 7,
    enrollment_close_days: 7,
    canvas_course_url: "https://canvas.example.test/courses/1",
    imported_from_canvas: true,
    canvas_image_url: null,
    image_override: false,
    image_media_id: null as string | null,
    unpublished_at: null,
    active_registrations: 0,
    seats_in_use: 0,
    sales_page_status: "none",
  };
  await page.route("**/api/staff-session", (route) =>
    route.fulfill({
      json: {
        member: {
          id,
          email: "manager@example.test",
          display_name: "Image test",
          roles: ["catalog_manager"],
          active: true,
          version: 1,
          scopes: ["staff:read", "catalog:write"],
        },
        auth: { mode: "canvas", configured: true },
      },
    }),
  );
  for (const endpoint of ["approval-requests", "exceptions"])
    await page.route(`**/api/${endpoint}`, (route) =>
      route.fulfill({ json: [] }),
    );
  await page.route("**/api/staff/offerings", (route) =>
    route.fulfill({ json: [offering] }),
  );
  await page.route(`**/api/staff/offerings/${id}`, (route) =>
    route.fulfill({ json: { offering, registrations: {}, activity: [] } }),
  );
  await page.route(`**/api/offerings/${id}/prices`, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/reconciliation", (route) =>
    route.fulfill({
      json: {
        audit: [],
        simulated_orders: 0,
        simulated_enrollments: 0,
        pending_operations: 0,
        open_exceptions: 0,
      },
    }),
  );
  await page.route("**/api/prototype/simulation", (route) =>
    route.fulfill({ json: { provisioningOutcome: "normal" } }),
  );
  const { readFile } = await import("node:fs/promises");
  const cover = await readFile(
    "src/web/public/course-images/data-analysis.jpg",
  );
  await page.route(`**/media/${mediaId}`, (route) =>
    route.fulfill({ contentType: "image/jpeg", body: cover }),
  );
  const modes: string[] = [];
  await page.route(`**/api/offerings/${id}/image`, async (route) => {
    const body = route.request().postDataJSON();
    expect(body.version).toBe(offering.version);
    expect(body.reason).toBe("Choose a portal course image");
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    modes.push(body.mode);
    if (body.mode === "upload") {
      expect(body.fileName).toBe("portal-cover.jpg");
      expect(body.contentType).toBe("image/jpeg");
      expect(body.data).toBe(cover.toString("base64"));
    }
    offering = {
      ...offering,
      version: offering.version + 1,
      image_override: body.mode !== "source",
      image_media_id: body.mode === "upload" ? mediaId : null,
    };
    await route.fulfill({ json: offering });
  });
  await page.goto(`/staff/offerings/${id}/details`);
  const change = page.getByRole("button", {
    name: "Change image",
    exact: true,
  });
  // Unsaved text changes must not be lost by an independent image save.
  const summary = page.getByRole("textbox", {
    name: "Short summary",
    exact: true,
  });
  await summary.fill("Unsaved portal summary");
  await expect(change).toBeDisabled();
  await summary.fill(offering.summary);
  await expect(change).toBeEnabled();
  for (const mode of ["upload", "fallback", "source"]) {
    await change.focus();
    await change.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Change course image" });
    const choice = dialog.getByRole("radio", {
      name:
        mode === "upload"
          ? "Upload a portal image"
          : mode === "fallback"
            ? "Use CU CE image"
            : "Use Canvas course image",
      exact: true,
    });
    await choice.focus();
    await choice.press("Space");
    if (mode === "upload") {
      await dialog
        .getByLabel("Choose image (PNG, JPEG, WebP or GIF; up to 5 MB)")
        .setInputFiles({
          name: "wrong.svg",
          mimeType: "image/svg+xml",
          buffer: Buffer.from("<svg/>"),
        });
      await expect(dialog.getByRole("alert")).toContainText("Choose a PNG");
      await expect(dialog.getByRole("alert")).toBeFocused();
      await scan(page, "Course image validation");
      await dialog
        .getByLabel("Choose image (PNG, JPEG, WebP or GIF; up to 5 MB)")
        .setInputFiles({
          name: "portal-cover.jpg",
          mimeType: "image/jpeg",
          buffer: cover,
        });
      await expect(
        dialog.getByAltText("Course display image preview"),
      ).toHaveAttribute("src", /^data:image\/jpeg/);
    }
    await dialog
      .getByRole("textbox", { name: "Reason for image change" })
      .fill("Choose a portal course image");
    await scan(page, `Portal image ${mode} dialog`);
    if (mode === "upload")
      await page.screenshot({
        path: `/tmp/ce-portal-image-dialog-${test.info().project.name}.png`,
      });
    const save = dialog.getByRole("button", {
      name: "Save image",
      exact: true,
    });
    await save.focus();
    await save.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(change).toBeFocused();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Course image saved in the portal" }),
    ).toBeVisible();
  }
  expect(modes).toEqual(["upload", "fallback", "source"]);
  await change.press("Enter");
  await page.getByRole("dialog").press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(change).toBeFocused();
  await scan(page, "Portal course image saved");
  await page.screenshot({
    path: `/tmp/ce-portal-image-editor-${test.info().project.name}.png`,
    fullPage: true,
  });
});

for (const layout of ["list", "grid"] as const)
  test(`Canvas course card images and CU CE fallback in ${layout} layout`, async ({
    page,
  }) => {
    const rows = [
      {
        id: "00000000-0000-4000-8000-000000000501",
        title: "Imported course with Canvas image",
        canvas_image_url: "https://images.example.test/course-cover.jpg",
      },
      {
        id: "00000000-0000-4000-8000-000000000502",
        title: "Imported course without image",
        canvas_image_url: null,
      },
      {
        id: "00000000-0000-4000-8000-000000000503",
        title: "Imported course with unavailable image",
        canvas_image_url: "https://images.example.test/unavailable.jpg",
      },
      {
        id: "00000000-0000-4000-8000-000000000504",
        title: "Imported course with portal image",
        canvas_image_url: "https://images.example.test/should-not-load.jpg",
        image_override: true,
        image_media_id: "00000000-0000-4000-8000-000000000506",
      },
      {
        id: "00000000-0000-4000-8000-000000000505",
        title: "Imported course with explicit CU CE choice",
        canvas_image_url: "https://images.example.test/should-not-load.jpg",
        image_override: true,
        image_media_id: null,
      },
      {
        id: "00000000-0000-4000-8000-000000000507",
        title: "Imported course with unavailable portal image",
        canvas_image_url: "https://images.example.test/should-not-load.jpg",
        image_override: true,
        image_media_id: "00000000-0000-4000-8000-000000000508",
      },
    ].map((row) => ({
      ...row,
      imported_from_canvas: true,
      category: "Technology",
      summary: "Synthetic image verification course",
      format: "Online",
      course_type: "self_paced",
      start_date: null,
      end_date: null,
      price_cents: 100,
      published: true,
      approval_required: false,
      enrollment_open: true,
    }));
    const { readFile } = await import("node:fs/promises");
    const cover = await readFile(
      "src/web/public/course-images/data-analysis.jpg",
    );
    await page.route("**/media/00000000-0000-4000-8000-000000000506", (route) =>
      route.fulfill({ contentType: "image/jpeg", body: cover }),
    );
    await page.route("**/media/00000000-0000-4000-8000-000000000508", (route) =>
      route.fulfill({ status: 404, body: "Missing portal image" }),
    );
    let imageRequests = 0;
    await page.route("https://images.example.test/*", (route) => {
      expect(route.request().headers()["authorization"]).toBeUndefined();
      expect(route.request().url()).not.toContain("should-not-load");
      imageRequests++;
      return route.request().url().includes("unavailable")
        ? route.fulfill({ status: 404, body: "Image not found" })
        : route.fulfill({ contentType: "image/jpeg", body: cover });
    });
    await page.route("**/api/offerings", (route) =>
      route.fulfill({ json: rows }),
    );
    await page.route("**/api/explore", (route) =>
      route.fulfill({ json: { courses: rows, collections: [], pathways: [] } }),
    );
    await page.goto("/?tab=courses");
    const toggle = page.getByRole("button", {
      name: `${layout === "grid" ? "Grid" : "List"} layout`,
      exact: true,
    });
    await toggle.focus();
    await toggle.press("Enter");
    for (const [index, row] of rows.entries()) {
      const card = page.locator(".MuiPaper-root").filter({
        has: page.getByRole("heading", { name: row.title, exact: true }),
      });
      await card.scrollIntoViewIfNeeded();
      const image = card.locator("img");
      await expect(image).toHaveAttribute("alt", "");
      await expect(image).toHaveAttribute(
        "src",
        row.image_override && row.image_media_id && index !== 5
          ? new RegExp(`/media/${row.image_media_id}$`)
          : index === 0
            ? row.canvas_image_url!
            : /cedarville-continuing-education-white/,
      );
      await expect(image).toHaveJSProperty("complete", true);
      expect(
        await image.evaluate(
          (element: HTMLImageElement) => element.naturalWidth,
        ),
      ).toBeGreaterThan(0);
      await expect(
        card.getByRole("link", { name: `View course: ${row.title}` }),
      ).toBeVisible();
    }
    expect(imageRequests).toBeGreaterThanOrEqual(2);
    await scan(page, `Canvas images and CU CE fallback (${layout})`);
    await page.screenshot({
      path: `/tmp/ce-course-images-${layout}-${test.info().project.name}.png`,
      fullPage: true,
    });
  });
// Credential documents keep the pilot editor behavior and participate in the
// existing portal theme, session, keyboard and accessibility checks.
test.describe("credential integration", () => {
  for (const [slug, title] of [
    ["badges", "Badge designer"],
    ["badge-publishing", "Publish and map badges"],
    ["badge-awards", "Award badges"],
    ["certificates", "Certificates"],
    ["badge-issuances", "Issuance register"],
  ]) {
    test(`${title} workspace`, async ({ page }) => {
      const signIn = await page.request.post("/api/staff-session", {
        data: { email: "admin@cuce.test" },
      });
      expect(signIn.ok()).toBeTruthy();
      await page.goto(`/staff/${slug}`);
      await expect(
        page
          .locator("main > div")
          .getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      const frame = page.frameLocator("iframe");
      await expect(frame.locator("main")).toBeVisible();
      if (slug === "certificates")
        await expect(frame.locator("#cc-tools")).toBeVisible();
      if (slug === "badge-awards")
        await expect(frame.locator("#ca-tools")).toBeVisible();
      if (slug === "badge-issuances")
        await expect(frame.locator("#register-content")).toBeVisible();
      if (slug === "badge-publishing")
        await expect(frame.locator("#workspace")).toBeVisible();
      await scan(page, `${title} integrated document`);
    });
  }
  test("signed-out learner badges", async ({ page }) => {
    await page.goto("/badges");
    await expect(
      page.getByRole("heading", { name: "My badges and certificates" }),
    ).toBeVisible();
    await scan(page, "Signed-out learner badges");
  });
  test("Canvas learner without email can open earned credentials", async ({
    page,
  }) => {
    await page.route("**/api/demo-session", (route) =>
      route.fulfill({
        json: {
          id: "00000000-0000-4000-8000-000000000099",
          email: null,
          display_name: "CU Test Learner",
          auth: { mode: "canvas", configured: true },
        },
      }),
    );
    await page.route("**/api/badges/me/badges", (route) =>
      route.fulfill({ json: { badges: [] } }),
    );
    await page.goto("/badges");
    await expect(page.locator("iframe")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .frameLocator("iframe")
        .getByText("Your achievements will appear here.", { exact: true }),
    ).toBeVisible();
    await scan(page, "Canvas learner credentials without email");
  });
  test("unlinked learner account fails closed", async ({ page }) => {
    await page.request.post("/api/demo-session", {
      data: { email: "a11y-scan@example.test" },
    });
    await page.goto("/badges");
    await expect(
      page
        .frameLocator("iframe")
        .getByText(
          "Your badge account has not been linked. Contact portal support.",
          { exact: true },
        ),
    ).toBeVisible();
    await scan(page, "Unlinked learner badges");
  });
});

test("credential integration: keyboard, unsaved design and 320px reflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.request.post("/api/staff-session", {
    data: { email: "admin@cuce.test" },
  });
  await page.goto("/staff/certificates");
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("#cc-tools")).toBeVisible();
  await frame.locator("#cc-header").focus();
  await page.keyboard.press("Tab");
  await expect(frame.locator("#cc-logo")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(frame.locator("#cc-header")).toBeFocused();
  await frame.locator("#cc-header").fill("Unsaved accessibility exercise");
  await page
    .getByRole("link", { name: "Issuance register", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Stay", exact: true }).click();
  await expect(frame.locator("#cc-header")).toHaveValue(
    "Unsaved accessibility exercise",
  );
  await page
    .getByRole("link", { name: "Issuance register", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page).toHaveURL(/\/staff\/badge-issuances$/);
  await page.setViewportSize({ width: 320, height: 800 });
  for (const slug of [
    "badges",
    "badge-publishing",
    "badge-awards",
    "certificates",
    "badge-issuances",
  ]) {
    await page.goto(`/staff/${slug}`);
    await expect(page.locator("iframe")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
      `${slug} portal reflow`,
    ).toBe(true);
    if (slug === "badge-issuances") {
      const region = page
        .frameLocator("iframe")
        .getByRole("region", { name: "Issuance register table", exact: true });
      await region.focus();
      await expect(region).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() => region.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
    }
    const overflow = await page
      .frameLocator("iframe")
      .locator("html")
      .evaluate((el) => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
        regions: [
          ...el.querySelectorAll("main,.records,.table-wrap,.table-footer"),
        ].map((n) => ({
          cls: String(n.className),
          width: n.getBoundingClientRect().width,
          overflow: getComputedStyle(n).overflow,
          display: getComputedStyle(n).display,
        })),
        widest: [...el.querySelectorAll("body *")]
          .filter(
            (n) =>
              !n.closest(".table-wrap") &&
              n.getBoundingClientRect().right > el.clientWidth + 1,
          )
          .slice(0, 8)
          .map((n) => ({
            tag: n.tagName,
            id: n.id,
            cls: String(n.className),
            right: n.getBoundingClientRect().right,
            width: n.getBoundingClientRect().width,
          })),
      }));
    expect(
      overflow.scroll <= overflow.width + 1,
      `${slug} editor reflow: ${JSON.stringify(overflow)}`,
    ).toBe(true);
  }
});

test.describe("individual progress and cohort reporting", () => {
  const planId = "00000000-0000-4000-8000-000000000801",
    learnerId = "00000000-0000-4000-8000-000000000802",
    participantId = "00000000-0000-4000-8000-000000000803",
    stepId = "00000000-0000-4000-8000-000000000804";
  async function setup(
    page: Page,
    { editable = true, empty = false, fail = false } = {},
  ) {
    const plan = {
      id: planId,
      title: "Synthetic learning course",
      revision: 1,
      offeringId: planId,
    };
    const step = {
      id: stepId,
      title: "Required project",
      position: 1,
      required: true,
      state: "awaiting_verification",
      eventId: null,
      note: "",
      reference: "",
      recordedAt: null,
      source: null,
    };
    const participant = {
      id: participantId,
      learnerId,
      name: "Alex Synthetic",
      active: true,
      steps: [step],
      completed: 0,
      required: 1,
      percent: 0,
      state: "awaiting_verification",
    };
    const report = {
      plan,
      steps: [step],
      participants: empty ? [] : [participant],
      summary: {
        learners: empty ? 0 : 1,
        completed: 0,
        inProgress: 0,
        awaitingVerification: empty ? 0 : 1,
        notStarted: 0,
      },
    };
    await page.route("**/api/demo-session", (r) =>
      r.fulfill({
        json: {
          id: null,
          email: null,
          auth: { mode: "mock", configured: true },
        },
      }),
    );
    await page.route("**/api/staff-session", (r) =>
      r.fulfill({
        json: {
          member: {
            id: learnerId,
            email: "staff@example.test",
            display_name: "Progress tester",
            active: true,
            version: 1,
            roles: [editable ? "catalog_manager" : "approver"],
            scopes: [
              "reports:read",
              "staff:read",
              ...(editable ? ["progress:manage"] : []),
            ],
          },
          auth: { mode: "mock", configured: true },
        },
      }),
    );
    await page.route("**/api/staff/offerings", (r) =>
      r.fulfill({
        json: [
          {
            id: planId,
            title: plan.title,
            category: "Learning",
            summary: "Synthetic",
            description: "Synthetic",
            format: "Online",
            course_type: "self_paced",
            published: true,
            listed: true,
            capacity: 10,
            price_cents: 0,
            outcomes: [],
            version: 1,
            collections: [],
          },
        ],
      }),
    );
    for (const endpoint of ["approval-requests", "exceptions"])
      await page.route(`**/api/${endpoint}`, (r) => r.fulfill({ json: [] }));
    await page.route("**/api/reconciliation", (r) =>
      r.fulfill({ json: { audit: [] } }),
    );
    await page.route("**/api/prototype/simulation", (r) =>
      r.fulfill({ json: { provisioningOutcome: "normal" } }),
    );
    await page.route("**/api/staff/progress", (r) =>
      fail
        ? r.fulfill({
            status: 503,
            json: { message: "Progress temporarily unavailable" },
          })
        : r.fulfill({
            json: {
              plans: empty
                ? []
                : [
                    {
                      ...plan,
                      offering_id: planId,
                      participants: 1,
                      steps: [step],
                    },
                  ],
              cohorts: [],
              learners: [
                {
                  id: learnerId,
                  email: "alex@example.test",
                  display_name: "Alex Synthetic",
                },
              ],
            },
          }),
    );
    await page.route(`**/api/staff/progress/plans/${planId}/report`, (r) =>
      r.fulfill({ json: report }),
    );
    await page.route(
      `**/api/staff/progress/participants/${participantId}/history`,
      (r) => r.fulfill({ json: [] }),
    );
    return { report, step, participant };
  }
  test("staff report and evidence dialog: names, keyboard, focus and axe", async ({
    page,
  }) => {
    await setup(page);
    await page.goto("/staff/progress");
    await expect(
      page.getByRole("table", {
        name: "Individual completion and cohort matrix",
      }),
    ).toBeVisible();
    const open = page.getByRole("button", {
      name: "View progress for Alex Synthetic",
    });
    await open.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Alex Synthetic: completion progress" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Record evidence for Required project" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Record evidence: Required project",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Record verification" }),
    ).toBeDisabled();
    await dialog
      .getByRole("textbox", { name: "Evidence or correction note" })
      .fill("Staff verified the required synthetic project.");
    await expect(
      dialog.getByRole("button", { name: "Record verification" }),
    ).toBeEnabled();
    await scan(page, "Progress evidence dialog");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Alex Synthetic: completion progress" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(open).toBeFocused();
    await scan(page, "Progress report");
  });
  test("create a requirements revision and cohort, assign a learner and save evidence", async ({
    page,
  }) => {
    const { report, step, participant } = await setup(page);
    const nextId = "00000000-0000-4000-8000-000000000805",
      cohortId = "00000000-0000-4000-8000-000000000806";
    let created = false,
      cohort = false,
      assigned = false,
      completed = false;
    const nextStep = { ...step, title: "Verified project" };
    const nextReport = () => ({
      ...report,
      plan: { ...report.plan, id: nextId, revision: 2 },
      steps: [nextStep],
      participants: assigned
        ? [
            {
              ...participant,
              steps: [
                {
                  ...nextStep,
                  state: completed ? "completed" : "awaiting_verification",
                  eventId: completed ? cohortId : null,
                  recordedAt: completed ? "2026-10-28T12:00:00Z" : null,
                },
              ],
              completed: completed ? 1 : 0,
              percent: completed ? 100 : 0,
              state: completed ? "completed" : "awaiting_verification",
            },
          ]
        : [],
      summary: {
        learners: assigned ? 1 : 0,
        completed: completed ? 1 : 0,
        inProgress: 0,
        awaitingVerification: assigned && !completed ? 1 : 0,
        notStarted: 0,
      },
    });
    await page.unroute("**/api/staff/progress");
    await page.route("**/api/staff/progress", (r) =>
      r.fulfill({
        json: {
          plans: [
            ...(created
              ? [
                  {
                    id: nextId,
                    title: report.plan.title,
                    revision: 2,
                    offering_id: planId,
                    participants: assigned ? 1 : 0,
                    steps: [nextStep],
                  },
                ]
              : []),
            {
              ...report.plan,
              offering_id: planId,
              participants: 1,
              steps: [step],
            },
          ],
          cohorts: cohort
            ? [
                {
                  id: cohortId,
                  name: "October learning cohort",
                  plan_id: nextId,
                  title: report.plan.title,
                  revision: 2,
                  members: assigned ? 1 : 0,
                },
              ]
            : [],
          learners: [
            {
              id: learnerId,
              email: "alex@example.test",
              display_name: "Alex Synthetic",
            },
          ],
        },
      }),
    );
    await page.route("**/api/staff/progress/plans", async (r) => {
      const body = r.request().postDataJSON();
      expect(body.previousRevision).toBe(1);
      expect(body.steps).toEqual([
        { title: "Verified project", required: true },
      ]);
      created = true;
      await r.fulfill({ json: { id: nextId, revision: 2 } });
    });
    await page.route(`**/api/staff/progress/plans/${nextId}/report`, (r) =>
      r.fulfill({ json: nextReport() }),
    );
    await page.route("**/api/staff/progress/cohorts", async (r) => {
      expect(r.request().postDataJSON().planId).toBe(nextId);
      cohort = true;
      await r.fulfill({ json: { id: cohortId } });
    });
    await page.route(`**/api/staff/progress/cohorts/${cohortId}/report`, (r) =>
      r.fulfill({
        json: {
          ...nextReport(),
          cohort: { id: cohortId, name: "October learning cohort" },
        },
      }),
    );
    await page.route(
      `**/api/staff/progress/cohorts/${cohortId}/members`,
      async (r) => {
        expect(r.request().postDataJSON()).toEqual({ learnerId, active: true });
        assigned = true;
        await r.fulfill({ json: { participantId, active: true } });
      },
    );
    await page.route(
      `**/api/staff/progress/participants/${participantId}/evidence`,
      async (r) => {
        const body = r.request().postDataJSON();
        expect(body.state).toBe("completed");
        expect(body.previousEventId).toBe(null);
        completed = true;
        await r.fulfill({ json: { id: cohortId } });
      },
    );
    await page.goto("/staff/progress");
    await page.getByRole("button", { name: "Define requirements" }).click();
    await page
      .getByRole("textbox", { name: "Required steps (one per line)" })
      .fill("Verified project");
    await scan(page, "Completion requirements instructions");
    await page
      .getByRole("button", { name: "Create revised checklist" })
      .click();
    await expect(
      page.getByRole("heading", {
        name: /Synthetic learning course · Requirements v2/,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Create cohort", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Cohort name" })
      .fill("October learning cohort");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create cohort", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: /October learning cohort · Requirements v2/,
      }),
    ).toBeVisible();
    await page.getByRole("combobox", { name: "Learner to assign" }).click();
    await page.getByRole("option", { name: "Alex Synthetic" }).click();
    await page
      .getByRole("button", { name: "Add to cohort", exact: true })
      .click();
    await page
      .getByRole("button", { name: "View progress for Alex Synthetic" })
      .click();
    await page
      .getByRole("button", { name: "Record evidence for Verified project" })
      .click();
    await page.getByRole("combobox", { name: "Verified status" }).click();
    await page.getByRole("option", { name: "Completed", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Evidence or correction note" })
      .fill("Staff reviewed the submitted synthetic project.");
    await page
      .getByRole("button", { name: "Record verification", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("1 of 1 required steps · 100%")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "View progress for Alex Synthetic" }),
    ).toBeFocused();
    await scan(page, "Completed cohort report");
  });
  test("read-only, empty and unavailable states", async ({ page }) => {
    await setup(page, { editable: false });
    await page.goto("/staff/progress");
    await expect(
      page.getByRole("table", {
        name: "Individual completion and cohort matrix",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Define requirements" }),
    ).toHaveCount(0);
    await scan(page, "Read-only progress");
    await page.unroute("**/api/staff/progress");
    await page.route("**/api/staff/progress", (r) =>
      r.fulfill({ json: { plans: [], cohorts: [], learners: [] } }),
    );
    await page.reload();
    await expect(
      page.getByText(/No completion requirements yet/),
    ).toBeVisible();
    await scan(page, "Empty progress");
    await page.unroute("**/api/staff/progress");
    await page.route("**/api/staff/progress", (r) =>
      r.fulfill({
        status: 503,
        json: { message: "Progress temporarily unavailable" },
      }),
    );
    await page.reload();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Progress temporarily unavailable" }),
    ).toBeVisible();
  });
  test("stale evidence retains note and 320px report reflows", async ({
    page,
  }) => {
    await setup(page);
    await page.route(
      `**/api/staff/progress/participants/${participantId}/evidence`,
      (r) =>
        r.fulfill({
          status: 409,
          json: {
            message: "Evidence changed. Refresh before recording a correction.",
          },
        }),
    );
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/staff/progress");
    await page
      .getByRole("button", { name: "View progress for Alex Synthetic" })
      .click();
    await page
      .getByRole("button", { name: "Record evidence for Required project" })
      .click();
    const note = page.getByRole("textbox", {
      name: "Evidence or correction note",
    });
    await note.fill("Keep this verification note after a stale update.");
    await page
      .getByRole("button", { name: "Record verification", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Evidence changed" }).last(),
    ).toBeVisible();
    await expect(note).toHaveValue(
      "Keep this verification note after a stale update.",
    );
    await scan(page, "Stale progress evidence");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  });
  test("learner sees only the completion API response and can refresh", async ({
    page,
  }) => {
    const { report, participant } = await setup(page);
    await page.unroute("**/api/demo-session");
    await page.route("**/api/demo-session", (r) =>
      r.fulfill({
        json: {
          id: learnerId,
          email: "alex@example.test",
          display_name: "Alex Synthetic",
          auth: { mode: "mock", configured: true },
        },
      }),
    );
    for (const endpoint of ["me/learning", "me/saved-courses", "me/pathways"])
      await page.route(`**/api/${endpoint}`, (r) => r.fulfill({ json: [] }));
    await page.route("**/api/me/progress", (r) =>
      r.fulfill({ json: [{ plan: report.plan, progress: participant }] }),
    );
    await page.goto("/learning");
    await expect(
      page.getByRole("heading", { name: "Completion progress" }),
    ).toBeVisible();
    await expect(page.getByText("0 of 1 required steps · 0%")).toBeVisible();
    await page
      .getByRole("button", { name: "Refresh completion progress" })
      .click();
    await expect(page.getByText("No verification yet")).toBeVisible();
    await scan(page, "Learner completion progress");
  });
});

test.describe("skills and careers", () => {
  const releaseId = "81000000-0000-4000-8000-000000000001";
  const skill = {
    id: "2.A.2.a",
    releaseId,
    name: "Critical Thinking",
    description: "Use reasoning to compare alternative solutions.",
    category: "essential",
    url: "https://www.onetcenter.org/content.html#2.A.2.a",
    source: "O*NET",
    version: "31.0",
    attribution: "O*NET 31.0 Database by USDOL/ETA.",
    license: "https://creativecommons.org/licenses/by/4.0/",
  };
  const catalog = {
    ready: true,
    skillsRelease: { id: releaseId, version: "31.0" },
    marketRelease: {
      id: "bls-fixture",
      version: "May 2025; 2025–2035",
      importedAt: "2026-10-28T12:00:00Z",
    },
    regions: [
      { id: "US", name: "United States" },
      { id: "OH", name: "Ohio" },
    ],
    attribution: "O*NET 31.0 Database by USDOL/ETA, CC BY 4.0.",
    onet: { configured: true },
  };
  async function mockSkills(page: Page, configured = true) {
    await page.route("**/api/badges/**/skills/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const body =
        route.request().method() === "POST"
          ? route.request().postDataJSON()
          : {};
      if (path.endsWith("/onet/status"))
        return route.fulfill({
          json: {
            configured,
            message: configured
              ? "O*NET API access is configured."
              : "O*NET API access is not configured. Imported skills and BLS statistics remain available.",
          },
        });
      if (path.endsWith("/onet/search"))
        return route.fulfill({
          json: {
            occupations: [
              {
                code: "25-9031.00",
                title: "Instructional Coordinators",
                url: "https://www.onetonline.org/link/summary/25-9031.00",
              },
            ],
            limit: 10,
            retrievedAt: "2026-10-28T12:00:00Z",
          },
        });
      if (path.endsWith("/onet/outlook"))
        return route.fulfill({
          json: {
            code: body.code,
            outlook: {
              category: "Bright",
              description: "Original provider wording.",
            },
            brightOutlook: [{ title: "Grow Rapidly" }],
            region: "US",
            retrievedAt: "2026-10-28T12:00:00Z",
            attributionUrl: "https://services.onetcenter.org/",
            url: "https://www.mynextmove.org/profile/summary/" + body.code,
          },
        });
      if (path.endsWith("/catalog"))
        return route.fulfill({ json: { ...catalog, onet: { configured } } });
      if (path.endsWith("/search"))
        return route.fulfill({ json: { skills: [skill], limit: 25 } });
      if (path.endsWith("/occupations"))
        return route.fulfill({
          json: {
            skills: [skill],
            region: body.region,
            regions: catalog.regions,
            catalog: { ...catalog, onet: { configured } },
            note: "Occupational relevance is not proof of learner mastery or an employment guarantee.",
            occupations: [
              {
                code: "15-1252.00",
                socCode: "15-1252",
                title: "Software Developers",
                url: "https://www.onetonline.org/link/summary/15-1252.00",
                matches: [
                  {
                    name: skill.name,
                    importance: 4,
                    basis: "importance",
                    dataDate: "2025-08-01",
                  },
                ],
                wage: {
                  region: body.region,
                  regionName: body.region === "OH" ? "Ohio" : "United States",
                  year: 2025,
                  medianAnnual: body.region === "OH" ? null : 100000,
                  medianHourly: 42.5,
                  annualMarker: body.region === "OH" ? "#" : null,
                },
                outlook: {
                  baseYear: 2025,
                  endYear: 2035,
                  percentChange: 12.5,
                  annualOpenings: 123400,
                },
                scopeNote:
                  "Wages and outlook use SOC 15-1252, which may group multiple O*NET occupations.",
              },
            ],
          },
        });
      return route.fulfill({
        status: 404,
        json: { error: "Unknown synthetic skills route" },
      });
    });
  }
  test("public explorer supports skill selection, regional wages, national outlook and keyboard navigation without sign-in", async ({
    page,
  }) => {
    await mockSkills(page);
    await page.goto("/skills");
    const frame = page.frameLocator("iframe");
    const credit = frame.locator(".skills-onet-credit").first();
    await expect(credit).toContainText(
      "This site incorporates information from O*NET Web Services by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). O*NET® is a trademark of USDOL/ETA.",
    );
    const logo = credit.getByRole("img", { name: "O*NET in-it", exact: true });
    await expect(logo).toHaveAttribute(
      "src",
      "/credential-tools/onet-in-it.svg",
    );
    await expect(
      credit.getByRole("link", { name: "O*NET in-it", exact: true }),
    ).toHaveAttribute("href", "https://services.onetcenter.org/");
    await expect(
      credit.getByRole("link", { name: "O*NET in-it", exact: true }),
    ).toHaveAttribute(
      "title",
      "This site incorporates information from O*NET Web Services. Click to learn more.",
    );
    await expect
      .poll(() =>
        logo.evaluate(
          (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
        ),
      )
      .toBeTruthy();
    await expect(
      frame.getByRole("button", { name: "Search skills", exact: true }),
    ).toBeEnabled();
    await frame.getByLabel("Search O*NET skills or software").fill("critical");
    const wasDark = await page.evaluate(
      () => matchMedia("(prefers-color-scheme: dark)").matches,
    );
    await page.emulateMedia({ colorScheme: wasDark ? "light" : "dark" });
    await expect(frame.locator("html")).toHaveAttribute(
      "data-theme",
      wasDark ? "light" : "dark",
    );
    await expect(
      frame.getByLabel("Search O*NET skills or software"),
    ).toHaveValue("critical");
    await frame
      .getByRole("button", { name: "Search skills", exact: true })
      .click();
    await frame
      .getByRole("button", { name: "Select Critical Thinking", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await frame
      .getByRole("button", { name: "Find related occupations" })
      .click();
    await expect(frame.getByText("Median annual wage: $100,000")).toBeVisible();
    await frame.getByLabel("Wage region").focus();
    await frame.getByLabel("Wage region").selectOption("OH");
    await expect(
      frame.getByText("Median annual wage: Not published (source marker #)"),
    ).toBeVisible();
    await expect(frame.getByLabel("Wage region")).toBeFocused();
    await expect(
      frame.getByText("United States outlook · 2025–2035 (national)"),
    ).toBeVisible();
    await expect(
      frame.getByText("Annual openings, period average: 123,400 jobs per year"),
    ).toBeVisible();
    await frame
      .getByLabel("Occupation keywords")
      .fill("instructional designer");
    await frame
      .getByRole("button", { name: "Search occupations", exact: true })
      .click();
    const api = frame.locator(".onet-results");
    await api
      .getByRole("button", { name: "View O*NET outlook for 25-9031.00" })
      .click();
    await expect(api.getByText("Original provider wording.")).toBeVisible();
    await expect(
      api.getByRole("link", { name: "O*NET Web Services" }),
    ).toHaveAttribute("href", "https://services.onetcenter.org/");
    await expect(
      page.getByRole("heading", {
        name: "Skills and career explorer",
        exact: true,
      }),
    ).toBeVisible();
    await scan(page, "Public skills, regional wages and O*NET API outlook");
    expect(
      await frame
        .locator("body")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBeTruthy();
  });
  test("missing API configuration keeps imported skills usable and handles a provider failure", async ({
    page,
  }) => {
    await mockSkills(page, false);
    await page.goto("/skills");
    const frame = page.frameLocator("iframe");
    await expect(
      frame.getByRole("button", { name: "Search occupations", exact: true }),
    ).toBeDisabled();
    await expect(
      frame.getByRole("button", { name: "Search skills", exact: true }),
    ).toBeEnabled();
    await expect(
      frame.getByText(/O\*NET API access is not configured/),
    ).toBeVisible();
    await scan(page, "Skills explorer with API disabled");
    await page.unroute("**/api/badges/**/skills/**");
    await mockSkills(page, true);
    await page.route("**/api/badges/public/skills/onet/search", (route) =>
      route.fulfill({
        status: 429,
        json: { error: "O*NET is busy. Wait a moment before trying again." },
      }),
    );
    await page.reload();
    await expect(
      frame.getByRole("button", { name: "Search occupations", exact: true }),
    ).toBeEnabled();
    await frame.getByLabel("Occupation keywords").fill("teaching");
    await frame
      .getByRole("button", { name: "Search occupations", exact: true })
      .click();
    await expect(
      frame.getByText("O*NET is busy. Wait a moment before trying again."),
    ).toBeVisible();
    await expect(
      frame.getByRole("button", { name: "Search occupations", exact: true }),
    ).toBeEnabled();
  });
  test("badge designer explains and saves assessed skills after validation", async ({
    page,
  }) => {
    await page.request.post("/api/staff-session", {
      data: { email: "admin@cuce.test" },
    });
    await mockSkills(page);
    let saved: any = null;
    await page.route("**/api/badges/designer/drafts**", (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: { drafts: saved ? [saved] : [] } });
      saved = {
        id: "81000000-0000-4000-8000-000000000002",
        revision: 1,
        design: route.request().postDataJSON().design,
      };
      return route.fulfill({ json: saved });
    });
    await page.goto("/staff/badges");
    const frame = page.frameLocator("iframe");
    await frame.getByRole("tab", { name: /Details/ }).click();
    await expect(
      frame.getByRole("button", { name: "Search skills", exact: true }),
    ).toBeEnabled();
    await frame.getByLabel("Search O*NET skills or software").fill("critical");
    await frame
      .getByRole("button", { name: "Search skills", exact: true })
      .click();
    await frame
      .getByRole("button", { name: "Select Critical Thinking", exact: true })
      .click();
    await frame
      .getByRole("button", { name: "Save badge draft", exact: true })
      .click();
    expect(saved).toBeNull();
    await expect(
      frame.getByText(
        "Explain how each selected skill is assessed (at least 10 characters).",
      ),
    ).toBeVisible();
    await frame
      .getByLabel("How is Critical Thinking assessed?")
      .fill(
        "Learner compares alternative solutions using a documented rubric.",
      );
    await frame
      .getByRole("button", { name: "Save badge draft", exact: true })
      .click();
    await expect(
      frame.getByText("Badge draft saved and verified."),
    ).toBeVisible();
    expect(saved.design.skills[0].id).toBe(skill.id);
    expect(saved.design.skills[0].assessment).toContain("documented rubric");
    await scan(page, "Assessed skills badge draft");
  });
  test("learner opens career context from an owned aligned award", async ({
    page,
  }) => {
    await mockSkills(page);
    await page.route("**/api/demo-session", (route) =>
      route.fulfill({
        json: {
          id: "00000000-0000-4000-8000-000000000099",
          email: null,
          display_name: "Test Learner",
          auth: { mode: "canvas", configured: true },
        },
      }),
    );
    await page.route("**/api/badges/me/badges", (route) =>
      route.fulfill({
        json: {
          badges: [
            {
              id: releaseId,
              sourceId: "workspace",
              title: "Assessed learning accomplishment",
              issuer: "Cedarville University",
              issuedAt: "2026-10-28T12:00:00Z",
              description: "Synthetic aligned accomplishment.",
              criteria: "Complete the documented assessment.",
              signatureValid: true,
              status: "issued",
              demo: true,
              shared: false,
              certificateAvailable: true,
              skills: [skill],
            },
          ],
        },
      }),
    );
    await page.route(
      "**/api/badges/me/badges/workspace/" + releaseId + "/careers/*",
      (route) => {
        const region = new URL(route.request().url()).pathname
          .split("/")
          .at(-1);
        return route.fulfill({
          json: {
            region,
            regions: catalog.regions,
            catalog,
            alignments: [
              {
                ...skill,
                assessment:
                  "Compare alternative solutions against the documented rubric.",
              },
            ],
            occupations: [],
            note: "Owned award skills context.",
          },
        });
      },
    );
    await page.goto("/badges");
    const frame = page.frameLocator("iframe");
    await frame
      .getByRole("button", {
        name: "Skills and career connections",
        exact: true,
      })
      .click();
    await frame
      .getByText("How these skills were assessed", { exact: true })
      .click();
    await expect(
      frame.getByText(
        "Compare alternative solutions against the documented rubric.",
        { exact: true },
      ),
    ).toBeVisible();
    await frame.getByLabel("Wage region").selectOption("OH");
    await expect(
      frame.getByText("Owned award skills context.", { exact: true }),
    ).toBeVisible();
    await expect(
      frame.getByRole("button", {
        name: "Download certificate PDF",
        exact: true,
      }),
    ).toBeVisible();
    await scan(page, "Learner owned skill assessment and career context");
  });
});
