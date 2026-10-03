import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { PoolClient } from "pg";
import { db } from "../domain/db";
import { OfferingDto, QueryDto } from "./dto";
import { Principal } from "./auth";

const listing = `SELECT o.*, to_char(o.start_date,'YYYY-MM-DD') AS start_date, to_char(o.end_date,'YYYY-MM-DD') AS end_date,
  (o.capacity - (SELECT count(*) FROM entitlements e WHERE e.offering_id=o.id AND
    (e.status IN ('provisioning','enrolled','exception') OR (e.status='reserved' AND e.reserved_until>now()))))::integer AS seats_available
  FROM offerings o`;
export async function audit(
  client: PoolClient,
  actor: string,
  action: string,
  id: string,
  details = {},
) {
  await client.query(
    "INSERT INTO audit_events(actor,action,object_id,details) VALUES ($1,$2,$3,$4)",
    [actor, action, id, JSON.stringify(details)],
  );
}
@Injectable()
export class PortalService {
  async demoUser(email: string) {
    const normalized = email.trim().toLowerCase();
    return (
      await db.query(
        "INSERT INTO learners(email) VALUES ($1) ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id,email,created_at",
        [normalized],
      )
    ).rows[0];
  }
  async me(principal: Principal) {
    const result = await db.query(
      "SELECT id,email,created_at FROM learners WHERE id=$1",
      [principal.learnerId],
    );
    if (!result.rowCount)
      throw new NotFoundException("Demo learner not found.");
    return result.rows[0];
  }
  async list(query: QueryDto, staff = false) {
    return (
      await db.query(
        `${listing} WHERE ($1 OR o.published) AND ($2='' OR o.title ILIKE $2 OR o.summary ILIKE $2) AND ($3='' OR o.category=$3) ORDER BY o.start_date,o.title LIMIT 100`,
        [staff, query.search ? `%${query.search}%` : "", query.category || ""],
      )
    ).rows;
  }
  async detail(id: string) {
    const result = await db.query(`${listing} WHERE o.id=$1 AND o.published`, [
      id,
    ]);
    if (!result.rowCount) throw new NotFoundException("Offering not found.");
    return result.rows[0];
  }
  async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async command(
    principal: Principal,
    key: string,
    input: unknown,
    action: (client: PoolClient) => Promise<unknown>,
  ) {
    if (!key || key.length > 160)
      throw new BadRequestException(
        "Provide an Idempotency-Key header of 1–160 characters.",
      );
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    return this.transaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`${principal.actor}:${key}`],
      );
      const previous = await client.query(
        "SELECT fingerprint,response FROM commands WHERE actor=$1 AND key=$2",
        [principal.actor, key],
      );
      if (previous.rowCount) {
        if (previous.rows[0].fingerprint !== fingerprint)
          throw new ConflictException(
            "Idempotency key was already used for a different command.",
          );
        return previous.rows[0].response;
      }
      const response = await action(client);
      await client.query(
        "INSERT INTO commands(actor,key,fingerprint,response) VALUES ($1,$2,$3,$4)",
        [principal.actor, key, fingerprint, JSON.stringify(response)],
      );
      return response;
    });
  }
  async reserve(client: PoolClient, offering: any) {
    const occupied = await client.query(
      `SELECT count(*)::integer AS count FROM entitlements WHERE offering_id=$1 AND (status IN ('provisioning','enrolled','exception') OR (status='reserved' AND reserved_until>now()))`,
      [offering.id],
    );
    if (occupied.rows[0].count >= offering.capacity)
      throw new ConflictException("This offering has no available seats.");
  }
  async register(principal: Principal, key: string, offeringId: string) {
    return this.command(
      principal,
      key,
      { action: "register", offeringId },
      async (client) => {
        const found = await client.query(
          "SELECT * FROM offerings WHERE id=$1 AND published FOR UPDATE",
          [offeringId],
        );
        if (!found.rowCount)
          throw new NotFoundException("Offering not available.");
        const offering = found.rows[0];
        if (
          offering.end_date &&
          new Date(offering.end_date).getTime() < Date.now()
        )
          throw new ConflictException("Registration has closed.");
        const existing = await client.query(
          "SELECT * FROM entitlements WHERE learner_id=$1 AND offering_id=$2",
          [principal.learnerId, offeringId],
        );
        if (
          existing.rowCount &&
          !["approved", "expired"].includes(existing.rows[0].status)
        ) {
          const row = existing.rows[0];
          if (
            row.status === "reserved" &&
            new Date(row.reserved_until).getTime() <= Date.now()
          ) {
            // Revalidate capacity below before renewing a timed-out prototype reservation.
          } else return row;
        }
        const needsApproval =
          offering.approval_required &&
          (!existing.rowCount ||
            !["approved", "expired", "reserved"].includes(
              existing.rows[0].status,
            ));
        if (!needsApproval) await this.reserve(client, offering);
        const status = needsApproval ? "awaiting_approval" : "reserved";
        const result = await client.query(
          `INSERT INTO entitlements(learner_id,offering_id,status,reserved_until) VALUES ($1,$2,$3,CASE WHEN $3='reserved' THEN now()+interval '30 minutes' ELSE NULL END)
        ON CONFLICT(learner_id,offering_id) DO UPDATE SET status=EXCLUDED.status,reserved_until=EXCLUDED.reserved_until RETURNING *`,
          [principal.learnerId, offeringId, status],
        );
        await audit(
          client,
          principal.actor,
          needsApproval ? "approval.requested" : "seat.reserved",
          result.rows[0].id,
        );
        return result.rows[0];
      },
    );
  }
  async payment(principal: Principal, key: string, entitlementId: string) {
    return this.command(
      principal,
      key,
      { action: "simulate-payment", entitlementId },
      async (client) => {
        const result = await client.query(
          "SELECT e.*,o.price_cents FROM entitlements e JOIN offerings o ON o.id=e.offering_id WHERE e.id=$1 AND e.learner_id=$2 FOR UPDATE OF e",
          [entitlementId, principal.learnerId],
        );
        if (!result.rowCount)
          throw new NotFoundException("Registration not found.");
        const row = result.rows[0];
        const existing = await client.query(
          "SELECT * FROM operations WHERE entitlement_id=$1",
          [entitlementId],
        );
        if (existing.rowCount) return existing.rows[0];
        if (
          row.status !== "reserved" ||
          new Date(row.reserved_until).getTime() <= Date.now()
        )
          throw new ConflictException(
            "A current seat reservation is required.",
          );
        await client.query(
          "INSERT INTO orders(entitlement_id,amount_cents) VALUES ($1,$2)",
          [entitlementId, row.price_cents],
        );
        await client.query(
          "UPDATE entitlements SET status='provisioning',reserved_until=NULL WHERE id=$1",
          [entitlementId],
        );
        const op = await client.query(
          "INSERT INTO operations(entitlement_id) VALUES ($1) RETURNING *",
          [entitlementId],
        );
        await audit(
          client,
          principal.actor,
          "prototype.payment_simulated",
          entitlementId,
        );
        return op.rows[0];
      },
    );
  }
  async learning(principal: Principal) {
    return (
      await db.query(
        `SELECT e.*,o.title,o.category,o.format,o.course_type,o.price_cents,to_char(o.start_date,'YYYY-MM-DD') AS start_date,to_char(o.end_date,'YYYY-MM-DD') AS end_date,
      p.id AS operation_id,p.stage,p.status AS operation_status FROM entitlements e JOIN offerings o ON o.id=e.offering_id LEFT JOIN operations p ON p.entitlement_id=e.id WHERE e.learner_id=$1 ORDER BY e.created_at DESC`,
        [principal.learnerId],
      )
    ).rows;
  }
  async operation(id: string, principal: Principal) {
    const result = await db.query(
      `SELECT p.* FROM operations p JOIN entitlements e ON e.id=p.entitlement_id WHERE p.id=$1 AND ($2::uuid IS NULL OR e.learner_id=$2)`,
      [id, principal.learnerId || null],
    );
    if (!result.rowCount) throw new NotFoundException("Operation not found.");
    return result.rows[0];
  }
  async approvals() {
    return (
      await db.query(
        `SELECT e.*,o.title,l.email AS learner_email FROM entitlements e JOIN offerings o ON o.id=e.offering_id JOIN learners l ON l.id=e.learner_id WHERE e.status='awaiting_approval' ORDER BY e.created_at`,
      )
    ).rows;
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
      async (client) => {
        const row = await client.query(
          "UPDATE entitlements SET status=$2 WHERE id=$1 AND status='awaiting_approval' RETURNING *",
          [id, decision],
        );
        if (!row.rowCount)
          throw new ConflictException("Request is not awaiting approval.");
        await audit(client, principal.actor, `approval.${decision}`, id);
        return row.rows[0];
      },
    );
  }
  async create(principal: Principal, key: string, data: OfferingDto) {
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
    return this.command(
      principal,
      key,
      { action: "create", data },
      async (client) => {
        const row = await client.query(
          `INSERT INTO offerings(title,category,summary,description,format,start_date,end_date,capacity,price_cents,approval_required,course_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [
            data.title,
            data.category,
            data.summary,
            data.description,
            data.format,
            data.startDate,
            data.endDate,
            data.capacity,
            data.priceCents,
            data.approvalRequired,
            data.courseType,
          ],
        );
        await audit(
          client,
          principal.actor,
          "offering.created",
          row.rows[0].id,
        );
        return row.rows[0];
      },
    );
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
      async (client) => {
        const row = await client.query(
          "UPDATE offerings SET published=true,version=version+1 WHERE id=$1 AND version=$2 RETURNING *",
          [id, version],
        );
        if (!row.rowCount)
          throw new ConflictException(
            "Offering changed or does not exist. Refresh and retry.",
          );
        await audit(
          client,
          principal.actor,
          "prototype.offering_published",
          id,
        );
        return row.rows[0];
      },
    );
  }
  async report() {
    const counts = await db.query(
      `SELECT (SELECT count(*) FROM orders)::integer AS simulated_orders,(SELECT count(*) FROM entitlements WHERE status='enrolled')::integer AS simulated_enrollments,(SELECT count(*) FROM operations WHERE status IN ('pending','running'))::integer AS pending_operations`,
    );
    // Resolve learner actors and affected records to readable labels for the staff log.
    const auditRows = await db.query(
      `SELECT a.actor,a.action,a.object_id,a.created_at,
        CASE WHEN a.actor LIKE 'demo-learner:%' THEN coalesce(actor_learner.email,'Legacy demo learner') END AS actor_email,
        coalesce(o.title,eo.title) AS offering_title,
        subject_learner.email AS subject_email
      FROM audit_events a
      LEFT JOIN learners actor_learner ON a.actor='demo-learner:'||actor_learner.id::text
      LEFT JOIN offerings o ON o.id=a.object_id
      LEFT JOIN entitlements e ON e.id=a.object_id
      LEFT JOIN offerings eo ON eo.id=e.offering_id
      LEFT JOIN learners subject_learner ON subject_learner.id=e.learner_id
      ORDER BY a.id DESC LIMIT 200`,
    );
    return { ...counts.rows[0], audit: auditRows.rows };
  }
}
