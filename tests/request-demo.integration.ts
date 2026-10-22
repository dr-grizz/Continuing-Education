import "reflect-metadata";
import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { migrate } from "../scripts/db-migrate";
import { endPoolAndWaitForClients } from "./helpers/close-pool";

// No worker or live provider: prove fulfillment/recovery against a fresh database.
const base = new URL(process.env.DATABASE_URL!);
const database = `ce_requesttest_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({
  connectionString: Object.assign(new URL(base), { pathname: "/postgres" })
    .href,
});
let created = false;
let prisma: typeof import("../src/domain/prisma").prisma | undefined;
let pool: typeof import("../src/domain/db").db | undefined;
async function main() {
  await admin.query(`CREATE DATABASE ${database}`);
  created = true;
  Object.assign(process.env, {
    DATABASE_URL: Object.assign(new URL(base), { pathname: `/${database}` })
      .href,
    PROTOTYPE_MODE: "true",
    STAFF_AUTH_MODE: "mock",
    STRIPE_SECRET_KEY: "sk_test_isolated_request_demo",
    CANVAS_COURSES_ENABLED: "false",
  });
  await migrate(process.env.DATABASE_URL!, { quiet: true });
  prisma = (await import("../src/domain/prisma")).prisma;
  pool = (await import("../src/domain/db")).db;
  const { PortalService } = await import("../src/server/service");
  const { stripe } = await import("../src/server/stripe");
  const service = new PortalService();
  const offering = await prisma.offerings.create({
    data: {
      title: "Isolated request demo",
      summary: "Synthetic request demo",
      description: "Synthetic offering for isolated request processing tests",
      category: "Technology",
      format: "Online",
      course_type: "self_paced",
      capacity: 20,
      price_cents: 100,
      published: true,
    },
  });
  const staff = {
    actor: "request-demo-support",
    scopes: ["payments:reconcile"],
  };
  const reserve = async () => {
    const learner = await prisma!.learners.create({
      data: { email: `${randomUUID()}@example.test` },
    });
    const principal = {
      actor: `learner:${learner.id}`,
      learnerId: learner.id,
      scopes: ["learner"],
    };
    const registration = (await service.register(
      principal,
      randomUUID(),
      offering.id,
    )) as any;
    return { principal, registration };
  };
  const first = await reserve();
  await Promise.all(
    [1, 2].map(() =>
      service.payment(first.principal, randomUUID(), first.registration.id),
    ),
  );
  assert.equal(
    (
      await prisma.entitlements.findUniqueOrThrow({
        where: { id: first.registration.id },
      })
    ).status,
    "enrolled",
  );
  assert.equal(
    await prisma.orders.count({
      where: { entitlement_id: first.registration.id },
    }),
    1,
  );
  assert.equal(
    await prisma.operations.count({
      where: { entitlement_id: first.registration.id, status: "succeeded" },
    }),
    1,
  );
  console.log(
    "PASS: normal simulated payment completes atomically with duplicate protection and no worker",
  );

  const samples: any[] = [];
  for (const mode of ["paid", "expired", "unavailable"]) {
    const { registration } = await reserve();
    const id = `cs_test_${mode}_${randomUUID()}`;
    await prisma.checkout_sessions.create({
      data: {
        id,
        entitlement_id: registration.id,
        amount_cents: 100,
        expires_at: new Date(Date.now() - 120_000),
      },
    });
    await prisma.entitlements.update({
      where: { id: registration.id },
      data: { reserved_until: new Date(Date.now() - 60_000) },
    });
    samples.push({ mode, id, registration });
  }
  let calls = 0;
  stripe.checkout.sessions.retrieve = (async (id: string) => {
    calls++;
    const sample = samples.find((s) => s.id === id);
    if (sample.mode === "unavailable") throw new Error("Mock provider timeout");
    return {
      id,
      status: sample.mode === "paid" ? "complete" : "expired",
      payment_status: sample.mode === "paid" ? "paid" : "unpaid",
      amount_total: 100,
      currency: "usd",
      metadata: { entitlement_id: sample.registration.id },
      payment_intent: `pi_test_${sample.mode}`,
    };
  }) as any;
  const key = randomUUID();
  assert.deepEqual(await service.reconcilePayments(staff, key), {
    checked: 2,
    failed: 1,
  });
  const beforeRetry = calls;
  assert.deepEqual(await service.reconcilePayments(staff, key), {
    checked: 2,
    failed: 1,
  });
  assert.equal(
    calls,
    beforeRetry,
    "a completed command retry makes no provider calls",
  );
  assert.equal(
    (
      await prisma.entitlements.findUniqueOrThrow({
        where: { id: samples[0].registration.id },
      })
    ).status,
    "enrolled",
  );
  assert.equal(
    (
      await prisma.entitlements.findUniqueOrThrow({
        where: { id: samples[1].registration.id },
      })
    ).status,
    "expired",
  );
  await service.processDemo();
  assert.equal(
    (
      await prisma.entitlements.findUniqueOrThrow({
        where: { id: samples[2].registration.id },
      })
    ).status,
    "reserved",
    "uncertain payment retains its hold",
  );
  await assert.rejects(service.reconcilePayments(staff, ""), /UUID/);
  assert.equal(calls, beforeRetry);
  console.log(
    "PASS: manual reconciliation recovers missed payment, releases confirmed expiry, preserves uncertain holds and deduplicates retries",
  );

  const delayed = await reserve();
  await prisma.prototype_settings.update({
    where: { key: "provisioning_outcome" },
    data: { value: "delayed" },
  });
  await service.payment(
    delayed.principal,
    randomUUID(),
    delayed.registration.id,
  );
  await prisma.prototype_settings.update({
    where: { key: "provisioning_outcome" },
    data: { value: "normal" },
  });
  assert.equal(
    (
      await prisma.entitlements.findUniqueOrThrow({
        where: { id: delayed.registration.id },
      })
    ).status,
    "provisioning",
  );
  await prisma.operations.updateMany({
    where: { entitlement_id: delayed.registration.id },
    data: { next_run: new Date(0) },
  });
  await new PortalService().processDemo();
  assert.equal(
    (
      await prisma.entitlements.findUniqueOrThrow({
        where: { id: delayed.registration.id },
      })
    ).status,
    "enrolled",
  );
  console.log(
    "PASS: delayed simulation resumes from durable state in a new API instance without a background loop",
  );
}
main()
  .finally(async () => {
    await prisma?.$disconnect();
    if (pool) await endPoolAndWaitForClients(pool);
    if (created) await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
