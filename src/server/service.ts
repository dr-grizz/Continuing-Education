import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { PoolClient } from "pg";
import { db } from "../domain/db";
import {
  OfferingDto,
  OfferingEditDto,
  OfferingSettingsDto,
  ProvisioningOutcome,
  QueryDto,
} from "./dto";
import { Principal } from "./auth";

// Scheduled courses close enrollment a staff-set number of days after they start.
const enrollmentWindow = `CASE WHEN o.course_type='cohort' THEN to_char(o.start_date+o.enrollment_close_days,'YYYY-MM-DD') END AS enrollment_closes_on,
  CASE WHEN o.course_type='cohort' THEN to_char(o.start_date+o.enrollment_close_days,'Mon FMDD, YYYY') END AS enrollment_closes_label,
  (o.course_type<>'cohort' OR current_date<=o.start_date+o.enrollment_close_days) AS enrollment_open`;
const listing = `SELECT o.*,${enrollmentWindow}, to_char(o.start_date,'YYYY-MM-DD') AS start_date, to_char(o.end_date,'YYYY-MM-DD') AS end_date,
  (o.capacity - (SELECT count(*) FROM entitlements e WHERE e.offering_id=o.id AND
    (e.status IN ('provisioning','enrolled','exception') OR (e.status='reserved' AND e.reserved_until>now()))))::integer AS seats_available
  FROM offerings o`;
