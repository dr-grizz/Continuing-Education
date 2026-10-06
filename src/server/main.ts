import "reflect-metadata";
import {
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
  Req,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
  DocumentBuilder,
  SwaggerModule,
} from "@nestjs/swagger";
import { prisma, sql } from "../domain/prisma";
import { PrototypeGuard, requireScope } from "./auth";
import {
  DemoUserDto,
  DecisionDto,
  ExceptionActionDto,
  SimulationDto,
  UnpublishDto,
  OfferingDto,
  OfferingEditDto,
  OfferingSettingsDto,
  PublishDto,
  QueryDto,
  RegistrationDto,
} from "./dto";
import { PortalService } from "./service";
@ApiTags("Catalog")
@Controller("api/v1")
class CatalogController {
  constructor(private readonly portal: PortalService) {}
  @Get("health") health() {
    return { status: "ok", mode: "local-prototype" };
  }
  @Get("offerings")
  @ApiOperation({ summary: "List published sample offerings (up to 100)" })
  list(@Query() query: QueryDto) {
    return this.portal.list(query);
  }
  @Get("offerings/:id") detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.portal.detail(id);
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
  @Get("operations/:id") operation(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    if (!req.principal.learnerId) requireScope(req, "reports:read");
    return this.portal.operation(id, req.principal);
  }
  @Get("staff/offerings") staffList(@Req() req: any, @Query() query: QueryDto) {
    requireScope(req, "catalog:write");
    return this.portal.list(query, true);
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
    requireScope(req, "catalog:write");
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
  @Get("approval-requests") approvals(@Req() req: any) {
    requireScope(req, "approvals:decide");
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
    requireScope(req, "exceptions:resolve");
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
  @Get("reconciliation") report(@Req() req: any) {
    requireScope(req, "reports:read");
    return this.portal.report();
  }
}
@Module({
  controllers: [CatalogController, WorkflowController],
  providers: [PortalService, PrototypeGuard],
})
class AppModule {}
async function main() {
  // Refuse to start until npm run db:migrate has recorded the Prisma baseline.
  const migrated = await sql(
    prisma,
    "SELECT 1 AS ok FROM _prisma_migrations WHERE migration_name='0_baseline' AND finished_at IS NOT NULL AND rolled_back_at IS NULL",
  ).catch(() => []);
  if (!migrated.length) throw new Error("Run npm run db:migrate first.");
  for (const name of [
    "LEARNER_API_TOKEN",
    "STAFF_API_TOKEN",
    "AUTOMATION_API_TOKEN",
  ])
    if (!process.env[name]) throw new Error("Run npm run setup first.");
  const app = await NestFactory.create(AppModule);
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
      "Local synthetic data only. Authentication is a prototype token adapter, not production SSO. Payment and enrollment are simulated.",
    )
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document, {
    jsonDocumentUrl: "api/openapi.json",
  });
  await app.listen(3001, "127.0.0.1");
  console.log("API: http://localhost:3001/api/docs");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
