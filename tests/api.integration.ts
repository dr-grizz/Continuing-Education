import "reflect-metadata";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { db, DEMO_LEARNER } from "../src/domain/db";
import { PortalService } from "../src/server/service";
import { Principal } from "../src/server/auth";
const service = new PortalService();
const userIds: string[] = [];
const ids: string[] = [],
  actors: string[] = [],
  httpKeys: string[] = [];
async function http(path: string, token?: string, body?: unknown) {
  const key = randomUUID();
  httpKeys.push(key);
  return fetch(`http://127.0.0.1:3001/api/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  } finally {
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
    await db.query("DELETE FROM learners WHERE id=ANY($1::uuid[])", [userIds]);
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
