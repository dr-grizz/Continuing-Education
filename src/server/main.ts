import "reflect-metadata";
import { CanvasCoursesService } from "./canvas-courses";
import { CanvasCoursesController } from "./canvas-courses-controller";
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
  StreamableFile,
  ServiceUnavailableException,
  BadRequestException,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
  DocumentBuilder,
  SwaggerModule,
} from "@nestjs/swagger";
import { prisma, sql } from "../domain/prisma";
import { PrototypeGuard, requireAnyScope, requireScope } from "./auth";
import {
  RefundReasonDto,
  CollectionDto,
  ExploreDto,
  SalesPageDto,
  SalesPageRestoreDto,
  MediaUploadDto,
  OfferingImageDto,
  CollectionEditDto,
  FollowDto,
  SavedCourseDto,
  DemoUserDto,
  DashboardQueryDto,
  DecisionDto,
  LearnerAccessDto,
  LearnerQueryDto,
  ExceptionActionDto,
  SimulationDto,
  StaffMemberDto,
  StaffCanvasLinkDto,
  StaffSessionDto,
  StaffUpdateDto,
  UnpublishDto,
  OfferingDto,
  OfferingEditDto,
  OfferingSettingsDto,
  PublishDto,
  QueryDto,
  RegistrationDto,
} from "./dto";
import { PortalService } from "./service";
import { stripe, webhookSecret } from "./stripe";
import { StaffAuthController, StaffBrokerGuard } from "./staff-auth-controller";
import { CanvasStaffAuthService } from "./canvas-staff-auth";
import { staffAuthMode } from "./staff-auth-config";
import { learnerAuthMode } from "./learner-auth-config";
import { CanvasLearnerAuthService } from "./canvas-learner-auth";
import {
  LearnerAuthController,
  LearnerBrokerGuard,
} from "./learner-auth-controller";
@ApiTags("Catalog")
@Controller("api/v1")
class CatalogController {
  constructor(private readonly portal: PortalService) {}
  @Get("health") health() {
    return { status: "ok", mode: "local-prototype" };
  }
  @Get("offerings")
  @ApiOperation({
    summary:
      "List published, listed offerings for public discovery (up to 100)",
  })
  list(@Query() query: QueryDto) {
    return this.portal.list(query);
  }
  @Get("offerings/:id") detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.portal.detail(id);
  }
  @Get("payments/config")
  @ApiOperation({
    summary: "Payment provider in use: stripe (sandbox Checkout) or simulated",
  })
  paymentConfig() {
    return this.portal.paymentConfig();
  }
  @Get("explore")
  @ApiOperation({
    summary:
      "Explore tab: up to 5 courses, 3 collections and 3 pathways; staff picks first, then automatic fill",
  })
  explore() {
    return this.portal.explore();
  }
  @Get("media/:id")
  @ApiOperation({ summary: "An uploaded sales page image (public)" })
  async media(
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: any,
  ) {
    const file = await this.portal.media(id);
    res.set({
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    return new StreamableFile(file.bytes, { type: file.content_type });
  }
  @Get("collections")
  @ApiOperation({
    summary:
      "Published, listed collections and pathways with visible course counts",
  })
  collections() {
    return this.portal.publicCollections();
  }
  @Get("collections/:slug")
  @ApiOperation({
    summary: "A published collection or pathway with its courses in order",
  })
  collection(@Param("slug") slug: string) {
    return this.portal.publicCollection(slug);
  }
}
@ApiTags("Prototype workflow")
@ApiBearerAuth()
@ApiHeader({
  name: "X-Prototype-Learner-Id",
  required: false,
  description:
    "Select an existing demo learner with the learner token. Omit for legacy sample learner. Mock identity only.",
})
@ApiHeader({
  name: "X-Prototype-Staff-Id",
  required: false,
  description:
    "Mock mode only: select an active demo staff member with the staff token. Rejected in Canvas mode.",
})
@ApiHeader({
  name: "X-Staff-Session",
  required: false,
  description:
    "Canvas mode: opaque portal session, supplied only by the trusted web backend with the staff broker token. Current portal roles decide access.",
})
@ApiHeader({
  name: "Idempotency-Key",
  required: false,
  description:
    "Required for all POST commands. Use a new UUID per action; reuse on retry.",
})
@UseGuards(PrototypeGuard)
@Controller("api/v1")
class WorkflowController {
  constructor(private readonly portal: PortalService) {}
  @Post("prototype/users")
  @ApiOperation({
    summary: "Create or retrieve a demo learner by email; not authentication",
  })
  demoUser(@Req() req: any, @Body() dto: DemoUserDto) {
    requireScope(req, "learner");
    return this.portal.demoUser(dto.email);
  }
  @Get("me") me(@Req() req: any) {
    requireScope(req, "learner");
    return this.portal.me(req.principal);
  }
  @Get("me/learning") learning(@Req() req: any) {
    requireScope(req, "learner");
    return this.portal.learning(req.principal);
  }
  @Get("me/saved-courses")
  @ApiOperation({ summary: "The selected learner's private saved courses" })
  savedCourses(@Req() req: any) {
    requireScope(req, "learner");
    return this.portal.savedCourses(req.principal);
  }
  @Post("me/saved-courses/:offeringId")
  @HttpCode(200)
  @ApiOperation({ summary: "Save or remove a course; registers nothing" })
  saveCourse(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("offeringId", ParseUUIDPipe) offeringId: string,
    @Body() dto: SavedCourseDto,
  ) {
    requireScope(req, "learner");
    return this.portal.setSaved(req.principal, key, offeringId, dto.saved);
  }
  @Get("me/pathways")
  @ApiOperation({
    summary:
      "Pathways the selected learner follows, with registration status per course (no completion data)",
  })
  pathways(@Req() req: any) {
    requireScope(req, "learner");
    return this.portal.followedPathways(req.principal);
  }
  @Post("me/pathways/:id")
  @HttpCode(200)
  @ApiOperation({
    summary: "Follow or stop following a pathway; free and registers nothing",
  })
  follow(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: FollowDto,
  ) {
    requireScope(req, "learner");
    return this.portal.setFollowing(req.principal, key, id, dto.following);
  }
  @Post("registrations") register(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Body() dto: RegistrationDto,
  ) {
    requireScope(req, "learner");
    return this.portal.register(req.principal, key, dto.offeringId);
  }
  @Post("prototype/registrations/:id/simulate-payment")
  @HttpCode(202)
  @ApiOperation({
    summary: "SIMULATION ONLY: queue fake provisioning; no Stripe charge",
  })
  pay(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    requireScope(req, "learner");
    return this.portal.payment(req.principal, key, id);
  }
  @Post("registrations/:id/checkout")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Start Stripe-hosted Checkout (sandbox) for a current reservation; returns the Checkout URL. The webhook, not the browser, confirms payment.",
  })
  checkout(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    requireScope(req, "learner");
    return this.portal.checkout(req.principal, key, id);
  }
  @Get("operations/:id") operation(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    if (!req.principal.learnerId) requireScope(req, "reports:read");
    return this.portal.operation(id, req.principal);
  }
  @Get("staff/offerings") staffList(@Req() req: any, @Query() query: QueryDto) {
    requireScope(req, "staff:read");
    return this.portal.list(query, true);
  }
  @Get("staff/offerings/:id")
  @ApiOperation({
    summary:
      "One offering for staff: details, registration counts by status, sales page status and its activity",
  })
  staffOffering(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    requireScope(req, "staff:read");
    return this.portal.staffOffering(id);
  }
  @Post("offerings") create(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Body() dto: OfferingDto,
  ) {
    requireScope(req, "catalog:write");
    return this.portal.create(req.principal, key, dto);
  }
  @Post("offerings/:id/publish") publish(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PublishDto,
  ) {
    requireScope(req, "catalog:write");
    return this.portal.publish(req.principal, key, id, dto.version);
  }
  @Post("offerings/:id/edit")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Edit an offering (version-checked); published offerings need a reason and keep protected terms",
  })
  edit(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: OfferingEditDto,
  ) {
    requireScope(req, "catalog:write");
    return this.portal.edit(req.principal, key, id, dto);
  }
  @Post("offerings/:id/image")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Change the portal-only course image (catalog:write); Canvas is never changed and refreshes preserve the override",
  })
  changeOfferingImage(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: OfferingImageDto,
  ) {
    requireScope(req, "catalog:write");
    return this.portal.changeOfferingImage(req.principal, key, id, dto);
  }
  @Post("offerings/:id/unpublish")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Stop new registrations and payments; in-progress enrollments continue",
  })
  unpublish(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UnpublishDto,
  ) {
    requireScope(req, "catalog:write");
    return this.portal.unpublish(
      req.principal,
      key,
      id,
      dto.version,
      dto.reason,
    );
  }
  @Get("offerings/:id/prices")
  @ApiOperation({ summary: "Append-only price history, newest first" })
  prices(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    requireScope(req, "staff:read");
    return this.portal.prices(id);
  }
  @Post("offerings/:id/settings")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Change approval validity, enrollment window and Canvas link (version-checked)",
  })
  settings(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: OfferingSettingsDto,
  ) {
    requireScope(req, "catalog:write");
    return this.portal.updateSettings(req.principal, key, id, dto);
  }
  @Get("staff/explore")
  @ApiOperation({ summary: "Current staff picks for the learner Explore tab" })
  staffExplore(@Req() req: any) {
    requireScope(req, "staff:read");
    return this.portal.staffExplore();
  }
  @Post("staff/explore")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Replace the Explore tab picks (published items only), audited; catalog:write or content:write",
  })
  setExplore(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Body() dto: ExploreDto,
  ) {
    // Decided Oct 7, 2026: catalog managers and content editors both curate Explore.
    requireAnyScope(req, "catalog:write", "content:write");
    return this.portal.setExplore(req.principal, key, dto);
  }
  @Get("staff/sales-pages/:id")
  @ApiOperation({
    summary:
      "An offering's sales page: draft, published page, what blocks publishing, and revisions",
  })
  salesPage(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    requireScope(req, "staff:read");
    return this.portal.staffSalesPage(id);
  }
  @Post("staff/sales-pages/:id")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Save the sales page draft (version-checked, audited; content:write)",
  })
  saveSalesPage(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SalesPageDto,
  ) {
    requireScope(req, "content:write");
    return this.portal.saveSalesPage(
      req.principal,
      key,
      id,
      dto.version,
      dto.page,
    );
  }
  @Post("staff/media")
  @HttpCode(201)
  @ApiOperation({
    summary:
      "Upload a sales page image (PNG, JPEG, WebP or GIF, up to 5 MB; content:write)",
  })
  uploadMedia(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Body() dto: MediaUploadDto,
  ) {
    requireScope(req, "content:write");
    return this.portal.uploadMedia(req.principal, key, dto);
  }
  @Post("staff/sales-pages/:id/publish")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Publish the draft as a new revision; refused while anything blocks publishing (content:write)",
  })
  publishSalesPage(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PublishDto,
  ) {
    requireScope(req, "content:write");
    return this.portal.publishSalesPage(req.principal, key, id, dto.version);
  }
  @Post("staff/sales-pages/:id/unpublish")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Remove the published page; the course shows its default page (content:write)",
  })
  unpublishSalesPage(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PublishDto,
  ) {
    requireScope(req, "content:write");
    return this.portal.unpublishSalesPage(req.principal, key, id, dto.version);
  }
  @Post("staff/sales-pages/:id/restore")
  @HttpCode(200)
  @ApiOperation({
    summary: "Copy a published revision into the draft (content:write)",
  })
  restoreSalesPage(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SalesPageRestoreDto,
  ) {
    requireScope(req, "content:write");
    return this.portal.restoreSalesPageRevision(
      req.principal,
      key,
      id,
      dto.version,
      dto.revision,
    );
  }
  @Get("staff/transactions")
  @ApiOperation({
    summary:
      "Transactions (orders) with refund status, read-only (payments:read)",
  })
  transactions(@Req() req: any) {
    requireScope(req, "payments:read");
    return this.portal.transactions();
  }
  @Post("staff/transactions/reconcile")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Manually reconcile up to five unresolved Stripe Checkout sessions (payments:reconcile)",
  })
  reconcilePayments(@Req() req: any, @Headers("idempotency-key") key: string) {
    requireScope(req, "payments:reconcile");
    return this.portal.reconcilePayments(req.principal, key);
  }
  @Post("staff/transactions/:id/refund-requests")
  @ApiOperation({
    summary:
      "Request a refund; Finance issues it in the Stripe Dashboard (refunds:request)",
  })
  requestRefund(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RefundReasonDto,
  ) {
    requireScope(req, "refunds:request");
    return this.portal.requestRefund(req.principal, key, id, dto.reason);
  }
  @Post("staff/refund-requests/:id/cancel")
  @HttpCode(200)
  @ApiOperation({
    summary: "Cancel a waiting refund request (refunds:request)",
  })
  cancelRefundRequest(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RefundReasonDto,
  ) {
    requireScope(req, "refunds:request");
    return this.portal.cancelRefundRequest(req.principal, key, id, dto.reason);
  }
  @Get("staff/collections")
  @ApiOperation({
    summary:
      "All collections and pathways, including drafts, with follower counts",
  })
  staffCollections(@Req() req: any) {
    requireScope(req, "staff:read");
    return this.portal.staffCollections();
  }
  @Post("collections")
  @ApiOperation({ summary: "Create a draft collection or pathway" })
  createCollection(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Body() dto: CollectionDto,
  ) {
    requireScope(req, "catalog:write");
    return this.portal.createCollection(req.principal, key, dto);
  }
  @Post("collections/:id/edit")
  @HttpCode(200)
  @ApiOperation({
    summary: "Edit title, summary and course order (version-checked)",
  })
  editCollection(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CollectionEditDto,
  ) {
    requireScope(req, "catalog:write");
    return this.portal.editCollection(req.principal, key, id, dto);
  }
  @Post("collections/:id/publish")
  @HttpCode(200)
  publishCollection(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PublishDto,
  ) {
    requireScope(req, "catalog:write");
    return this.portal.setCollectionPublished(
      req.principal,
      key,
      id,
      dto.version,
      true,
    );
  }
  @Post("collections/:id/unpublish")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Hide a collection or pathway from learners; follows and saved courses are kept",
  })
  unpublishCollection(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PublishDto,
  ) {
    requireScope(req, "catalog:write");
    return this.portal.setCollectionPublished(
      req.principal,
      key,
      id,
      dto.version,
      false,
    );
  }
  @Get("approval-requests") approvals(@Req() req: any) {
    requireScope(req, "staff:read");
    return this.portal.approvals();
  }
  @Post("approval-requests/:id/decision") decide(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ) {
    requireScope(req, "approvals:decide");
    return this.portal.decide(req.principal, key, id, dto.decision);
  }
  @Get("prototype/simulation")
  @ApiOperation({
    summary: "PROTOTYPE ONLY: current simulated provisioning outcome",
  })
  simulation(@Req() req: any) {
    requireScope(req, "reports:read");
    return this.portal.simulation();
  }
  @Post("prototype/simulation")
  @HttpCode(200)
  @ApiOperation({
    summary: "PROTOTYPE ONLY: choose the outcome for newly queued provisioning",
  })
  setSimulation(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Body() dto: SimulationDto,
  ) {
    requireScope(req, "prototype:simulate");
    return this.portal.setSimulation(
      req.principal,
      key,
      dto.provisioningOutcome,
    );
  }
  @Get("exceptions")
  @ApiOperation({
    summary: "Registrations whose provisioning failed after automatic retries",
  })
  exceptions(@Req() req: any) {
    requireScope(req, "reports:read");
    return this.portal.exceptions();
  }
  @Post("exceptions/:id/retry")
  @HttpCode(200)
  @ApiOperation({
    summary: "Queue provisioning again after the cause is fixed",
  })
  retry(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ExceptionActionDto,
  ) {
    requireScope(req, "exceptions:resolve");
    return this.portal.recover(req.principal, key, id, "retry", dto.reason);
  }
  @Post("exceptions/:id/resolve")
  @HttpCode(200)
  @ApiOperation({
    summary: "Record that access was granted manually outside the portal",
  })
  resolve(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ExceptionActionDto,
  ) {
    requireScope(req, "exceptions:resolve");
    return this.portal.recover(req.principal, key, id, "resolve", dto.reason);
  }
  @Post("prototype/staff-sessions")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "MOCK MODE ONLY: mock staff sign-in by email (no password); disabled in Canvas mode",
  })
  staffSession(@Req() req: any, @Body() dto: StaffSessionDto) {
    requireScope(req, "staff:session");
    return this.portal.staffSession(dto.email);
  }
  @Get("prototype/staff-directory")
  @ApiOperation({
    summary: "PROTOTYPE ONLY: active demo staff for mock sign-in",
  })
  staffDirectory(@Req() req: any) {
    requireScope(req, "staff:session");
    return this.portal.staffDirectory();
  }
  @Get("staff/me")
  @ApiOperation({ summary: "The selected staff member, roles and scopes" })
  staffMe(@Req() req: any) {
    requireScope(req, "staff:read");
    return this.portal.staffMe(req.principal);
  }
  @Get("staff/roles")
  @ApiOperation({ summary: "Role catalog: labels, descriptions and scopes" })
  staffRolesCatalog(@Req() req: any) {
    requireScope(req, "staff:read");
    return this.portal.roleCatalog();
  }
  @Get("staff/members")
  staffMembers(@Req() req: any) {
    requireScope(req, "staff:manage");
    return this.portal.staffMembers();
  }
  @Post("staff/members")
  createStaff(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Body() dto: StaffMemberDto,
  ) {
    requireScope(req, "staff:manage");
    return this.portal.createStaff(req.principal, key, dto);
  }
  @Post("staff/members/:id/canvas-link")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Link an administrator-verified Canvas user ID; preserve roles and refuse identity replacement",
  })
  linkStaffCanvas(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: StaffCanvasLinkDto,
  ) {
    requireScope(req, "staff:manage");
    return this.portal.linkStaffCanvas(req.principal, key, id, dto);
  }
  @Post("staff/members/:id")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Update name, roles or active status (version-checked; keeps one active staff administrator)",
  })
  updateStaff(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: StaffUpdateDto,
  ) {
    requireScope(req, "staff:manage");
    return this.portal.updateStaff(req.principal, key, id, dto);
  }
  @Get("staff/dashboard")
  @ApiOperation({
    summary:
      "Sample dashboard: enrollment for all staff; sales with reports:sales; completion after Canvas",
  })
  dashboard(@Req() req: any, @Query() query: DashboardQueryDto) {
    requireScope(req, "staff:read");
    return this.portal.dashboard(
      req.principal,
      query.days ?? 30,
      query.offeringId,
    );
  }
  @Get("staff/learners")
  @ApiOperation({
    summary: "Learners with registration counts (search by email)",
  })
  staffLearners(@Req() req: any, @Query() query: LearnerQueryDto) {
    requireScope(req, "staff:read");
    return this.portal.staffLearners(query.search);
  }
  @Get("staff/learners/:id")
  @ApiOperation({
    summary: "Learner profile, registrations and recent activity",
  })
  staffLearner(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    requireScope(req, "staff:read");
    return this.portal.staffLearner(id);
  }
  @Post("staff/learners/:id/access")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Deactivate or reactivate a learner account with an audited reason (version-checked)",
  })
  setLearnerAccess(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: LearnerAccessDto,
  ) {
    requireScope(req, "learners:manage");
    return this.portal.setLearnerAccess(req.principal, key, id, dto);
  }
  @Get("reconciliation") report(@Req() req: any) {
    requireScope(req, "reports:read");
    return this.portal.report();
  }
}
// Stripe calls this directly: no token, but every request must carry a valid
// Stripe-Signature for STRIPE_WEBHOOK_SECRET over the raw request body.
@ApiTags("Payments")
@Controller("api/v1/webhooks")
class WebhookController {
  constructor(private readonly portal: PortalService) {}
  @Post("stripe")
  @HttpCode(200)
  @ApiOperation({ summary: "Stripe webhook receiver (signed events only)" })
  async stripeWebhook(
    @Req() req: RawBodyRequest<{ headers: Record<string, string> }>,
    @Headers("stripe-signature") signature: string,
  ) {
    if (!webhookSecret)
      throw new ServiceUnavailableException(
        "STRIPE_WEBHOOK_SECRET is not configured.",
      );
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody as Buffer,
        signature,
        webhookSecret,
      );
    } catch {
      throw new BadRequestException("Invalid Stripe signature.");
    }
    return this.portal.stripeEvent(event);
  }
}
// Gates run before interceptors. Webhooks verify signatures and fulfill within
// their own transaction; health checks must never act as a background timer.
@Injectable()
class DemoRequestInterceptor implements NestInterceptor {
  constructor(private readonly portal: PortalService) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    if (req.principal) await this.portal.processDemo();
    return next.handle();
  }
}
@Module({
  controllers: [
    CanvasCoursesController,
    CatalogController,
    WorkflowController,
    WebhookController,
    StaffAuthController,
    LearnerAuthController,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: DemoRequestInterceptor },
    CanvasCoursesService,
    PortalService,
    PrototypeGuard,
    StaffBrokerGuard,
    CanvasStaffAuthService,
    CanvasLearnerAuthService,
    LearnerBrokerGuard,
  ],
})
class AppModule {}
async function main() {
  staffAuthMode();
  learnerAuthMode();
  // Refuse to start until npm run db:migrate has recorded the Prisma baseline.
  const migrated = await sql(
    prisma,
    "SELECT 1 AS ok FROM _prisma_migrations WHERE migration_name='000_baseline' AND finished_at IS NOT NULL AND rolled_back_at IS NULL",
  ).catch(() => []);
  if (!migrated.length) throw new Error("Run npm run db:migrate first.");
  for (const name of [
    "LEARNER_API_TOKEN",
    "STAFF_API_TOKEN",
    "AUTOMATION_API_TOKEN",
  ])
    if (!process.env[name]) throw new Error("Run npm run setup first.");
  // rawBody keeps the exact bytes Stripe signed, for webhook verification.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  // Credentials share this API process and its PostgreSQL pool. No second listener.
  const { createApp } = require(
    require("node:path").resolve("badge-service/server.mjs"),
  );
  const { db } = require("../domain/db");
  const credentials = await createApp({
    directory: process.env.BADGE_DATA_DIR || "badge-service/data",
    baseUrl: `http://127.0.0.1:${process.env.API_PORT || 3051}`,
    pool: db,
    demo: process.env.BADGE_DEMO !== "false",
    ...(process.env.BADGE_CONFIG
      ? {
          config: JSON.parse(
            require("node:fs").readFileSync(process.env.BADGE_CONFIG, "utf8"),
          ),
        }
      : {}),
  });
  // Mount before body parsing so certificate/image uploads retain stream limits.
  app.use("/api/credentials", (request: any, response: any) => {
    credentials.server.emit("request", request, response);
  });
  app.enableShutdownHooks();
  // Sales page images arrive as base64 JSON (up to 5 MB decoded).
  app.useBodyParser("json", { limit: "8mb" });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const config = new DocumentBuilder()
    .setTitle("Continuing Education prototype API")
    .setDescription(
      "Local prototype. Staff authentication supports configurable Canvas OAuth with optional course-read scopes and portal roles, or mock identities in mock mode. Learner identity and enrollment are simulated. Payment uses the Stripe sandbox when configured, otherwise a simulation.",
    )
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document, {
    jsonDocumentUrl: "api/openapi.json",
  });
  const port = Number(process.env.API_PORT || "3051");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("API_PORT must be a valid TCP port.");
  await app.listen(port, "127.0.0.1");
  console.log(`API: http://127.0.0.1:${port}/api/docs`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
