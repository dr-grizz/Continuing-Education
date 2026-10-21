import {
  processDemoOperation,
  expireDemoReservations,
} from "./demo-processing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  Prisma,
  type CollectionKind,
  type entitlements,
  type offerings,
  type SimulatedOutcome,
  type StaffRole,
} from "../generated/prisma/client";
import { protectCanvasOfferingLink } from "./canvas-offering-links";
import { missingOfferingInfo } from "../domain/offering-readiness";
import { DEMO_LEARNER } from "../domain/db";
import {
  offeringColumns,
  prisma,
  sql,
  transaction,
  Tx,
} from "../domain/prisma";
import {
  roleDescriptions,
  roleLabels,
  scopeDescriptions,
  scopesFor,
  staffRoles,
} from "./roles";
import {
  CollectionDto,
  ExploreDto,
  CollectionEditDto,
  LearnerAccessDto,
  StaffMemberDto,
  StaffUpdateDto,
  OfferingDto,
  OfferingEditDto,
  OfferingImageDto,
  OfferingSettingsDto,
  ProvisioningOutcome,
  QueryDto,
} from "./dto";
import { Principal } from "./auth";
import { staffAuthMode } from "./staff-auth-config";
import {
  emptySalesPage,
  parseSalesPage,
  publicSalesPage,
  publishProblems,
} from "./sales-pages";
import Stripe from "stripe";
import {
  CHECKOUT_MINUTES,
  HOLD_GRACE_MINUTES,
  stripe,
  stripeEnabled,
  webUrl,
} from "./stripe";

function imageBytes(data: { data: string; contentType: string }) {
  const bytes = Buffer.from(data.data, "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw new BadRequestException("Images must be 5 MB or smaller.");
  const signatures: Record<string, (b: Buffer) => boolean> = {
    "image/png": (b) =>
      b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
    "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    "image/gif": (b) => b.subarray(0, 4).toString("latin1") === "GIF8",
    "image/webp": (b) =>
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  };
  if (!signatures[data.contentType]?.(bytes))
    throw new BadRequestException(
      "The file is not a PNG, JPEG, WebP or GIF image.",
    );
  return bytes;
}

function salesPageStatus(
  page: { draft: unknown; published: unknown } | null,
): "none" | "draft" | "published" | "changes" {
  if (!page) return "none";
  if (!page.published) return "draft";
  // Both come back from jsonb with the same key order, so text comparison is exact.
  return JSON.stringify(page.draft) === JSON.stringify(page.published)
    ? "published"
    : "changes";
}
// Scheduled courses close enrollment a staff-set number of days after they start.
const enrollmentWindow = `CASE WHEN o.course_type='cohort' THEN to_char(o.start_date+o.enrollment_close_days,'YYYY-MM-DD') END AS enrollment_closes_on,
  CASE WHEN o.course_type='cohort' THEN to_char(o.start_date+o.enrollment_close_days,'Mon FMDD, YYYY') END AS enrollment_closes_label,
  (o.course_type<>'cohort' OR current_date<=o.start_date+o.enrollment_close_days) AS enrollment_open`;
const scheduleText = `to_char(o.start_date,'YYYY-MM-DD') AS start_date, to_char(o.end_date,'YYYY-MM-DD') AS end_date`;
const listing = `SELECT ${offeringColumns("o")},
  (SELECT m.source->>'image_url' FROM canvas_offering_mappings m WHERE m.offering_id=o.id) AS canvas_image_url,
  ${enrollmentWindow},${scheduleText},
  (o.capacity - (SELECT count(*) FROM entitlements e WHERE e.offering_id=o.id AND
    (e.status IN ('provisioning','enrolled','exception') OR (e.status='reserved' AND e.reserved_until>now()))))::integer AS seats_available
  FROM offerings o`;
// Registrations that still depend on the offering's current terms.
const activeRegistrations = `(SELECT count(*) FROM entitlements a WHERE a.offering_id=o.id AND
  (a.status IN ('awaiting_approval','approved','provisioning','enrolled','exception') OR (a.status='reserved' AND a.reserved_until>now())))::integer`;
const seatsInUse = `(SELECT count(*) FROM entitlements s WHERE s.offering_id=o.id AND
  (s.status IN ('provisioning','enrolled','exception') OR (s.status='reserved' AND s.reserved_until>now())))::integer`;

// Sales page status for staff lists; matches salesPageStatus().
const salesPageStatusSql = `coalesce((SELECT CASE WHEN sp.published IS NULL THEN 'draft'
  WHEN sp.draft=sp.published THEN 'published' ELSE 'changes' END
  FROM sales_pages sp WHERE sp.offering_id=o.id),'none')`;
// Row shapes for raw queries, derived from the Prisma models.
type ScheduleText = { start_date: string | null; end_date: string | null };
type EnrollmentWindow = {
  enrollment_closes_on: string | null;
  enrollment_closes_label: string | null;
  enrollment_open: boolean;
};
export type OfferingListing = Omit<offerings, "start_date" | "end_date"> &
  ScheduleText &
  EnrollmentWindow & {
    canvas_image_url: string | null;
    seats_available: number | null;
    active_registrations?: number;
    seats_in_use?: number;
  };
export type LearningRow = entitlements &
  ScheduleText &
  EnrollmentWindow &
  Pick<
    offerings,
    | "title"
    | "category"
    | "format"
    | "course_type"
    | "price_cents"
    | "approval_required"
    | "published"
    | "canvas_course_url"
  > & {
    operation_id: string | null;
    stage: string | null;
    operation_status: string | null;
    attempts: number | null;
  };

type CollectionSummary = {
  id: string;
  kind: CollectionKind;
  slug: string;
  title: string;
  summary: string;
  course_count: number;
  topics: string[];
  min_price_cents: number;
  max_price_cents: number;
  featured_rank: number | null;
  created_at: Date;
};
// "Christian Leadership & Ethics" -> "christian-leadership-ethics"
const slugify = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");

export async function audit(
  tx: Tx,
  actor: string,
  action: string,
  id: string | null,
  details: Prisma.InputJsonObject = {},
) {
  await tx.audit_events.create({
    data: { actor, action, object_id: id, details },
  });
}
function validateCapacity(data: OfferingDto) {
  if (data.unlimitedSeats === true) {
    if (data.capacity != null)
      throw new BadRequestException(
        "Omit capacity or set it to null when Unlimited seats is selected.",
      );
  } else if (
    data.capacity == null ||
    !Number.isInteger(data.capacity) ||
    data.capacity < 1 ||
    data.capacity > 10000
  ) {
    throw new BadRequestException(
      "Set a seat capacity from 1 to 10,000, or select Unlimited seats.",
    );
  }
}
function validateSchedule(data: OfferingDto) {
  if (data.courseType === "cohort") {
    if (
      !data.startDate ||
      !data.endDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.endDate)
    )
      throw new BadRequestException(
        "Cohort courses require YYYY-MM-DD start and end dates.",
      );
    if (data.endDate < data.startDate)
      throw new BadRequestException("End date must follow start date.");
  } else if (data.startDate != null || data.endDate != null) {
    throw new BadRequestException(
      "Learn-on-your-own courses start anytime; omit cohort dates.",
    );
  }
}
const staffSelect = {
  id: true,
  email: true,
  display_name: true,
  roles: true,
  active: true,
  version: true,
} as const;
// Prisma date columns take a Date; YYYY-MM-DD parses as UTC midnight, preserving the day.
const toDate = (value?: string | null) => (value ? new Date(value) : null);
// Command responses are stored as JSON, exactly as JSON.stringify renders them.
const asJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;

@Injectable()
export class PortalService {
  // Authenticated requests resume due simulations and apply elapsed deadlines.
  // No external API calls and no processing after an HTTP response is sent.
  async processDemo() {
    await transaction(async (tx) => {
      for (let i = 0; i < 32; i++)
        if (!(await processDemoOperation(tx, audit))) break;
      await expireDemoReservations(tx, audit);
    });
  }

