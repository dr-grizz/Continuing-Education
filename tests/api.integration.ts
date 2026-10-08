import "reflect-metadata";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { db, DEMO_LEARNER } from "../src/domain/db";
import { PortalService } from "../src/server/service";
import Stripe from "stripe";
import { Principal } from "../src/server/auth";
const service = new PortalService();
const userIds: string[] = [];
const ids: string[] = [],
  actors: string[] = [],
  httpKeys: string[] = [];
const staffIds: string[] = [];
const collectionIds: string[] = [];
// Explore picks are site-wide; the test saves and restores them.
const testStarted = new Date();
const stripeEventIds: string[] = [];
let explorePicks:
  { courses: string[]; collections: string[]; pathways: string[] } | undefined;
let adminStaffId = "";
const mediaIds: string[] = [];
// Staff-token calls act as a demo staff member: the seeded administrator unless
// `staffAs` names another member, or nobody when `staffAs` is null (sign-in only).
async function http(
  path: string,
  token?: string,
  body?: unknown,
  staffAs?: string | null,
) {
  const key = randomUUID();
  httpKeys.push(key);
  const staffId =
    token === process.env.STAFF_API_TOKEN && staffAs !== null
      ? (staffAs ?? adminStaffId)
      : undefined;
  return fetch(`http://127.0.0.1:3001/api/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(staffId ? { "X-Prototype-Staff-Id": staffId } : {}),
      "Idempotency-Key": key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function seed(approval: boolean) {
  const row = await db.query(
    `INSERT INTO offerings(title,category,summary,description,format,start_date,end_date,price_cents,capacity,published,approval_required) VALUES ('Isolated integration test','Technology','Test sample summary','Test sample description only','Online','2099-01-01','2099-02-01',100,1,true,$1) RETURNING id`,
    [approval],
  );
  ids.push(row.rows[0].id);
  return row.rows[0].id as string;
}
async function learner(): Promise<Principal> {
  const actor = `integration-${randomUUID()}`;
  actors.push(actor);
  const learnerId = randomUUID();
  await db.query("INSERT INTO learners(id) VALUES ($1)", [learnerId]);
  userIds.push(learnerId);
  return { actor, learnerId, scopes: ["learner"] };
}
async function main() {
  try {
    const staffByEmail = async (email: string) =>
      (await db.query("SELECT id FROM staff_members WHERE email=$1", [email]))
        .rows[0].id as string;
    adminStaffId = await staffByEmail("admin@cuce.test");
    assert.equal((await http("me/learning")).status, 401);
    assert.equal(
      (await http("staff/offerings", process.env.LEARNER_API_TOKEN)).status,
      403,
    );
    assert.equal(
      (await http("reconciliation", process.env.AUTOMATION_API_TOKEN)).status,
      200,
    );
    assert.equal(
      (
        await http("offerings", process.env.AUTOMATION_API_TOKEN, {
          title: "Unauthorized test",
          category: "Technology",
          summary: "Sample summary text",
          description: "Sample description for validation",
          format: "Online",
          courseType: "cohort",
          startDate: "2099-01-01",
          endDate: "2099-02-01",
          capacity: 1,
          priceCents: 100,
          approvalRequired: false,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await http("registrations", process.env.LEARNER_API_TOKEN, {
          offeringId: "bad",
          unexpected: true,
        })
      ).status,
      400,
    );
    console.log("PASS: authentication, scopes and request validation");
    const draftResponse = await http("offerings", process.env.STAFF_API_TOKEN, {
      title: "Isolated staff creation test",
      category: "Technology",
      summary: "Synthetic draft used only by integration tests",
      description:
        "Synthetic offering created and removed by the integration suite.",
      format: "Online",
      courseType: "cohort",
      startDate: "2099-01-01",
      endDate: "2099-02-01",
      capacity: 1,
      priceCents: 14950,
      approvalRequired: false,
    });
    assert.equal(draftResponse.status, 201);
    const draft = (await draftResponse.json()) as any;
    ids.push(draft.id);
    assert.equal((await http(`offerings/${draft.id}`)).status, 404);
    assert.equal(
      (
        await http(
          `offerings/${draft.id}/publish`,
          process.env.STAFF_API_TOKEN,
          { version: draft.version },
        )
      ).status,
      201,
    );
    assert.equal((await http(`offerings/${draft.id}`)).status, 200);
    assert.equal(
      (
        await http(
          `offerings/${draft.id}/publish`,
          process.env.STAFF_API_TOKEN,
          { version: draft.version },
        )
      ).status,
      409,
    );
    const baseOffering = {
      title: "Isolated anytime course test",
      category: "Technology",
      summary: "Synthetic anytime offering for integration tests",
      description:
        "Synthetic offering created and removed by the integration suite.",
      format: "Online",
      capacity: 2,
      priceCents: 100,
      approvalRequired: false,
    };
    const anytimeResponse = await http(
      "offerings",
      process.env.STAFF_API_TOKEN,
      { ...baseOffering, courseType: "self_paced" },
    );
    assert.equal(anytimeResponse.status, 201);
    const anytime = (await anytimeResponse.json()) as any;
    ids.push(anytime.id);
    assert.equal(anytime.course_type, "self_paced");
    assert.equal(anytime.start_date, null);
    assert.equal(anytime.end_date, null);
    for (const invalid of [
      { courseType: "cohort" },
      { courseType: "cohort", startDate: "2099-02-01", endDate: "2099-01-01" },
      { courseType: "self_paced", startDate: "2099-01-01" },
      { courseType: "invalid" },
    ]) {
      assert.equal(
        (
          await http("offerings", process.env.STAFF_API_TOKEN, {
            ...baseOffering,
            ...invalid,
          })
        ).status,
        400,
      );
    }
    assert.equal(draft.course_type, "cohort");
    assert.ok(draft.start_date && draft.end_date);
    console.log(
      "PASS: cohort schedules, anytime courses and invalid schedule rejection",
    );
    console.log(
      "PASS: staff draft creation, public visibility and stale-version protection",
    );
    const email = `integration-${randomUUID()}@example.com`;
    const users = await Promise.all([
      service.demoUser(email),
      service.demoUser(email.toUpperCase()),
    ]);
    assert.equal(users[0].id, users[1].id);
    assert.equal(users[0].email, email);
    userIds.push(users[0].id);
    const webSignIn = await fetch("http://127.0.0.1:3000/api/demo-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.toUpperCase() }),
    });
    assert.equal(webSignIn.status, 201);
    assert.equal(((await webSignIn.json()) as any).id, users[0].id);
    const sessionCookie = webSignIn.headers.get("set-cookie")!;
    assert.match(sessionCookie, /HttpOnly/i);
    const cookie = sessionCookie.split(";")[0];
    const restored = await fetch("http://127.0.0.1:3000/api/demo-session", {
      headers: { Cookie: cookie },
    });
    assert.equal(((await restored.json()) as any).email, email);
    assert.equal(
      (await fetch("http://127.0.0.1:3000/api/me/learning")).status,
      401,
    );
    const signedOut = await fetch("http://127.0.0.1:3000/api/demo-session", {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    assert.equal(signedOut.status, 200);
    assert.match(signedOut.headers.get("set-cookie")!, /1970/);
    console.log(
      "PASS: web mock session creation/restoration, HTTP-only cookie, sign-out and signed-out workflow rejection",
    );
    const user = {
      actor: `demo-learner:${users[0].id}`,
      learnerId: users[0].id,
      scopes: ["learner"],
    };
    actors.push(user.actor);
    await db.query("UPDATE offerings SET published=true WHERE id=$1", [
      anytime.id,
    ]);
    const own = (await service.register(user, randomUUID(), anytime.id)) as any;
    assert.equal(own.status, "reserved");
    const other = await learner();
    assert.equal((await service.learning(user)).length, 1);
    assert.equal((await service.learning(other)).length, 0);
    await assert.rejects(
      service.payment(other, randomUUID(), own.id),
      /not found/,
    );
    const selected = await fetch("http://127.0.0.1:3001/api/v1/me/learning", {
      headers: {
        Authorization: `Bearer ${process.env.LEARNER_API_TOKEN}`,
        "X-Prototype-Learner-Id": user.learnerId,
      },
    });
    assert.equal(selected.status, 200);
    assert.equal(((await selected.json()) as any[])[0].id, own.id);
    const invalid = await fetch("http://127.0.0.1:3001/api/v1/me", {
      headers: {
        Authorization: `Bearer ${process.env.LEARNER_API_TOKEN}`,
        "X-Prototype-Learner-Id": randomUUID(),
      },
    });
    assert.equal(invalid.status, 401);
    assert.equal(
      (
        await http("prototype/users", process.env.LEARNER_API_TOKEN, {
          email: "bad",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await http("prototype/users", process.env.AUTOMATION_API_TOKEN, {
          email,
        })
      ).status,
      403,
    );
    console.log(
      "PASS: normalized concurrent demo-user lookup, self-paced registration, learner/payment isolation and HTTP learner selection",
    );
    const open = await seed(false),
      a = await learner(),
      b = await learner();
    const outcomes = await Promise.allSettled([
      service.register(a, randomUUID(), open),
      service.register(b, randomUUID(), open),
    ]);
    assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
    const winner = outcomes[0].status === "fulfilled" ? a : b;
    const registration = (
      outcomes.find(
        (o) => o.status === "fulfilled",
      ) as PromiseFulfilledResult<any>
    ).value;
    const key = randomUUID();
    const payments = await Promise.all([
      service.payment(winner, key, registration.id),
      service.payment(winner, key, registration.id),
    ]);
    assert.equal((payments[0] as any).id, (payments[1] as any).id);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM orders WHERE entitlement_id=$1",
          [registration.id],
        )
      ).rows[0].count,
      1,
    );
    await assert.rejects(
      service.register(winner, key, open),
      /different command/,
    );
    console.log(
      "PASS: concurrent final-seat allocation and idempotent payment/retry",
    );
    const gated = await seed(true),
      c = await learner();
    await db.query("UPDATE learners SET email=$2 WHERE id=$1", [
      c.learnerId,
      `integration-${randomUUID()}@example.com`,
    ]);
    const request = (await service.register(c, randomUUID(), gated)) as any;
    const approval = (await service.approvals()).find(
      (row) => row.id === request.id,
    );
    assert.ok(approval?.learner_email);
    assert.equal(request.status, "awaiting_approval");
    await assert.rejects(
      service.payment(c, randomUUID(), request.id),
      /reservation/,
    );
    const staff = {
      actor: `integration-${randomUUID()}`,
      scopes: ["approvals:decide"],
    };
    actors.push(staff.actor);
    await service.decide(staff, randomUUID(), request.id, "approved");
    assert.equal(
      ((await service.register(c, randomUUID(), gated)) as any).status,
      "reserved",
    );
    const stranger = {
      actor: "integration-stranger",
      learnerId: DEMO_LEARNER,
      scopes: ["learner"],
    };
    await assert.rejects(
      service.operation((payments[0] as any).id, stranger),
      /not found/,
    );
    console.log(
      "PASS: payment blocked before approval and operation ownership isolation",
    );

    const recoveryStaff: Principal = {
      actor: `integration-staff-${randomUUID()}`,
      scopes: [
        "catalog:write",
        "approvals:decide",
        "reports:read",
        "exceptions:resolve",
      ],
    };
    actors.push(recoveryStaff.actor);
    const previousOutcome = (await service.simulation()).provisioningOutcome;
    // Queue one paid registration with a chosen simulated outcome, then restore
    // the shared setting immediately (each operation keeps its own outcome).
    async function paidWith(outcome: any) {
      const offeringId = await seed(false);
      const who = await learner();
      const reg: any = await service.register(who, randomUUID(), offeringId);
      await service.setSimulation(recoveryStaff, randomUUID(), outcome);
      try {
        const op: any = await service.payment(who, randomUUID(), reg.id);
        assert.equal(op.simulated_outcome, outcome);
        return { reg, op };
      } finally {
        await service.setSimulation(
          recoveryStaff,
          randomUUID(),
          previousOutcome,
        );
      }
    }
    async function waitFor(id: string, status: string) {
      for (let i = 0; i < 60; i++) {
        const row = await db.query(
          "SELECT status FROM entitlements WHERE id=$1",
          [id],
        );
        if (row.rows[0].status === status) return;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      assert.fail(`Registration ${id} did not reach ${status}`);
    }
    const actions = async (id: string) =>
      (
        await db.query(
          "SELECT action FROM audit_events WHERE object_id=$1 ORDER BY id",
          [id],
        )
      ).rows.map((r) => r.action);

    const identity = await paidWith("identity_failure");
    await waitFor(identity.reg.id, "exception");
    const failedOp = (
      await db.query("SELECT * FROM operations WHERE id=$1", [identity.op.id])
    ).rows[0];
    assert.equal(failedOp.status, "failed");
    assert.equal(failedOp.attempts, 3);
    assert.equal(failedOp.stage, "identity");
    assert.match(failedOp.error, /identity/i);
    const identityEvents = await actions(identity.reg.id);
    assert.equal(
      identityEvents.filter(
        (a) => a === "prototype.provisioning_retry_scheduled",
      ).length,
      2,
    );
    assert.ok(identityEvents.includes("prototype.provisioning_failed"));
    const queue: any[] = await service.exceptions();
    const listed = queue.find((row) => row.id === identity.reg.id);
    assert.ok(
      listed && listed.history.length >= 4 && listed.learner_email === null,
    );
    assert.equal(
      (await http("exceptions", process.env.LEARNER_API_TOKEN)).status,
      403,
    );
    assert.equal(
      (await http("exceptions", process.env.AUTOMATION_API_TOKEN)).status,
      200,
    );
    assert.equal(
      (
        await http(
          `exceptions/${identity.reg.id}/retry`,
          process.env.AUTOMATION_API_TOKEN,
          { reason: "Automation must not recover" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await http(
          `exceptions/${identity.reg.id}/retry`,
          process.env.STAFF_API_TOKEN,
          { reason: "short" },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await http("prototype/simulation", process.env.AUTOMATION_API_TOKEN, {
          provisioningOutcome: "normal",
        })
      ).status,
      403,
    );
    await service.recover(
      recoveryStaff,
      randomUUID(),
      identity.reg.id,
      "retry",
      "Identity record corrected by IT (integration test).",
    );
    await assert.rejects(
      service.recover(
        recoveryStaff,
        randomUUID(),
        identity.reg.id,
        "retry",
        "Second retry must be rejected.",
      ),
      /not awaiting recovery/,
    );
    await waitFor(identity.reg.id, "enrolled");
    assert.ok(
      (await actions(identity.reg.id)).includes("exception.retry_requested"),
    );
    console.log(
      "PASS: simulated identity failure, bounded retries, exception queue, scoped staff retry and recovery",
    );

    const canvas = await paidWith("canvas_failure");
    await waitFor(canvas.reg.id, "exception");
    assert.equal(
      (
        await db.query("SELECT stage FROM operations WHERE id=$1", [
          canvas.op.id,
        ])
      ).rows[0].stage,
      "canvas",
    );
    await service.recover(
      recoveryStaff,
      randomUUID(),
      canvas.reg.id,
      "resolve",
      "Canvas admin enrolled the learner manually (integration test).",
    );
    assert.equal(
      (
        await db.query("SELECT status FROM entitlements WHERE id=$1", [
          canvas.reg.id,
        ])
      ).rows[0].status,
      "enrolled",
    );
    const manual = (
      await db.query(
        "SELECT details FROM audit_events WHERE object_id=$1 AND action='exception.resolved_manually'",
        [canvas.reg.id],
      )
    ).rows[0];
    assert.equal(manual.details.stage, "canvas");
    assert.match(manual.details.reason, /manually/);

    const transient = await paidWith("transient");
    await waitFor(transient.reg.id, "enrolled");
    const transientEvents = await actions(transient.reg.id);
    assert.equal(
      transientEvents.filter(
        (a) => a === "prototype.provisioning_retry_scheduled",
      ).length,
      1,
    );
    assert.ok(!transientEvents.includes("prototype.provisioning_failed"));
    assert.equal(
      (await service.simulation()).provisioningOutcome,
      previousOutcome,
    );
    console.log(
      "PASS: Canvas failure with audited manual resolution; temporary failure recovers automatically",
    );

    // Enrollment window: Scheduled courses close a staff-set number of days after the start date.
    const started = (
      await db.query(
        `INSERT INTO offerings(title,category,summary,description,format,start_date,end_date,price_cents,capacity,published,course_type)
        VALUES ('Isolated integration test','Technology','Test sample summary','Test sample description only','Online',current_date-10,current_date+30,100,5,true,'cohort') RETURNING id,version`,
      )
    ).rows[0];
    ids.push(started.id);
    const late = await learner();
    await assert.rejects(
      service.register(late, randomUUID(), started.id),
      /Enrollment closed on/,
    );
    const widened: any = await service.updateSettings(
      recoveryStaff,
      randomUUID(),
      started.id,
      {
        version: started.version,
        approvalValidDays: 7,
        enrollmentCloseDays: 14,
        canvasCourseUrl: null,
      },
    );
    const lateSeat: any = await service.register(
      late,
      randomUUID(),
      started.id,
    );
    assert.equal(lateSeat.status, "reserved");
    await assert.rejects(
      service.updateSettings(recoveryStaff, randomUUID(), started.id, {
        version: started.version,
        approvalValidDays: 7,
        enrollmentCloseDays: 0,
        canvasCourseUrl: null,
      }),
      /changed/,
    );
    await service.updateSettings(recoveryStaff, randomUUID(), started.id, {
      version: widened.version,
      approvalValidDays: 7,
      enrollmentCloseDays: 0,
      canvasCourseUrl: null,
    });
    assert.equal(
      ((await service.register(late, randomUUID(), started.id)) as any).id,
      lateSeat.id,
      "a current reservation is returned unchanged after enrollment closes",
    );
    const settingsHttp = await http(
      `offerings/${started.id}/settings`,
      process.env.STAFF_API_TOKEN,
      {
        version: 99,
        approvalValidDays: 0,
        enrollmentCloseDays: 7,
        canvasCourseUrl: "http://insecure.example.edu",
      },
    );
    assert.equal(settingsHttp.status, 400);
    console.log(
      "PASS: enrollment window closes after the start date, staff-adjustable and version-checked",
    );

    // Approval validity, lapse and repeat requests.
    const gatedOffering = await seed(true);
    const asker = await learner();
    const ask: any = await service.register(asker, randomUUID(), gatedOffering);
    const approved: any = await service.decide(
      recoveryStaff,
      randomUUID(),
      ask.id,
      "approved",
    );
    const days =
      (new Date(approved.approval_expires_at).getTime() - Date.now()) /
      86400000;
    assert.ok(days > 6.9 && days <= 7, `approval lasts 7 days (got ${days})`);
    await db.query(
      "UPDATE entitlements SET approval_expires_at=now()-interval '1 minute' WHERE id=$1",
      [ask.id],
    );
    await waitFor(ask.id, "approval_expired");
    const again: any = await service.register(
      asker,
      randomUUID(),
      gatedOffering,
    );
    assert.equal(again.status, "awaiting_approval");
    assert.equal(again.approval_expires_at, null);
    assert.ok((await actions(ask.id)).includes("approval.expired"));
    assert.ok((await actions(ask.id)).includes("approval.requested_again"));
    await service.decide(recoveryStaff, randomUUID(), ask.id, "declined");
    const retried: any = await service.register(
      asker,
      randomUUID(),
      gatedOffering,
    );
    assert.equal(
      retried.status,
      "awaiting_approval",
      "declined learners can request again",
    );
    const gatedVersion = (
      await db.query("SELECT version FROM offerings WHERE id=$1", [
        gatedOffering,
      ])
    ).rows[0].version;
    await service.updateSettings(recoveryStaff, randomUUID(), gatedOffering, {
      version: gatedVersion,
      approvalValidDays: 2,
      enrollmentCloseDays: 7,
      canvasCourseUrl: "https://canvas.example.edu/courses/9999",
    });
    const shorter: any = await service.decide(
      recoveryStaff,
      randomUUID(),
      ask.id,
      "approved",
    );
    const shorterDays =
      (new Date(shorter.approval_expires_at).getTime() - Date.now()) / 86400000;
    assert.ok(
      shorterDays > 1.9 && shorterDays <= 2,
      "changed validity applies to new approvals",
    );
    console.log(
      "PASS: approvals last the staff-set period, lapse to approval_expired, and declined or lapsed learners can request again",
    );

    // Canvas link appears only once enrollment completes.
    const seat: any = await service.register(
      asker,
      randomUUID(),
      gatedOffering,
    );
    assert.equal(seat.status, "reserved");
    const before: any[] = await service.learning(asker);
    assert.equal(before.find((r) => r.id === seat.id).canvas_course_url, null);
    await service.payment(asker, randomUUID(), seat.id);
    await waitFor(seat.id, "enrolled");
    const after: any[] = await service.learning(asker);
    assert.equal(
      after.find((r) => r.id === seat.id).canvas_course_url,
      "https://canvas.example.edu/courses/9999",
    );
    console.log(
      "PASS: Canvas course link is returned only after enrollment completes",
    );

    // Offering management: edits, protected published terms, quoted prices, unpublishing.
    const managed = await seed(false);
    const editBody = async (overrides: any = {}) => {
      const o = (
        await db.query(
          "SELECT *,to_char(start_date,'YYYY-MM-DD') AS sd,to_char(end_date,'YYYY-MM-DD') AS ed FROM offerings WHERE id=$1",
          [managed],
        )
      ).rows[0];
      return {
        version: o.version,
        title: o.title,
        category: o.category,
        summary: o.summary,
        description: o.description,
        format: o.format,
        courseType: o.course_type,
        startDate: o.sd,
        endDate: o.ed,
        capacity: o.capacity,
        priceCents: o.price_cents,
        approvalRequired: o.approval_required,
        approvalValidDays: o.approval_valid_days,
        enrollmentCloseDays: o.enrollment_close_days,
        canvasCourseUrl: o.canvas_course_url ?? undefined,
        ...overrides,
      };
    };
    await assert.rejects(
      service.edit(
        recoveryStaff,
        randomUUID(),
        managed,
        await editBody({ title: "Renamed integration test" }),
      ),
      /reason/,
      "published edits need a reason",
    );
    await assert.rejects(
      service.edit(
        recoveryStaff,
        randomUUID(),
        managed,
        await editBody({
          courseType: "self_paced",
          startDate: undefined,
          endDate: undefined,
          reason: "Switch to self-paced (test)",
        }),
      ),
      /Course type cannot change/,
    );
    await assert.rejects(
      service.edit(
        recoveryStaff,
        randomUUID(),
        managed,
        await editBody({
          approvalRequired: true,
          reason: "Require approval now (test)",
        }),
      ),
      /approval requirement/,
    );
    const buyer = await learner();
    const quoted: any = await service.register(buyer, randomUUID(), managed);
    assert.equal(quoted.quoted_price_cents, 100);
    await assert.rejects(
      service.edit(
        recoveryStaff,
        randomUUID(),
        managed,
        await editBody({
          startDate: "2099-01-08",
          reason: "Move the start date (test)",
        }),
      ),
      /Dates cannot change/,
    );
    const repriced: any = await service.edit(
      recoveryStaff,
      randomUUID(),
      managed,
      await editBody({
        priceCents: 250,
        capacity: 2,
        reason: "Annual price update (integration test)",
      }),
    );
    assert.equal(repriced.price_cents, 250);
    const history: any[] = await service.prices(managed);
    assert.equal(history[0].price_cents, 250);
    assert.match(history[0].reason, /Annual price update/);
    await assert.rejects(
      db.query(
        "UPDATE offering_prices SET price_cents=1 WHERE offering_id=$1",
        [managed],
      ),
      /append-only/,
    );
    const edited = (
      await db.query(
        "SELECT details FROM audit_events WHERE object_id=$1 AND action='offering.edited'",
        [managed],
      )
    ).rows[0];
    assert.deepEqual(edited.details.changes.price_cents, {
      before: 100,
      after: 250,
    });
    const second = await learner();
    const secondSeat: any = await service.register(
      second,
      randomUUID(),
      managed,
    );
    assert.equal(
      secondSeat.quoted_price_cents,
      250,
      "new reservations use the new price",
    );
    await assert.rejects(
      service.edit(
        recoveryStaff,
        randomUUID(),
        managed,
        await editBody({
          capacity: 1,
          reason: "Shrink below seats in use (test)",
        }),
      ),
      /seats in use/,
    );
    const firstOrderOp: any = await service.payment(
      buyer,
      randomUUID(),
      quoted.id,
    );
    const firstOrder = (
      await db.query(
        "SELECT amount_cents FROM orders WHERE entitlement_id=$1",
        [quoted.id],
      )
    ).rows[0];
    assert.equal(
      firstOrder.amount_cents,
      100,
      "earlier reservation keeps its quoted price",
    );
    assert.ok(firstOrderOp.id);
    console.log(
      "PASS: offering edits are version-checked and audited; published terms are protected; price history is append-only and reservations keep their quoted price",
    );

    const pricesHttp = await http(
      `offerings/${managed}/prices`,
      process.env.STAFF_API_TOKEN,
    );
    assert.equal(pricesHttp.status, 200);
    assert.equal(
      (await http(`offerings/${managed}/prices`, process.env.LEARNER_API_TOKEN))
        .status,
      403,
    );
    const currentVersion = (
      await db.query("SELECT version FROM offerings WHERE id=$1", [managed])
    ).rows[0].version;
    assert.equal(
      (
        await http(
          `offerings/${managed}/unpublish`,
          process.env.STAFF_API_TOKEN,
          { version: currentVersion, reason: "short" },
        )
      ).status,
      400,
    );
    const hidden: any = await service.unpublish(
      recoveryStaff,
      randomUUID(),
      managed,
      currentVersion,
      "Course cancelled by the program (integration test).",
    );
    assert.equal(hidden.published, false);
    assert.equal(hidden.active_registrations, 2);
    await assert.rejects(service.detail(managed), /not found/);
    await assert.rejects(
      service.register(await learner(), randomUUID(), managed),
      /not available/,
    );
    await assert.rejects(
      service.payment(second, randomUUID(), secondSeat.id),
      /no longer open/,
      "unpublishing stops new payments",
    );
    await waitFor(quoted.id, "enrolled");
    const unpublishedAudit = (
      await db.query(
        "SELECT details FROM audit_events WHERE object_id=$1 AND action='offering.unpublished'",
        [managed],
      )
    ).rows[0];
    assert.match(unpublishedAudit.details.reason, /cancelled/);
    assert.ok(
      hidden.unpublished_at,
      "unpublished offerings are distinguishable from drafts",
    );
    await assert.rejects(
      service.edit(
        recoveryStaff,
        randomUUID(),
        managed,
        await editBody({ title: "Edited after unpublishing" }),
      ),
      /reason/,
      "previously published offerings keep the reason requirement",
    );
    const republished: any = await service.publish(
      recoveryStaff,
      randomUUID(),
      managed,
      hidden.version,
    );
    assert.equal(republished.published, true);
    assert.equal(republished.unpublished_at, null);
    console.log(
      "PASS: unpublishing needs a reason, hides the offering and stops new registrations and payments while paid enrollment completes",
    );

    // Staff roles and mock sign-in (ADR 0004).
    const STAFF = process.env.STAFF_API_TOKEN;
    const approverId = await staffByEmail("approver@cuce.test");
    const catalogId = await staffByEmail("catalog@cuce.test");
    const supportId = await staffByEmail("support@cuce.test");
    const directory = await http(
      "prototype/staff-directory",
      STAFF,
      undefined,
      null,
    );
    assert.equal(directory.status, 200);
    assert.ok((await directory.json()).length >= 6);
    assert.equal(
      (await http("staff/me", STAFF, undefined, null)).status,
      403,
      "the bare staff token only signs in",
    );
    assert.equal(
      (await http("staff/offerings", STAFF, undefined, null)).status,
      403,
    );
    const signIn = await http(
      "prototype/staff-sessions",
      STAFF,
      { email: "Approver@CUCE.TEST" },
      null,
    );
    assert.equal(signIn.status, 200);
    assert.equal((await signIn.json()).id, approverId);
    assert.equal(
      (
        await http(
          "prototype/staff-sessions",
          STAFF,
          { email: "nobody@cuce.test" },
          null,
        )
      ).status,
      404,
    );
    const me = await (
      await http("staff/me", STAFF, undefined, approverId)
    ).json();
    assert.deepEqual(me.roles, ["approver"]);
    assert.ok(
      me.scopes.includes("approvals:decide") &&
        !me.scopes.includes("catalog:write"),
    );

    const draftBody = {
      title: "Role test draft",
      category: "Technology",
      summary: "Role test summary text",
      description: "Role test description for scope checks",
      format: "Online",
      courseType: "self_paced",
      capacity: 2,
      priceCents: 100,
      approvalRequired: true,
    };
    assert.equal(
      (await http("offerings", STAFF, draftBody, approverId)).status,
      403,
      "approver cannot create offerings",
    );
    assert.equal(
      (await http("staff/offerings", STAFF, undefined, approverId)).status,
      200,
      "every staff role can view",
    );
    const created = await http("offerings", STAFF, draftBody, catalogId);
    assert.equal(created.status, 201, "catalog manager can create offerings");
    const roleDraft = await created.json();
    ids.push(roleDraft.id);
    assert.equal(
      (
        await http(
          `offerings/${roleDraft.id}/publish`,
          STAFF,
          { version: roleDraft.version },
          catalogId,
        )
      ).status,
      201,
    );
    const roleLearner = await learner();
    const roleRequest: any = await service.register(
      roleLearner,
      randomUUID(),
      roleDraft.id,
    );
    assert.equal(roleRequest.status, "awaiting_approval");
    assert.equal(
      (
        await http(
          `approval-requests/${roleRequest.id}/decision`,
          STAFF,
          { decision: "approved" },
          catalogId,
        )
      ).status,
      403,
      "catalog manager cannot decide approvals",
    );
    assert.equal(
      (
        await http(
          `approval-requests/${roleRequest.id}/decision`,
          STAFF,
          { decision: "approved" },
          approverId,
        )
      ).status,
      201,
    );
    const decided = (
      await db.query(
        "SELECT actor FROM audit_events WHERE object_id=$1 AND action='approval.approved'",
        [roleRequest.id],
      )
    ).rows[0];
    assert.equal(
      decided.actor,
      `staff:${approverId}`,
      "audit records the individual staff member",
    );
    const report = await (
      await http("reconciliation", STAFF, undefined, approverId)
    ).json();
    const labeled = report.audit.find(
      (entry: any) =>
        entry.object_id === roleRequest.id &&
        entry.action === "approval.approved",
    );
    assert.equal(labeled.actor_email, "approver@cuce.test");
    assert.equal(
      (
        await http(
          "prototype/simulation",
          STAFF,
          { provisioningOutcome: "normal" },
          approverId,
        )
      ).status,
      403,
      "approvers cannot change the simulation",
    );
    const currentOutcome = (await service.simulation()).provisioningOutcome;
    assert.equal(
      (
        await http(
          "prototype/simulation",
          STAFF,
          { provisioningOutcome: currentOutcome },
          supportId,
        )
      ).status,
      200,
    );
    assert.equal(
      (await http("staff/members", STAFF, undefined, supportId)).status,
      403,
      "only staff administrators manage staff",
    );
    console.log(
      "PASS: mock staff sign-in; role scopes gate catalog, approvals, simulation and staff management; audit names the staff member",
    );

    const newEmail = `role-test-${randomUUID().slice(0, 8)}@cuce.test`;
    const added = await http("staff/members", STAFF, {
      email: newEmail.toUpperCase(),
      displayName: "Role Test",
      roles: ["approver"],
    });
    assert.equal(added.status, 201);
    const addedMember = await added.json();
    staffIds.push(addedMember.id);
    assert.equal(addedMember.email, newEmail);
    assert.equal(
      (
        await http("staff/members", STAFF, {
          email: newEmail,
          displayName: "Duplicate",
          roles: ["approver"],
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await http("staff/members", STAFF, {
          email: `x-${newEmail}`,
          displayName: "No roles",
          roles: [],
        })
      ).status,
      400,
    );
    const promoted = await http(`staff/members/${addedMember.id}`, STAFF, {
      version: addedMember.version,
      displayName: "Role Test",
      roles: ["approver", "catalog_manager"],
      active: true,
    });
    assert.equal(promoted.status, 200);
    const promotedMember = await promoted.json();
    assert.ok(
      (
        await (await http("staff/me", STAFF, undefined, addedMember.id)).json()
      ).scopes.includes("catalog:write"),
    );
    const deactivated = await http(`staff/members/${addedMember.id}`, STAFF, {
      version: promotedMember.version,
      displayName: "Role Test",
      roles: ["approver"],
      active: false,
    });
    assert.equal(deactivated.status, 200);
    assert.equal(
      (await http("staff/me", STAFF, undefined, addedMember.id)).status,
      401,
      "inactive staff cannot act",
    );
    const admin = (
      await db.query("SELECT version FROM staff_members WHERE id=$1", [
        adminStaffId,
      ])
    ).rows[0];
    const lockout = await http(`staff/members/${adminStaffId}`, STAFF, {
      version: admin.version,
      displayName: "Demo Staff Administrator",
      roles: ["approver"],
      active: true,
    });
    assert.equal(
      lockout.status,
      409,
      "the last active staff administrator cannot be removed",
    );
    assert.match(
      (await lockout.json()).message,
      /At least one active staff administrator/,
    );
    const roles = await (
      await http("staff/roles", STAFF, undefined, approverId)
    ).json();
    assert.equal(roles.length, 6);
    const contentId = await staffByEmail("content@cuce.test");
    const contentMe = await (
      await http("staff/me", STAFF, undefined, contentId)
    ).json();
    assert.deepEqual(
      [...contentMe.scopes].sort(),
      ["content:write", "reports:read", "staff:read"],
      "content editors view the workspace and hold the reserved sales-page scope only",
    );
    assert.equal(
      (await http("offerings", STAFF, draftBody, contentId)).status,
      403,
      "content editors cannot create or change offerings",
    );
    assert.ok(
      roles
        .find((r: any) => r.role === "staff_admin")
        .members.some((m: any) => m.id === adminStaffId),
    );
    console.log(
      "PASS: staff administrators add members, change roles and deactivate access; the last administrator is protected",
    );

    // Learner management (staff Learners tab).
    const managedEmail = `learner-mgmt-${randomUUID().slice(0, 8)}@example.test`;
    const managedLearner: any = await service.demoUser(managedEmail);
    userIds.push(managedLearner.id);
    const mgmtOffering = await seed(false);
    await service.register(
      {
        actor: `demo-learner:${managedLearner.id}`,
        learnerId: managedLearner.id,
        scopes: ["learner"],
      },
      randomUUID(),
      mgmtOffering,
    );
    const learnerList = await (
      await http(
        `staff/learners?search=${encodeURIComponent(managedEmail)}`,
        STAFF,
        undefined,
        approverId,
      )
    ).json();
    assert.equal(learnerList.length, 1);
    assert.deepEqual(
      {
        registrations: learnerList[0].registrations,
        in_progress: learnerList[0].in_progress,
        active: learnerList[0].active,
      },
      { registrations: 1, in_progress: 1, active: true },
    );
    const detail = await (
      await http(
        `staff/learners/${managedLearner.id}`,
        STAFF,
        undefined,
        approverId,
      )
    ).json();
    assert.equal(detail.registrations[0].status, "reserved");
    assert.ok(
      detail.activity.some((event: any) => event.action === "seat.reserved"),
    );
    const deactivate = {
      version: detail.version,
      active: false,
      reason: "Duplicate account (integration test).",
    };
    assert.equal(
      (
        await http(
          `staff/learners/${managedLearner.id}/access`,
          STAFF,
          deactivate,
          approverId,
        )
      ).status,
      403,
      "approver cannot change learner access",
    );
    assert.equal(
      (
        await http(
          `staff/learners/${managedLearner.id}/access`,
          STAFF,
          { ...deactivate, reason: "short" },
          supportId,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await http(
          `staff/learners/${managedLearner.id}/access`,
          STAFF,
          deactivate,
          supportId,
        )
      ).status,
      200,
    );
    const asLearner = await fetch("http://127.0.0.1:3001/api/v1/me/learning", {
      headers: {
        Authorization: `Bearer ${process.env.LEARNER_API_TOKEN}`,
        "X-Prototype-Learner-Id": managedLearner.id,
      },
    });
    assert.equal(asLearner.status, 401, "deactivated learners cannot act");
    await assert.rejects(
      service.demoUser(managedEmail),
      /deactivated/,
      "deactivated learners cannot sign in",
    );
    assert.equal(
      (
        await http(
          `staff/learners/${managedLearner.id}/access`,
          STAFF,
          deactivate,
          supportId,
        )
      ).status,
      409,
      "stale version or same state is refused",
    );
    const deactivatedDetail = await (
      await http(
        `staff/learners/${managedLearner.id}`,
        STAFF,
        undefined,
        supportId,
      )
    ).json();
    assert.ok(deactivatedDetail.deactivated_at && !deactivatedDetail.active);
    assert.equal(
      (
        await http(
          `staff/learners/${managedLearner.id}/access`,
          STAFF,
          {
            version: deactivatedDetail.version,
            active: true,
            reason: "Confirmed not a duplicate (test).",
          },
          supportId,
        )
      ).status,
      200,
    );
    assert.equal(
      (await service.demoUser(managedEmail)).id,
      managedLearner.id,
      "reactivated learners can sign in",
    );
    const legacyDetail = await (
      await http(`staff/learners/${DEMO_LEARNER}`, STAFF, undefined, supportId)
    ).json();
    assert.equal(
      (
        await http(
          `staff/learners/${DEMO_LEARNER}/access`,
          STAFF,
          {
            version: legacyDetail.version,
            active: false,
            reason: "Must not be allowed (test).",
          },
          supportId,
        )
      ).status,
      409,
    );
    const accessEvents = (
      await db.query(
        "SELECT action, actor FROM audit_events WHERE object_id=$1 AND action LIKE 'learner.%' ORDER BY id",
        [managedLearner.id],
      )
    ).rows;
    assert.deepEqual(
      accessEvents.map((e) => e.action),
      ["learner.deactivated", "learner.reactivated"],
    );
    assert.equal(accessEvents[0].actor, `staff:${supportId}`);
    console.log(
      "PASS: staff list and inspect learners; Support deactivates and reactivates access with a reason; deactivated learners are blocked; legacy learner protected",
    );

    // Sample staff dashboard.
    const asApprover = await (
      await http(
        `staff/dashboard?days=7&offeringId=${mgmtOffering}`,
        STAFF,
        undefined,
        approverId,
      )
    ).json();
    assert.equal(asApprover.sales, null, "sales need the reports:sales scope");
    assert.equal(asApprover.enrollment.registrations, 1);
    assert.equal(asApprover.enrollment.in_progress, 1);
    assert.equal(
      asApprover.enrollment.trend.length,
      7,
      "one bucket per day for 7 days",
    );
    assert.equal(
      asApprover.enrollment.trend.reduce(
        (sum: number, point: any) => sum + point.value,
        0,
      ),
      1,
    );
    assert.equal(asApprover.completion.available, false);
    const asAdmin = await (
      await http("staff/dashboard?days=30", STAFF, undefined, adminStaffId)
    ).json();
    assert.ok(asAdmin.sales && typeof asAdmin.sales.gross_cents === "number");
    assert.equal(
      asAdmin.sales.trend.reduce(
        (sum: number, point: any) => sum + point.value,
        0,
      ),
      asAdmin.sales.gross_cents,
      "sales trend sums to gross",
    );
    assert.equal(
      (await http("staff/dashboard?days=5", STAFF, undefined, adminStaffId))
        .status,
      400,
    );
    console.log(
      "PASS: dashboard reports enrollment to all staff, sales only to staff administrators, filtered by date range and offering",
    );

    // Collections, pathways, saved courses and follows (decisions F3 and F4).
    const learnerCall = (path: string, learnerId: string, body?: unknown) => {
      const key = randomUUID();
      httpKeys.push(key);
      return fetch(`http://127.0.0.1:3001/api/v1/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.LEARNER_API_TOKEN}`,
          "X-Prototype-Learner-Id": learnerId,
          "Idempotency-Key": key,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    };
    const firstStep = await seed(false),
      secondStep = await seed(false),
      hiddenStep = await seed(false);
    await db.query("UPDATE offerings SET published=false WHERE id=$1", [
      hiddenStep,
    ]);
    const pathwayTitle = `Integration pathway ${randomUUID().slice(0, 8)}`;
    const pathwayBody = {
      kind: "pathway",
      title: pathwayTitle,
      summary: "Synthetic pathway for integration tests.",
      offeringIds: [firstStep],
    };
    assert.equal(
      (await http("collections", STAFF, pathwayBody, approverId)).status,
      403,
      "creating collections needs catalog:write",
    );
    assert.equal(
      (
        await http(
          "collections",
          STAFF,
          { ...pathwayBody, slug: "Not A Slug" },
          catalogId,
        )
      ).status,
      400,
    );
    let pathway = await (
      await http("collections", STAFF, pathwayBody, catalogId)
    ).json();
    collectionIds.push(pathway.id);
    assert.equal(pathway.published, false);
    assert.match(pathway.slug, /^integration-pathway-[a-z0-9]+$/);
    assert.equal(
      (await http("collections", STAFF, pathwayBody, catalogId)).status,
      409,
      "slugs are unique",
    );
    assert.equal(
      (
        await http(
          `collections/${pathway.id}/publish`,
          STAFF,
          { version: pathway.version },
          catalogId,
        )
      ).status,
      400,
      "a published pathway needs two published courses",
    );
    const editCollection = async (offeringIds: string[]) =>
      http(
        `collections/${pathway.id}/edit`,
        STAFF,
        {
          version: pathway.version,
          title: pathwayTitle,
          summary: pathway.summary,
          offeringIds,
        },
        catalogId,
      );
    pathway = await (
      await editCollection([firstStep, hiddenStep, secondStep])
    ).json();
    pathway = await (
      await http(
        `collections/${pathway.id}/publish`,
        STAFF,
        { version: pathway.version },
        catalogId,
      )
    ).json();
    assert.equal(pathway.published, true);
    assert.equal(
      (await editCollection([firstStep, hiddenStep])).status,
      400,
      "a published pathway keeps two published courses",
    );
    const publicPathway = await (
      await http(`collections/${pathway.slug}`)
    ).json();
    assert.deepEqual(
      publicPathway.offerings.map((o: any) => o.id),
      [firstStep, secondStep],
      "learners see published courses in the recommended order",
    );
    const publicList = await (await http("collections")).json();
    assert.equal(
      publicList.find((c: any) => c.id === pathway.id).course_count,
      2,
    );
    const filtered = await (
      await http(`offerings?collection=${pathway.slug}`)
    ).json();
    assert.deepEqual(
      filtered.map((o: any) => o.id).sort(),
      [firstStep, secondStep].sort(),
    );
    assert.equal((await http("offerings?collection=Bad%20Slug")).status, 400);
    const inPathway = await (await http(`offerings/${firstStep}`)).json();
    assert.ok(
      inPathway.collections.some((c: any) => c.slug === pathway.slug),
      "course detail lists its published collections",
    );

    const saver = await learner(),
      otherLearner = await learner();
    const savedIds = async (who: Principal) =>
      (
        await (
          await learnerCall("me/saved-courses", who.learnerId as string)
        ).json()
      ).map((o: any) => o.id);
    assert.equal(
      (
        await learnerCall(`me/saved-courses/${firstStep}`, saver.learnerId!, {
          saved: true,
        })
      ).status,
      200,
    );
    assert.deepEqual(await savedIds(saver), [firstStep]);
    assert.deepEqual(
      await savedIds(otherLearner),
      [],
      "saved courses are private",
    );
    assert.equal(
      (
        await learnerCall(`me/saved-courses/${hiddenStep}`, saver.learnerId!, {
          saved: true,
        })
      ).status,
      404,
      "unpublished courses cannot be saved",
    );
    await learnerCall(`me/saved-courses/${firstStep}`, saver.learnerId!, {
      saved: false,
    });
    assert.deepEqual(await savedIds(saver), []);

    assert.equal(
      (
        await learnerCall(`me/pathways/${pathway.id}`, saver.learnerId!, {
          following: true,
        })
      ).status,
      200,
    );
    const sampleCollection = (
      await db.query(
        "SELECT id FROM collections WHERE kind='collection' AND published LIMIT 1",
      )
    ).rows[0];
    if (sampleCollection)
      assert.equal(
        (
          await learnerCall(
            `me/pathways/${sampleCollection.id}`,
            saver.learnerId!,
            { following: true },
          )
        ).status,
        404,
        "only pathways can be followed",
      );
    const followed = await (
      await learnerCall("me/pathways", saver.learnerId!)
    ).json();
    assert.deepEqual(
      followed
        .find((p: any) => p.id === pathway.id)
        .steps.map((s: any) => s.id),
      [firstStep, secondStep],
    );
    assert.equal(
      (await (await learnerCall("me/pathways", otherLearner.learnerId!)).json())
        .length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM entitlements WHERE learner_id=$1",
          [saver.learnerId],
        )
      ).rows[0].n,
      0,
      "following and saving register nothing",
    );
    const staffView = await (
      await http("staff/collections", STAFF, undefined, approverId)
    ).json();
    const staffPathway = staffView.find((c: any) => c.id === pathway.id);
    assert.equal(staffPathway.followers, 1);
    assert.deepEqual(
      staffPathway.courses.map((c: any) => c.published),
      [true, false, true],
      "staff see unpublished courses in the collection",
    );
    pathway = await (
      await http(
        `collections/${pathway.id}/unpublish`,
        STAFF,
        { version: pathway.version },
        catalogId,
      )
    ).json();
    assert.equal((await http(`collections/${pathway.slug}`)).status, 404);
    assert.equal(
      (await (await learnerCall("me/pathways", saver.learnerId!)).json())
        .length,
      0,
      "unpublished pathways disappear for followers",
    );
    const collectionEvents = (
      await db.query(
        "SELECT action, actor FROM audit_events WHERE object_id=$1 ORDER BY id",
        [pathway.id],
      )
    ).rows;
    assert.deepEqual(
      collectionEvents.map((e) => e.action),
      [
        "collection.created",
        "collection.edited",
        "collection.published",
        "collection.unpublished",
      ],
    );
    assert.ok(collectionEvents.every((e) => e.actor === `staff:${catalogId}`));
    console.log(
      "PASS: staff curate collections and pathways; learners filter, save courses privately and follow pathways without registering",
    );

    // Explore tab: staff picks first, automatic fill, published items only.
    const currentPicks = await (
      await http("staff/explore", STAFF, undefined, approverId)
    ).json();
    explorePicks = {
      courses: currentPicks.courses.map((c: any) => c.id),
      collections: currentPicks.collections.map((c: any) => c.id),
      pathways: currentPicks.pathways.map((c: any) => c.id),
    };
    const featuredCourse = await seed(false);
    const pickBody = {
      courses: [featuredCourse],
      collections: [],
      pathways: [],
    };
    assert.equal(
      (await http("staff/explore", STAFF, pickBody, approverId)).status,
      403,
      "changing Explore picks needs catalog:write or content:write",
    );
    assert.equal(
      (await http("staff/explore", STAFF, pickBody, contentId)).status,
      200,
      "content editors also curate the Explore picks",
    );
    assert.equal(
      (
        await http(
          "staff/explore",
          STAFF,
          { ...pickBody, courses: [hiddenStep] },
          catalogId,
        )
      ).status,
      400,
      "unpublished courses cannot be featured",
    );
    assert.equal(
      (
        await http(
          "staff/explore",
          STAFF,
          { ...pickBody, pathways: [sampleCollection?.id ?? randomUUID()] },
          catalogId,
        )
      ).status,
      400,
      "a collection cannot be featured as a pathway",
    );
    assert.equal(
      (
        await http(
          "staff/explore",
          STAFF,
          {
            ...pickBody,
            courses: Array.from({ length: 6 }, () => randomUUID()),
          },
          catalogId,
        )
      ).status,
      400,
      "at most five featured courses",
    );
    assert.equal(
      (await http("staff/explore", STAFF, pickBody, catalogId)).status,
      200,
    );
    const explore = await (await http("explore")).json();
    assert.equal(
      explore.courses[0].id,
      featuredCourse,
      "staff picks come first",
    );
    assert.equal(explore.courses[0].featured, true);
    assert.ok(
      explore.courses.length <= 5 &&
        explore.courses.slice(1).every((c: any) => c.featured === false),
      "remaining spots fill automatically",
    );
    assert.ok(
      explore.courses.every((c: any) => c.published && c.enrollment_open),
    );
    assert.ok(explore.pathways.every((p: any) => p.kind === "pathway"));
    assert.ok(explore.collections.length <= 3 && explore.pathways.length <= 3);
    const unpublishTarget = (
      await db.query("SELECT version FROM offerings WHERE id=$1", [
        featuredCourse,
      ])
    ).rows[0];
    await http(
      `offerings/${featuredCourse}/unpublish`,
      STAFF,
      {
        version: unpublishTarget.version,
        reason: "Integration test unpublish",
      },
      catalogId,
    );
    assert.equal(
      (
        await db.query("SELECT featured_rank FROM offerings WHERE id=$1", [
          featuredCourse,
        ])
      ).rows[0].featured_rank,
      null,
      "unpublishing clears the featured position",
    );
    assert.ok(
      !(await (await http("explore")).json()).courses.some(
        (c: any) => c.id === featuredCourse,
      ),
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE action='explore.updated' AND actor=$1",
          [`staff:${catalogId}`],
        )
      ).rows[0].n >= 1,
      true,
    );
    console.log(
      "PASS: Explore shows staff picks first and fills the rest; only published items, by catalog managers or content editors; unpublishing removes a pick",
    );

    // Sales pages (F2): content editors draft, publish and remove structured pages.
    const pageCourse = await seed(false);
    const pagePath = `staff/sales-pages/${pageCourse}`;
    const heroBlock = {
      type: "hero",
      image: "data-analysis",
      decorative: false,
      alt: "Two people reviewing a chart",
      tagline: "Clear answers from your data",
    };
    const quote = {
      type: "testimonial",
      quote: "Useful from the first week.",
      name: "Sample Learner",
      role: "",
      consent: false,
      consentNote: "Release form on file (sample)",
    };
    const draftPage = {
      blocks: [
        heroBlock,
        { type: "outcomes", heading: "What you learn" },
        quote,
      ],
      seo: { title: "Data course" },
    };
    assert.equal(
      (await http(pagePath, STAFF, { version: 0, page: draftPage }, catalogId))
        .status,
      403,
      "editing sales pages needs content:write",
    );
    assert.equal(
      (
        await http(
          pagePath,
          STAFF,
          {
            version: 0,
            page: { blocks: [{ type: "html", body: "<script>" }], seo: {} },
          },
          contentId,
        )
      ).status,
      400,
      "unknown block types are refused",
    );
    const pageCreated = await (
      await http(pagePath, STAFF, { version: 0, page: draftPage }, contentId)
    ).json();
    assert.equal(pageCreated.status, "draft");
    assert.equal(
      (await http(pagePath, STAFF, { version: 0, page: draftPage }, contentId))
        .status,
      409,
      "a second create is a conflict",
    );
    const pageDetail = await (
      await http(pagePath, STAFF, undefined, approverId)
    ).json();
    assert.deepEqual(pageDetail.problems, [
      "Block 3 (Testimonial): confirm the person agreed to be quoted.",
    ]);
    assert.equal(
      (
        await http(
          `${pagePath}/publish`,
          STAFF,
          { version: pageCreated.version },
          contentId,
        )
      ).status,
      400,
      "testimonials need recorded consent to publish",
    );
    const consented = await (
      await http(
        pagePath,
        STAFF,
        {
          version: pageCreated.version,
          page: {
            ...draftPage,
            blocks: [
              heroBlock,
              draftPage.blocks[1],
              { ...quote, consent: true },
            ],
          },
        },
        contentId,
      )
    ).json();
    const published = await (
      await http(
        `${pagePath}/publish`,
        STAFF,
        { version: consented.version },
        contentId,
      )
    ).json();
    assert.equal(published.status, "published");
    assert.equal(published.published_revision, 1);
    const learnerView = await (await http(`offerings/${pageCourse}`)).json();
    assert.equal(learnerView.sales_page.blocks.length, 3);
    assert.equal(learnerView.sales_page.seo.title, "Data course");
    assert.ok(
      !("consentNote" in learnerView.sales_page.blocks[2]) &&
        !("consent" in learnerView.sales_page.blocks[2]),
      "consent records never reach learners",
    );
    // Editing after publishing leaves the live page alone until the next publish.
    const pageEdited = await (
      await http(
        pagePath,
        STAFF,
        {
          version: published.version,
          page: { ...draftPage, blocks: [heroBlock] },
        },
        contentId,
      )
    ).json();
    assert.equal(pageEdited.status, "changes");
    assert.equal(
      (await (await http(`offerings/${pageCourse}`)).json()).sales_page.blocks
        .length,
      3,
    );
    assert.equal(
      (
        await http(
          `${pagePath}/publish`,
          STAFF,
          { version: published.version },
          contentId,
        )
      ).status,
      409,
      "publishing a stale version is a conflict",
    );
    const pageRestored = await (
      await http(
        `${pagePath}/restore`,
        STAFF,
        { version: pageEdited.version, revision: 1 },
        contentId,
      )
    ).json();
    assert.equal(
      pageRestored.status,
      "published",
      "revision 1 pageRestored to the draft",
    );
    const removed = await (
      await http(
        `${pagePath}/unpublish`,
        STAFF,
        { version: pageRestored.version },
        contentId,
      )
    ).json();
    assert.equal(removed.status, "draft");
    assert.equal(
      (await (await http(`offerings/${pageCourse}`)).json()).sales_page,
      null,
      "removing the page restores the default course page",
    );
    const offeringPage = await (
      await http(`staff/offerings/${pageCourse}`, STAFF, undefined, approverId)
    ).json();
    assert.equal(offeringPage.offering.sales_page_status, "draft");
    assert.deepEqual(offeringPage.registrations, {});
    assert.equal(
      offeringPage.activity.filter((e: any) =>
        e.action.startsWith("sales_page."),
      ).length,
      6,
      "the offering page lists its own activity",
    );
    assert.equal(
      offeringPage.activity.find(
        (e: any) => e.action === "sales_page.published",
      ).actor_email,
      "content@cuce.test",
    );
    assert.equal(
      (
        await (
          await http("staff/offerings", STAFF, undefined, approverId)
        ).json()
      ).find((o: any) => o.id === pageCourse).sales_page_status,
      "draft",
      "the staff list shows each sales page's status",
    );
    await assert.rejects(
      db.query(
        "UPDATE sales_page_revisions SET page='{}'::jsonb WHERE offering_id=$1",
        [pageCourse],
      ),
      /append-only/,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE object_id=$1 AND action LIKE 'sales_page.%'",
          [pageCourse],
        )
      ).rows[0].n,
      6,
      "every sales page change is audited",
    );
    // Rich text (Tiptap JSON): only allowlisted content; uploaded images; video players.
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
        "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
      "hex",
    ).toString("base64");
    assert.equal(
      (
        await http(
          "staff/media",
          STAFF,
          { fileName: "x.png", contentType: "image/png", data: png },
          catalogId,
        )
      ).status,
      403,
      "uploading images needs content:write",
    );
    assert.equal(
      (
        await http(
          "staff/media",
          STAFF,
          {
            fileName: "x.svg",
            contentType: "image/svg+xml",
            data: Buffer.from("<svg onload='alert(1)'/>").toString("base64"),
          },
          contentId,
        )
      ).status,
      400,
      "SVG is not accepted",
    );
    assert.equal(
      (
        await http(
          "staff/media",
          STAFF,
          {
            fileName: "fake.png",
            contentType: "image/png",
            data: Buffer.from("<html>not an image</html>").toString("base64"),
          },
          contentId,
        )
      ).status,
      400,
      "files are checked by their bytes, not their name",
    );
    const uploaded = await (
      await http(
        "staff/media",
        STAFF,
        { fileName: "dot.png", contentType: "image/png", data: png },
        contentId,
      )
    ).json();
    mediaIds.push(uploaded.id);
    assert.equal(uploaded.url, `/media/${uploaded.id}`);
    const served = await fetch(
      `http://127.0.0.1:3001/api/v1/media/${uploaded.id}`,
    );
    assert.equal(served.headers.get("content-type"), "image/png");
    assert.equal(served.headers.get("x-content-type-options"), "nosniff");
    assert.equal(
      Buffer.from(await served.arrayBuffer()).toString("base64"),
      png,
    );
    const rich = (content: unknown[]) => ({
      version: removed.version,
      page: {
        blocks: [{ type: "rich_text", doc: { type: "doc", content } }],
        seo: { title: "" },
      },
    });
    const para = (text: string, marks?: unknown[]) => ({
      type: "paragraph",
      content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
    });
    for (const [content, label] of [
      [
        [
          para("Click", [
            { type: "link", attrs: { href: "javascript:alert(1)" } },
          ]),
        ],
        "script links",
      ],
      [
        [
          {
            type: "videoEmbed",
            attrs: { src: "https://evil.example.com/embed/1", title: "x" },
          },
        ],
        "videos from other sites",
      ],
      [
        [
          {
            type: "image",
            attrs: { src: "https://evil.example.com/a.png", alt: "x" },
          },
        ],
        "images from other sites",
      ],
      [[{ type: "html", content: [] }], "unknown content types"],
    ] as [unknown[], string][])
      assert.equal(
        (await http(pagePath, STAFF, rich(content), contentId)).status,
        400,
        `rich text refuses ${label}`,
      );
    const richDraft = await (
      await http(
        pagePath,
        STAFF,
        rich([
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "Why" }],
          },
          para("Sign up", [
            { type: "bold" },
            {
              type: "link",
              attrs: { href: "https://example.edu/apply", target: "_blank" },
            },
          ]),
          { type: "image", attrs: { src: uploaded.url, alt: "", width: 50 } },
          {
            type: "videoEmbed",
            attrs: {
              src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              title: "",
            },
          },
        ]),
        contentId,
      )
    ).json();
    assert.deepEqual(
      (await (await http(pagePath, STAFF, undefined, contentId)).json())
        .problems,
      [
        "Block 1 (Rich text): describe image 1 (alternative text).",
        "Block 1 (Rich text): give video 1 a title.",
      ],
      "images need a description and videos a title before publishing",
    );
    const saved = (
      await (await http(pagePath, STAFF, undefined, contentId)).json()
    ).draft.blocks[0].doc.content;
    assert.equal(saved[0].attrs.level, 2, "heading levels start at 2");
    assert.deepEqual(saved[1].content[0].marks[1], {
      type: "link",
      attrs: { href: "https://example.edu/apply" },
    });
    assert.deepEqual(saved[2].attrs, { src: uploaded.url, alt: "" });
    assert.deepEqual(saved[3].attrs, {
      provider: "youtube",
      src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      title: "",
    });
    assert.equal(richDraft.status, "draft");

    console.log(
      "PASS: sales pages: content editors draft, publish as revisions; rich text allowlist, uploaded images checked by bytes, YouTube/Vimeo/Kaltura only, restore and remove; consent required and kept from learners; structured blocks only; offering page shows status, counts and activity",
    );

    // Stripe sandbox Checkout: signed fake webhook events, no network calls.
    const paymentConfig = await (await http("payments/config")).json();
    assert.ok(["stripe", "simulated"].includes(paymentConfig.provider));
    const reserve = async (who: Principal, offeringId: string) =>
      (await service.register(who, randomUUID(), offeringId)) as {
        id: string;
        status: string;
        learner_id: string;
      };
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret)
      console.log(
        "SKIP: Stripe webhook checks (STRIPE_WEBHOOK_SECRET not set)",
      );
    else {
      const signer = new Stripe("sk_test_signing_only");
      const postEvent = (event: object, secret = webhookSecret) => {
        const payload = JSON.stringify(event);
        return fetch("http://127.0.0.1:3001/api/v1/webhooks/stripe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Stripe-Signature": signer.webhooks.generateTestHeaderString({
              payload,
              secret,
            }),
          },
          body: payload,
        });
      };
      const stripeEvent = (type: string, session: object) => {
        const id = `evt_test_${randomUUID().replace(/-/g, "")}`;
        stripeEventIds.push(id);
        return { id, object: "event", type, data: { object: session } };
      };
      const payer = await learner();
      const paidOffering = await seed(false);
      const reservation = await reserve(payer, paidOffering);
      const sessionId = `cs_test_${randomUUID().replace(/-/g, "")}`;
      await db.query(
        "INSERT INTO checkout_sessions(id,entitlement_id,amount_cents,expires_at) VALUES ($1,$2,100,now()+interval '31 minutes')",
        [sessionId, reservation.id],
      );
      const paidSession = {
        id: sessionId,
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 100,
        currency: "usd",
        metadata: { entitlement_id: reservation.id },
        payment_intent: `pi_test_${randomUUID().slice(0, 8)}`,
      };
      assert.equal(
        (
          await postEvent(
            stripeEvent("checkout.session.completed", paidSession),
            "whsec_wrong",
          )
        ).status,
        400,
        "events with a bad signature are rejected",
      );
      const mismatch = stripeEvent("checkout.session.completed", {
        ...paidSession,
        amount_total: 99,
      });
      assert.equal(
        (await postEvent(mismatch)).status,
        400,
        "an amount that differs from the reservation is rejected",
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM stripe_events WHERE id=$1",
            [mismatch.id],
          )
        ).rows[0].n,
        0,
        "a rejected event is not marked handled, so Stripe retries it",
      );
      const completed = stripeEvent("checkout.session.completed", paidSession);
      assert.equal((await postEvent(completed)).status, 200);
      assert.equal(
        (await (await postEvent(completed)).json()).duplicate,
        true,
        "a repeated delivery is ignored",
      );
      const order = (
        await db.query(
          "SELECT provider,amount_cents,stripe_checkout_session_id,stripe_payment_intent_id FROM orders WHERE entitlement_id=$1",
          [reservation.id],
        )
      ).rows;
      assert.equal(order.length, 1, "exactly one order");
      assert.equal(order[0].provider, "stripe");
      assert.equal(order[0].amount_cents, 100);
      assert.equal(order[0].stripe_checkout_session_id, sessionId);
      assert.equal(
        order[0].stripe_payment_intent_id,
        paidSession.payment_intent,
      );
      assert.equal(
        (
          await db.query("SELECT status FROM entitlements WHERE id=$1", [
            reservation.id,
          ])
        ).rows[0].status,
        "provisioning",
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM operations WHERE entitlement_id=$1",
            [reservation.id],
          )
        ).rows[0].n,
        1,
        "enrollment is queued once",
      );
      assert.equal(
        (
          await db.query(
            "SELECT actor FROM audit_events WHERE object_id=$1 AND action='payment.stripe_paid'",
            [reservation.id],
          )
        ).rows[0]?.actor,
        "stripe-webhook",
      );
      const lapsed = await reserve(await learner(), await seed(false));
      const lapsedSession = `cs_test_${randomUUID().replace(/-/g, "")}`;
      await db.query(
        "INSERT INTO checkout_sessions(id,entitlement_id,amount_cents,expires_at) VALUES ($1,$2,100,now()+interval '31 minutes')",
        [lapsedSession, lapsed.id],
      );
      assert.equal(
        (
          await postEvent(
            stripeEvent("checkout.session.expired", {
              id: lapsedSession,
              object: "checkout.session",
              payment_status: "unpaid",
            }),
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await db.query("SELECT status FROM checkout_sessions WHERE id=$1", [
            lapsedSession,
          ])
        ).rows[0].status,
        "expired",
      );
      console.log(
        "PASS: Stripe webhooks: signed events only, amount checked, paid once, enrollment queued, expiry recorded",
      );

      // Transactions are read-only; refunds are requested here and issued in Stripe.
      const paidOrder = (
        await db.query("SELECT id FROM orders WHERE entitlement_id=$1", [
          reservation.id,
        ])
      ).rows[0].id as string;
      assert.equal(
        (await http("staff/transactions", STAFF, undefined, approverId)).status,
        403,
        "approvers cannot see transactions",
      );
      const listed = await (
        await http("staff/transactions", STAFF, undefined, adminStaffId)
      ).json();
      const row = listed.find((t: any) => t.id === paidOrder);
      assert.equal(row.provider, "stripe");
      assert.equal(row.amount_cents, 100);
      const refundPath = `staff/transactions/${paidOrder}/refund-requests`;
      assert.equal(
        (
          await http(
            refundPath,
            STAFF,
            { reason: "Learner withdrew before the start" },
            approverId,
          )
        ).status,
        403,
        "requesting refunds needs refunds:request",
      );
      assert.equal(
        (await http(refundPath, STAFF, { reason: "short" }, supportId)).status,
        400,
      );
      const firstRequest = await (
        await http(
          refundPath,
          STAFF,
          { reason: "Learner withdrew before the start" },
          supportId,
        )
      ).json();
      assert.equal(firstRequest.status, "requested");
      assert.equal(firstRequest.amount_cents, 100);
      assert.equal(
        (
          await http(
            refundPath,
            STAFF,
            { reason: "Duplicate request for the same payment" },
            adminStaffId,
          )
        ).status,
        409,
        "one waiting request per payment",
      );
      assert.equal(
        (
          await http(
            `staff/refund-requests/${firstRequest.id}/cancel`,
            STAFF,
            { reason: "Requested on the wrong registration" },
            supportId,
          )
        ).status,
        200,
      );
      const secondRequest = await (
        await http(
          refundPath,
          STAFF,
          { reason: "Learner withdrew before the start" },
          adminStaffId,
        )
      ).json();
      const simulatedOrder = (
        await db.query(
          "SELECT o.id FROM orders o JOIN entitlements e ON e.id=o.entitlement_id WHERE o.provider='simulated' AND e.offering_id=ANY($1::uuid[]) LIMIT 1",
          [ids],
        )
      ).rows[0];
      if (simulatedOrder)
        assert.equal(
          (
            await http(
              `staff/transactions/${simulatedOrder.id}/refund-requests`,
              STAFF,
              { reason: "Learner withdrew before the start" },
              supportId,
            )
          ).status,
          409,
          "simulated payments cannot be refunded in Stripe",
        );
      assert.equal(
        (
          await postEvent(
            stripeEvent("charge.refunded", {
              id: `ch_test_${randomUUID().slice(0, 8)}`,
              object: "charge",
              payment_intent: paidSession.payment_intent,
              amount_refunded: 100,
              refunds: {
                object: "list",
                data: [{ id: "re_test_integration" }],
              },
            }),
          )
        ).status,
        200,
      );
      const refundedOrder = (
        await db.query("SELECT refunded_cents FROM orders WHERE id=$1", [
          paidOrder,
        ])
      ).rows[0];
      assert.equal(refundedOrder.refunded_cents, 100);
      const closedRequest = (
        await db.query(
          "SELECT status,stripe_refund_id,resolved_by FROM refund_requests WHERE id=$1",
          [secondRequest.id],
        )
      ).rows[0];
      assert.equal(closedRequest.status, "refunded");
      assert.equal(closedRequest.stripe_refund_id, "re_test_integration");
      assert.equal(closedRequest.resolved_by, "stripe-webhook");
      assert.equal(
        (
          await db.query("SELECT status FROM entitlements WHERE id=$1", [
            reservation.id,
          ])
        ).rows[0].status,
        "refunded",
        "a full refund ends course access",
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM operations WHERE entitlement_id=$1 AND status IN ('pending','running')",
            [reservation.id],
          )
        ).rows[0].n,
        0,
        "no enrollment job continues after the refund",
      );
      // A refunded learner can register again and pay as a new order.
      const again = await reserve(payer, paidOffering);
      assert.equal(again.id, reservation.id, "the same registration restarts");
      assert.equal(again.status, "reserved");
      const againSession = `cs_test_${randomUUID().replace(/-/g, "")}`;
      const againIntent = `pi_test_${randomUUID().slice(0, 8)}`;
      await db.query(
        "INSERT INTO checkout_sessions(id,entitlement_id,amount_cents,expires_at) VALUES ($1,$2,100,now()+interval '31 minutes')",
        [againSession, reservation.id],
      );
      assert.equal(
        (
          await postEvent(
            stripeEvent("checkout.session.completed", {
              ...paidSession,
              id: againSession,
              payment_intent: againIntent,
            }),
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM orders WHERE entitlement_id=$1",
            [reservation.id],
          )
        ).rows[0].n,
        2,
        "the earlier refunded order stays as history",
      );
      assert.equal(
        (
          await db.query("SELECT status FROM entitlements WHERE id=$1", [
            reservation.id,
          ])
        ).rows[0].status === "refunded",
        false,
        "paying again restores access",
      );
      // A late refund event for the earlier payment does not end the new access.
      await postEvent(
        stripeEvent("charge.refunded", {
          id: `ch_test_${randomUUID().slice(0, 8)}`,
          object: "charge",
          payment_intent: paidSession.payment_intent,
          amount_refunded: 100,
        }),
      );
      assert.notEqual(
        (
          await db.query("SELECT status FROM entitlements WHERE id=$1", [
            reservation.id,
          ])
        ).rows[0].status,
        "refunded",
        "a refund of an earlier payment leaves current access",
      );
      // A partial refund is recorded but leaves access unchanged.
      const partial = await reserve(await learner(), await seed(false));
      const partialSession = `cs_test_${randomUUID().replace(/-/g, "")}`;
      const partialIntent = `pi_test_${randomUUID().slice(0, 8)}`;
      await db.query(
        "INSERT INTO checkout_sessions(id,entitlement_id,amount_cents,expires_at) VALUES ($1,$2,100,now()+interval '31 minutes')",
        [partialSession, partial.id],
      );
      await postEvent(
        stripeEvent("checkout.session.completed", {
          ...paidSession,
          id: partialSession,
          metadata: { entitlement_id: partial.id },
          payment_intent: partialIntent,
        }),
      );
      await postEvent(
        stripeEvent("charge.refunded", {
          id: `ch_test_${randomUUID().slice(0, 8)}`,
          object: "charge",
          payment_intent: partialIntent,
          amount_refunded: 50,
        }),
      );
      const partialState = (
        await db.query(
          "SELECT e.status,o.refunded_cents FROM entitlements e JOIN orders o ON o.entitlement_id=e.id WHERE e.id=$1",
          [partial.id],
        )
      ).rows[0];
      assert.equal(partialState.refunded_cents, 50);
      assert.notEqual(
        partialState.status,
        "refunded",
        "a partial refund leaves access unchanged",
      );
      assert.equal(
        (
          await http(
            refundPath,
            STAFF,
            { reason: "Another request after the refund" },
            supportId,
          )
        ).status,
        409,
        "fully refunded payments cannot be requested again",
      );
      console.log(
        "PASS: transactions are read-only for payments:read; refund requests are validated and closed by Stripe's charge.refunded; a full refund ends access, learners can pay again, partial refunds are flagged",
      );

      // A lapsed reservation keeps its seat while its Checkout session is unresolved.
      const held = await reserve(await learner(), await seed(false));
      const heldSession = `cs_test_${randomUUID().replace(/-/g, "")}`;
      await db.query(
        "INSERT INTO checkout_sessions(id,entitlement_id,amount_cents,expires_at) VALUES ($1,$2,100,now()+interval '10 minutes')",
        [heldSession, held.id],
      );
      await db.query(
        "UPDATE entitlements SET reserved_until=now()-interval '1 minute' WHERE id=$1",
        [held.id],
      );
      await new Promise((resolve) => setTimeout(resolve, 2500));
      assert.equal(
        (
          await db.query("SELECT status FROM entitlements WHERE id=$1", [
            held.id,
          ])
        ).rows[0].status,
        "reserved",
        "the worker keeps the seat while Checkout is unresolved",
      );
      await db.query(
        "UPDATE checkout_sessions SET status='expired' WHERE id=$1",
        [heldSession],
      );
      await new Promise((resolve) => setTimeout(resolve, 2500));
      assert.equal(
        (
          await db.query("SELECT status FROM entitlements WHERE id=$1", [
            held.id,
          ])
        ).rows[0].status,
        "expired",
        "the seat is released once the session is resolved",
      );
      console.log(
        "PASS: seats are held while a Checkout session is unresolved and released after",
      );
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      const pending = await reserve(await learner(), await seed(false));
      await assert.rejects(
        service.checkout(
          {
            actor: "integration-checkout",
            learnerId: pending.learner_id,
            scopes: ["learner"],
          },
          randomUUID(),
          pending.id,
        ),
        /Stripe is not configured/,
      );
      console.log("PASS: checkout is refused while Stripe is not configured");
    }
  } finally {
    await db.query("DELETE FROM media_assets WHERE id=ANY($1::uuid[])", [
      mediaIds,
    ]);
    await db.query("DELETE FROM stripe_events WHERE id=ANY($1::text[])", [
      stripeEventIds,
    ]);
    // Restore the site-wide Explore picks, then remove this run's audit entries for them.
    if (explorePicks)
      await http("staff/explore", process.env.STAFF_API_TOKEN, explorePicks);
    // Site-wide settings the run changed and restored leave audit entries too.
    await db.query(
      "DELETE FROM audit_events WHERE action IN ('explore.updated','prototype.simulation_changed') AND created_at>=$1",
      [testStarted],
    );
    await db.query("DELETE FROM audit_events WHERE object_id=ANY($1::uuid[])", [
      collectionIds,
    ]);
    await db.query("DELETE FROM collections WHERE id=ANY($1::uuid[])", [
      collectionIds,
    ]);
    await db.query(
      "DELETE FROM operations WHERE entitlement_id IN (SELECT id FROM entitlements WHERE offering_id=ANY($1::uuid[]))",
      [ids],
    );
    await db.query(
      "DELETE FROM orders WHERE entitlement_id IN (SELECT id FROM entitlements WHERE offering_id=ANY($1::uuid[]))",
      [ids],
    );
    await db.query(
      "DELETE FROM audit_events WHERE actor=ANY($1::text[]) OR object_id=ANY($2::uuid[]) OR object_id IN (SELECT id FROM entitlements WHERE offering_id=ANY($2::uuid[]))",
      [actors, ids],
    );
    await db.query(
      "DELETE FROM entitlements WHERE offering_id=ANY($1::uuid[])",
      [ids],
    );
    await db.query(
      "DELETE FROM commands WHERE actor=ANY($1::text[]) OR key=ANY($2::text[])",
      [actors, httpKeys],
    );
    await db.query("DELETE FROM offerings WHERE id=ANY($1::uuid[])", [ids]);
    await db.query(
      "DELETE FROM audit_events WHERE object_id=ANY($1::uuid[]) OR actor=ANY($2::text[])",
      [staffIds, staffIds.map((id) => `staff:${id}`)],
    );
    await db.query("DELETE FROM staff_members WHERE id=ANY($1::uuid[])", [
      staffIds,
    ]);
    await db.query("DELETE FROM audit_events WHERE object_id=ANY($1::uuid[])", [
      userIds,
    ]);
    // Commands made as a test learner through the API use its demo-learner actor.
    await db.query("DELETE FROM commands WHERE actor=ANY($1::text[])", [
      userIds.map((id) => `demo-learner:${id}`),
    ]);
    await db.query("DELETE FROM learners WHERE id=ANY($1::uuid[])", [userIds]);
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
