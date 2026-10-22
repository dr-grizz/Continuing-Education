import "reflect-metadata";
import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  Body,
  Controller,
  Get,
  Headers,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { migrate } from "../scripts/db-migrate";
import { endPoolAndWaitForClients } from "./helpers/close-pool";

const savedEnv = { ...process.env };
const base = new URL(process.env.DATABASE_URL!);
const database = `ce_visibility_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({
  connectionString: Object.assign(new URL(base), { pathname: "/postgres" })
    .href,
});
let created = false;
let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
let client: typeof import("../src/domain/prisma").prisma | undefined;
let pool: typeof import("../src/domain/db").db | undefined;

async function main() {
  await admin.query(`CREATE DATABASE ${database}`);
  created = true;
  Object.assign(process.env, {
    DATABASE_URL: Object.assign(new URL(base), { pathname: `/${database}` })
      .href,
    PROTOTYPE_MODE: "true",
    LEARNER_AUTH_MODE: "mock",
    STAFF_AUTH_MODE: "mock",
    LEARNER_API_TOKEN: "visibility-learner",
    STAFF_API_TOKEN: "visibility-staff",
    CANVAS_COURSES_ENABLED: "false",
  });
  await migrate(process.env.DATABASE_URL, { quiet: true });
  client = (await import("../src/domain/prisma")).prisma;
  pool = (await import("../src/domain/db")).db;
  const prisma = client;
  const { PortalService } = await import("../src/server/service");
  const { PrototypeGuard, requireScope } = await import("../src/server/auth");
  const { CanvasStaffAuthService } =
    await import("../src/server/canvas-staff-auth");
  const {
    OfferingSettingsDto,
    OfferingEditDto,
    OfferingDto,
    QueryDto,
    RegistrationDto,
    CollectionDto,
    CollectionEditDto,
  } = await import("../src/server/dto");
  // Decorator metadata needs runtime DTO classes, supplied below through explicit
  // pipes since the DTOs are dynamically imported after the isolated DB is set.
  const validate = (dto: any) =>
    new ValidationPipe({
      expectedType: dto,
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
  const service = new PortalService();
  @Controller("api/v1")
  class Routes {
    @Get("offerings") list(@Query(validate(QueryDto)) q: any) {
      return service.list(q);
    }
    @Get("offerings/:id") detail(@Param("id", ParseUUIDPipe) id: string) {
      return service.detail(id);
    }
    @Get("collections") collections() {
      return service.publicCollections();
    }
    @Get("collections/:slug") collection(@Param("slug") slug: string) {
      return service.publicCollection(slug);
    }
    @Get("explore") explore() {
      return service.explore();
    }
    @Post("offerings/:id/settings")
    @UseGuards(PrototypeGuard)
    settings(
      @Req() req: any,
      @Headers("idempotency-key") key: string,
      @Param("id", ParseUUIDPipe) id: string,
      @Body(validate(OfferingSettingsDto)) data: any,
    ) {
      requireScope(req, "catalog:write");
      return service.updateSettings(req.principal, key, id, data);
    }
    @Post("offerings/:id/edit")
    @UseGuards(PrototypeGuard)
    edit(
      @Req() req: any,
      @Headers("idempotency-key") key: string,
      @Param("id", ParseUUIDPipe) id: string,
      @Body(validate(OfferingEditDto)) data: any,
    ) {
      requireScope(req, "catalog:write");
      return service.edit(req.principal, key, id, data);
    }
    @Post("offerings")
    @UseGuards(PrototypeGuard)
    create(
      @Req() req: any,
      @Headers("idempotency-key") key: string,
      @Body(validate(OfferingDto)) data: any,
    ) {
      requireScope(req, "catalog:write");
      return service.create(req.principal, key, data);
    }
    @Post("collections")
    @UseGuards(PrototypeGuard)
    createCollection(
      @Req() req: any,
      @Headers("idempotency-key") key: string,
      @Body(validate(CollectionDto)) data: any,
    ) {
      requireScope(req, "catalog:write");
      return service.createCollection(req.principal, key, data);
    }
    @Post("collections/:id/edit")
    @UseGuards(PrototypeGuard)
    editCollection(
      @Req() req: any,
      @Headers("idempotency-key") key: string,
      @Param("id", ParseUUIDPipe) id: string,
      @Body(validate(CollectionEditDto)) data: any,
    ) {
      requireScope(req, "catalog:write");
      return service.editCollection(req.principal, key, id, data);
    }
    @Post("registrations")
    @UseGuards(PrototypeGuard)
    register(
      @Req() req: any,
      @Headers("idempotency-key") key: string,
      @Body(validate(RegistrationDto)) data: any,
    ) {
      requireScope(req, "learner");
      return service.register(req.principal, key, data.offeringId);
    }
  }
  @Module({
    controllers: [Routes],
    providers: [PrototypeGuard, CanvasStaffAuthService],
  })
  class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const api = await app.getUrl();
  const manager = await prisma.staff_members.findUniqueOrThrow({
    where: { email: "catalog@cuce.test" },
  });
  const support = await prisma.staff_members.findUniqueOrThrow({
    where: { email: "support@cuce.test" },
  });
  const staff = { actor: `staff:${manager.id}`, scopes: ["catalog:write"] };
  const learner = await prisma.learners.create({
    data: { email: "visibility@example.test" },
  });
  const second = await prisma.learners.create({
    data: { email: "visibility-other@example.test" },
  });
  const learnerPrincipal = {
    actor: `learner:${learner.id}`,
    learnerId: learner.id,
    scopes: ["learner"],
  };
  const otherPrincipal = {
    actor: `learner:${second.id}`,
    learnerId: second.id,
    scopes: ["learner"],
  };
  const call = (
    path: string,
    data?: unknown,
    who = manager.id,
    key = randomUUID(),
  ) =>
    fetch(`${api}/api/v1/${path}`, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer visibility-staff",
        "X-Prototype-Staff-Id": who,
        "Idempotency-Key": key,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const input = (title: string, priceCents = 100) => ({
    title,
    category: "Technology",
    summary: "Synthetic visibility test course",
    description: "Synthetic description for offering visibility tests.",
    format: "Online",
    courseType: "self_paced" as const,
    priceCents,
    capacity: 20,
    approvalRequired: false,
  });
  const make = async (title: string, price = 100, category = "Technology") => {
    const draft = (await service.create(staff, randomUUID(), {
      ...input(title, price),
      category,
    })) as any;
    assert.equal(draft.listed, true);
    assert.equal(draft.published, false);
    return (await service.publish(
      staff,
      randomUUID(),
      draft.id,
      draft.version,
    )) as any;
  };
  const a = await make("HiddenKeyword Visibility Course", 90000, "Healthcare");
  const b = await make("Visible Second Course", 100);
  const c = await make("Visible Third Course", 200);
  const group = (await service.createCollection(staff, randomUUID(), {
    kind: "collection",
    slug: "visibility-collection",
    title: "Visibility collection",
    summary: "Synthetic visibility collection",
    offeringIds: [a.id, b.id, c.id],
  })) as any;
  const path = (await service.createCollection(staff, randomUUID(), {
    kind: "pathway",
    slug: "visibility-pathway",
    title: "Visibility pathway",
    summary: "Synthetic visibility pathway",
    offeringIds: [a.id, b.id, c.id],
  })) as any;
  await service.setCollectionPublished(
    staff,
    randomUUID(),
    group.id,
    group.version,
    true,
  );
  await service.setCollectionPublished(
    staff,
    randomUUID(),
    path.id,
    path.version,
    true,
  );
  const onlyHidden = (await service.createCollection(staff, randomUUID(), {
    kind: "collection",
    slug: "visibility-only-hidden",
    title: "Single course collection",
    summary: "A collection that will have no publicly visible courses",
    offeringIds: [a.id],
  })) as any;
  await service.setCollectionPublished(
    staff,
    randomUUID(),
    onlyHidden.id,
    onlyHidden.version,
    true,
  );
  await service.setExplore(staff, randomUUID(), {
    courses: [a.id],
    collections: [onlyHidden.id, group.id],
    pathways: [path.id],
  });
  await service.setSaved(learnerPrincipal, randomUUID(), a.id, true);
  await service.setFollowing(learnerPrincipal, randomUUID(), path.id, true);
  const settings = async (listed?: unknown, version?: number) => {
    const row = await prisma.offerings.findUniqueOrThrow({
      where: { id: a.id },
    });
    return {
      version: version ?? row.version,
      approvalValidDays: row.approval_valid_days,
      enrollmentCloseDays: row.enrollment_close_days,
      canvasCourseUrl: row.canvas_course_url,
      ...(listed === undefined ? {} : { listed }),
      reason: "Limit discovery to shared course links",
    };
  };
  assert.ok((await service.list({})).some((row) => row.id === a.id));
  const before = await prisma.offerings.findUniqueOrThrow({
    where: { id: a.id },
  });
  const write = await settings(false);
  assert.equal(
    (await call(`offerings/${a.id}/settings`, write, support.id)).status,
    403,
  );
  assert.equal(
    (await call(`offerings/${a.id}/settings`, { ...write, listed: null }))
      .status,
    400,
  );
  assert.equal(
    (await call(`offerings/${a.id}/settings`, { ...write, listed: "false" }))
      .status,
    400,
  );
  assert.equal(
    (await call(`offerings/${a.id}/settings`, { ...write, reason: undefined }))
      .status,
    400,
  );
  const key = randomUUID();
  assert.equal(
    (await call(`offerings/${a.id}/settings`, write, manager.id, key)).status,
    201,
  );
  assert.equal(
    (await call(`offerings/${a.id}/settings`, write, manager.id, key)).status,
    201,
  );
  assert.equal((await call(`offerings/${a.id}/settings`, write)).status, 409);
  const hidden = await prisma.offerings.findUniqueOrThrow({
    where: { id: a.id },
  });
  assert.equal(hidden.listed, false);
  assert.equal(hidden.published, true);
  assert.equal(hidden.version, before.version + 1);
  for (const field of [
    "title",
    "price_cents",
    "capacity",
    "canvas_course_url",
    "featured_rank",
    "image_override",
    "image_media_id",
  ] as const)
    assert.equal(hidden[field], before[field]);
  const audits = await prisma.audit_events.findMany({
    where: { object_id: a.id, action: "offering.settings_changed" },
  });
  assert.equal(audits.length, 1);
  const audit = audits[0].details as any;
  assert.equal(audit.before.listed, true);
  assert.equal(audit.after.listed, false);
  assert.equal(audit.reason, write.reason);
  for (const resource of [
    "offerings",
    "offerings?search=HiddenKeyword",
    "offerings?category=Healthcare",
    "offerings?collection=visibility-collection",
    "explore",
    "collections/visibility-collection",
    "collections/visibility-pathway",
  ]) {
    const response = await call(resource);
    assert.equal(response.status, 200);
    assert.ok(
      !JSON.stringify(await response.json()).includes(a.id),
      `${resource} leaked the unlisted course`,
    );
  }
  const summaries = await service.publicCollections();
  assert.equal(
    summaries.some((row) => row.id === onlyHidden.id),
    false,
  );
  assert.equal(
    (await service.publicCollection("visibility-only-hidden")).offerings.length,
    0,
  );
  assert.equal(
    (await service.explore()).collections.some(
      (row) => row.id === onlyHidden.id,
    ),
    false,
  );
  const insufficient = (await service.createCollection(staff, randomUUID(), {
    kind: "pathway",
    slug: "visibility-not-ready",
    title: "Not enough listed courses",
    summary: "Unlisted courses cannot satisfy the public pathway minimum",
    offeringIds: [a.id, b.id],
  })) as any;
  await assert.rejects(
    service.setCollectionPublished(
      staff,
      randomUUID(),
      insufficient.id,
      insufficient.version,
      true,
    ),
    /published, listed courses/,
  );
  for (const id of [group.id, path.id]) {
    const summary = summaries.find((row) => row.id === id)!;
    assert.equal(summary.course_count, 2);
    assert.equal(summary.min_price_cents, 100);
    assert.equal(summary.max_price_cents, 200);
    assert.deepEqual(summary.topics, ["Technology"]);
  }
  assert.ok(
    (await service.list({}, true)).some(
      (row) => row.id === a.id && !row.listed,
    ),
  );
  assert.equal((await call(`offerings/${a.id}`)).status, 200);
  assert.equal((await service.detail(a.id)).listed, false);
  assert.equal(
    (await service.savedCourses(learnerPrincipal)).some(
      (row) => row.id === a.id,
    ),
    true,
  );
  assert.equal(
    (await service.followedPathways(learnerPrincipal))
      .find((row) => row.id === path.id)!
      .steps.some((row) => row.id === a.id),
    false,
  );
  assert.equal((await service.staffExplore()).courses[0].id, a.id);
  const registration = await fetch(`${api}/api/v1/registrations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer visibility-learner",
      "X-Prototype-Learner-Id": learner.id,
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({ offeringId: a.id }),
  });
  assert.equal(registration.status, 201);
  const entitlement = (await registration.json()) as any;
  await service.payment(learnerPrincipal, randomUUID(), entitlement.id);
  assert.ok(
    (await service.learning(learnerPrincipal)).some(
      (row) => row.offering_id === a.id,
    ),
  );
  assert.equal((await service.learning(otherPrincipal)).length, 0);
  assert.equal(
    await prisma.orders.count({ where: { entitlement_id: entitlement.id } }),
    1,
  );
  await service.updateSettings(
    staff,
    randomUUID(),
    a.id,
    (await settings()) as any,
  );
  assert.equal(
    (await prisma.offerings.findUniqueOrThrow({ where: { id: a.id } })).listed,
    false,
  );
  let current = await prisma.offerings.findUniqueOrThrow({
    where: { id: a.id },
  });
  await service.edit(staff, randomUUID(), a.id, {
    ...input(current.title),
    priceCents: current.price_cents!,
    version: current.version,
    reason: "Update description without changing discovery",
    description: "An updated course description that remains portal-owned.",
  });
  assert.equal((await service.detail(a.id)).listed, false);
  current = await prisma.offerings.findUniqueOrThrow({ where: { id: a.id } });
  await service.unpublish(
    staff,
    randomUUID(),
    a.id,
    current.version,
    "Temporarily pause new registrations",
  );
  assert.equal((await call(`offerings/${a.id}`)).status, 404);
  await assert.rejects(service.register(otherPrincipal, randomUUID(), a.id));
  assert.ok(
    (await service.learning(learnerPrincipal)).some(
      (row) => row.offering_id === a.id && row.status === "enrolled",
    ),
  );
  current = await prisma.offerings.findUniqueOrThrow({ where: { id: a.id } });
  await service.publish(staff, randomUUID(), a.id, current.version);
  assert.equal((await service.detail(a.id)).listed, false);
  assert.equal((await service.list({ search: "HiddenKeyword" })).length, 0);
  assert.equal(
    (await call(`offerings/${a.id}/settings`, await settings(true))).status,
    201,
  );
  assert.ok(
    (await service.list({ search: "HiddenKeyword" })).some(
      (row) => row.id === a.id,
    ),
  );
  assert.ok((await service.explore()).courses.some((row) => row.id === a.id));
  // Draft visibility saves independently of unknown imported sales fields.
  const draft = await prisma.offerings.create({
    data: {
      title: "Incomplete Canvas draft",
      category: "",
      summary: "",
      description: "",
      format: "",
      imported_from_canvas: true,
      course_type: null,
      price_cents: null,
      capacity: null,
    },
  });
  await service.updateSettings(staff, randomUUID(), draft.id, {
    version: draft.version,
    approvalValidDays: 7,
    enrollmentCloseDays: 7,
    listed: false,
  });
  const incomplete = await prisma.offerings.findUniqueOrThrow({
    where: { id: draft.id },
  });
  assert.equal(incomplete.listed, false);
  assert.equal(incomplete.published, false);
  assert.equal(incomplete.capacity, null);
  await assert.rejects(
    service.publish(staff, randomUUID(), draft.id, incomplete.version),
  );
  assert.equal((await call(`offerings/${draft.id}`)).status, 404);
  // Collection/pathway listing is independent of member-course listing.
  const offeringsBefore = await prisma.offerings.findMany({
    orderBy: { id: "asc" },
  });
  for (const original of [group, path]) {
    const currentGroup = () =>
      prisma.collections.findUniqueOrThrow({ where: { id: original.id } });
    const originalRow = await currentGroup();
    assert.equal(originalRow.listed, true);
    const membership = await prisma.collection_items.findMany({
      where: { collection_id: original.id },
      orderBy: { position: "asc" },
    });
    const body = {
      version: originalRow.version,
      title: originalRow.title,
      summary: originalRow.summary,
      offeringIds: membership.map((item) => item.offering_id),
      listed: false,
    };
    const route = `collections/${original.id}/edit`;
    assert.equal((await call(route, body, support.id)).status, 403);
    for (const listed of [null, "false"])
      assert.equal((await call(route, { ...body, listed })).status, 400);
    const retry = randomUUID();
    assert.equal((await call(route, body, manager.id, retry)).status, 201);
    assert.equal((await call(route, body, manager.id, retry)).status, 201);
    assert.equal((await call(route, body)).status, 409);
    const hidden = await currentGroup();
    assert.equal(hidden.listed, false);
    assert.equal(hidden.published, true);
    assert.equal(hidden.featured_rank, originalRow.featured_rank);
    assert.equal(hidden.version, originalRow.version + 1);
    assert.deepEqual(
      await prisma.collection_items.findMany({
        where: { collection_id: original.id },
        orderBy: { position: "asc" },
      }),
      membership,
    );
    assert.ok(
      !(await service.publicCollections()).some(
        (row) => row.id === original.id,
      ),
    );
    const explore = await service.explore();
    assert.ok(
      ![...explore.collections, ...explore.pathways].some(
        (row) => row.id === original.id,
      ),
    );
    assert.ok(
      !(await service.detail(b.id)).collections.some(
        (row) => row.slug === originalRow.slug,
      ),
    );
    assert.deepEqual(await service.list({ collection: originalRow.slug }), []);
    assert.ok(
      (await service.list({ collection: originalRow.slug }, true)).length > 0,
    );
    assert.equal((await call(`collections/${originalRow.slug}`)).status, 200);
    assert.equal(
      (await service.publicCollection(originalRow.slug)).offerings.length,
      3,
    );
    assert.ok(
      (await service.staffCollections()).some(
        (row) => row.id === original.id && row.listed === false,
      ),
    );
    if (original.kind === "pathway") {
      assert.ok(
        (await service.followedPathways(learnerPrincipal)).some(
          (row) => row.id === original.id,
        ),
      );
      await service.setFollowing(
        otherPrincipal,
        randomUUID(),
        original.id,
        true,
      );
      assert.ok(
        (await service.followedPathways(otherPrincipal)).some(
          (row) => row.id === original.id,
        ),
      );
    }
    const events = await prisma.audit_events.findMany({
      where: { object_id: original.id, action: "collection.edited" },
    });
    assert.equal(events.length, 1);
    assert.equal((events[0].details as any).before.listed, true);
    assert.equal((events[0].details as any).after.listed, false);
    // Legacy edit callers omit listed without relisting the group.
    const { listed: omitted, ...legacy } = body;
    await service.editCollection(staff, randomUUID(), original.id, {
      ...legacy,
      version: hidden.version,
    });
    let updated = await currentGroup();
    assert.equal(updated.listed, false);
    await service.setCollectionPublished(
      staff,
      randomUUID(),
      original.id,
      updated.version,
      false,
    );
    await assert.rejects(service.publicCollection(originalRow.slug));
    if (original.kind === "pathway")
      assert.ok(
        !(await service.followedPathways(learnerPrincipal)).some(
          (row) => row.id === original.id,
        ),
      );
    updated = await currentGroup();
    await service.setCollectionPublished(
      staff,
      randomUUID(),
      original.id,
      updated.version,
      true,
    );
    updated = await currentGroup();
    assert.equal(updated.listed, false);
    if (original.kind === "pathway")
      assert.ok(
        (await service.followedPathways(learnerPrincipal)).some(
          (row) => row.id === original.id,
        ),
      );
    // Competing edits must not both accept the same version.
    const concurrent = await Promise.all([
      call(route, { ...body, version: updated.version, listed: true }),
      call(route, {
        ...body,
        version: updated.version,
        listed: true,
        title: `${body.title} revised`,
      }),
    ]);
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await currentGroup()).listed, true);
    assert.ok(
      (await service.publicCollections()).some((row) => row.id === original.id),
    );
    assert.ok(
      (await service.detail(b.id)).collections.some(
        (row) => row.slug === originalRow.slug,
      ),
    );
    assert.ok(
      (await service.list({ collection: originalRow.slug })).length > 0,
    );
    const restored = await service.explore();
    assert.ok(
      [...restored.collections, ...restored.pathways].some(
        (row) => row.id === original.id,
      ),
    );
  }
  const draftGroupInput = {
    kind: "collection",
    title: "Unlisted draft collection",
    summary: "Synthetic draft without public discovery",
    offeringIds: [],
    listed: false,
  };
  assert.equal(
    (await call("collections", { ...draftGroupInput, listed: "false" })).status,
    400,
  );
  assert.equal(
    (await call("collections", { ...draftGroupInput, listed: null })).status,
    400,
  );
  const draftGroup = await (await call("collections", draftGroupInput)).json();
  assert.equal(draftGroup.listed, false);
  assert.equal(draftGroup.published, false);
  await assert.rejects(service.publicCollection(draftGroup.slug));
  // A group with no remaining visible members can still be hidden without changing membership.
  const emptyPublished = await prisma.collections.findUniqueOrThrow({
    where: { id: onlyHidden.id },
  });
  await prisma.offerings.update({
    where: { id: a.id },
    data: { listed: false },
  });
  await service.editCollection(staff, randomUUID(), onlyHidden.id, {
    version: emptyPublished.version,
    title: emptyPublished.title,
    summary: emptyPublished.summary,
    offeringIds: [a.id],
    listed: false,
  });
  assert.equal(
    (await service.publicCollection(emptyPublished.slug)).offerings.length,
    0,
  );
  await prisma.offerings.update({
    where: { id: a.id },
    data: { listed: true },
  });
  assert.deepEqual(
    await prisma.offerings.findMany({ orderBy: { id: "asc" } }),
    offeringsBefore,
  );
  console.log(
    "PASS collection visibility: defaults, draft/unpublished access, listing filters/recommendations, direct links, preserved members/picks/follows, audit/idempotency/validation/permissions, stale and concurrent edits, republishing and omitted-field compatibility.",
  );
  console.log(
    "PASS visibility: independent publication/listing, public discovery and aggregates, direct registration, paid/saved access, permissions, validation, stale versions, idempotency/audit, republishing and incomplete drafts (isolated DB; no Canvas writes).",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
    await client?.$disconnect();
    if (pool) await endPoolAndWaitForClients(pool);
    if (created) await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
    process.env = savedEnv;
  });
