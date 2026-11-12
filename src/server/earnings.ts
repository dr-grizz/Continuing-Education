import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString, IsUUID, Matches } from "class-validator";
import { prisma, sql } from "../domain/prisma";
import {
  EarningsDashboard,
  EarningsProvider,
  EarningsTotals,
} from "../domain/earnings";
import { PrototypeGuard, requireScope } from "./auth";
const receipts = `(SELECT o.id,e.offering_id,e.learner_id,o.created_at,o.amount_cents,o.refunded_cents,o.provider::text provider,o.payment_status,
 (SELECT least(q.amount_cents,o.amount_cents-o.refunded_cents) FROM refund_requests q WHERE q.order_id=o.id AND q.status='requested' ORDER BY q.created_at DESC,q.id DESC LIMIT 1) requested_cents
 FROM orders o JOIN entitlements e ON e.id=o.entitlement_id
 UNION ALL SELECT p.id,p.offering_id,p.learner_id,p.paid_on::timestamp AT TIME ZONE 'UTC',p.amount_cents,
 coalesce((SELECT sum(r.amount_cents)::integer FROM manual_refunds r WHERE r.payment_id=p.id),0),'manual','paid',NULL::integer
 FROM manual_payments p)`;
const paidStatus = `((o.provider IN ('stripe','manual') AND o.payment_status='paid') OR (o.provider='simulated' AND o.payment_status IN ('paid','simulated_paid')))`;
const DAY = 86400000;
const date = (time: number) => new Date(time).toISOString().slice(0, 10);
export class EarningsQuery {
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsUUID() offeringId?: string;
  @IsOptional()
  @IsIn(["stripe", "simulated", "manual"])
  provider?: EarningsProvider;
}
type Payment = {
  id: string;
  offering_id: string;
  learner_id: string;
  created_at: string;
  amount_cents: number;
  refunded_cents: number;
  requested_cents: number | null;
};
const sum = (
  rows: Payment[],
  field: "amount_cents" | "refunded_cents" | "requested_cents",
) => {
  const result = rows.reduce((n, row) => n + (row[field] ?? 0), 0);
  if (!Number.isSafeInteger(result))
    throw new ServiceUnavailableException(
      "Payment totals exceed the supported reporting range.",
    );
  return result;
};
function totals(rows: Payment[]): EarningsTotals {
  const gross = sum(rows, "amount_cents"),
    refunded = sum(rows, "refunded_cents");
  return {
    grossCents: gross,
    refundedCents: refunded,
    retainedCents: gross - refunded,
    payments: rows.length,
    payers: new Set(rows.map((r) => r.learner_id)).size,
    averagePaymentCents: rows.length ? gross / rows.length : null,
    refundedPayments: rows.filter((r) => r.refunded_cents > 0).length,
    fullyRefundedPayments: rows.filter(
      (r) => r.refunded_cents > 0 && r.refunded_cents === r.amount_cents,
    ).length,
    partiallyRefundedPayments: rows.filter(
      (r) => r.refunded_cents > 0 && r.refunded_cents < r.amount_cents,
    ).length,
    refundShare: gross > 0 ? (100 * refunded) / gross : null,
  };
}
@Injectable()
export class EarningsService {
  async dashboard(query: EarningsQuery): Promise<EarningsDashboard> {
    const today = Date.parse(date(Date.now())),
      from = Date.parse(query.from ?? date(today - 30 * DAY)),
      last = Date.parse(query.to ?? date(today - DAY));
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(last) ||
      (query.from && date(from) !== query.from) ||
      (query.to && date(last) !== query.to) ||
      last < from ||
      last >= today ||
      (last - from) / DAY >= 366
    )
      throw new BadRequestException(
        "Choose 1–366 complete UTC days ending before today.",
      );
    const end = last + DAY,
      previous = from - (end - from),
      provider = query.provider ?? "stripe",
      offeringId = query.offeringId ?? null;
    if (!["stripe", "simulated", "manual"].includes(provider))
      throw new BadRequestException(
        "Choose Stripe sandbox, simulated, or manual records.",
      );
    return prisma.$transaction(
      async (tx) => {
        const offerings = await sql<{ id: string; title: string }>(
          tx,
          "SELECT id,title FROM offerings ORDER BY title,id",
        );
        if (offeringId && !offerings.some((o) => o.id === offeringId))
          throw new BadRequestException("Offering not found.");
        // Orders are the payment authority, not entitlement status or current catalog prices.
        // Deactivated people and unpublished offerings retain their financial history.
        const paid = await sql<Payment>(
          tx,
          `SELECT o.id,o.offering_id,o.learner_id,o.created_at::text,o.amount_cents,o.refunded_cents,o.requested_cents FROM ${receipts} o
           WHERE o.provider=$1 AND o.created_at >= $2::timestamptz AND o.created_at < $3::timestamptz AND ($4::uuid IS NULL OR o.offering_id=$4::uuid) AND ${paidStatus}`,
          provider,
          new Date(previous),
          new Date(end),
          offeringId,
        );
        const priorPayers = await sql<{ learner_id: string }>(
          tx,
          `SELECT DISTINCT o.learner_id FROM ${receipts} o WHERE o.provider=$1 AND o.created_at<$2::timestamptz AND ${paidStatus}`,
          provider,
          new Date(from),
        );
        const [excluded] = await sql<{ count: number }>(
          tx,
          `SELECT count(*)::integer count FROM ${receipts} o WHERE o.provider=$1 AND o.created_at >= $2::timestamptz AND o.created_at<$3::timestamptz AND ($4::uuid IS NULL OR o.offering_id=$4::uuid) AND NOT ${paidStatus}`,
          provider,
          new Date(from),
          new Date(end),
          offeringId,
        );
        const selected = paid.filter((p) => Date.parse(p.created_at) >= from),
          past = paid.filter((p) => Date.parse(p.created_at) < from),
          current = totals(selected),
          before = totals(past);
        const old = new Set(priorPayers.map((p) => p.learner_id)),
          payers = new Set(selected.map((p) => p.learner_id));
        const bucketDays = (end - from) / DAY <= 31 ? 1 : 7,
          trend = [];
        for (let start = from; start < end; start += bucketDays * DAY) {
          const rows = selected.filter(
            (p) =>
              Date.parse(p.created_at) >= start &&
              Date.parse(p.created_at) <
                Math.min(end, start + bucketDays * DAY),
          );
          trend.push({
            date: date(start),
            grossCents: sum(rows, "amount_cents"),
            payments: rows.length,
          });
        }
        let checkouts: EarningsDashboard["checkouts"] = null;
        if (provider === "stripe") {
          const sessions = await sql<{ status: string; confirmed: boolean }>(
            tx,
            `SELECT c.status::text,EXISTS(SELECT 1 FROM orders o WHERE o.stripe_checkout_session_id=c.id AND o.provider='stripe' AND o.payment_status='paid') confirmed FROM checkout_sessions c JOIN entitlements e ON e.id=c.entitlement_id WHERE c.created_at >= $1::timestamptz AND c.created_at<$2::timestamptz AND ($3::uuid IS NULL OR e.offering_id=$3::uuid)`,
            new Date(from),
            new Date(end),
            offeringId,
          );
          const confirmed = sessions.filter((c) => c.confirmed).length;
          checkouts = {
            attempts: sessions.length,
            confirmed,
            completeWithoutPayment: sessions.filter(
              (c) => !c.confirmed && c.status === "complete",
            ).length,
            open: sessions.filter((c) => !c.confirmed && c.status === "open")
              .length,
            expired: sessions.filter(
              (c) => !c.confirmed && c.status === "expired",
            ).length,
            confirmationRate: sessions.length
              ? (100 * confirmed) / sessions.length
              : null,
          };
        }
        return {
          generatedAt: new Date().toISOString(),
          range: {
            from: date(from),
            to: date(last),
            previousFrom: date(previous),
            previousTo: date(from - DAY),
            days: (end - from) / DAY,
          },
          provider,
          offeringId,
          offerings,
          totals: current,
          previous: {
            grossCents: before.grossCents,
            payments: before.payments,
            payers: before.payers,
          },
          buyers: {
            firstTime: [...payers].filter((id) => !old.has(id)).length,
            returning: [...payers].filter((id) => old.has(id)).length,
          },
          trend,
          byOffering: offerings
            .filter((o) => selected.some((p) => p.offering_id === o.id))
            .map((o) => ({
              ...o,
              ...totals(selected.filter((p) => p.offering_id === o.id)),
            }))
            .sort(
              (a, b) =>
                b.grossCents - a.grossCents || a.title.localeCompare(b.title),
            ),
          refunds: {
            outstandingRequests: selected.filter(
              (p) => p.requested_cents !== null && p.requested_cents > 0,
            ).length,
            requestedCents: sum(selected, "requested_cents"),
          },
          checkouts,
          excludedOrders: excluded.count,
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 20000 },
    );
  }
}
@Controller("api/v1/staff/earnings")
@UseGuards(PrototypeGuard)
export class EarningsController {
  constructor(private readonly service: EarningsService) {}
  @Get() dashboard(@Req() req: any, @Query() query: EarningsQuery) {
    requireScope(req, "reports:sales");
    return this.service.dashboard(query);
  }
}
