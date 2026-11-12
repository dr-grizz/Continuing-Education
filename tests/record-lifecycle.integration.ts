import "reflect-metadata";
import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { withIsolatedPortal } from "./helpers/isolated-portal";
let db: typeof import("../src/domain/db").db;
let prisma: typeof import("../src/domain/prisma").prisma;
let service: import("../src/server/service").PortalService;
let DEMO_LEARNER: string;
let apiUrl = "";
const actor = `lifecycle-test:${randomUUID()}`;
const principal = { actor, scopes: ["catalog:write", "learners:manage"] };
const ids: string[] = [];
const groups: string[] = [];
const learnerIds: string[] = [];
const key = () => randomUUID();
const reason = "Synthetic lifecycle verification";
async function main() {
  try {
    const learner = await prisma.learners.create({
      data: { email: `lifecycle-${randomUUID()}@example.test` },
    });
    learnerIds.push(learner.id);
    const makeOffering = async () => {
      const result = await db.query(
        `INSERT INTO offerings(title,category,summary,description,format,course_type,start_date,end_date,price_cents,capacity) VALUES ('Lifecycle test offering','Technology','Synthetic test summary','Synthetic test description','Online','self_paced',NULL,NULL,100,10) RETURNING id`,
      );
      ids.push(result.rows[0].id);
      return result.rows[0].id as string;
    };
    const first = await makeOffering(),
      second = await makeOffering();
    await prisma.offerings.updateMany({
      where: { id: { in: [first, second] } },
      data: { published: true },
    });
    for (const kind of ["collection", "pathway"] as const) {
      let group: any = await service.createCollection(principal, key(), {
        kind,
        title: `Lifecycle ${kind} ${randomUUID()}`,
        summary: "Synthetic lifecycle verification group",
        offeringIds: [first, second],
      });
      groups.push(group.id);
      group = await service.setCollectionPublished(
        principal,
        key(),
        group.id,
        group.version,
        true,
      );
      if (kind === "pathway")
        await prisma.pathway_follows.create({
          data: { learner_id: learner.id, collection_id: group.id },
        });
      const oldVersion = group.version;
      group = await service.setCollectionArchived(
        principal,
        key(),
        group.id,
        group.version,
        true,
      );
      assert.ok(group.archived_at);
      assert.equal(group.published, false);
      await assert.rejects(service.publicCollection(group.slug));
      await assert.rejects(
        service.setCollectionPublished(
          principal,
          key(),
          group.id,
          group.version,
          true,
        ),
      );
      await assert.rejects(
        service.deleteCollection(principal, key(), group.id, oldVersion),
      );
      assert.equal(
        await prisma.pathway_follows.count({
          where: { collection_id: group.id },
        }),
        kind === "pathway" ? 1 : 0,
      );
      group = await service.setCollectionArchived(
        principal,
        key(),
        group.id,
        group.version,
        false,
      );
      assert.equal(group.archived_at, null);
      assert.equal(group.published, false);
      group = await service.setCollectionArchived(
        principal,
        key(),
        group.id,
        group.version,
        true,
      );
      const deletionKey = key();
      const result = await service.deleteCollection(
        principal,
        deletionKey,
        group.id,
        group.version,
      );
      assert.deepEqual(
        await service.deleteCollection(
          principal,
          deletionKey,
          group.id,
          group.version,
        ),
        result,
      );
      assert.equal(
        await prisma.pathway_follows.count({
          where: { collection_id: group.id },
        }),
        0,
      );
      assert.equal(
        await prisma.offerings.count({
          where: { id: { in: [first, second] } },
        }),
        2,
      );
    }
    for (const target of ["learner", "offering"] as const) {
      const id = target === "learner" ? learner.id : await makeOffering();
      const call = (
        action: "archive" | "restore" | "delete",
        version: number,
        commandKey = key(),
      ) =>
        service.recordLifecycle(principal, commandKey, target, id, {
          action,
          version,
          reason,
        });
      await assert.rejects(call("delete", 1));
      await call("archive", 1);
      await assert.rejects(call("restore", 1));
      if (target === "learner") {
        const row = await prisma.learners.findUniqueOrThrow({ where: { id } });
        assert.equal(row.active, false);
        assert.ok(row.archived_at);
        await assert.rejects(
          service.setLearnerAccess(principal, key(), id, {
            active: true,
            version: 2,
            reason,
          }),
        );
      } else await assert.rejects(service.publish(principal, key(), id, 2));
      await call("restore", 2);
      await call("archive", 3);
      const deletionKey = key();
      const result = await call("delete", 4, deletionKey);
      assert.deepEqual(await call("delete", 4, deletionKey), result);
    }
    await assert.rejects(
      service.recordLifecycle(principal, key(), "learner", DEMO_LEARNER, {
        action: "archive",
        version: 1,
        reason,
      }),
    );
    await service.recordLifecycle(principal, key(), "offering", first, {
      action: "archive",
      version: 1,
      reason,
    });
    await assert.rejects(
      service.recordLifecycle(principal, key(), "offering", first, {
        action: "delete",
        version: 2,
        reason,
      }),
    );
    const protectedLearner = await prisma.learners.create({
      data: { email: `history-${randomUUID()}@example.test` },
    });
    learnerIds.push(protectedLearner.id);
    await db.query(
      "INSERT INTO entitlements(learner_id,offering_id,status) VALUES ($1,$2,'enrolled')",
      [protectedLearner.id, second],
    );
    await service.recordLifecycle(
      principal,
      key(),
      "learner",
      protectedLearner.id,
      { action: "archive", version: 1, reason },
    );
    await assert.rejects(
      service.recordLifecycle(
        principal,
        key(),
        "learner",
        protectedLearner.id,
        { action: "delete", version: 2, reason },
      ),
    );
    assert.equal(
      await prisma.entitlements.count({
        where: { learner_id: protectedLearner.id },
      }),
      1,
    );
    const staff = await prisma.staff_members.findFirstOrThrow({
      where: { email: "approver@cuce.test" },
    });
    for (const path of [
      `collections/${groups[0]}/delete`,
      `staff/learners/${protectedLearner.id}/lifecycle`,
      `offerings/${second}/lifecycle`,
    ]) {
      const response = await fetch(`${apiUrl}/api/v1/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.STAFF_API_TOKEN}`,
          "X-Prototype-Staff-Id": staff.id,
          "Idempotency-Key": key(),
        },
        body: JSON.stringify(
          path.endsWith("delete")
            ? { version: 1 }
            : { action: "archive", version: 1, reason },
        ),
      });
      assert.equal(response.status, 403);
    }
    console.log(
      "PASS: collections/pathways, learners and offerings archive/restore/delete; stale versions, idempotency, history protection and HTTP permissions",
    );
  } finally {
    await db.query(
      "DELETE FROM entitlements WHERE learner_id=ANY($1::uuid[])",
      [learnerIds],
    );
    await db.query("DELETE FROM collections WHERE id=ANY($1::uuid[])", [
      groups,
    ]);
    await db.query("DELETE FROM offerings WHERE id=ANY($1::uuid[])", [ids]);
    await db.query("DELETE FROM learners WHERE id=ANY($1::uuid[])", [
      learnerIds,
    ]);
    await db.query("DELETE FROM audit_events WHERE actor=$1", [actor]);
    await db.query("DELETE FROM commands WHERE actor=$1", [actor]);
    await prisma.$disconnect();
    await db.end();
  }
}
async function isolated() {
  await withIsolatedPortal(async (origin) => {
    apiUrl = origin;
    ({ db, DEMO_LEARNER } = await import("../src/domain/db"));
    prisma = (await import("../src/domain/prisma")).prisma;
    service = new (await import("../src/server/service")).PortalService();
    await main();
  });
}
isolated().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
