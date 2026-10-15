import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  Matches,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsUUID,
  ValidateIf,
} from "class-validator";
import { PrototypeGuard, requireScope } from "./auth";
import { CanvasCoursesService } from "./canvas-courses";

export class CourseScheduleDto {
  @IsBoolean() enabled!: boolean;
  @IsInt() @Min(15) @Max(1440) intervalMinutes!: number;
  @IsInt() @Min(0) version!: number;
}
export class SaveCoursePreviewDto {
  @ValidateIf((value) => value.previousSavedRunId !== null)
  @IsUUID()
  previousSavedRunId!: string | null;
}
export class SyncCoursesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(10000)
  @Matches(/^[1-9][0-9]{0,19}$/, { each: true })
  courseIds!: string[];
  @Matches(/^[0-9a-f]{64}$/) savedRevision!: string;
}
@ApiTags("Canvas courses")
@ApiBearerAuth()
@UseGuards(PrototypeGuard)
@Controller("api/v1/staff/canvas")
export class CanvasCoursesController {
  constructor(private readonly courses: CanvasCoursesService) {}
  @Get("connection")
  connection(@Req() req: any) {
    requireScope(req, "canvas:read");
    return this.courses.view(req.principal);
  }
  @Get("courses")
  @ApiOperation({
    summary: "Filter the complete Canvas course preview before pagination",
  })
  async list(@Req() req: any, @Query() query: Record<string, unknown>) {
    requireScope(req, "canvas:read");
    await this.courses.readPendingPreview(req.principal.staffId);
    return this.courses.view(req.principal, Number(query.page ?? 1), query);
  }
  @Post("sync")
  @HttpCode(202)
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({
    summary:
      "Queue a read using the signed-in staff member's Canvas authorization",
  })
  sync(@Req() req: any, @Headers("idempotency-key") key: string) {
    requireScope(req, "canvas:sync");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        key || "",
      )
    )
      throw new BadRequestException("A UUID Idempotency-Key is required.");
    return this.courses.enqueue(req.principal.staffId, key);
  }
  @Get("sync-runs/:id")
  status(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    requireScope(req, "canvas:read");
    return this.courses.runStatus(id);
  }
  @Post("sync-runs/:id/save")
  @HttpCode(200)
  @ApiOperation({
    summary: "Explicitly save the caller's reviewed, unexpired course preview",
  })
  save(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SaveCoursePreviewDto,
  ) {
    requireScope(req, "canvas:sync");
    return this.courses.savePreview(req.principal, id, body.previousSavedRunId);
  }
  @Post("sync-runs/:id/sync-courses")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Sync selected courses from the caller's reviewed preview, preserving other synced courses",
  })
  syncCourses(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SyncCoursesDto,
  ) {
    requireScope(req, "canvas:sync");
    return this.courses.syncCourses(
      req.principal,
      id,
      body.courseIds,
      body.savedRevision,
    );
  }
  @Post("schedule")
  @HttpCode(200)
  schedule(@Req() req: any, @Body() body: CourseScheduleDto) {
    requireScope(req, "canvas:manage");
    return this.courses.setSchedule(req.principal, body);
  }
  @Post("disconnect")
  @HttpCode(200)
  disconnect(@Req() req: any) {
    requireScope(req, "canvas:sync");
    return this.courses.disconnect(req.principal);
  }
}
