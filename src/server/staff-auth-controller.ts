import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { timingSafeEqual } from "node:crypto";
import { CanvasStaffAuthService } from "./canvas-staff-auth";
import { staffAuthInfo } from "./staff-auth-config";

@Injectable()
export class StaffBrokerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const authorization = context.switchToHttp().getRequest()
      .headers.authorization;
    const expected = process.env.STAFF_API_TOKEN;
    if (typeof authorization !== "string" || !expected)
      throw new UnauthorizedException();
    const actual = Buffer.from(authorization);
    const wanted = Buffer.from(`Bearer ${expected}`);
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted))
      throw new UnauthorizedException();
    return true;
  }
}
export class CanvasStartDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/) browserNonce!: string;
}
export class CanvasCallbackDto extends CanvasStartDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/) state!: string;
  @IsOptional() @IsString() @MaxLength(2048) code?: string;
  @IsOptional() @IsString() @MaxLength(200) error?: string;
  @IsOptional() @Matches(/^[A-Za-z0-9_-]{43}$/) previousSession?: string;
}
@ApiTags("Staff authentication")
@ApiBearerAuth()
@UseGuards(StaffBrokerGuard)
@Controller("api/v1/auth/staff")
export class StaffAuthController {
  constructor(private readonly auth: CanvasStaffAuthService) {}
  @Get("config") config() {
    return staffAuthInfo();
  }
  @Post("canvas/start")
  @HttpCode(200)
  start(@Body() body: CanvasStartDto) {
    return this.auth.begin(body.browserNonce);
  }
  @Post("canvas/callback")
  @HttpCode(200)
  complete(@Body() body: CanvasCallbackDto) {
    return this.auth.complete(body);
  }
  @Post("logout")
  @HttpCode(200)
  async logout(@Headers("x-staff-session") token?: string) {
    await this.auth.logout(token);
    return { member: null };
  }
}
