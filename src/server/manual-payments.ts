import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { prisma, sql } from "../domain/prisma";
import {
  ManualLedger,
  ManualOptions,
  ManualPayment,
} from "../domain/manual-payments";
import { Principal, PrototypeGuard, requireScope } from "./auth";
import { audit, PortalService } from "./service";
export class ManualRecordDto {
  @IsInt() @Min(1) @Max(2147483647) amountCents!: number;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsString() @MinLength(1) @MaxLength(120) reference!: string;
  @IsString() @MinLength(3) @MaxLength(1000) note!: string;
}
export class ManualPaymentDto extends ManualRecordDto {
  @IsUUID() learnerId!: string;
  @IsUUID() offeringId!: string;
  @IsIn(["cash", "check", "bank_transfer", "other"]) method!: string;
}
function validate(dto: ManualRecordDto) {
  const day = Date.parse(dto.date);
  if (
    dto.date < "0001-01-01" ||
    !Number.isFinite(day) ||
    new Date(day).toISOString().slice(0, 10) !== dto.date ||
    dto.date > new Date().toISOString().slice(0, 10)
  )
    throw new BadRequestException(
      "Choose a valid UTC date no later than today.",
    );
  if (
    !Number.isInteger(dto.amountCents) ||
    dto.amountCents < 1 ||
    dto.amountCents > 2147483647 ||
    !dto.reference.trim() ||
    dto.note.trim().length < 3
  )
    throw new BadRequestException(
      "Enter a positive USD amount, reference, and explanatory note.",
    );
}
@Injectable()
export class ManualPaymentsService {
  constructor(private readonly portal: PortalService) {}
  async options(search: string): Promise<ManualOptions> {
    const q = search.trim();
    if (q.length > 100)
      throw new BadRequestException("Search must be 100 characters or less.");
    const learners =
      q.length < 2
        ? []
        : await sql<{ id: string; label: string }>(
            prisma,
            `SELECT id,concat_ws(' · ',display_name,email,id::text) label FROM learners WHERE strpos(lower(concat_ws(' ',display_name,email,id::text)),lower($1))>0 ORDER BY display_name NULLS LAST,email NULLS LAST,id LIMIT 50`,
            q,
          );
    const offerings = await sql<{ id: string; title: string }>(
      prisma,
      "SELECT id,title FROM offerings ORDER BY title,id",
    );
    return { learners, offerings };
  }
  async ledger(): Promise<ManualLedger> {
    const payments = await sql<ManualPayment>(
      prisma,
      `SELECT p.*,p.paid_on::text, p.recorded_at::text,
      coalesce(l.display_name,l.email,l.id::text) learner,o.title offering,
      coalesce((SELECT sum(r.amount_cents)::integer FROM manual_refunds r WHERE r.payment_id=p.id),0) refunded_cents,
      coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.recorded_at,r.id) FROM manual_refunds r WHERE r.payment_id=p.id),'[]'::jsonb) refunds
      FROM manual_payments p JOIN learners l ON l.id=p.learner_id JOIN offerings o ON o.id=p.offering_id ORDER BY p.recorded_at DESC,p.id DESC LIMIT 250`,
    );
    return { payments, limit: 250 };
  }
  async payment(actor: Principal, key: string, dto: ManualPaymentDto) {
    validate(dto);
    return this.portal.command(
      actor,
      key,
      { action: "manual.payment", ...dto },
      async (tx) => {
        const [learner] = await sql(
            tx,
            "SELECT id FROM learners WHERE id=$1::uuid",
            dto.learnerId,
          ),
          [offering] = await sql(
            tx,
            "SELECT id FROM offerings WHERE id=$1::uuid",
            dto.offeringId,
          );
        if (!learner || !offering)
          throw new BadRequestException(
            "Choose an existing learner and offering.",
          );
        const [row] = await sql<{ id: string }>(
          tx,
          `INSERT INTO manual_payments(learner_id,offering_id,amount_cents,paid_on,method,reference,note,recorded_by) VALUES($1::uuid,$2::uuid,$3,$4::date,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id`,
          dto.learnerId,
          dto.offeringId,
          dto.amountCents,
          dto.date,
          dto.method,
          dto.reference.trim(),
          dto.note.trim(),
          actor.actor,
        );
        if (!row)
          throw new ConflictException(
            "This payment method and reference are already recorded. Review the ledger before trying again.",
          );
        await audit(tx, actor.actor, "manual_payment.recorded", row.id, {
          ...dto,
          reference: dto.reference.trim(),
          note: dto.note.trim(),
        });
        return row;
      },
    );
  }
  async refund(
    actor: Principal,
    key: string,
    id: string,
    dto: ManualRecordDto,
  ) {
    validate(dto);
    return this.portal.command(
      actor,
      key,
      { action: "manual.refund", id, ...dto },
      async (tx) => {
        const [payment] = await sql<{ amount_cents: number; paid_on: string }>(
          tx,
          "SELECT amount_cents,paid_on::text FROM manual_payments WHERE id=$1::uuid FOR UPDATE",
          id,
        );
        if (!payment)
          throw new BadRequestException(
            "Manual payment not found; Stripe payments must use the existing Finance workflow.",
          );
        const [total] = await sql<{ refunded: number }>(
          tx,
          "SELECT coalesce(sum(amount_cents),0)::integer refunded FROM manual_refunds WHERE payment_id=$1::uuid",
          id,
        );
        if (
          dto.date < payment.paid_on ||
          dto.amountCents > payment.amount_cents - total.refunded
        )
          throw new ConflictException(
            "Refund date must follow the payment, and amount cannot exceed its unrefunded balance.",
          );
        const [row] = await sql<{ id: string }>(
          tx,
          `INSERT INTO manual_refunds(payment_id,amount_cents,refunded_on,reference,note,recorded_by) VALUES($1::uuid,$2,$3::date,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
          id,
          dto.amountCents,
          dto.date,
          dto.reference.trim(),
          dto.note.trim(),
          actor.actor,
        );
        if (!row)
          throw new ConflictException(
            "This refund reference is already recorded. Review the ledger before trying again.",
          );
        await audit(tx, actor.actor, "manual_refund.recorded", row.id, {
          paymentId: id,
          ...dto,
        });
        return row;
      },
    );
  }
}
@Controller("api/v1/staff/manual-payments")
@UseGuards(PrototypeGuard)
export class ManualPaymentsController {
  constructor(private readonly service: ManualPaymentsService) {}
  @Get() list(@Req() req: any) {
    requireScope(req, "payments:read");
    return this.service.ledger();
  }
  @Get("options") options(@Req() req: any, @Query("search") search = "") {
    requireScope(req, "payments:record");
    return this.service.options(search);
  }
  @Post() @HttpCode(200) record(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Body() dto: ManualPaymentDto,
  ) {
    requireScope(req, "payments:record");
    return this.service.payment(req.principal, key, dto);
  }
  @Post(":id/refunds") @HttpCode(200) refund(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ManualRecordDto,
  ) {
    requireScope(req, "payments:record");
    return this.service.refund(req.principal, key, id, dto);
  }
}
