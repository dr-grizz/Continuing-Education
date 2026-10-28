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
  const base = new URL(process.env.DATABASE_URL!),
    database = `ce_progresstest_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({
    connectionString: Object.assign(new URL(base), { pathname: "/postgres" })
      .href,
  });
  const directory = mkdtempSync(join(tmpdir(), "ce-progress-test-"));
  let created = false,
    db: Pool | undefined,
    child: ChildProcess | undefined;
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    created = true;
    const url = Object.assign(new URL(base), { pathname: `/${database}` }).href;
    await migrate(url, { quiet: true });
    db = new Pool({ connectionString: url });
    const staff = (
      await db.query(
        "SELECT id,roles::text[] AS roles FROM staff_members WHERE active",
      )
    ).rows;
    const manager = staff.find((x) => x.roles.includes("catalog_manager")),
      reader = staff.find(
        (x) => x.roles.length === 1 && x.roles[0] === "approver",
      );
    assert.ok(manager && reader);
    const a = (
        await db.query(
          "INSERT INTO learners(email) VALUES('progress-a@example.test') RETURNING id",
        )
      ).rows[0].id,
      b = (
        await db.query(
          "INSERT INTO learners(email) VALUES('progress-b@example.test') RETURNING id",
        )
      ).rows[0].id;
    const offering = (await db.query("SELECT id FROM offerings LIMIT 1"))
      .rows[0].id;
    await db.query(
      "INSERT INTO entitlements(learner_id,offering_id,status) VALUES($1,$2,'enrolled')",
      [a, offering],
    );
    const listener = createServer();
    await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>((r) => listener.close(() => r()));
    const origin = `http://127.0.0.1:${port}`,
      token = randomUUID(),
      learnerToken = randomUUID();
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
          PROTOTYPE_MODE: "true",
          HOSTED_DEMO: "false",
          STAFF_AUTH_MODE: "mock",
          LEARNER_AUTH_MODE: "mock",
          API_PORT: String(port),
          API_URL: origin,
          STAFF_API_TOKEN: token,
          LEARNER_API_TOKEN: learnerToken,
          AUTOMATION_API_TOKEN: randomUUID(),
          BADGE_DATA_DIR: directory,
        },
        stdio: "pipe",
      },
    );
    child.stdout?.resume();
    child.stderr?.resume();
    let ready = false;
    for (let i = 0; i < 200; i++) {
      if (child.exitCode !== null)
        throw new Error("Progress test API exited before startup");
      try {
        if ((await fetch(origin + "/api/v1/health")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, "Test API ready");
    async function request(
      path: string,
      body?: unknown,
      who = manager.id,
      key = randomUUID(),
      asLearner = false,
    ) {
      const response = await fetch(`${origin}/api/v1/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${asLearner ? learnerToken : token}`,
          ...(asLearner
            ? { "X-Prototype-Learner-Id": who }
            : { "X-Prototype-Staff-Id": who }),
          "Idempotency-Key": key,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, data: await response.json() };
    }
    const planBody = {
      offeringId: offering,
      previousRevision: 0,
      steps: [
        { title: "Required module", required: true },
        { title: "Assessment passed", required: true },
        { title: "Optional reflection", required: false },
      ],
    };
    assert.equal(
      (await request("staff/progress/plans", planBody, reader.id)).status,
      403,
    );
    assert.equal(
      (
        await request("staff/progress/plans", {
          ...planBody,
          steps: [{ title: " ", required: true }],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("staff/progress/plans", {
          ...planBody,
          steps: [{ title: "Optional", required: false }],
        })
      ).status,
      400,
    );
    const key = randomUUID(),
      plan = await request("staff/progress/plans", planBody, manager.id, key);
    assert.equal(plan.status, 200);
    assert.deepEqual(
      (await request("staff/progress/plans", planBody, manager.id, key)).data,
      plan.data,
    );
    assert.equal((await request("staff/progress/plans", planBody)).status, 409);
    const id = plan.data.id;
    assert.deepEqual(
      (await request("me/progress", undefined, a, undefined, true)).data,
      [],
      "Enrollment alone does not assign or complete requirements",
    );
    const cohort = (
      await request("staff/progress/cohorts", {
        name: "Synthetic Cohort",
        planId: id,
      })
    ).data;
    const cohort2 = (
      await request("staff/progress/cohorts", {
        name: "Second Cohort",
        planId: id,
      })
    ).data;
    for (const learnerId of [a, b])
      assert.equal(
        (
          await request(`staff/progress/cohorts/${cohort.id}/members`, {
            learnerId,
            active: true,
          })
        ).status,
        200,
      );
    await request(`staff/progress/cohorts/${cohort2.id}/members`, {
      learnerId: a,
      active: true,
    });
    let report = (await request(`staff/progress/cohorts/${cohort.id}/report`))
      .data;
    assert.equal(report.summary.awaitingVerification, 2);
    assert.equal(report.summary.completed, 0);
    const person = report.participants.find((p: any) => p.learnerId === a),
      first = person.steps[0],
      second = person.steps[1],
      optional = person.steps[2];
    const evidence = {
      stepId: first.id,
      state: "completed",
      note: "Staff verified completed module requirements.",
      reference: "Synthetic module evidence",
      previousEventId: null,
    };
    assert.equal(
      (
        await request(
          `staff/progress/participants/${person.id}/evidence`,
          evidence,
          b,
          undefined,
          true,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(`staff/progress/participants/${person.id}/evidence`, {
          ...evidence,
          note: "short",
        })
      ).status,
      400,
    );
    const result = await request(
      `staff/progress/participants/${person.id}/evidence`,
      evidence,
    );
    assert.equal(result.status, 200);
    assert.equal(
      (
        await request(
          `staff/progress/participants/${person.id}/evidence`,
          evidence,
        )
      ).status,
      409,
    );
    const mine = (await request("me/progress", undefined, a, undefined, true))
      .data;
    assert.equal(mine[0].progress.percent, 50);
    assert.equal(mine[0].progress.required, 2);
    assert.equal(mine[0].progress.name, undefined);
    assert.equal(
      (await request("me/progress", undefined, b, undefined, true)).data[0]
        .progress.percent,
      0,
    );
    assert.equal(
      (
        await request(
          `staff/progress/plans/${id}/report`,
          undefined,
          a,
          undefined,
          true,
        )
      ).status,
      403,
    );
    await request(`staff/progress/participants/${person.id}/evidence`, {
      ...evidence,
      stepId: second.id,
    });
    report = (await request(`staff/progress/cohorts/${cohort.id}/report`)).data;
    assert.equal(report.summary.completed, 1);
    assert.equal(
      report.participants.find((p: any) => p.learnerId === a).percent,
      100,
      "Optional step does not affect completion",
    );
    assert.equal(
      (await request(`staff/progress/cohorts/${cohort2.id}/report`)).data
        .summary.completed,
      1,
      "Same individual record feeds multiple cohorts",
    );
    const corrected = await request(
      `staff/progress/participants/${person.id}/evidence`,
      {
        ...evidence,
        state: "not_started",
        note: "Correction: original evidence belongs to a different learner.",
        previousEventId: result.data.id,
      },
    );
    assert.equal(corrected.status, 200);
    const history = (
      await request(`staff/progress/participants/${person.id}/history`)
    ).data;
    assert.equal(history.length, 3);
    assert.equal(history[0].state, "not_started");
    assert.equal(
      (await request("me/progress", undefined, a, undefined, true)).data[0]
        .progress.percent,
      50,
    );
    await request(`staff/progress/cohorts/${cohort.id}/members`, {
      learnerId: a,
      active: false,
    });
    assert.equal(
      (await request(`staff/progress/cohorts/${cohort.id}/report`)).data.summary
        .learners,
      1,
    );
    assert.equal(
      (await request("me/progress", undefined, a, undefined, true)).data[0]
        .progress.percent,
      50,
    );
    const rev2 = (
      await request("staff/progress/plans", {
        offeringId: offering,
        previousRevision: 1,
        steps: [{ title: "New version requirement", required: true }],
      })
    ).data;
    assert.equal(rev2.revision, 2);
    assert.equal(
      (await request("me/progress", undefined, a, undefined, true)).data[0].plan
        .revision,
      1,
    );
    const newPerson = (
      await request(`staff/progress/plans/${rev2.id}/participants`, {
        learnerId: a,
      })
    ).data;
    assert.equal(
      (
        await request(
          `staff/progress/participants/${newPerson.id}/evidence`,
          evidence,
        )
      ).status,
      400,
      "Cross-version step rejected",
    );
    await assert.rejects(
      db.query(
        "UPDATE progress_evidence SET note='rewritten history' WHERE id=$1",
        [result.data.id],
      ),
      /immutable/,
    );
    await assert.rejects(
      db.query(
        "UPDATE progress_steps SET title='rewritten requirements' WHERE id=$1",
        [first.id],
      ),
      /immutable/,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::integer AS n FROM audit_events WHERE action LIKE 'progress.%'",
        )
      ).rows[0].n > 0,
      true,
    );
    console.log(
      "PASS: progress HTTP authorization, learner isolation, validation, immutable versions, documented evidence/corrections, stale updates, idempotent retries, cohort aggregation and membership preservation",
    );
  } finally {
    if (child && child.exitCode === null) {
      const c = child;
      await new Promise<void>((r) => {
        const timeout = setTimeout(() => c.kill("SIGKILL"), 10000);
        c.once("exit", () => {
          clearTimeout(timeout);
          r();
        });
        c.kill("SIGTERM");
      });
    }
    if (db) await endPoolAndWaitForClients(db);
    if (created) await admin.query(`DROP DATABASE ${database}`);
    await endPoolAndWaitForClients(admin);
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
