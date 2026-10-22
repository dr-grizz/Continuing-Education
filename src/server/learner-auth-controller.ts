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
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { timingSafeEqual } from "node:crypto";
import { CanvasLearnerAuthService } from "./canvas-learner-auth";
import { learnerAuthInfo } from "./learner-auth-config";

@Injectable()
export class LearnerBrokerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const value = context.switchToHttp().getRequest().headers.authorization;
    const key = process.env.LEARNER_API_TOKEN;
    if (typeof value !== "string" || !key) throw new UnauthorizedException();
    const actual = Buffer.from(value),
      expected = Buffer.from(`Bearer ${key}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new UnauthorizedException();
    return true;
  }
}
class LearnerStartDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/) browserNonce!: string;
  @IsOptional() @IsString() @MaxLength(200) returnTo?: string;
}
class LearnerCallbackDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/) browserNonce!: string;
  @Matches(/^learner\.[A-Za-z0-9_-]{43}$/) state!: string;
  @IsOptional() @IsString() @MaxLength(2048) code?: string;
  @IsOptional() @IsString() @MaxLength(200) error?: string;
  @IsOptional() @Matches(/^[A-Za-z0-9_-]{43}$/) previousSession?: string;
}
@Controller("api/v1/auth/learner")
@UseGuards(LearnerBrokerGuard)
export class LearnerAuthController {
  constructor(private readonly auth: CanvasLearnerAuthService) {}
  @Get("config") config() {
    return learnerAuthInfo();
  }
  @Post("canvas/start")
  @HttpCode(200)
  start(@Body() input: LearnerStartDto) {
    return this.auth.begin(input.browserNonce, input.returnTo);
  }
  @Post("canvas/callback")
  @HttpCode(200)
  complete(@Body() input: LearnerCallbackDto) {
    return this.auth.complete(input);
  }
  @Post("logout")
  @HttpCode(200)
  async logout(@Headers("x-learner-session") token?: string) {
    await this.auth.logout(token);
    return { learner: null };
  }
}