  async demoUser(email: string) {
    if ((process.env.LEARNER_AUTH_MODE || "mock") !== "mock")
      throw new ForbiddenException("Mock learner sign-in is disabled.");
    const normalized = email.trim().toLowerCase();
    // Matching where/create/update values let Prisma use a native ON CONFLICT upsert.
    const learner = await prisma.learners.upsert({
      where: { email: normalized },
      create: { email: normalized },
      update: { email: normalized },
      select: { id: true, email: true, created_at: true, active: true },
    });
    if (!learner.active)
      throw new ForbiddenException(
        "This learner account is deactivated. Contact the program office.",
      );
    const { active, ...profile } = learner;
    return profile;
  }
  async me(principal: Principal) {
    const learner = await prisma.learners.findUnique({
      where: { id: principal.learnerId },
      select: { id: true, email: true, display_name: true, created_at: true },
    });
    if (!learner) throw new NotFoundException("Demo learner not found.");
    return learner;
  }
  async list(query: QueryDto, staff = false) {
    // Staff also see how many registrations and seats depend on each offering.
    const select = staff
      ? listing.replace(
          "FROM offerings o",
          `,${activeRegistrations} AS active_registrations,${seatsInUse} AS seats_in_use,${salesPageStatusSql} AS sales_page_status FROM offerings o`,
        )
      : listing;
    const rows = await sql<OfferingListing>(
      prisma,
      `${select} WHERE ($1 OR o.published) AND ($2='' OR o.title ILIKE $2 OR o.summary ILIKE $2) AND ($3='' OR o.category=$3)
        AND ($4='' OR o.id IN (SELECT i.offering_id FROM collection_items i JOIN collections c ON c.id=i.collection_id WHERE c.slug=$4 AND c.published))
        ORDER BY o.start_date,o.title LIMIT 100`,
      staff,
      query.search ? `%${query.search}%` : "",
      query.category || "",
      query.collection || "",
    );
    return staff
      ? rows.map((row) => ({
          ...row,
          missing_required_info: missingOfferingInfo(row),
        }))
      : rows;
  }
  async detail(id: string) {
    const [offering] = await sql<OfferingListing>(
      prisma,
      `${listing} WHERE o.id=$1::uuid AND o.published`,
      id,
    );
    if (!offering) throw new NotFoundException("Offering not found.");
    // Published collections and pathways that include this course.
    const collections = await prisma.collections.findMany({
      where: {
        published: true,
        collection_items: { some: { offering_id: id } },
      },
      select: { slug: true, title: true, kind: true },
      orderBy: [{ kind: "asc" }, { title: "asc" }],
    });
    const page = await prisma.sales_pages.findUnique({
      where: { offering_id: id },
      select: { published: true },
    });
    return {
      ...offering,
      collections,
      sales_page: page?.published
        ? publicSalesPage(parseSalesPage(page.published))
        : null,
    };
  }
  async command(
    principal: Principal,
    key: string,
    input: unknown,
    action: (tx: Tx) => Promise<unknown>,
  ) {
    if (!key || key.length > 160)
      throw new BadRequestException(
        "Provide an Idempotency-Key header of 1–160 characters.",
      );
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    return transaction(async (tx) => {
      // Serializes retries of the same actor-scoped key within this transaction.
      await sql(
        tx,
        "SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended($1,0))) l",
        `${principal.actor}:${key}`,
      );
      const previous = await tx.commands.findUnique({
        where: { actor_key: { actor: principal.actor, key } },
      });
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new ConflictException(
            "Idempotency key was already used for a different command.",
          );
        return previous.response;
      }
      const response = await action(tx);
      await tx.commands.create({
        data: {
          actor: principal.actor,
          key,
          fingerprint,
          response: asJson(response),
        },
      });
      return response;
    });
  }
  async reserve(
    tx: Tx,
    offering: {
      id: string;
      capacity: number | null;
      unlimited_seats?: boolean;
    },
  ) {
    if (offering.unlimited_seats) return;
    const [occupied] = await sql<{ count: number }>(
      tx,
      `SELECT count(*)::integer AS count FROM entitlements WHERE offering_id=$1::uuid AND (status IN ('provisioning','enrolled','exception') OR (status='reserved' AND reserved_until>now()))`,
      offering.id,
    );
    if (offering.capacity === null || occupied.count >= offering.capacity)
      throw new ConflictException("This offering has no available seats.");
  }
  async register(principal: Principal, key: string, offeringId: string) {
    return this.command(
      principal,
      key,
      { action: "register", offeringId },
      async (tx) => {
        // Row lock on the offering serializes final-seat allocation.
        const [offering] = await sql<offerings & EnrollmentWindow>(
          tx,
          `SELECT o.*,${enrollmentWindow} FROM offerings o WHERE o.id=$1::uuid AND o.published FOR UPDATE`,
          offeringId,
        );
        if (!offering) throw new NotFoundException("Offering not available.");
        if (missingOfferingInfo(offering).length)
          throw new ConflictException(
            "This offering is not ready for registration.",
          );
        const row = await tx.entitlements.findUnique({
          where: {
            learner_id_offering_id: {
              learner_id: principal.learnerId as string,
              offering_id: offeringId,
            },
          },
        });
        const now = Date.now();
        const reservationCurrent =
          row?.status === "reserved" &&
          Boolean(row.reserved_until) &&
          (row.reserved_until as Date).getTime() > now;
        // In-progress registrations are returned unchanged, even after enrollment closes.
        if (
          row &&
          (reservationCurrent ||
            [
              "awaiting_approval",
              "provisioning",
              "enrolled",
              "exception",
            ].includes(row.status))
        )
          return row;
        // A refunded registration may start again (decided October 8, 2026): it
        // reserves or requests approval like a new one, and pays as a new order.
        if (!offering.enrollment_open)
          throw new ConflictException(
            `Enrollment closed on ${offering.enrollment_closes_label}.`,
          );
        // A still-valid approval allows reserving again; declined or lapsed approvals need a new request.
        const approvalValid =
          !!row &&
          ["approved", "expired", "reserved"].includes(row.status) &&
          !!row.approval_expires_at &&
          row.approval_expires_at.getTime() > now;
        const needsApproval = offering.approval_required && !approvalValid;
        if (!needsApproval) await this.reserve(tx, offering);
        const status = needsApproval ? "awaiting_approval" : "reserved";
        const [result] = await sql<entitlements>(
          tx,
          `INSERT INTO entitlements(learner_id,offering_id,status,reserved_until,quoted_price_cents) VALUES ($1::uuid,$2::uuid,$3::entitlement_status,CASE WHEN $3::entitlement_status='reserved' THEN now()+interval '30 minutes' ELSE NULL END,
          CASE WHEN $3::entitlement_status='reserved' THEN $4::integer END)
        ON CONFLICT(learner_id,offering_id) DO UPDATE SET status=EXCLUDED.status,reserved_until=EXCLUDED.reserved_until,
          quoted_price_cents=coalesce(EXCLUDED.quoted_price_cents,entitlements.quoted_price_cents),
          approval_expires_at=CASE WHEN EXCLUDED.status='awaiting_approval' THEN NULL ELSE entitlements.approval_expires_at END
        RETURNING *`,
          principal.learnerId,
          offeringId,
          status,
          offering.price_cents,
        );
        await audit(
          tx,
          principal.actor,
          needsApproval
            ? row
              ? "approval.requested_again"
              : "approval.requested"
            : "seat.reserved",
          result.id,
        );
        return result;
      },
    );
  }
  async payment(principal: Principal, key: string, entitlementId: string) {
    return this.command(
      principal,
      key,
      { action: "simulate-payment", entitlementId },
      async (tx) => {
        const [row] = await sql<
          entitlements & { amount_cents: number; published: boolean }
        >(
          tx,
          "SELECT e.*,coalesce(e.quoted_price_cents,o.price_cents) AS amount_cents,o.published FROM entitlements e JOIN offerings o ON o.id=e.offering_id WHERE e.id=$1::uuid AND e.learner_id=$2::uuid FOR UPDATE OF e",
          entitlementId,
          principal.learnerId,
        );
        if (!row) throw new NotFoundException("Registration not found.");
        // Already paid in this cycle: return its enrollment job (idempotent). A
        // refunded registration that reserved again pays as a new cycle.
        if (["provisioning", "enrolled", "exception"].includes(row.status)) {
          const latest = await tx.operations.findFirst({
            where: { entitlement_id: entitlementId },
            orderBy: { created_at: "desc" },
          });
          if (latest) return latest;
        }
        if (
          row.status !== "reserved" ||
          !row.reserved_until ||
          new Date(row.reserved_until).getTime() <= Date.now()
        )
          throw new ConflictException(
            "A current seat reservation is required.",
          );
        // Unpublishing stops new payments; already-paid registrations continue.
        if (!row.published)
          throw new ConflictException(
            "This course is no longer open for registration.",
          );
        return this.recordPayment(tx, entitlementId, row.amount_cents, {
          actor: principal.actor,
          action: "prototype.payment_simulated",
        });
      },
    );
  }
  // One path for every provider: the order, the registration's move to
  // provisioning and the enrollment job happen together, or not at all.
  private async recordPayment(
    tx: Tx,
    entitlementId: string,
    amountCents: number,
    payment: {
      actor: string;
      action: string;
      stripe?: { sessionId: string; paymentIntentId: string | null };
      details?: Prisma.InputJsonObject;
    },
  ) {
    await tx.orders.create({
      data: {
        entitlement_id: entitlementId,
        amount_cents: amountCents,
        ...(payment.stripe
          ? {
              provider: "stripe" as const,
              payment_status: "paid",
              stripe_checkout_session_id: payment.stripe.sessionId,
              stripe_payment_intent_id: payment.stripe.paymentIntentId,
            }
          : {}),
      },
    });
    await tx.entitlements.update({
      where: { id: entitlementId },
      data: { status: "provisioning", reserved_until: null },
    });
    const setting = await tx.prototype_settings.findUnique({
      where: { key: "provisioning_outcome" },
    });
    const op = await tx.operations.create({
      data: {
        entitlement_id: entitlementId,
        // Ready in this transaction even if the client's clock is ahead of DB now().
        next_run: new Date(0),
        // Set only through the validated simulation command; the enum column rejects anything else.
        simulated_outcome: (setting?.value ?? "normal") as SimulatedOutcome,
      },
    });
    await audit(tx, payment.actor, payment.action, entitlementId, {
      amount_cents: amountCents,
      ...(payment.details ?? {}),
    });
    // Complete the normal two-stage simulation before acknowledging payment.
    // Delays/failures retain next_run and resume on subsequent authenticated requests.
    for (let i = 0; i < 2; i++)
      if (!(await processDemoOperation(tx, audit, entitlementId))) break;
    return tx.operations.findUniqueOrThrow({ where: { id: op.id } });
  }
  paymentConfig() {
    return { provider: stripeEnabled ? "stripe" : "simulated" };
  }
  // Stripe-hosted Checkout for a current reservation (ADR 0005). Reuses an open
  // session; otherwise creates one that expires in 31 minutes and extends the
  // seat hold to cover it, so a completed payment always finds its seat.
  async checkout(principal: Principal, key: string, entitlementId: string) {
    if (!stripeEnabled)
      throw new ConflictException(
        "Stripe is not configured. Add STRIPE_SECRET_KEY to .env, or use the simulated payment.",
      );
    return this.command(
      principal,
      key,
      { action: "checkout", entitlementId },
      async (tx) => {
        const [row] = await sql<
          entitlements & {
            amount_cents: number;
            published: boolean;
            title: string;
            email: string | null;
          }
        >(
          tx,
          `SELECT e.*,coalesce(e.quoted_price_cents,o.price_cents) AS amount_cents,o.published,o.title,l.email
           FROM entitlements e JOIN offerings o ON o.id=e.offering_id JOIN learners l ON l.id=e.learner_id
           WHERE e.id=$1::uuid AND e.learner_id=$2::uuid FOR UPDATE OF e`,
          entitlementId,
          principal.learnerId,
        );
        if (!row) throw new NotFoundException("Registration not found.");
        if (
          row.status !== "reserved" ||
          !row.reserved_until ||
          new Date(row.reserved_until).getTime() <= Date.now()
        )
          throw new ConflictException(
            "A current seat reservation is required.",
          );
        if (!row.published)
          throw new ConflictException(
            "This course is no longer open for registration.",
          );
        const open = await tx.checkout_sessions.findFirst({
          where: {
            entitlement_id: entitlementId,
            status: "open",
            expires_at: { gt: new Date(Date.now() + 2 * 60_000) },
          },
          orderBy: { created_at: "desc" },
        });
        if (open) return { url: open.url, expires_at: open.expires_at };
        const price = await this.stripePrice(
          tx,
          row.offering_id,
          row.title,
          row.amount_cents,
        );
        const expiresAt = new Date(Date.now() + CHECKOUT_MINUTES * 60_000);
        const attempt = await tx.checkout_sessions.count({
          where: { entitlement_id: entitlementId },
        });
        const metadata = {
          entitlement_id: entitlementId,
          offering_id: row.offering_id,
          learner_id: row.learner_id,
        };
        const session = await stripe.checkout.sessions.create(
          {
            mode: "payment",
            line_items: [{ price, quantity: 1 }],
            // Cards, which include Apple Pay and Google Pay; no delayed methods
            // such as bank debits, which would outlast the seat hold.
            allowed_payment_method_types: ["card"],
            // Link would add its own bank and buy-now-pay-later options and a
            // "save my information" sign-up; found in the first sandbox run.
            wallet_options: { link: { display: "never" } },
            client_reference_id: entitlementId,
            ...(row.email ? { customer_email: row.email } : {}),
            metadata,
            payment_intent_data: { metadata },
            expires_at: Math.floor(expiresAt.getTime() / 1000),
            success_url: `${webUrl}/learning?checkout=success`,
            cancel_url: `${webUrl}/learning?checkout=cancelled`,
          },
          { idempotencyKey: `checkout-${entitlementId}-${attempt + 1}` },
        );
        await tx.checkout_sessions.create({
          data: {
            id: session.id,
            entitlement_id: entitlementId,
            amount_cents: row.amount_cents,
            url: session.url,
            expires_at: expiresAt,
          },
        });
        await tx.entitlements.update({
          where: { id: entitlementId },
          data: {
            reserved_until: new Date(
              expiresAt.getTime() + HOLD_GRACE_MINUTES * 60_000,
            ),
          },
        });
        await audit(
          tx,
          principal.actor,
          "payment.checkout_started",
          entitlementId,
          { checkout_session_id: session.id, amount_cents: row.amount_cents },
        );
        return { url: session.url, expires_at: expiresAt };
      },
    );
  }
  // One Stripe Product per offering and one Price per amount (decided Oct 7,
  // 2026). Idempotency keys make retries safe; the product name follows edits.
  private async stripePrice(
    tx: Tx,
    offeringId: string,
    title: string,
    amountCents: number,
  ) {
    let product = await tx.stripe_products.findUnique({
      where: { offering_id: offeringId },
    });
    if (!product) {
      const created = await stripe.products.create(
        { name: title, metadata: { offering_id: offeringId } },
        { idempotencyKey: `product-${offeringId}` },
      );
      product = await tx.stripe_products.create({
        data: { offering_id: offeringId, stripe_product_id: created.id },
      });
    } else {
      const current = await stripe.products.retrieve(product.stripe_product_id);
      if (current.name !== title)
        await stripe.products.update(product.stripe_product_id, {
          name: title,
        });
    }
    const known = await tx.stripe_prices.findUnique({
      where: {
        offering_id_price_cents: {
          offering_id: offeringId,
          price_cents: amountCents,
        },
      },
    });
    if (known) return known.stripe_price_id;
    const created = await stripe.prices.create(
      {
        product: product.stripe_product_id,
        unit_amount: amountCents,
        currency: "usd",
        metadata: { offering_id: offeringId },
      },
      { idempotencyKey: `price-${offeringId}-${amountCents}` },
    );
    await tx.stripe_prices.create({
      data: {
        stripe_price_id: created.id,
        offering_id: offeringId,
        price_cents: amountCents,
      },
    });
    return created.id;
  }
  // Signed Stripe webhook events (the caller verifies the signature). Each
  // event is handled once; only Stripe (by webhook or reconciliation) marks a
  // Stripe payment paid.
  async stripeEvent(event: Stripe.Event) {
    // Newer API versions omit the refund list from charge.refunded; look up
    // the latest refund ID first (best effort, outside the transaction).
    let refundId: string | null = null;
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      refundId = charge.refunds?.data?.[0]?.id ?? null;
      if (!refundId && stripeEnabled)
        refundId = await stripe.refunds
          .list({ charge: charge.id, limit: 1 })
          .then((list) => list.data[0]?.id ?? null)
          .catch(() => null);
    }
    return transaction(async (tx) => {
      const [fresh] = await sql<{ id: string }>(
        tx,
        "INSERT INTO stripe_events(id,type) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id",
        event.id,
        event.type,
      );
      if (!fresh) return { received: true, duplicate: true };
      if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
      )
        await this.applyPaidSession(
          tx,
          event.data.object as Stripe.Checkout.Session,
          "stripe-webhook",
        );
      else if (event.type === "checkout.session.expired")
        await this.applyExpiredSession(
          tx,
          (event.data.object as Stripe.Checkout.Session).id,
          "stripe-webhook",
        );
      else if (event.type === "charge.refunded")
        await this.applyRefund(
          tx,
          event.data.object as Stripe.Charge,
          refundId,
        );
      // Other events (disputes) are stored for reconciliation until P5 is decided.
      return { received: true };
    });
  }
  private async applyPaidSession(
    tx: Tx,
    session: Stripe.Checkout.Session,
    actor: string,
  ) {
    if (session.payment_status !== "paid") return;
    const [stored] = await sql<{
      entitlement_id: string;
      amount_cents: number;
      status: string;
    }>(
      tx,
      "SELECT entitlement_id,amount_cents,status FROM checkout_sessions WHERE id=$1 FOR UPDATE",
      session.id,
    );
    if (!stored)
      throw new BadRequestException(`Unknown Checkout session ${session.id}.`);
    if (stored.status === "complete") return;
    if (
      session.metadata?.entitlement_id !== stored.entitlement_id ||
      session.amount_total !== stored.amount_cents ||
      session.currency !== "usd"
    )
      throw new BadRequestException(
        "Checkout session does not match its reservation.",
      );
    await tx.checkout_sessions.update({
      where: { id: session.id },
      data: { status: "complete", completed_at: new Date() },
    });
    const [registration] = await sql<{ status: string }>(
      tx,
      "SELECT status FROM entitlements WHERE id=$1::uuid FOR UPDATE",
      stored.entitlement_id,
    );
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);
    if (registration.status === "reserved" || registration.status === "expired")
      // Payment is authoritative: a seat that expired while Stripe was
      // confirming is honored and flagged for staff.
      await this.recordPayment(tx, stored.entitlement_id, stored.amount_cents, {
        actor,
        action: "payment.stripe_paid",
        stripe: { sessionId: session.id, paymentIntentId },
        details: {
          checkout_session_id: session.id,
          payment_intent_id: paymentIntentId,
          ...(registration.status === "expired"
            ? { late_after_expiry: true }
            : {}),
        },
      });
    else
      await audit(
        tx,
        actor,
        "payment.stripe_unmatched",
        stored.entitlement_id,
        {
          checkout_session_id: session.id,
          registration_status: registration.status,
        },
      );
  }
  private async applyExpiredSession(tx: Tx, sessionId: string, actor: string) {
    const updated = await tx.checkout_sessions.updateMany({
      where: { id: sessionId, status: "open" },
      data: { status: "expired" },
    });
    if (!updated.count) return;
    const stored = await tx.checkout_sessions.findUnique({
      where: { id: sessionId },
    });
    await audit(
      tx,
      actor,
      "payment.checkout_expired",
      stored?.entitlement_id ?? null,
      { checkout_session_id: sessionId },
    );
    await expireDemoReservations(tx, audit);
  }
  // charge.refunded from Stripe: Finance refunded in the Stripe Dashboard.
  // Records the refunded amount and closes any open portal request. A full
  // refund ends course access (decision P5). Partial refunds are not allowed by
  // policy; one made in Stripe anyway is recorded and flagged, access unchanged.
  private async applyRefund(
    tx: Tx,
    charge: Stripe.Charge,
    refundId: string | null,
  ) {
    const paymentIntentId =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : (charge.payment_intent?.id ?? null);
    const [order] = paymentIntentId
      ? await sql<{ id: string; amount_cents: number; entitlement_id: string }>(
          tx,
          "SELECT id,amount_cents,entitlement_id FROM orders WHERE stripe_payment_intent_id=$1 FOR UPDATE",
          paymentIntentId,
        )
      : [];
    if (!order) {
      await audit(tx, "stripe-webhook", "payment.refund_unmatched", null, {
        charge_id: charge.id,
        payment_intent_id: paymentIntentId,
      });
      return;
    }
    const refunded = Math.min(charge.amount_refunded, order.amount_cents);
    await tx.orders.update({
      where: { id: order.id },
      data: { refunded_cents: refunded, refunded_at: new Date() },
    });
    const closed = await tx.refund_requests.updateMany({
      where: { order_id: order.id, status: "requested" },
      data: {
        status: "refunded",
        resolved_at: new Date(),
        resolved_by: "stripe-webhook",
        stripe_refund_id: refundId,
      },
    });
    const full = refunded >= order.amount_cents;
    await audit(
      tx,
      "stripe-webhook",
      "payment.refunded",
      order.entitlement_id,
      {
        order_id: order.id,
        refunded_cents: refunded,
        full,
        ...(closed.count ? {} : { without_portal_request: true }),
        ...(full ? {} : { partial_against_policy: true }),
      },
    );
    if (!full) return;
    // A late refund of an earlier payment must not end access bought again.
    const [latest] = await sql<{ id: string }>(
      tx,
      "SELECT id FROM orders WHERE entitlement_id=$1::uuid ORDER BY created_at DESC LIMIT 1",
      order.entitlement_id,
    );
    if (latest?.id !== order.id) return;
    const [registration] = await sql<{ status: string }>(
      tx,
      "SELECT status FROM entitlements WHERE id=$1::uuid FOR UPDATE",
      order.entitlement_id,
    );
    if (!registration || registration.status === "refunded") return;
    await tx.entitlements.update({
      where: { id: order.entitlement_id },
      data: { status: "refunded", reserved_until: null },
    });
    // An enrollment still being prepared must not complete after the refund.
    await tx.operations.updateMany({
      where: {
        entitlement_id: order.entitlement_id,
        status: { in: ["pending", "running"] },
      },
      data: { status: "failed", error: "Refunded: course access ended" },
    });
    await audit(tx, "stripe-webhook", "access.ended", order.entitlement_id, {
      reason: "full refund",
      previous_status: registration.status,
      canvas:
        "Remove the Canvas enrollment manually until Canvas is connected.",
    });
  }
  // Read-only transaction list for staff with payments:read.
  async transactions() {
    return sql<{
      id: string;
      created_at: Date;
      amount_cents: number;
      refunded_cents: number;
      refunded_at: Date | null;
      provider: string;
      stripe_payment_intent_id: string | null;
      learner_email: string | null;
      offering_title: string;
      registration_status: string;
      request_id: string | null;
      request_status: string | null;
      request_reason: string | null;
      request_created_at: Date | null;
      requested_by_email: string | null;
    }>(
      prisma,
      `SELECT o.id,o.created_at,o.amount_cents,o.refunded_cents,o.refunded_at,o.provider,o.stripe_payment_intent_id,
         l.email AS learner_email,l.display_name AS learner_name,f.title AS offering_title,e.status AS registration_status,
         r.id AS request_id,r.status AS request_status,r.reason AS request_reason,r.created_at AS request_created_at,
         s.email AS requested_by_email
       FROM orders o JOIN entitlements e ON e.id=o.entitlement_id
       JOIN learners l ON l.id=e.learner_id JOIN offerings f ON f.id=e.offering_id
       LEFT JOIN LATERAL (SELECT * FROM refund_requests q WHERE q.order_id=o.id ORDER BY q.created_at DESC LIMIT 1) r ON true
       LEFT JOIN staff_members s ON r.requested_by='staff:'||s.id::text
       ORDER BY o.created_at DESC LIMIT 500`,
    );
  }
  // A refund request: nothing is refunded here. Finance issues the refund in
  // the Stripe Dashboard, and charge.refunded marks the request refunded.
  async requestRefund(
    principal: Principal,
    key: string,
    orderId: string,
    reason: string,
  ) {
    return this.command(
      principal,
      key,
      { action: "refund.request", orderId, reason },
      async (tx) => {
        const [order] = await sql<{
          id: string;
          provider: string;
          amount_cents: number;
          refunded_cents: number;
          entitlement_id: string;
        }>(
          tx,
          "SELECT id,provider,amount_cents,refunded_cents,entitlement_id FROM orders WHERE id=$1::uuid FOR UPDATE",
          orderId,
        );
        if (!order) throw new NotFoundException("Transaction not found.");
        if (order.provider !== "stripe")
          throw new ConflictException(
            "This was a simulated payment; there is nothing to refund in Stripe.",
          );
        if (order.refunded_cents >= order.amount_cents)
          throw new ConflictException("This payment is already refunded.");
        const open = await tx.refund_requests.findFirst({
          where: { order_id: orderId, status: "requested" },
        });
        if (open)
          throw new ConflictException(
            "A refund request for this payment is already waiting for Finance.",
          );
        const request = await tx.refund_requests.create({
          data: {
            order_id: orderId,
            amount_cents: order.amount_cents - order.refunded_cents,
            reason: reason.trim(),
            requested_by: principal.actor,
          },
        });
        await audit(
          tx,
          principal.actor,
          "refund.requested",
          order.entitlement_id,
          {
            order_id: orderId,
            amount_cents: request.amount_cents,
            reason: request.reason,
          },
        );
        return request;
      },
    );
  }
  async cancelRefundRequest(
    principal: Principal,
    key: string,
    requestId: string,
    reason: string,
  ) {
    return this.command(
      principal,
      key,
      { action: "refund.cancel", requestId, reason },
      async (tx) => {
        const updated = await tx.refund_requests.updateMany({
          where: { id: requestId, status: "requested" },
          data: {
            status: "cancelled",
            resolved_at: new Date(),
            resolved_by: principal.actor,
            resolution_note: reason.trim(),
          },
        });
        if (!updated.count)
          throw new ConflictException(
            "This request is no longer waiting. Refresh and retry.",
          );
        const request = await tx.refund_requests.findUniqueOrThrow({
          where: { id: requestId },
          include: { orders: { select: { entitlement_id: true } } },
        });
        await audit(
          tx,
          principal.actor,
          "refund.request_cancelled",
          request.orders.entitlement_id,
          { order_id: request.order_id, reason: reason.trim() },
        );
        const { orders, ...rest } = request;
        return rest;
      },
    );
  }
  // Sessions past their expiry that no webhook resolved (the listener was
  // down, or a delivery was lost) are checked with Stripe directly. Paid ones
  // are recorded exactly as the webhook would; expired ones release their hold.
  async reconcileCheckouts(limit = 5) {
    if (!stripeEnabled) return { checked: 0, failed: 0 };
    const due = await prisma.checkout_sessions.findMany({
      where: {
        status: "open",
        expires_at: { lt: new Date(Date.now() - 60_000) },
      },
      orderBy: { expires_at: "asc" },
      take: limit,
      select: { id: true },
    });
    let checked = 0,
      failed = 0;
    for (const { id } of due) {
      try {
        const options = { timeout: 10_000, maxNetworkRetries: 0 };
        let session = await stripe.checkout.sessions.retrieve(id, {}, options);
        if (session.status === "open")
          session = await stripe.checkout.sessions.expire(id, {}, options);
        await transaction(async (tx) => {
          if (session.status === "complete")
            await this.applyPaidSession(tx, session, "stripe-reconciliation");
          else if (session.status === "expired")
            await this.applyExpiredSession(tx, id, "stripe-reconciliation");
          else throw new Error("Unresolved Stripe session");
        });
        checked++;
      } catch {
        // An uncertain provider response must retain its unresolved payment hold.
        failed++;
      }
    }
    return { checked, failed };
  }
  async reconcilePayments(principal: Principal, key: string) {
    // Validate the command key before making any external calls.
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        key || "",
      )
    )
      throw new BadRequestException("A UUID Idempotency-Key is required.");
    const input = { action: "payments.reconcile" };
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const previous = await prisma.commands.findUnique({
      where: { actor_key: { actor: principal.actor, key } },
    });
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new ConflictException(
          "Idempotency key was already used for a different command.",
        );
      return previous.response;
    }
    const result = await this.reconcileCheckouts();
    return this.command(
      principal,
      key,
      { action: "payments.reconcile" },
      async (tx) => {
        await audit(tx, principal.actor, "payments.reconciled", null, result);
        return result;
      },
    );
  }
  async learning(principal: Principal) {
    return sql<LearningRow>(
      prisma,
      `SELECT e.*,o.title,o.category,o.format,o.course_type,o.price_cents,o.approval_required,${scheduleText},
      ${enrollmentWindow},o.published,CASE WHEN e.status='enrolled' THEN o.canvas_course_url END AS canvas_course_url,
      p.id AS operation_id,p.stage,p.status AS operation_status,p.attempts FROM entitlements e JOIN offerings o ON o.id=e.offering_id LEFT JOIN LATERAL (SELECT * FROM operations q WHERE q.entitlement_id=e.id ORDER BY q.created_at DESC LIMIT 1) p ON true WHERE e.learner_id=$1::uuid ORDER BY e.created_at DESC`,
      principal.learnerId,
    );
  }
  async operation(id: string, principal: Principal) {
    // Learners may read only their own operations; automation reads any.
    const operation = await prisma.operations.findFirst({
      where: {
        id,
        ...(principal.learnerId
          ? { entitlements: { learner_id: principal.learnerId } }
          : {}),
      },
    });
    if (!operation) throw new NotFoundException("Operation not found.");
    return operation;
  }
  async approvals() {
    const requests = await prisma.entitlements.findMany({
      where: { status: "awaiting_approval" },
      include: {
        offerings: { select: { title: true, approval_valid_days: true } },
        learners: { select: { email: true, display_name: true } },
      },
      orderBy: { created_at: "asc" },
    });
    return requests.map(({ offerings: offering, learners, ...request }) => ({
      ...request,
      title: offering.title,
      approval_valid_days: offering.approval_valid_days,
      learner_email: learners.email,
      learner_name: learners.display_name,
    }));
  }
  async decide(
    principal: Principal,
    key: string,
    id: string,
    decision: string,
  ) {
    return this.command(
      principal,
      key,
      { action: "decision", id, decision },
      async (tx) => {
        // Approvals stay valid for the offering's staff-set number of days.
        const [row] = await sql<entitlements>(
          tx,
          `UPDATE entitlements e SET status=$2::entitlement_status,
            approval_expires_at=CASE WHEN $2::entitlement_status='approved' THEN now()+make_interval(days => o.approval_valid_days) END
          FROM offerings o WHERE e.id=$1::uuid AND e.status='awaiting_approval' AND o.id=e.offering_id RETURNING e.*`,
          id,
          decision,
        );
        if (!row)
          throw new ConflictException("Request is not awaiting approval.");
        await audit(tx, principal.actor, `approval.${decision}`, id);
        return row;
      },
    );
  }
  async create(principal: Principal, key: string, data: OfferingDto) {
    validateSchedule(data);
    validateCapacity(data);
    return this.command(
      principal,
      key,
      { action: "create", data },
      async (tx) => {
        await protectCanvasOfferingLink(tx, data.canvasCourseUrl || null);
        const offering = await tx.offerings.create({
          data: {
            title: data.title,
            category: data.category,
            summary: data.summary,
            description: data.description,
            format: data.format,
            start_date: toDate(data.startDate),
            end_date: toDate(data.endDate),
            capacity: data.unlimitedSeats ? null : data.capacity!,
            unlimited_seats: data.unlimitedSeats ?? false,
            price_cents: data.priceCents,
            approval_required: data.approvalRequired,
            course_type: data.courseType,
            approval_valid_days: data.approvalValidDays ?? 7,
            enrollment_close_days: data.enrollmentCloseDays ?? 7,
            canvas_course_url: data.canvasCourseUrl || null,
          },
        });
        await tx.offering_prices.create({
          data: {
            offering_id: offering.id,
            price_cents: data.priceCents,
            actor: principal.actor,
            reason: "Initial price",
          },
        });
        await audit(tx, principal.actor, "offering.created", offering.id);
        return offering;
      },
    );
  }
  async updateSettings(
    principal: Principal,
    key: string,
    id: string,
    data: OfferingSettingsDto,
  ) {
    return this.command(
      principal,
      key,
      { action: "settings", id, data },
      async (tx) => {
        await protectCanvasOfferingLink(tx, data.canvasCourseUrl || null, id);
        const [before] = await sql<
          Pick<
            offerings,
            | "approval_valid_days"
            | "enrollment_close_days"
            | "canvas_course_url"
          >
        >(
          tx,
          "SELECT approval_valid_days,enrollment_close_days,canvas_course_url FROM offerings WHERE id=$1::uuid AND version=$2 FOR UPDATE",
          id,
          data.version,
        );
        if (!before)
          throw new ConflictException(
            "Offering changed or does not exist. Refresh and retry.",
          );
        const after = {
          approval_valid_days: data.approvalValidDays,
          enrollment_close_days: data.enrollmentCloseDays,
          canvas_course_url: data.canvasCourseUrl || null,
        };
        const offering = await tx.offerings.update({
          where: { id },
          data: { ...after, version: { increment: 1 } },
        });
        // Changed periods apply to future approvals; existing approvals keep their expiry.
        await audit(tx, principal.actor, "offering.settings_changed", id, {
          before,
          after,
        });
        return offering;
      },
    );
  }
  async edit(
    principal: Principal,
    key: string,
    id: string,
    data: OfferingEditDto,
  ) {
    validateSchedule(data);
    validateCapacity(data);
    const { version, reason, ...fields } = data;
    return this.command(
      principal,
      key,
      { action: "edit", id, data },
      async (tx) => {
        await protectCanvasOfferingLink(tx, fields.canvasCourseUrl || null, id);
        const [before] = await sql<
          Omit<offerings, "start_date" | "end_date"> &
            ScheduleText & {
              active_registrations: number;
              seats_in_use: number;
            }
        >(
          tx,
          `SELECT ${offeringColumns("o")},${scheduleText},
            ${activeRegistrations} AS active_registrations,${seatsInUse} AS seats_in_use
          FROM offerings o WHERE o.id=$1::uuid AND o.version=$2 FOR UPDATE`,
          id,
          version,
        );
        if (!before)
          throw new ConflictException(
            "Offering changed or does not exist. Refresh and retry.",
          );
        // Offerings that are or were published change only with an audited
        // reason and protected terms, because learners may depend on them.
        const protectedTerms = before.published || before.unpublished_at;
        if (protectedTerms) {
          if (!reason || reason.trim().length < 10)
            throw new BadRequestException(
              "Give a reason of at least 10 characters to change a published offering.",
            );
          if (fields.courseType !== before.course_type)
            throw new BadRequestException(
              "Course type cannot change after publishing.",
            );
          if (fields.approvalRequired !== before.approval_required)
            throw new BadRequestException(
              "The approval requirement cannot change after publishing.",
            );
        }
        if (
          before.active_registrations > 0 &&
          ((fields.startDate ?? null) !== before.start_date ||
            (fields.endDate ?? null) !== before.end_date)
        )
          throw new ConflictException(
            "Dates cannot change while learners are registered.",
          );
        if (!fields.unlimitedSeats && fields.capacity! < before.seats_in_use)
          throw new ConflictException(
            `Capacity cannot be lower than the ${before.seats_in_use} seats in use.`,
          );
        const after = {
          title: fields.title,
          category: fields.category,
          summary: fields.summary,
          description: fields.description,
          format: fields.format,
          course_type: fields.courseType,
          start_date: fields.startDate ?? null,
          end_date: fields.endDate ?? null,
          capacity: fields.unlimitedSeats ? null : fields.capacity!,
          unlimited_seats: fields.unlimitedSeats ?? false,
          price_cents: fields.priceCents,
          approval_required: fields.approvalRequired,
          approval_valid_days:
            fields.approvalValidDays ?? before.approval_valid_days,
          enrollment_close_days:
            fields.enrollmentCloseDays ?? before.enrollment_close_days,
          canvas_course_url: fields.canvasCourseUrl || null,
        };
        const previous = before as Record<string, unknown>;
        const changes = Object.fromEntries(
          Object.entries(after)
            .filter(([field, value]) => previous[field] !== value)
            .map(([field, value]) => [
              field,
              { before: previous[field] ?? null, after: value },
            ]),
        );
        if (!Object.keys(changes).length)
          throw new BadRequestException("No changes to save.");
        const offering = await tx.offerings.update({
          where: { id },
          data: {
            ...after,
            start_date: toDate(after.start_date),
            end_date: toDate(after.end_date),
            version: { increment: 1 },
          },
        });
        if (changes.price_cents)
          await tx.offering_prices.create({
            data: {
              offering_id: id,
              price_cents: after.price_cents,
              actor: principal.actor,
              reason: reason?.trim() || null,
            },
          });
        await audit(tx, principal.actor, "offering.edited", id, {
          reason: reason?.trim() || null,
          published: before.published,
          unpublished: Boolean(before.unpublished_at),
          changes: changes as Prisma.InputJsonObject,
        });
        return offering;
      },
    );
  }
  async unpublish(
    principal: Principal,
    key: string,
    id: string,
    version: number,
    reason: string,
  ) {
    return this.command(
      principal,
      key,
      { action: "unpublish", id, version, reason },
      async (tx) => {
        const [offering] = await sql<
          offerings & { active_registrations: number }
        >(
          tx,
          `UPDATE offerings o SET published=false,unpublished_at=now(),featured_rank=NULL,version=version+1 WHERE o.id=$1::uuid AND o.version=$2 AND o.published
          RETURNING o.*,${activeRegistrations} AS active_registrations`,
          id,
          version,
        );
        if (!offering)
          throw new ConflictException(
            "Offering changed, is not published, or does not exist. Refresh and retry.",
          );
        await audit(tx, principal.actor, "offering.unpublished", id, {
          reason,
          active_registrations: offering.active_registrations,
        });
        return offering;
      },
    );
  }
  async prices(id: string) {
    return prisma.offering_prices.findMany({
      where: { offering_id: id },
      orderBy: { id: "desc" },
      select: {
        price_cents: true,
        effective_at: true,
        actor: true,
        reason: true,
      },
    });
  }
  async publish(
    principal: Principal,
    key: string,
    id: string,
    version: number,
  ) {
    return this.command(
      principal,
      key,
      { action: "publish", id, version },
      async (tx) => {
        const current = await tx.offerings.findUnique({ where: { id } });
        if (!current || current.version !== version)
          throw new ConflictException(
            "Offering changed or does not exist. Refresh and retry.",
          );
        const missing = missingOfferingInfo(current);
        if (missing.length)
          throw new BadRequestException(
            `Complete required offering information before publishing: ${missing.join(", ")}.`,
          );
        // Version check guards against publishing a stale draft.
        const updated = await tx.offerings.updateMany({
          where: { id, version },
          data: {
            published: true,
            unpublished_at: null,
            version: { increment: 1 },
          },
        });
        if (!updated.count)
          throw new ConflictException(
            "Offering changed or does not exist. Refresh and retry.",
          );
        await audit(tx, principal.actor, "prototype.offering_published", id);
        return tx.offerings.findUniqueOrThrow({ where: { id } });
      },
    );
  }
  async simulation() {
    const setting = await prisma.prototype_settings.findUnique({
      where: { key: "provisioning_outcome" },
    });
    return {
      // operations_simulated_outcome_check limits stored values to these outcomes.
      provisioningOutcome: (setting?.value ?? "normal") as ProvisioningOutcome,
      updatedAt: setting?.updated_at ?? null,
    };
  }
  async setSimulation(
    principal: Principal,
    key: string,
    outcome: ProvisioningOutcome,
  ) {
    return this.command(
      principal,
      key,
      { action: "simulation", outcome },
      async (tx) => {
        await tx.prototype_settings.upsert({
          where: { key: "provisioning_outcome" },
          create: { key: "provisioning_outcome", value: outcome },
          update: { value: outcome, updated_at: new Date() },
        });
        await audit(tx, principal.actor, "prototype.simulation_changed", null, {
          provisioningOutcome: outcome,
        });
        return { provisioningOutcome: outcome };
      },
    );
  }
  async exceptions() {
    const rows = await prisma.entitlements.findMany({
      where: { status: "exception" },
      include: {
        offerings: { select: { title: true } },
        learners: { select: { email: true, display_name: true } },
        // The current enrollment job is the latest one.
        operations: { orderBy: { created_at: "desc" }, take: 1 },
      },
    });
    rows.sort(
      (a, b) =>
        (a.operations[0]?.failed_at?.getTime() ?? 0) -
        (b.operations[0]?.failed_at?.getTime() ?? 0),
    );
    const history = rows.length
      ? await prisma.audit_events.findMany({
          where: { object_id: { in: rows.map((row) => row.id) } },
          orderBy: { id: "asc" },
          select: {
            object_id: true,
            actor: true,
            action: true,
            details: true,
            created_at: true,
          },
        })
      : [];
    const staffIds = [
      ...new Set(
        history
          .filter((event) => event.actor.startsWith("staff:"))
          .map((event) => event.actor.slice("staff:".length)),
      ),
    ];
    const staffEmails = new Map(
      (
        await prisma.staff_members.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, email: true },
        })
      ).map((member) => [`staff:${member.id}`, member.email]),
    );
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      offering_id: row.offering_id,
      title: row.offerings.title,
      learner_email: row.learners.email,
      learner_name: row.learners.display_name,
      operation_id: row.operations[0]?.id ?? null,
      stage: row.operations[0]?.stage ?? null,
      error: row.operations[0]?.error ?? null,
      attempts: row.operations[0]?.attempts ?? 0,
      failed_at: row.operations[0]?.failed_at ?? null,
      simulated_outcome: row.operations[0]?.simulated_outcome ?? null,
      history: history
        .filter((event) => event.object_id === row.id)
        .map(({ object_id, ...event }) => ({
          ...event,
          actor_email: staffEmails.get(event.actor) ?? null,
        })),
    }));
  }
  // Staff recovery for registrations whose simulated provisioning exhausted its retries.
  async recover(
    principal: Principal,
    key: string,
    id: string,
    action: "retry" | "resolve",
    reason: string,
  ) {
    return this.command(
      principal,
      key,
      { action: `exception.${action}`, id, reason },
      async (tx) => {
        const [found] = await sql<{
          id: string;
          operation_id: string;
          stage: string;
        }>(
          tx,
          `SELECT e.id,p.id AS operation_id,p.stage FROM entitlements e
           JOIN operations p ON p.id=(SELECT q.id FROM operations q WHERE q.entitlement_id=e.id ORDER BY q.created_at DESC LIMIT 1)
           WHERE e.id=$1::uuid AND e.status='exception' FOR UPDATE OF e,p`,
          id,
        );
        if (!found)
          throw new ConflictException("Registration is not awaiting recovery.");
        if (action === "retry") {
          // Retrying assumes the cause was fixed, so the simulation resumes normally.
          await tx.entitlements.update({
            where: { id },
            data: { status: "provisioning" },
          });
          await tx.operations.update({
            where: { id: found.operation_id },
            data: {
              status: "pending",
              attempts: 0,
              error: null,
              failed_at: null,
              simulated_outcome: "normal",
              next_run: new Date(0),
            },
          });
        } else {
          await tx.entitlements.update({
            where: { id },
            data: { status: "enrolled" },
          });
          await tx.operations.update({
            where: { id: found.operation_id },
            data: { status: "succeeded", stage: "manual", next_run: null },
          });
        }
        await audit(
          tx,
          principal.actor,
          action === "retry"
            ? "exception.retry_requested"
            : "exception.resolved_manually",
          id,
          { reason, stage: found.stage },
        );
        if (action === "retry")
          for (let i = 0; i < 2; i++)
            if (!(await processDemoOperation(tx, audit, id))) break;
        return tx.entitlements.findUniqueOrThrow({ where: { id } });
      },
    );
  }
  // Mock staff sign-in (ADR 0004): any active member may be selected without a password.
  // Canvas mode uses its separate verified identity flow and refuses this lookup.
  async staffSession(email: string) {
    if (staffAuthMode() !== "mock")
      throw new ForbiddenException("Mock staff sign-in is disabled.");
    const member = await prisma.staff_members.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: staffSelect,
    });
    if (!member?.active)
      throw new NotFoundException("No active staff member with that email.");
    return member;
  }
  async staffDirectory() {
    if (staffAuthMode() !== "mock")
      throw new ForbiddenException("Mock staff sign-in is disabled.");
    return prisma.staff_members.findMany({
      where: { active: true },
      select: { id: true, email: true, display_name: true, roles: true },
      orderBy: { display_name: "asc" },
    });
  }
  async staffMe(principal: Principal) {
    const member = await prisma.staff_members.findUniqueOrThrow({
      where: { id: principal.staffId },
      select: staffSelect,
    });
    return { ...member, scopes: scopesFor(member.roles) };
  }
  async roleCatalog() {
    const members = await prisma.staff_members.findMany({
      select: {
        id: true,
        display_name: true,
        email: true,
        roles: true,
        active: true,
      },
    });
    return staffRoles.map((role) => ({
      role,
      label: roleLabels[role],
      description: roleDescriptions[role],
      scopes: scopesFor([role]).map((scope) => ({
        scope,
        description: scopeDescriptions[scope] ?? scope,
      })),
      members: members
        .filter((member) => member.roles.includes(role))
        .map(({ roles, ...member }) => member),
    }));
  }
  async staffMembers() {
    return prisma.staff_members.findMany({
      select: { ...staffSelect, auth_provider: true, created_at: true },
      orderBy: [{ active: "desc" }, { display_name: "asc" }],
    });
  }
  async createStaff(principal: Principal, key: string, data: StaffMemberDto) {
    return this.command(
      principal,
      key,
      { action: "staff.create", data },
      async (tx) => {
        const email = data.email.trim().toLowerCase();
        if (await tx.staff_members.findUnique({ where: { email } }))
          throw new ConflictException("A staff member with that email exists.");
        const member = await tx.staff_members.create({
          data: {
            email,
            display_name: data.displayName.trim(),
            roles: data.roles,
          },
          select: staffSelect,
        });
        await audit(tx, principal.actor, "staff.created", member.id, {
          roles: member.roles,
        });
        return member;
      },
    );
  }
  async updateStaff(
    principal: Principal,
    key: string,
    id: string,
    data: StaffUpdateDto,
  ) {
    return this.command(
      principal,
      key,
      { action: "staff.update", id, data },
      async (tx) => {
        // Serialize role changes so two admins cannot remove each other concurrently.
        await sql(
          tx,
          "SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended('staff-admins',0))) l",
        );
        const before = await tx.staff_members.findFirst({
          where: { id, version: data.version },
          select: staffSelect,
        });
        if (!before)
          throw new ConflictException(
            "Staff member changed or does not exist. Refresh and retry.",
          );
        const roles = data.roles as StaffRole[];
        const remainsAdmin = data.active && roles.includes("staff_admin");
        if (before.roles.includes("staff_admin") && !remainsAdmin) {
          const otherAdmins = await tx.staff_members.count({
            where: {
              id: { not: id },
              active: true,
              roles: { has: "staff_admin" },
            },
          });
          if (!otherAdmins)
            throw new ConflictException(
              "At least one active staff administrator is required.",
            );
        }
        const member = await tx.staff_members.update({
          where: { id },
          data: {
            display_name: data.displayName.trim(),
            roles,
            active: data.active,
            version: { increment: 1 },
          },
          select: staffSelect,
        });
        await audit(tx, principal.actor, "staff.updated", id, {
          before: {
            display_name: before.display_name,
            roles: before.roles,
            active: before.active,
          },
          after: {
            display_name: member.display_name,
            roles: member.roles,
            active: member.active,
          },
        });
        if (!member.active)
          await tx.staff_sessions.deleteMany({
            where: { staff_id: member.id },
          });
        return member;
      },
    );
  }
  // Staff learner management: list, details and account access (support role).
  async staffLearners(search?: string) {
    const term = search?.trim() ? `%${search.trim()}%` : "";
    return sql<{
      id: string;
      email: string | null;
      created_at: Date;
      active: boolean;
      deactivated_at: Date | null;
      version: number;
      registrations: number;
      enrolled: number;
      in_progress: number;
      last_activity: Date | null;
    }>(
      prisma,
      `SELECT l.id,l.email,l.display_name,l.created_at,l.active,l.deactivated_at,l.version,
        count(e.id)::integer AS registrations,
        count(e.id) FILTER (WHERE e.status='enrolled')::integer AS enrolled,
        count(e.id) FILTER (WHERE e.status IN ('awaiting_approval','approved','reserved','provisioning','exception'))::integer AS in_progress,
        (SELECT max(a.created_at) FROM audit_events a WHERE a.actor='demo-learner:'||l.id::text OR a.actor='learner:'||l.id::text
          OR a.object_id IN (SELECT x.id FROM entitlements x WHERE x.learner_id=l.id)) AS last_activity
      FROM learners l LEFT JOIN entitlements e ON e.learner_id=l.id
      WHERE ($1='' OR l.email ILIKE $1 OR l.display_name ILIKE $1)
      GROUP BY l.id ORDER BY l.created_at DESC LIMIT 500`,
      term,
    );
  }
  async staffLearner(id: string) {
    const learner = await prisma.learners.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        display_name: true,
        created_at: true,
        active: true,
        deactivated_at: true,
        version: true,
        entitlements: {
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            status: true,
            created_at: true,
            quoted_price_cents: true,
            reserved_until: true,
            approval_expires_at: true,
            offerings: { select: { id: true, title: true, price_cents: true } },
            // Latest payment and job; earlier ones remain as history.
            orders: {
              select: { amount_cents: true, created_at: true },
              orderBy: { created_at: "desc" },
              take: 1,
            },
            operations: {
              select: { status: true, stage: true, attempts: true },
              orderBy: { created_at: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    if (!learner) throw new NotFoundException("Learner not found.");
    const registrationIds = learner.entitlements.map((e) => e.id);
    const activity = await prisma.audit_events.findMany({
      where: {
        OR: [
          { actor: `demo-learner:${id}` },
          { actor: `learner:${id}` },
          { object_id: { in: [id, ...registrationIds] } },
        ],
      },
      orderBy: { id: "desc" },
      take: 50,
      select: {
        actor: true,
        action: true,
        object_id: true,
        details: true,
        created_at: true,
      },
    });
    const titles = new Map(
      learner.entitlements.map((e) => [e.id, e.offerings.title]),
    );
    const { entitlements, ...profile } = learner;
    return {
      ...profile,
      legacy: id === DEMO_LEARNER,
      registrations: entitlements.map(
        ({ offerings: offering, orders, operations, ...e }) => ({
          ...e,
          offering_id: offering.id,
          title: offering.title,
          price_cents: offering.price_cents,
          paid_cents: orders[0]?.amount_cents ?? null,
          paid_at: orders[0]?.created_at ?? null,
          operation_status: operations[0]?.status ?? null,
          operation_stage: operations[0]?.stage ?? null,
        }),
      ),
      activity: activity.map((event) => ({
        ...event,
        offering_title: event.object_id
          ? (titles.get(event.object_id) ?? null)
          : null,
      })),
    };
  }
  async setLearnerAccess(
    principal: Principal,
    key: string,
    id: string,
    data: LearnerAccessDto,
  ) {
    return this.command(
      principal,
      key,
      { action: "learner.access", id, data },
      async (tx) => {
        if (id === DEMO_LEARNER)
          throw new ConflictException(
            "The legacy sample learner cannot be deactivated; direct API demos rely on it.",
          );
        const updated = await tx.learners.updateMany({
          where: { id, version: data.version, active: !data.active },
          data: {
            active: data.active,
            deactivated_at: data.active ? null : new Date(),
            version: { increment: 1 },
          },
        });
        if (!updated.count)
          throw new ConflictException(
            "Learner changed or is already in that state. Refresh and retry.",
          );
        await audit(
          tx,
          principal.actor,
          data.active ? "learner.reactivated" : "learner.deactivated",
          id,
          { reason: data.reason.trim() },
        );
        return tx.learners.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            email: true,
            active: true,
            deactivated_at: true,
            version: true,
          },
        });
      },
    );
  }
  // Sample staff dashboard (plan: enrollment, sales and completion dashboards).
  // Enrollment for all staff; sales only with reports:sales; completion waits for Canvas.
  async dashboard(principal: Principal, days = 30, offeringId?: string) {
    const offering = offeringId ?? null;
    const [range] = await sql<{ from: string; to: string; bucket: string }>(
      prisma,
      `SELECT to_char(f,'YYYY-MM-DD') AS from, to_char(current_date,'YYYY-MM-DD') AS to,
        CASE WHEN current_date-f<=31 THEN 'day' WHEN current_date-f<=180 THEN 'week' ELSE 'month' END AS bucket
      FROM (SELECT CASE WHEN $1::int>0 THEN current_date-($1::int-1)
        ELSE coalesce((SELECT min(created_at)::date FROM entitlements),current_date) END AS f) r`,
      days,
    );
    const inRange = `e.created_at::date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR e.offering_id=$3::uuid)`;
    const args = [range.from, range.to, offering];
    const [totals] = await sql<{
      registrations: number;
      enrolled: number;
      in_progress: number;
      awaiting_approval: number;
      exceptions: number;
      not_continuing: number;
    }>(
      prisma,
      `SELECT count(*)::int AS registrations,
        count(*) FILTER (WHERE e.status='enrolled')::int AS enrolled,
        count(*) FILTER (WHERE e.status IN ('approved','reserved','provisioning'))::int AS in_progress,
        count(*) FILTER (WHERE e.status='awaiting_approval')::int AS awaiting_approval,
        count(*) FILTER (WHERE e.status='exception')::int AS exceptions,
        count(*) FILTER (WHERE e.status IN ('declined','expired','approval_expired','refunded'))::int AS not_continuing
      FROM entitlements e WHERE ${inRange}`,
      ...args,
    );
    const [seats] = await sql<{
      capacity: number;
      in_use: number;
      limited_in_use: number;
      unlimited_count: number;
      unlimited_in_use: number;
    }>(
      prisma,
      `SELECT coalesce(sum(o.capacity),0)::int AS capacity, coalesce(sum(${seatsInUse}),0)::int AS in_use,
        coalesce(sum(${seatsInUse}) FILTER (WHERE NOT o.unlimited_seats),0)::int AS limited_in_use,
        count(*) FILTER (WHERE o.unlimited_seats)::int AS unlimited_count,
        coalesce(sum(${seatsInUse}) FILTER (WHERE o.unlimited_seats),0)::int AS unlimited_in_use
      FROM offerings o WHERE o.published AND ($1::uuid IS NULL OR o.id=$1::uuid)`,
      offering,
    );
    const series = (value: string, from: string) => `
      WITH buckets AS (
        SELECT generate_series(date_trunc($4,$1::date), date_trunc($4,$2::date), ('1 '||$4)::interval)::date AS bucket)
      SELECT to_char(b.bucket,'YYYY-MM-DD') AS bucket, coalesce(${value},0)::int AS value
      FROM buckets b LEFT JOIN (${from}) x ON x.bucket=b.bucket
      GROUP BY b.bucket ORDER BY b.bucket`;
    const registrationsTrend = await sql<{ bucket: string; value: number }>(
      prisma,
      series(
        "sum(x.n)",
        `SELECT date_trunc($4,e.created_at)::date AS bucket, count(*) AS n FROM entitlements e WHERE ${inRange} GROUP BY 1`,
      ),
      ...args,
      range.bucket,
    );
    const byOffering = await sql<{
      id: string;
      title: string;
      published: boolean;
      capacity: number | null;
      unlimited_seats: boolean;
      seats_in_use: number;
      registrations: number;
      enrolled: number;
      in_progress: number;
      awaiting_approval: number;
    }>(
      prisma,
      `SELECT o.id,o.title,o.published,o.capacity,o.unlimited_seats,${seatsInUse} AS seats_in_use,
        count(e.id)::int AS registrations,
        count(e.id) FILTER (WHERE e.status='enrolled')::int AS enrolled,
        count(e.id) FILTER (WHERE e.status IN ('approved','reserved','provisioning'))::int AS in_progress,
        count(e.id) FILTER (WHERE e.status='awaiting_approval')::int AS awaiting_approval
      FROM offerings o LEFT JOIN entitlements e ON e.offering_id=o.id AND e.created_at::date BETWEEN $1::date AND $2::date
      WHERE ($3::uuid IS NULL OR o.id=$3::uuid) AND (o.published OR o.unpublished_at IS NOT NULL)
      GROUP BY o.id ORDER BY count(e.id) DESC, o.title`,
      ...args,
    );
    let sales = null;
    if (principal.scopes.includes("reports:sales")) {
      const paidInRange = `r.created_at::date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR e.offering_id=$3::uuid)`;
      const [money] = await sql<{
        orders: number;
        gross_cents: number;
        first_time_buyers: number;
        returning_buyers: number;
      }>(
        prisma,
        `WITH paid AS (
          SELECT r.id,r.amount_cents,e.learner_id,
            r.created_at=(SELECT min(r2.created_at) FROM orders r2 JOIN entitlements e2 ON e2.id=r2.entitlement_id WHERE e2.learner_id=e.learner_id) AS first_order
          FROM orders r JOIN entitlements e ON e.id=r.entitlement_id WHERE ${paidInRange})
        SELECT count(*)::int AS orders, coalesce(sum(amount_cents),0)::int AS gross_cents,
          count(DISTINCT learner_id) FILTER (WHERE first_order)::int AS first_time_buyers,
          count(DISTINCT learner_id) FILTER (WHERE NOT first_order)::int AS returning_buyers
        FROM paid`,
        ...args,
      );
      const salesTrend = await sql<{ bucket: string; value: number }>(
        prisma,
        series(
          "sum(x.cents)",
          `SELECT date_trunc($4,r.created_at)::date AS bucket, sum(r.amount_cents) AS cents
          FROM orders r JOIN entitlements e ON e.id=r.entitlement_id WHERE ${paidInRange} GROUP BY 1`,
        ),
        ...args,
        range.bucket,
      );
      const salesByOffering = await sql<{
        id: string;
        title: string;
        orders: number;
        gross_cents: number;
      }>(
        prisma,
        `SELECT o.id,o.title,count(r.id)::int AS orders,coalesce(sum(r.amount_cents),0)::int AS gross_cents
        FROM orders r JOIN entitlements e ON e.id=r.entitlement_id JOIN offerings o ON o.id=e.offering_id
        WHERE ${paidInRange} GROUP BY o.id ORDER BY 4 DESC, o.title`,
        ...args,
      );
      sales = {
        ...money,
        // Refunds and failed payments arrive with Stripe (M3) and refunds (M5).
        refunds_cents: null,
        failed_payments: null,
        net_cents: money.gross_cents,
        trend: salesTrend,
        by_offering: salesByOffering,
      };
    }
    return {
      range: { days, ...range },
      offering_id: offering,
      simulated: true,
      enrollment: {
        ...totals,
        seats_capacity: seats.capacity,
        seats_in_use: seats.in_use,
        limited_seats_in_use: seats.limited_in_use,
        unlimited_offerings: seats.unlimited_count,
        unlimited_seats_in_use: seats.unlimited_in_use,
        trend: registrationsTrend,
        by_offering: byOffering,
      },
      sales,
      completion: {
        available: false,
        reason:
          "Completion data comes from Canvas and is planned after the Canvas connection (decisions R2 and F11).",
      },
    };
  }
  // Collections and pathways (decisions F3 and F4). Learners see only published
  // collections and their published courses; pathway steps are numbered in that order.
  async publicCollections() {
    return sql<CollectionSummary>(
      prisma,
      `SELECT c.id,c.kind,c.slug,c.title,c.summary,c.featured_rank,c.created_at,count(o.id)::integer AS course_count,
         array_agg(DISTINCT o.category ORDER BY o.category) AS topics,
         min(o.price_cents)::integer AS min_price_cents,max(o.price_cents)::integer AS max_price_cents
       FROM collections c JOIN collection_items i ON i.collection_id=c.id
       JOIN offerings o ON o.id=i.offering_id AND o.published
       WHERE c.published GROUP BY c.id ORDER BY c.kind,c.title`,
    );
  }
  async publicCollection(slug: string) {
    const collection = await prisma.collections.findFirst({
      where: { slug, published: true },
      select: { id: true, kind: true, slug: true, title: true, summary: true },
    });
    if (!collection) throw new NotFoundException("Collection not found.");
    return {
      ...collection,
      offerings: await this.collectionOfferings(collection.id),
    };
  }
  private collectionOfferings(collectionId: string) {
    return sql<OfferingListing & { position: number }>(
      prisma,
      `${listing.replace("FROM offerings o", ",i.position FROM offerings o JOIN collection_items i ON i.offering_id=o.id")}
       WHERE i.collection_id=$1::uuid AND o.published ORDER BY i.position`,
      collectionId,
    );
  }
  async staffCollections() {
    const rows = await prisma.collections.findMany({
      orderBy: [{ kind: "asc" }, { title: "asc" }],
      include: {
        collection_items: {
          orderBy: { position: "asc" },
          select: {
            offering_id: true,
            offerings: { select: { title: true, published: true } },
          },
        },
        _count: { select: { pathway_follows: true } },
      },
    });
    return rows.map(({ collection_items, _count, ...c }) => ({
      ...c,
      followers: _count.pathway_follows,
      courses: collection_items.map((item) => ({
        id: item.offering_id,
        title: item.offerings.title,
        published: item.offerings.published,
      })),
    }));
  }
  private async staffCollection(tx: Tx, id: string) {
    return (await this.staffCollectionsIn(tx)).find((c) => c.id === id);
  }
  private async staffCollectionsIn(tx: Tx) {
    const rows = await tx.collections.findMany({
      include: {
        collection_items: {
          orderBy: { position: "asc" },
          select: { offering_id: true },
        },
      },
    });
    return rows.map(({ collection_items, ...c }) => ({
      ...c,
      offeringIds: collection_items.map((item) => item.offering_id),
    }));
  }
  private async setCollectionItems(tx: Tx, id: string, offeringIds: string[]) {
    const found = await tx.offerings.count({
      where: { id: { in: offeringIds } },
    });
    if (found !== offeringIds.length)
      throw new BadRequestException("One or more courses do not exist.");
    await tx.collection_items.deleteMany({ where: { collection_id: id } });
    await tx.collection_items.createMany({
      data: offeringIds.map((offering_id, index) => ({
        collection_id: id,
        offering_id,
        position: index + 1,
      })),
    });
  }
  // A published collection needs a course learners can see; a pathway needs two.
  private async requirePublishable(
    tx: Tx,
    kind: CollectionKind,
    offeringIds: string[],
  ) {
    const minimum = kind === "pathway" ? 2 : 1;
    const visible = await tx.offerings.count({
      where: { id: { in: offeringIds }, published: true },
    });
    if (visible < minimum)
      throw new BadRequestException(
        kind === "pathway"
          ? "A published pathway needs at least two published courses."
          : "A published collection needs at least one published course.",
      );
  }
  async createCollection(
    principal: Principal,
    key: string,
    data: CollectionDto,
  ) {
    return this.command(
      principal,
      key,
      { action: "collection.create", data },
      async (tx) => {
        const slug = data.slug || slugify(data.title);
        if (!slug)
          throw new BadRequestException(
            "Add letters or numbers to the title, or set a slug.",
          );
        if (await tx.collections.findUnique({ where: { slug } }))
          throw new ConflictException(
            `The address "${slug}" is already used. Choose another slug.`,
          );
        const created = await tx.collections.create({
          data: {
            kind: data.kind,
            slug,
            title: data.title.trim(),
            summary: data.summary.trim(),
          },
        });
        await this.setCollectionItems(tx, created.id, data.offeringIds);
        await audit(tx, principal.actor, "collection.created", created.id, {
          kind: data.kind,
          title: created.title,
          offering_ids: data.offeringIds,
        });
        return this.staffCollection(tx, created.id);
      },
    );
  }
  async editCollection(
    principal: Principal,
    key: string,
    id: string,
    data: CollectionEditDto,
  ) {
    return this.command(
      principal,
      key,
      { action: "collection.edit", id, data },
      async (tx) => {
        const before = await this.staffCollection(tx, id);
        if (!before || before.version !== data.version)
          throw new ConflictException(
            "Collection changed or does not exist. Refresh and retry.",
          );
        if (before.published)
          await this.requirePublishable(tx, before.kind, data.offeringIds);
        await tx.collections.update({
          where: { id },
          data: {
            title: data.title.trim(),
            summary: data.summary.trim(),
            version: { increment: 1 },
            updated_at: new Date(),
          },
        });
        await this.setCollectionItems(tx, id, data.offeringIds);
        await audit(tx, principal.actor, "collection.edited", id, {
          title: data.title.trim(),
          before: {
            title: before.title,
            summary: before.summary,
            offering_ids: before.offeringIds,
          },
          after: {
            title: data.title.trim(),
            summary: data.summary.trim(),
            offering_ids: data.offeringIds,
          },
        });
        return this.staffCollection(tx, id);
      },
    );
  }
  async setCollectionPublished(
    principal: Principal,
    key: string,
    id: string,
    version: number,
    published: boolean,
  ) {
    return this.command(
      principal,
      key,
      {
        action: published ? "collection.publish" : "collection.unpublish",
        id,
        version,
      },
      async (tx) => {
        const current = await this.staffCollection(tx, id);
        if (
          !current ||
          current.version !== version ||
          current.published === published
        )
          throw new ConflictException(
            `Collection changed, is already ${published ? "published" : "unpublished"}, or does not exist. Refresh and retry.`,
          );
        if (published)
          await this.requirePublishable(tx, current.kind, current.offeringIds);
        await tx.collections.update({
          where: { id },
          data: {
            published,
            version: { increment: 1 },
            updated_at: new Date(),
            // Unpublished items leave the Explore tab.
            ...(published ? {} : { featured_rank: null }),
          },
        });
        await audit(
          tx,
          principal.actor,
          published ? "collection.published" : "collection.unpublished",
          id,
          { title: current.title, kind: current.kind },
        );
        return this.staffCollection(tx, id);
      },
    );
  }
  // Learner lists are private: only the selected learner can read or change them.
  async savedCourses(principal: Principal) {
    return sql<OfferingListing & { saved_at: Date }>(
      prisma,
      `${listing.replace("FROM offerings o", ",s.created_at AS saved_at FROM offerings o JOIN saved_courses s ON s.offering_id=o.id")}
       WHERE s.learner_id=$1::uuid AND o.published ORDER BY s.created_at DESC`,
      principal.learnerId,
    );
  }
  async setSaved(
    principal: Principal,
    key: string,
    offeringId: string,
    saved: boolean,
  ) {
    const learnerId = principal.learnerId as string;
    return this.command(
      principal,
      key,
      { action: "saved", offeringId, saved },
      async (tx) => {
        if (saved) {
          const offering = await tx.offerings.findFirst({
            where: { id: offeringId, published: true },
            select: { id: true },
          });
          if (!offering) throw new NotFoundException("Offering not found.");
          await tx.saved_courses.upsert({
            where: {
              learner_id_offering_id: {
                learner_id: learnerId,
                offering_id: offeringId,
              },
            },
            create: { learner_id: learnerId, offering_id: offeringId },
            update: {},
          });
        } else
          await tx.saved_courses.deleteMany({
            where: { learner_id: learnerId, offering_id: offeringId },
          });
        return { offering_id: offeringId, saved };
      },
    );
  }
  async followedPathways(principal: Principal) {
    const pathways = await prisma.collections.findMany({
      where: {
        kind: "pathway",
        published: true,
        pathway_follows: { some: { learner_id: principal.learnerId } },
      },
      select: { id: true, slug: true, title: true, summary: true },
      orderBy: { title: "asc" },
    });
    const registrations = await prisma.entitlements.findMany({
      where: { learner_id: principal.learnerId },
      select: { offering_id: true, status: true },
    });
    const status = new Map(registrations.map((r) => [r.offering_id, r.status]));
    return Promise.all(
      pathways.map(async (pathway) => ({
        ...pathway,
        // Registration status only; completion needs Canvas (decision F11).
        steps: (await this.collectionOfferings(pathway.id)).map((o) => ({
          id: o.id,
          title: o.title,
          course_type: o.course_type,
          start_date: o.start_date,
          registration_status: status.get(o.id) ?? null,
        })),
      })),
    );
  }
  async setFollowing(
    principal: Principal,
    key: string,
    collectionId: string,
    following: boolean,
  ) {
    const learnerId = principal.learnerId as string;
    return this.command(
      principal,
      key,
      { action: "follow", collectionId, following },
      async (tx) => {
        if (following) {
          const pathway = await tx.collections.findFirst({
            where: { id: collectionId, kind: "pathway", published: true },
            select: { id: true },
          });
          if (!pathway) throw new NotFoundException("Pathway not found.");
          await tx.pathway_follows.upsert({
            where: {
              learner_id_collection_id: {
                learner_id: learnerId,
                collection_id: collectionId,
              },
            },
            create: { learner_id: learnerId, collection_id: collectionId },
            update: {},
          });
        } else
          await tx.pathway_follows.deleteMany({
            where: { learner_id: learnerId, collection_id: collectionId },
          });
        return { collection_id: collectionId, following };
      },
    );
  }
  // Learner Explore tab: staff picks first, then automatic fill so no section is
  // short. Courses: open scheduled courses by soonest start, then the newest
  // self-paced. Collections and pathways: newest first.
  async explore() {
    const [courses, collections] = await Promise.all([
      this.list({}),
      this.publicCollections(),
    ]);
    const byRank = <T extends { featured_rank: number | null }>(a: T, b: T) =>
      (a.featured_rank as number) - (b.featured_rank as number);
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = (o: OfferingListing) =>
      o.start_date !== null && o.start_date >= today;
    const fillCourses = courses
      .filter((o) => o.featured_rank === null && o.enrollment_open)
      .sort(
        (a, b) =>
          Number(upcoming(b)) - Number(upcoming(a)) ||
          (a.start_date ?? "").localeCompare(b.start_date ?? "") ||
          b.created_at.getTime() - a.created_at.getTime(),
      );
    const pick = <T extends { featured_rank: number | null }>(
      items: T[],
      fill: T[],
      size: number,
    ) =>
      [...items.filter((i) => i.featured_rank !== null).sort(byRank), ...fill]
        .slice(0, size)
        .map((item) => ({ ...item, featured: item.featured_rank !== null }));
    const ofKind = (kind: CollectionKind) => {
      const all = collections.filter((c) => c.kind === kind);
      const fill = all
        .filter((c) => c.featured_rank === null)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      return pick(all, fill, 3);
    };
    return {
      courses: pick(courses, fillCourses, 5),
      collections: ofKind("collection"),
      pathways: ofKind("pathway"),
    };
  }
  async staffExplore() {
    const [courses, collections] = await Promise.all([
      prisma.offerings.findMany({
        where: { featured_rank: { not: null } },
        orderBy: { featured_rank: "asc" },
        select: { id: true, title: true, published: true },
      }),
      prisma.collections.findMany({
        where: { featured_rank: { not: null } },
        orderBy: { featured_rank: "asc" },
        select: { id: true, title: true, kind: true, published: true },
      }),
    ]);
    return {
      courses,
      collections: collections.filter((c) => c.kind === "collection"),
      pathways: collections.filter((c) => c.kind === "pathway"),
    };
  }
  async setExplore(principal: Principal, key: string, data: ExploreDto) {
    return this.command(
      principal,
      key,
      { action: "explore.update", data },
      async (tx) => {
        const courses = await tx.offerings.count({
          where: { id: { in: data.courses }, published: true },
        });
        if (courses !== data.courses.length)
          throw new BadRequestException(
            "Featured courses must exist and be published.",
          );
        for (const kind of ["collection", "pathway"] as const) {
          const ids = kind === "pathway" ? data.pathways : data.collections;
          const found = await tx.collections.count({
            where: { id: { in: ids }, kind, published: true },
          });
          if (found !== ids.length)
            throw new BadRequestException(
              `Featured ${kind === "pathway" ? "pathways" : "collections"} must exist, be published and be ${kind === "pathway" ? "pathways" : "collections"}.`,
            );
        }
        const before = await this.staffExploreIn(tx);
        // Replace every position in one transaction, so ranks never collide.
        await tx.offerings.updateMany({
          where: { featured_rank: { not: null } },
          data: { featured_rank: null },
        });
        await tx.collections.updateMany({
          where: { featured_rank: { not: null } },
          data: { featured_rank: null },
        });
        for (const [index, id] of data.courses.entries())
          await tx.offerings.update({
            where: { id },
            data: { featured_rank: index + 1 },
          });
        for (const [index, id] of [
          ...data.collections.entries(),
          ...data.pathways.entries(),
        ])
          await tx.collections.update({
            where: { id },
            data: { featured_rank: index + 1 },
          });
        await audit(tx, principal.actor, "explore.updated", null, {
          before,
          after: {
            courses: data.courses,
            collections: data.collections,
            pathways: data.pathways,
          },
        });
        return this.staffExploreIn(tx);
      },
    );
  }
  private async staffExploreIn(tx: Tx) {
    const [courses, collections] = await Promise.all([
      tx.offerings.findMany({
        where: { featured_rank: { not: null } },
        orderBy: { featured_rank: "asc" },
        select: { id: true },
      }),
      tx.collections.findMany({
        where: { featured_rank: { not: null } },
        orderBy: { featured_rank: "asc" },
        select: { id: true, kind: true },
      }),
    ]);
    return {
      courses: courses.map((c) => c.id),
      collections: collections
        .filter((c) => c.kind === "collection")
        .map((c) => c.id),
      pathways: collections
        .filter((c) => c.kind === "pathway")
        .map((c) => c.id),
    };
  }
  async report() {
    const [
      simulated_orders,
      simulated_enrollments,
      pending_operations,
      open_exceptions,
    ] = await Promise.all([
      prisma.orders.count(),
      prisma.entitlements.count({ where: { status: "enrolled" } }),
      prisma.operations.count({
        where: { status: { in: ["pending", "running"] } },
      }),
      prisma.entitlements.count({ where: { status: "exception" } }),
    ]);
    // Resolve learner actors and affected records to readable labels for the staff log.
    const audit = await sql<{
      actor: string;
      action: string;
      object_id: string | null;
      created_at: Date;
      actor_email: string | null;
      offering_title: string | null;
      subject_email: string | null;
    }>(
      prisma,
      `SELECT a.actor,a.action,a.object_id,a.created_at,
        CASE WHEN a.actor LIKE 'demo-learner:%' OR a.actor LIKE 'learner:%' THEN coalesce(actor_learner.email,actor_learner.display_name,'Legacy demo learner')
          WHEN a.actor LIKE 'staff:%' THEN actor_staff.email END AS actor_email,
        coalesce(o.title,eo.title,col.title) AS offering_title,
        coalesce(subject_learner.email,subject_learner.display_name,subject_staff.email) AS subject_email
      FROM audit_events a
      LEFT JOIN learners actor_learner ON a.actor='demo-learner:'||actor_learner.id::text OR a.actor='learner:'||actor_learner.id::text
      LEFT JOIN staff_members actor_staff ON a.actor='staff:'||actor_staff.id::text
      LEFT JOIN staff_members subject_staff ON subject_staff.id=a.object_id
      LEFT JOIN offerings o ON o.id=a.object_id
      LEFT JOIN entitlements e ON e.id=a.object_id
      LEFT JOIN offerings eo ON eo.id=e.offering_id
      LEFT JOIN learners subject_learner ON subject_learner.id=e.learner_id
      LEFT JOIN collections col ON col.id=a.object_id
      ORDER BY a.id DESC LIMIT 200`,
    );
    return {
      simulated_orders,
      simulated_enrollments,
      pending_operations,
      open_exceptions,
      audit,
    };
  }

  // Sales pages (decision F2): content editors edit a draft and publish it as a
  // numbered, append-only revision. The course page shows the published page.
  // Sales page images: raster formats only, checked by their first bytes so a
  // file cannot claim to be an image it is not.
  async uploadMedia(
    principal: Principal,
    key: string,
    data: { fileName: string; contentType: string; data: string },
  ) {
    const bytes = imageBytes(data);
    return this.command(
      principal,
      key,
      {
        action: "media.upload",
        fileName: data.fileName,
        sha: createHash("sha256").update(bytes).digest("hex"),
      },
      async (tx) => {
        const media = await tx.media_assets.create({
          data: {
            content_type: data.contentType,
            file_name: data.fileName,
            size: bytes.length,
            bytes,
            created_by: principal.actor,
          },
          select: { id: true },
        });
        await audit(tx, principal.actor, "media.uploaded", media.id, {
          file_name: data.fileName,
          size: bytes.length,
        });
        return { id: media.id, url: `/media/${media.id}` };
      },
    );
  }
  // This choice belongs to the portal offering, never to the Canvas source.
  // Commit media and the versioned choice together; failed saves leave no upload.
  async changeOfferingImage(
    principal: Principal,
    key: string,
    id: string,
    data: OfferingImageDto,
  ) {
    const bytes =
      data.mode === "upload"
        ? imageBytes({ data: data.data!, contentType: data.contentType! })
        : undefined;
    if (
      data.mode !== "upload" &&
      (data.data !== undefined ||
        data.fileName !== undefined ||
        data.contentType !== undefined)
    )
      throw new BadRequestException(
        "Image file fields are only accepted for an upload.",
      );
    return this.command(
      principal,
      key,
      {
        action: "offering.image",
        id,
        version: data.version,
        mode: data.mode,
        reason: data.reason,
        fileName: data.fileName,
        contentType: data.contentType,
        sha: bytes
          ? createHash("sha256").update(bytes).digest("hex")
          : undefined,
      },
      async (tx) => {
        const [before] = await sql<offerings>(
          tx,
          "SELECT * FROM offerings WHERE id=$1::uuid AND version=$2 FOR UPDATE",
          id,
          data.version,
        );
        if (!before)
          throw new ConflictException(
            "Offering changed or does not exist. Refresh and retry.",
          );
        if (
          (before.published || before.unpublished_at) &&
          (!data.reason || data.reason.trim().length < 10)
        )
          throw new BadRequestException(
            "Give a reason of at least 10 characters to change a published offering.",
          );
        const media = bytes
          ? await tx.media_assets.create({
              data: {
                content_type: data.contentType!,
                file_name: data.fileName!,
                size: bytes.length,
                bytes,
                created_by: principal.actor,
              },
              select: { id: true },
            })
          : undefined;
        const after = {
          image_override: data.mode !== "source",
          image_media_id: media?.id ?? null,
        };
        const offering = await tx.offerings.update({
          where: { id },
          data: { ...after, version: { increment: 1 } },
        });
        await audit(tx, principal.actor, "offering.image_changed", id, {
          before: {
            image_override: before.image_override,
            image_media_id: before.image_media_id,
          },
          after,
          mode: data.mode,
          reason: data.reason?.trim(),
        });
        return offering;
      },
    );
  }
  async media(id: string) {
    const file = await prisma.media_assets.findUnique({
      where: { id },
      select: { content_type: true, bytes: true },
    });
    if (!file) throw new NotFoundException("Image not found.");
    return file;
  }
  // One offering's staff page: the offering, registration counts by status,
  // its sales page status and offering-level activity (not learner records).
  async staffOffering(id: string) {
    const [offering] = await sql<
      OfferingListing & { sales_page_status: string }
    >(
      prisma,
      `${listing.replace(
        "FROM offerings o",
        `,${activeRegistrations} AS active_registrations,${seatsInUse} AS seats_in_use,${salesPageStatusSql} AS sales_page_status FROM offerings o`,
      )} WHERE o.id=$1::uuid`,
      id,
    );
    if (!offering) throw new NotFoundException("Offering not found.");
    const [registrations, activity] = await Promise.all([
      prisma.entitlements.groupBy({
        by: ["status"],
        where: { offering_id: id },
        _count: { _all: true },
      }),
      sql<{
        action: string;
        actor: string;
        actor_email: string | null;
        details: Prisma.JsonValue;
        created_at: Date;
      }>(
        prisma,
        `SELECT a.action,a.actor,s.email AS actor_email,a.details,a.created_at
        FROM audit_events a LEFT JOIN staff_members s ON a.actor='staff:'||s.id::text
        WHERE a.object_id=$1::uuid ORDER BY a.id DESC LIMIT 100`,
        id,
      ),
    ]);
    return {
      offering: {
        ...offering,
        missing_required_info: missingOfferingInfo(offering),
      },
      registrations: Object.fromEntries(
        registrations.map((r) => [r.status, r._count._all]),
      ),
      activity,
    };
  }
  async staffSalesPage(id: string) {
    const offering = await prisma.offerings.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        category: true,
        summary: true,
        outcomes: true,
        published: true,
        sales_page: true,
        sales_page_revisions: {
          orderBy: { revision: "desc" },
          select: { revision: true, published_by: true, published_at: true },
        },
      },
    });
    if (!offering) throw new NotFoundException("Offering not found.");
    const {
      sales_page: row,
      sales_page_revisions: revisions,
      ...rest
    } = offering;
    const draft = row ? parseSalesPage(row.draft) : emptySalesPage();
    const staff = await prisma.staff_members.findMany({
      where: {
        id: {
          in: revisions
            .map((r) => r.published_by.replace(/^staff:/, ""))
            .filter((v) => /^[0-9a-f-]{36}$/.test(v)),
        },
      },
      select: { id: true, email: true },
    });
    const emails = new Map(staff.map((m) => [`staff:${m.id}`, m.email]));
    return {
      offering: rest,
      // Version 0 means no page exists yet; the first save creates it.
      version: row?.version ?? 0,
      status: salesPageStatus(row),
      draft,
      published: row?.published ? parseSalesPage(row.published) : null,
      published_revision: row?.published ? row.published_revision : null,
      updated_at: row?.updated_at ?? null,
      published_at: row?.published_at ?? null,
      problems: publishProblems(draft),
      revisions: revisions.map((r) => ({
        revision: r.revision,
        published_at: r.published_at,
        published_by: emails.get(r.published_by) ?? r.published_by,
      })),
    };
  }
  async saveSalesPage(
    principal: Principal,
    key: string,
    id: string,
    version: number,
    input: unknown,
  ) {
    const page = parseSalesPage(input);
    return this.command(
      principal,
      key,
      { action: "sales_page.save", id, version, page },
      async (tx) => {
        const draft = page as unknown as Prisma.InputJsonObject;
        if (version === 0) {
          if (!(await tx.offerings.findUnique({ where: { id } })))
            throw new NotFoundException("Offering not found.");
          const created = await tx.sales_pages.createMany({
            data: [{ offering_id: id, draft }],
            skipDuplicates: true,
          });
          if (!created.count)
            throw new ConflictException(
              "Someone else started this page. Refresh and retry.",
            );
        } else {
          const updated = await tx.sales_pages.updateMany({
            where: { offering_id: id, version },
            data: {
              draft,
              version: { increment: 1 },
              updated_at: new Date(),
            },
          });
          if (!updated.count)
            throw new ConflictException(
              "This page changed since you opened it. Refresh and retry.",
            );
        }
        await audit(tx, principal.actor, "sales_page.draft_saved", id, {
          blocks: page.blocks.map((b) => b.type),
        });
        return this.salesPageVersion(tx, id);
      },
    );
  }
  async publishSalesPage(
    principal: Principal,
    key: string,
    id: string,
    version: number,
  ) {
    return this.command(
      principal,
      key,
      { action: "sales_page.publish", id, version },
      async (tx) => {
        const row = await tx.sales_pages.findUnique({
          where: { offering_id: id },
        });
        if (!row || row.version !== version)
          throw new ConflictException(
            "This page changed since you opened it. Refresh and retry.",
          );
        const draft = parseSalesPage(row.draft);
        const problems = publishProblems(draft);
        if (problems.length)
          throw new BadRequestException(
            `Fix these before publishing: ${problems.join(" ")}`,
          );
        const last = await tx.sales_page_revisions.aggregate({
          where: { offering_id: id },
          _max: { revision: true },
        });
        const revision = (last._max.revision ?? 0) + 1;
        const page = draft as unknown as Prisma.InputJsonObject;
        await tx.sales_page_revisions.create({
          data: {
            offering_id: id,
            revision,
            page,
            published_by: principal.actor,
          },
        });
        await tx.sales_pages.update({
          where: { offering_id: id },
          data: {
            published: page,
            published_revision: revision,
            published_at: new Date(),
            version: { increment: 1 },
          },
        });
        await audit(tx, principal.actor, "sales_page.published", id, {
          revision,
        });
        return this.salesPageVersion(tx, id);
      },
    );
  }
  async unpublishSalesPage(
    principal: Principal,
    key: string,
    id: string,
    version: number,
  ) {
    return this.command(
      principal,
      key,
      { action: "sales_page.unpublish", id, version },
      async (tx) => {
        const updated = await tx.sales_pages.updateMany({
          where: {
            offering_id: id,
            version,
            published: { not: Prisma.DbNull },
          },
          data: {
            published: Prisma.DbNull,
            published_at: null,
            version: { increment: 1 },
          },
        });
        if (!updated.count)
          throw new ConflictException(
            "This page changed or is not published. Refresh and retry.",
          );
        // The draft and revisions stay; the course page shows its default layout.
        await audit(tx, principal.actor, "sales_page.unpublished", id);
        return this.salesPageVersion(tx, id);
      },
    );
  }
  async restoreSalesPageRevision(
    principal: Principal,
    key: string,
    id: string,
    version: number,
    revision: number,
  ) {
    return this.command(
      principal,
      key,
      { action: "sales_page.restore", id, version, revision },
      async (tx) => {
        const source = await tx.sales_page_revisions.findUnique({
          where: { offering_id_revision: { offering_id: id, revision } },
        });
        if (!source) throw new NotFoundException("Revision not found.");
        // Restoring copies the revision into the draft; publishing it is a separate step.
        const updated = await tx.sales_pages.updateMany({
          where: { offering_id: id, version },
          data: {
            draft: source.page as Prisma.InputJsonObject,
            version: { increment: 1 },
            updated_at: new Date(),
          },
        });
        if (!updated.count)
          throw new ConflictException(
            "This page changed since you opened it. Refresh and retry.",
          );
        await audit(tx, principal.actor, "sales_page.revision_restored", id, {
          revision,
        });
        return this.salesPageVersion(tx, id);
      },
    );
  }
  private async salesPageVersion(tx: Tx, id: string) {
    const row = await tx.sales_pages.findUniqueOrThrow({
      where: { offering_id: id },
      select: {
        version: true,
        published_revision: true,
        published: true,
        draft: true,
      },
    });
    return {
      version: row.version,
      status: salesPageStatus(row),
      published_revision: row.published ? row.published_revision : null,
    };
  }
}