export async function audit(
  client: PoolClient,
  actor: string,
  action: string,
  id: string | null,
  details = {},
) {
  await client.query(
    "INSERT INTO audit_events(actor,action,object_id,details) VALUES ($1,$2,$3,$4)",
    [actor, action, id, JSON.stringify(details)],
  );
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
// Registrations that still depend on the offering's current terms.
const activeRegistrations = `(SELECT count(*) FROM entitlements a WHERE a.offering_id=o.id AND
  (a.status IN ('awaiting_approval','approved','provisioning','enrolled','exception') OR (a.status='reserved' AND a.reserved_until>now())))::integer`;
const seatsInUse = `(SELECT count(*) FROM entitlements s WHERE s.offering_id=o.id AND
  (s.status IN ('provisioning','enrolled','exception') OR (s.status='reserved' AND s.reserved_until>now())))::integer`;
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
    // Staff also see how many registrations and seats depend on each offering.
    const select = staff
      ? listing.replace(
          "FROM offerings o",
          `,${activeRegistrations} AS active_registrations,${seatsInUse} AS seats_in_use FROM offerings o`,
        )
      : listing;
    return (
      await db.query(
        `${select} WHERE ($1 OR o.published) AND ($2='' OR o.title ILIKE $2 OR o.summary ILIKE $2) AND ($3='' OR o.category=$3) ORDER BY o.start_date,o.title LIMIT 100`,
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
          `SELECT o.*,${enrollmentWindow} FROM offerings o WHERE o.id=$1 AND o.published FOR UPDATE`,
          [offeringId],
        );
        if (!found.rowCount)
          throw new NotFoundException("Offering not available.");
        const offering = found.rows[0];
        const existing = await client.query(
          "SELECT * FROM entitlements WHERE learner_id=$1 AND offering_id=$2",
          [principal.learnerId, offeringId],
        );
        const row = existing.rows[0];
        const now = Date.now();
        const reservationCurrent =
          row?.status === "reserved" &&
          new Date(row.reserved_until).getTime() > now;
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
        if (!offering.enrollment_open)
          throw new ConflictException(
            `Enrollment closed on ${offering.enrollment_closes_label}.`,
          );
        // A still-valid approval allows reserving again; declined or lapsed approvals need a new request.
        const approvalValid =
          ["approved", "expired", "reserved"].includes(row?.status) &&
          row?.approval_expires_at &&
          new Date(row.approval_expires_at).getTime() > now;
        const needsApproval = offering.approval_required && !approvalValid;
        if (!needsApproval) await this.reserve(client, offering);
        const status = needsApproval ? "awaiting_approval" : "reserved";
        const result = await client.query(
          `INSERT INTO entitlements(learner_id,offering_id,status,reserved_until,quoted_price_cents) VALUES ($1,$2,$3,CASE WHEN $3='reserved' THEN now()+interval '30 minutes' ELSE NULL END,
          CASE WHEN $3='reserved' THEN $4::integer END)
        ON CONFLICT(learner_id,offering_id) DO UPDATE SET status=EXCLUDED.status,reserved_until=EXCLUDED.reserved_until,
          quoted_price_cents=coalesce(EXCLUDED.quoted_price_cents,entitlements.quoted_price_cents),
          approval_expires_at=CASE WHEN EXCLUDED.status='awaiting_approval' THEN NULL ELSE entitlements.approval_expires_at END
        RETURNING *`,
          [principal.learnerId, offeringId, status, offering.price_cents],
        );
        await audit(
          client,
          principal.actor,
          needsApproval
            ? row
              ? "approval.requested_again"
              : "approval.requested"
            : "seat.reserved",
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
          "SELECT e.*,coalesce(e.quoted_price_cents,o.price_cents) AS amount_cents,o.published FROM entitlements e JOIN offerings o ON o.id=e.offering_id WHERE e.id=$1 AND e.learner_id=$2 FOR UPDATE OF e",
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
        // Unpublishing stops new payments; already-paid registrations continue.
        if (!row.published)
          throw new ConflictException(
            "This course is no longer open for registration.",
          );
        await client.query(
          "INSERT INTO orders(entitlement_id,amount_cents) VALUES ($1,$2)",
          [entitlementId, row.amount_cents],
        );
        await client.query(
          "UPDATE entitlements SET status='provisioning',reserved_until=NULL WHERE id=$1",
          [entitlementId],
        );
        const op = await client.query(
          `INSERT INTO operations(entitlement_id,simulated_outcome)
          SELECT $1,coalesce((SELECT value FROM prototype_settings WHERE key='provisioning_outcome'),'normal') RETURNING *`,
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
        `SELECT e.*,o.title,o.category,o.format,o.course_type,o.price_cents,o.approval_required,to_char(o.start_date,'YYYY-MM-DD') AS start_date,to_char(o.end_date,'YYYY-MM-DD') AS end_date,
      ${enrollmentWindow},o.published,CASE WHEN e.status='enrolled' THEN o.canvas_course_url END AS canvas_course_url,
      p.id AS operation_id,p.stage,p.status AS operation_status,p.attempts FROM entitlements e JOIN offerings o ON o.id=e.offering_id LEFT JOIN operations p ON p.entitlement_id=e.id WHERE e.learner_id=$1 ORDER BY e.created_at DESC`,
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
        `SELECT e.*,o.title,o.approval_valid_days,l.email AS learner_email FROM entitlements e JOIN offerings o ON o.id=e.offering_id JOIN learners l ON l.id=e.learner_id WHERE e.status='awaiting_approval' ORDER BY e.created_at`,
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
        // Approvals stay valid for the offering's staff-set number of days.
        const row = await client.query(
          `UPDATE entitlements e SET status=$2,
            approval_expires_at=CASE WHEN $2='approved' THEN now()+make_interval(days => o.approval_valid_days) END
          FROM offerings o WHERE e.id=$1 AND e.status='awaiting_approval' AND o.id=e.offering_id RETURNING e.*`,
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
    validateSchedule(data);
    return this.command(
      principal,
      key,
      { action: "create", data },
      async (client) => {
        const row = await client.query(
          `INSERT INTO offerings(title,category,summary,description,format,start_date,end_date,capacity,price_cents,approval_required,course_type,approval_valid_days,enrollment_close_days,canvas_course_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
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
            data.approvalValidDays ?? 7,
            data.enrollmentCloseDays ?? 7,
            data.canvasCourseUrl || null,
          ],
        );
        await client.query(
          "INSERT INTO offering_prices(offering_id,price_cents,actor,reason) VALUES ($1,$2,$3,'Initial price')",
          [row.rows[0].id, data.priceCents, principal.actor],
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
      async (client) => {
        const before = await client.query(
          "SELECT approval_valid_days,enrollment_close_days,canvas_course_url FROM offerings WHERE id=$1 AND version=$2 FOR UPDATE",
          [id, data.version],
        );
        if (!before.rowCount)
          throw new ConflictException(
            "Offering changed or does not exist. Refresh and retry.",
          );
        const row = await client.query(
          "UPDATE offerings SET approval_valid_days=$2,enrollment_close_days=$3,canvas_course_url=$4,version=version+1 WHERE id=$1 RETURNING *",
          [
            id,
            data.approvalValidDays,
            data.enrollmentCloseDays,
            data.canvasCourseUrl || null,
          ],
        );
        // Changed periods apply to future approvals; existing approvals keep their expiry.
        await audit(client, principal.actor, "offering.settings_changed", id, {
          before: before.rows[0],
          after: {
            approval_valid_days: data.approvalValidDays,
            enrollment_close_days: data.enrollmentCloseDays,
            canvas_course_url: data.canvasCourseUrl || null,
          },
        });
        return row.rows[0];
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
    const { version, reason, ...fields } = data;
    return this.command(
      principal,
      key,
      { action: "edit", id, data },
      async (client) => {
        const found = await client.query(
          `SELECT o.*,to_char(o.start_date,'YYYY-MM-DD') AS start_date,to_char(o.end_date,'YYYY-MM-DD') AS end_date,
            ${activeRegistrations} AS active_registrations,${seatsInUse} AS seats_in_use
          FROM offerings o WHERE o.id=$1 AND o.version=$2 FOR UPDATE`,
          [id, version],
        );
        if (!found.rowCount)
          throw new ConflictException(
            "Offering changed or does not exist. Refresh and retry.",
          );
        const before = found.rows[0];
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
        if (fields.capacity < before.seats_in_use)
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
          capacity: fields.capacity,
          price_cents: fields.priceCents,
          approval_required: fields.approvalRequired,
          approval_valid_days:
            fields.approvalValidDays ?? before.approval_valid_days,
          enrollment_close_days:
            fields.enrollmentCloseDays ?? before.enrollment_close_days,
          canvas_course_url: fields.canvasCourseUrl || null,
        };
        const changes = Object.fromEntries(
          Object.entries(after)
            .filter(([field, value]) => before[field] !== value)
            .map(([field, value]) => [
              field,
              { before: before[field], after: value },
            ]),
        );
        if (!Object.keys(changes).length)
          throw new BadRequestException("No changes to save.");
        const row = await client.query(
          `UPDATE offerings SET title=$2,category=$3,summary=$4,description=$5,format=$6,course_type=$7,start_date=$8,end_date=$9,
            capacity=$10,price_cents=$11,approval_required=$12,approval_valid_days=$13,enrollment_close_days=$14,canvas_course_url=$15,version=version+1
          WHERE id=$1 RETURNING *`,
          [id, ...Object.values(after)],
        );
        if (changes.price_cents)
          await client.query(
            "INSERT INTO offering_prices(offering_id,price_cents,actor,reason) VALUES ($1,$2,$3,$4)",
            [id, after.price_cents, principal.actor, reason?.trim() || null],
          );
        await audit(client, principal.actor, "offering.edited", id, {
          reason: reason?.trim() || null,
          published: before.published,
          unpublished: Boolean(before.unpublished_at),
          changes,
        });
        return row.rows[0];
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
      async (client) => {
        const row = await client.query(
          `UPDATE offerings o SET published=false,unpublished_at=now(),version=version+1 WHERE o.id=$1 AND o.version=$2 AND o.published
          RETURNING o.*,${activeRegistrations} AS active_registrations`,
          [id, version],
        );
        if (!row.rowCount)
          throw new ConflictException(
            "Offering changed, is not published, or does not exist. Refresh and retry.",
          );
        await audit(client, principal.actor, "offering.unpublished", id, {
          reason,
          active_registrations: row.rows[0].active_registrations,
        });
        return row.rows[0];
      },
    );
  }
  async prices(id: string) {
    return (
      await db.query(
        "SELECT price_cents,effective_at,actor,reason FROM offering_prices WHERE offering_id=$1 ORDER BY id DESC",
        [id],
      )
    ).rows;
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
          "UPDATE offerings SET published=true,unpublished_at=NULL,version=version+1 WHERE id=$1 AND version=$2 RETURNING *",
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
  async simulation() {
    const row = await db.query(
      "SELECT value,updated_at FROM prototype_settings WHERE key='provisioning_outcome'",
    );
    return {
      provisioningOutcome: row.rows[0]?.value ?? "normal",
      updatedAt: row.rows[0]?.updated_at ?? null,
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
      async (client) => {
        await client.query(
          `INSERT INTO prototype_settings(key,value) VALUES ('provisioning_outcome',$1)
          ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
          [outcome],
        );
        await audit(
          client,
          principal.actor,
          "prototype.simulation_changed",
          null,
          { provisioningOutcome: outcome },
        );
        return { provisioningOutcome: outcome };
      },
    );
  }
  async exceptions() {
    const rows = (
      await db.query(
        `SELECT e.id,e.status,e.offering_id,o.title,l.email AS learner_email,p.id AS operation_id,p.stage,p.error,p.attempts,p.failed_at,p.simulated_outcome
        FROM entitlements e JOIN offerings o ON o.id=e.offering_id JOIN learners l ON l.id=e.learner_id JOIN operations p ON p.entitlement_id=e.id
        WHERE e.status='exception' ORDER BY p.failed_at`,
      )
    ).rows;
    const history = rows.length
      ? (
          await db.query(
            "SELECT object_id,actor,action,details,created_at FROM audit_events WHERE object_id=ANY($1::uuid[]) ORDER BY id",
            [rows.map((row) => row.id)],
          )
        ).rows
      : [];
    return rows.map((row) => ({
      ...row,
      history: history
        .filter((event) => event.object_id === row.id)
        .map(({ object_id, ...event }) => event),
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
      async (client) => {
        const found = await client.query(
          "SELECT e.id,p.stage FROM entitlements e JOIN operations p ON p.entitlement_id=e.id WHERE e.id=$1 AND e.status='exception' FOR UPDATE OF e,p",
          [id],
        );
        if (!found.rowCount)
          throw new ConflictException("Registration is not awaiting recovery.");
        const stage = found.rows[0].stage;
        if (action === "retry") {
          // Retrying assumes the cause was fixed, so the simulation resumes normally.
          await client.query(
            "UPDATE entitlements SET status='provisioning' WHERE id=$1",
            [id],
          );
          await client.query(
            "UPDATE operations SET status='pending',attempts=0,error=NULL,failed_at=NULL,simulated_outcome='normal',next_run=now() WHERE entitlement_id=$1",
            [id],
          );
        } else {
          await client.query(
            "UPDATE entitlements SET status='enrolled' WHERE id=$1",
            [id],
          );
          await client.query(
            "UPDATE operations SET status='succeeded',stage='manual',next_run=NULL WHERE entitlement_id=$1",
            [id],
          );
        }
        await audit(
          client,
          principal.actor,
          action === "retry"
            ? "exception.retry_requested"
            : "exception.resolved_manually",
          id,
          { reason, stage },
        );
        return (
          await client.query("SELECT * FROM entitlements WHERE id=$1", [id])
        ).rows[0];
      },
    );
  }
  async report() {
    const counts = await db.query(
      `SELECT (SELECT count(*) FROM orders)::integer AS simulated_orders,(SELECT count(*) FROM entitlements WHERE status='enrolled')::integer AS simulated_enrollments,(SELECT count(*) FROM operations WHERE status IN ('pending','running'))::integer AS pending_operations,(SELECT count(*) FROM entitlements WHERE status='exception')::integer AS open_exceptions`,
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
