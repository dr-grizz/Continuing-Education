import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { spawn, ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { migrate } from "../scripts/db-migrate";
import { endPoolAndWaitForClients } from "./helpers/close-pool";
async function main() {
  const original = process.env.DATABASE_URL!,
    base = new URL(original),
    database = `ce_earnings_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({
      connectionString: Object.assign(new URL(base), { pathname: "/postgres" })
        .href,
    }),
    directory = mkdtempSync(join(tmpdir(), "ce-earnings-"));
  let db: Pool | undefined,
    child: ChildProcess | undefined,
    localPrisma: any,
    localPool: any,
    created = false,
    checks = 0;
  const check = (actual: unknown, expected: unknown, label: string) => {
    assert.deepEqual(actual, expected, label);
    checks++;
  };
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    created = true;
    const url = Object.assign(new URL(base), { pathname: `/${database}` }).href;
    await migrate(url, { quiet: true });
    db = new Pool({ connectionString: url });
    process.env.DATABASE_URL = url;
    const today = Date.parse(new Date().toISOString().slice(0, 10)),
      stamp = (days: number) => new Date(today + days * 86400000).toISOString();
    const offer = (
        await db.query("SELECT id FROM offerings ORDER BY id LIMIT 3")
      ).rows.map((r) => r.id),
      people = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    for (const [i, id] of people.entries())
      await db.query(
        "INSERT INTO learners(id,email,active,deactivated_at) VALUES($1,$2,$3,$4)",
        [
          id,
          `earnings-${i}@example.test`,
          i !== 1,
          i === 1 ? new Date() : null,
        ],
      );
    const entitlements: string[] = [];
    for (const [l, o, status] of [
      [0, 0, "enrolled"],
      [0, 1, "refunded"],
      [1, 0, "enrolled"],
      [2, 1, "enrolled"],
      [3, 2, "enrolled"],
      [0, 2, "enrolled"],
    ] as const) {
      const id = randomUUID();
      await db.query(
        "INSERT INTO entitlements(id,learner_id,offering_id,status) VALUES($1,$2,$3,$4)",
        [id, people[l], offer[o], status],
      );
      entitlements.push(id);
    }
    const order = async (
      ent: number,
      amount: number,
      offset: number,
      refund = 0,
      provider = "stripe",
      status = provider === "stripe" ? "paid" : "simulated_paid",
    ) => {
      const id = randomUUID();
      await db!.query(
        "INSERT INTO orders(id,entitlement_id,amount_cents,payment_status,provider,created_at,refunded_cents,refunded_at,stripe_checkout_session_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          id,
          entitlements[ent],
          amount,
          status,
          provider,
          stamp(offset),
          refund,
          refund ? stamp(0) : null,
          provider === "stripe" ? `cs_test_seed_${id}` : null,
        ],
      );
      return id;
    };
    const a = await order(0, 10000, -6, 2000),
      b = await order(1, 5000, -4, 5000),
      c = await order(2, 20000, -2),
      d = await order(3, 2500, -3);
    await order(4, 0, -1);
    await order(5, 8000, -10);
    const late = await order(3, 12000, 0);
    await order(0, 90000, -5, 0, "stripe", "failed");
    await order(0, 7000, -5, 0, "simulated");
    await order(2, 6000, -4, 0, "simulated", "paid");
    await order(1, 7000, -9, 0, "simulated");
    await order(0, 13000, -1, 0, "simulated", "pending");
    const request = async (id: string, amount: number, status = "requested") =>
      db!.query(
        "INSERT INTO refund_requests(order_id,amount_cents,reason,status,requested_by,created_at) VALUES($1,$2,'Documented test refund request',$3,'test',$4)",
        [id, amount, status, stamp(0)],
      );
    await request(a, 10000);
    await request(c, 5000);
    await request(a, 8000, "cancelled");
    await request(b, 5000);
    const checkout = async (
      index: number,
      ent: number,
      offset: number,
      status: string,
      paid?: string,
    ) => {
      const id = `cs_test_earnings_${index}`;
      await db!.query(
        "INSERT INTO checkout_sessions(id,entitlement_id,amount_cents,status,expires_at,created_at) VALUES($1,$2,10000,$3,$4,$5)",
        [id, entitlements[ent], status, stamp(1), stamp(offset)],
      );
      if (paid)
        await db!.query(
          "UPDATE orders SET stripe_checkout_session_id=$1 WHERE id=$2",
          [id, paid],
        );
    };
    await checkout(0, 0, -6, "complete", a);
    await checkout(1, 1, -4, "complete", b);
    await checkout(2, 3, -5, "complete");
    await checkout(3, 2, -3, "open");
    await checkout(4, 4, -1, "expired");
    await checkout(5, 2, -5, "expired", c);
    await checkout(6, 3, -2, "complete", late);
    await checkout(7, 3, 0, "open");
    await db.query(
      "UPDATE offerings SET price_cents=99999,published=false WHERE id=$1",
      [offer[0]],
    );
    const { EarningsService } = await import("../src/server/earnings"),
      prismaModule = await import("../src/domain/prisma"),
      poolModule = await import("../src/domain/db");
    localPrisma = prismaModule.prisma;
    localPool = poolModule.db;
    const service = new EarningsService(),
      query = { from: stamp(-7).slice(0, 10), to: stamp(-1).slice(0, 10) };
    const data = await service.dashboard(query);
    check(
      data.provider,
      "stripe",
      "Default source is Stripe sandbox; simulation is never silently mixed",
    );
    check(
      data.totals.grossCents,
      37500,
      "Recorded order prices, not current offering prices or enrollment state, drive receipts",
    );
    check(
      data.totals.payments,
      5,
      "Paid orders include zero amounts and deactivated payers, excluding today and unconfirmed orders",
    );
    check(
      data.totals.payers,
      4,
      "Distinct payers do not double-count multiple offerings",
    );
    check(
      data.totals.refundedCents,
      7000,
      "Current cumulative refunds count against their original selected payment cohort",
    );
    check(
      data.totals.retainedCents,
      30500,
      "Retained receipts subtract confirmed refunds, not requests",
    );
    check(
      data.totals.averagePaymentCents,
      7500,
      "Average includes free/zero-amount paid orders",
    );
    check(
      data.totals.fullyRefundedPayments,
      1,
      "Fully refunded payments remain in original receipts and payment counts",
    );
    check(
      data.totals.partiallyRefundedPayments,
      1,
      "Partial refunds classified separately",
    );
    check(data.totals.refundedPayments, 2, "Refunded order count");
    check(
      data.totals.refundShare,
      (100 * 7000) / 37500,
      "Refund share uses amount, not order count",
    );
    check(
      data.previous.grossCents,
      8000,
      "Equal-length preceding payment period",
    );
    check(data.previous.payments, 1, "Previous period paid order denominator");
    check(
      data.buyers,
      { firstTime: 3, returning: 1 },
      "New/returning payers are mutually exclusive by earlier same-source order",
    );
    check(
      data.refunds,
      { outstandingRequests: 2, requestedCents: 13000 },
      "Current requests capped at remaining receipts and fully refunded requests excluded",
    );
    check(data.trend.length, 7, "Every selected UTC day is represented");
    check(
      data.trend.reduce((n, p) => n + p.grossCents, 0),
      37500,
      "Trend reconciles to gross cents",
    );
    check(
      data.trend.reduce((n, p) => n + p.payments, 0),
      5,
      "Trend reconciles to order counts",
    );
    check(
      data.byOffering.reduce((n, o) => n + o.grossCents, 0),
      37500,
      "Offering gross totals reconcile without join multiplication",
    );
    check(
      data.byOffering.reduce((n, o) => n + o.refundedCents, 0),
      7000,
      "Offering refund totals reconcile",
    );
    check(
      data.byOffering.find((o) => o.id === offer[0])?.grossCents,
      30000,
      "Unpublished offering and inactive learner retain revenue history",
    );
    check(
      data.byOffering.find((o) => o.id === offer[2])?.payments,
      1,
      "Free payment offering remains represented",
    );
    check(
      data.checkouts,
      {
        attempts: 7,
        confirmed: 4,
        completeWithoutPayment: 1,
        open: 1,
        expired: 1,
        confirmationRate: (100 * 4) / 7,
      },
      "Checkout cohort counts matching paid orders, including later payment, without treating completion as receipts",
    );
    check(
      data.excludedOrders,
      1,
      "Nonpaid order states are excluded and disclosed",
    );
    const scoped = await service.dashboard({ ...query, offeringId: offer[0] });
    check(
      scoped.totals.grossCents,
      30000,
      "Offering filter intersects monetary totals",
    );
    check(scoped.byOffering.length, 1, "Offering details match filter");
    check(
      scoped.buyers.returning,
      1,
      "Earlier payments in another offering still establish returning payer",
    );
    check(
      scoped.checkouts?.attempts,
      3,
      "Checkout scope follows selected offering",
    );
    const simulated = await service.dashboard({
      ...query,
      provider: "simulated",
    });
    check(
      simulated.totals.grossCents,
      13000,
      "Simulation accepts its stored paid statuses while excluding Stripe",
    );
    check(simulated.totals.payments, 2, "Simulation paid-order denominator");
    check(
      simulated.previous.grossCents,
      7000,
      "Provider filter applies equally to comparison",
    );
    check(
      simulated.checkouts,
      null,
      "Stripe session metrics unavailable for simulation, not zero",
    );
    check(
      simulated.excludedOrders,
      1,
      "Unconfirmed simulation status excluded",
    );
    const empty = await service.dashboard({
      from: stamp(-50).slice(0, 10),
      to: stamp(-49).slice(0, 10),
    });
    check(
      empty.totals.averagePaymentCents,
      null,
      "Empty average remains unavailable",
    );
    check(
      empty.totals.refundShare,
      null,
      "Zero revenue gives no refund percentage",
    );
    check(
      empty.checkouts?.confirmationRate,
      null,
      "No checkout attempts gives unavailable rate",
    );
    await order(0, 2000000000, -100);
    await order(0, 1000000000, -100);
    check(
      (
        await service.dashboard({
          from: stamp(-101).slice(0, 10),
          to: stamp(-99).slice(0, 10),
        })
      ).totals.grossCents,
      3000000000,
      "Cents do not overflow PostgreSQL's 32-bit integer aggregate range",
    );
    for (const invalid of [
      { ...query, from: "2026-02-30" },
      { ...query, to: stamp(0).slice(0, 10) },
      { ...query, offeringId: randomUUID() },
      { ...query, provider: "all" as any },
      { ...query, from: stamp(-400).slice(0, 10) },
    ]) {
      await assert.rejects(() => service.dashboard(invalid));
      checks++;
    }
    const members = (
        await db.query(
          "SELECT id,roles::text[] roles FROM staff_members WHERE active",
        )
      ).rows,
      manager = members.find((s) => s.roles.includes("staff_admin")),
      reader = members.find(
        (s) => s.roles.length === 1 && s.roles[0] === "approver",
      ),
      support = members.find(
        (s) => s.roles.length === 1 && s.roles[0] === "support",
      );
    const listener = createServer();
    await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
    const port = (listener.address() as any).port;
    await new Promise<void>((r) => listener.close(() => r()));
    const token = randomUUID(),
      learnerToken = randomUUID(),
      origin = `http://127.0.0.1:${port}`;
    child = spawn(
      process.execPath,
      [
        "node_modules/ts-node/dist/bin.js",
        "-P",
        "tsconfig.server.json",
        "src/server/main.ts",
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: url,
          API_PORT: String(port),
          STAFF_API_TOKEN: token,
          LEARNER_API_TOKEN: learnerToken,
          AUTOMATION_API_TOKEN: randomUUID(),
          STAFF_AUTH_MODE: "mock",
          LEARNER_AUTH_MODE: "mock",
          BADGE_DATA_DIR: directory,
          BADGE_CONFIG: "",
          STRIPE_SECRET_KEY: "",
          STRIPE_WEBHOOK_SECRET: "",
          ALERTS_WORKER_ENABLED: "false",
          CANVAS_ALERTS_ENABLED: "false",
        },
        stdio: "pipe",
      },
    );
    let output = "";
    child.stdout?.on("data", (s) => (output += s));
    child.stderr?.on("data", (s) => (output += s));
    let ready = false;
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(origin + "/api/v1/health")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, output);
    const get = (search = "", who = manager.id, bearer = token) =>
      fetch(`${origin}/api/v1/staff/earnings${search}`, {
        headers: {
          Authorization: `Bearer ${bearer}`,
          "X-Prototype-Staff-Id": who,
        },
      });
    const manualPost = (
      path: string,
      payload: unknown,
      key = randomUUID(),
      who = manager.id,
      bearer = token,
    ) =>
      fetch(origin + "/api/v1/staff/manual-payments" + path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "X-Prototype-Staff-Id": who,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(payload),
      });
    const payload = {
      learnerId: people[0],
      offeringId: offer[0],
      amountCents: 10000,
      date: stamp(-5).slice(0, 10),
      method: "check",
      reference: "Receipt-A",
      note: "External receipt verified",
    };
    const beforeManual = (
      await db.query(
        "SELECT (SELECT count(*) FROM orders)::int orders,(SELECT count(*) FROM entitlements)::int entitlements",
      )
    ).rows[0];
    check(
      (await manualPost("", payload, randomUUID(), support.id)).status,
      403,
      "Transaction readers cannot record external money",
    );
    check(
      (await manualPost("", payload, randomUUID(), reader.id)).status,
      403,
      "Report readers cannot record external money",
    );
    check(
      (await manualPost("", payload, randomUUID(), manager.id, learnerToken))
        .status,
      403,
      "Learners cannot record money",
    );
    const paymentKey = randomUUID(),
      recorded = await manualPost("", payload, paymentKey);
    check(recorded.status, 200, "Authorized staff records external payment");
    const manualId = (await recorded.json()).id;
    check(
      (await (await manualPost("", payload, paymentKey)).json()).id,
      manualId,
      "Payment retry returns original record",
    );
    check(
      (await manualPost("", { ...payload, amountCents: 20000 }, paymentKey))
        .status,
      409,
      "Key reuse with changed payment rejected",
    );
    check(
      (await manualPost("", { ...payload, reference: " receipt-a " })).status,
      409,
      "Case/whitespace duplicate payment reference blocked",
    );
    for (const invalid of [
      { ...payload, amountCents: 0 },
      { ...payload, amountCents: 1.5 },
      { ...payload, date: stamp(1).slice(0, 10) },
      { ...payload, date: "2026-02-30" },
      { ...payload, date: "0000-01-01" },
      { ...payload, note: "  " },
      { ...payload, reference: "   " },
      { ...payload, learnerId: randomUUID() },
      { ...payload, offeringId: randomUUID() },
      { ...payload, method: "stripe" },
      { ...payload, unexpected: true },
    ]) {
      check(
        (await manualPost("", invalid)).status,
        400,
        "Invalid external payment rejected",
      );
    }
    const refund = {
        amountCents: 2500,
        date: stamp(-4).slice(0, 10),
        reference: "Refund-A",
        note: "Refund already completed externally",
      },
      refundKey = randomUUID();
    const partial = await manualPost(`/${manualId}/refunds`, refund, refundKey);
    check(partial.status, 200, "Partial external refund recorded");
    const refundId = (await partial.json()).id;
    check(
      (
        await (
          await manualPost(`/${manualId}/refunds`, refund, refundKey)
        ).json()
      ).id,
      refundId,
      "Refund retry does not duplicate money",
    );
    check(
      (
        await manualPost(`/${manualId}/refunds`, {
          ...refund,
          reference: " refund-a ",
        })
      ).status,
      409,
      "Duplicate refund reference blocked",
    );
    check(
      (
        await manualPost(`/${manualId}/refunds`, {
          ...refund,
          date: stamp(-6).slice(0, 10),
          reference: "bad-date",
        })
      ).status,
      409,
      "Refund cannot precede original payment",
    );
    check(
      (
        await manualPost(`/${manualId}/refunds`, {
          ...refund,
          amountCents: 10001,
          reference: "too-much",
        })
      ).status,
      409,
      "Refund cannot exceed remaining balance",
    );
    check(
      (await manualPost(`/${a}/refunds`, refund)).status,
      400,
      "Manual refund cannot alter Stripe order",
    );
    check(
      (
        await manualPost(
          `/${manualId}/refunds`,
          refund,
          randomUUID(),
          support.id,
        )
      ).status,
      403,
      "Read-only support cannot record refund",
    );
    const manualData = await service.dashboard({
      ...query,
      provider: "manual",
    });
    check(
      [
        manualData.totals.grossCents,
        manualData.totals.refundedCents,
        manualData.totals.retainedCents,
      ],
      [10000, 2500, 7500],
      "Manual receipt and refund reconcile separately",
    );
    check(
      manualData.checkouts,
      null,
      "Manual records have no Checkout denominator",
    );
    check(
      manualData.refunds,
      { outstandingRequests: 0, requestedCents: 0 },
      "Completed manual refunds do not create requests",
    );
    check(
      (
        await service.dashboard({
          ...query,
          provider: "manual",
          offeringId: offer[1],
        })
      ).totals.grossCents,
      0,
      "Manual offering filter intersects receipts",
    );
    check(
      (
        await db.query(
          "SELECT (SELECT count(*) FROM orders)::int orders,(SELECT count(*) FROM entitlements)::int entitlements",
        )
      ).rows[0],
      beforeManual,
      "Manual records never grant entitlements or change Stripe orders",
    );
    const concurrent = await Promise.all(
      ["race-1", "race-2"].map((reference) =>
        manualPost(`/${manualId}/refunds`, {
          ...refund,
          reference,
          amountCents: 6000,
        }),
      ),
    );
    check(
      concurrent.map((r) => r.status).sort(),
      [200, 409],
      "Concurrent refunds serialize and cannot overrefund",
    );
    const detailResponse = await fetch(
      origin + "/api/v1/staff/manual-payments",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Prototype-Staff-Id": manager.id,
        },
      },
    );
    check(detailResponse.status, 200, "Authorized manual ledger available");
    const detail = (await detailResponse.json()).payments.find(
      (p: any) => p.id === manualId,
    );
    check(
      [detail.refunded_cents, detail.refunds.length, detail.reference],
      [8500, 2, "Receipt-A"],
      "Ledger retains original receipt and all refunds",
    );
    check(
      detail.recorded_by.includes(manager.id),
      true,
      "Payment actor retained",
    );
    check(
      detail.refunds.every(
        (r: any) => r.recorded_by.includes(manager.id) && r.recorded_at,
      ),
      true,
      "Refund actor and recording timestamp retained",
    );
    check(
      (
        await db.query(
          "SELECT count(*)::int n FROM audit_events WHERE action IN ('manual_payment.recorded','manual_refund.recorded')",
        )
      ).rows[0].n,
      3,
      "Only successful new records add financial audit events",
    );
    await assert.rejects(() =>
      db!.query("UPDATE manual_payments SET amount_cents=1 WHERE id=$1", [
        manualId,
      ]),
    );
    checks++;
    await assert.rejects(() =>
      db!.query("DELETE FROM manual_refunds WHERE payment_id=$1", [manualId]),
    );
    checks++;
    await assert.rejects(() =>
      db!.query(
        "INSERT INTO manual_refunds(payment_id,amount_cents,refunded_on,reference,note,recorded_by) VALUES($1,9999,current_date,'direct-over','Direct SQL test','test')",
        [manualId],
      ),
    );
    checks++;
    const full = await manualPost(`/${manualId}/refunds`, {
      ...refund,
      reference: "final-refund",
      amountCents: 1500,
    });
    check(full.status, 200, "Remaining balance can be refunded in full");
    check(
      (await service.dashboard({ ...query, provider: "manual" })).totals
        .retainedCents,
      0,
      "Fully refunded manual cohort retains zero",
    );
    const optionsResponse = await fetch(
      origin + "/api/v1/staff/manual-payments/options?search=earnings-0",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Prototype-Staff-Id": manager.id,
        },
      },
    );
    check(
      (await optionsResponse.json()).learners.some(
        (l: any) => l.id === people[0],
      ),
      true,
      "Bounded literal learner search returns existing identity",
    );
    const response = await get("?" + new URLSearchParams(query));
    check(
      response.status,
      200,
      "Sales-authorized staff can access financial aggregates",
    );
    const body = await response.json();
    check(body.totals.grossCents, 37500, "Real API matches reviewed cents");
    check(
      body.refunds.requestedCents,
      13000,
      "Real API reconciles refund request amounts",
    );
    check(
      JSON.stringify(body).includes("@example.test"),
      false,
      "API contains no payer emails",
    );
    check(
      (await get("", reader.id)).status,
      403,
      "Ordinary reporting permission does not grant earnings access",
    );
    check(
      (await get("", support.id)).status,
      403,
      "Transaction-read access alone does not grant sales reports",
    );
    check(
      (await get("", manager.id, learnerToken)).status,
      403,
      "Learner broker cannot access earnings",
    );
    check((await get("", randomUUID())).status, 401, "Unknown staff rejected");
    check(
      (await get("?provider=all")).status,
      400,
      "No combined provider mode",
    );
    check(
      (await get("?offeringId=invalid")).status,
      400,
      "Malformed offering rejected",
    );
    check(
      (await get("?unexpected=true")).status,
      400,
      "Unknown query fields rejected",
    );
    console.log(
      `PASS: ${checks} earnings checks (real PostgreSQL/API; isolated payment, refund, and Checkout fixtures; no provider calls).`,
    );
  } finally {
    if (child) {
      child.kill("SIGTERM");
      await new Promise<void>((r) => {
        if (child!.exitCode !== null) r();
        else child!.once("exit", () => r());
      });
    }
    if (localPrisma) await localPrisma.$disconnect();
    if (localPool) await endPoolAndWaitForClients(localPool);
    if (db) await endPoolAndWaitForClients(db);
    if (created) await admin.query(`DROP DATABASE ${database}`);
    await endPoolAndWaitForClients(admin);
    rmSync(directory, { recursive: true, force: true });
    process.env.DATABASE_URL = original;
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
