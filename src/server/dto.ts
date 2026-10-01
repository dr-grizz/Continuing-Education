import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsEmail,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
export class RegistrationDto {
  @ApiProperty() @IsUUID() offeringId!: string;
}
export class DecisionDto {
  @ApiProperty({ enum: ["approved", "declined"] })
  @IsIn(["approved", "declined"])
  decision!: "approved" | "declined";
}
export class OfferingDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(120) title!: string;
  @ApiProperty({ enum: ["Technology", "Leadership", "Healthcare", "Ministry"] })
  @IsIn(["Technology", "Leadership", "Healthcare", "Ministry"])
  category!: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(240) summary!: string;
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(4000)
  description!: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(100) format!: string;
  @ApiProperty({ enum: ["cohort", "self_paced"] })
  @IsIn(["cohort", "self_paced"])
  courseType!: "cohort" | "self_paced";
  @ApiPropertyOptional({
    description: "Required for cohort courses; omit for self-paced courses.",
  })
  @ValidateIf((o) => o.courseType === "cohort" || o.startDate != null)
  @IsDateString({ strict: true })
  startDate?: string;
  @ApiPropertyOptional({
    description: "Required for cohort courses; omit for self-paced courses.",
  })
  @ValidateIf((o) => o.courseType === "cohort" || o.endDate != null)
  @IsDateString({ strict: true })
  endDate?: string;
  @ApiProperty() @IsInt() @Min(1) @Max(10000) capacity!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(1000000) priceCents!: number;
  @ApiProperty() @IsBoolean() approvalRequired!: boolean;
}
export class PublishDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
}
export class QueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
  @ApiPropertyOptional({
    enum: ["Technology", "Leadership", "Healthcare", "Ministry"],
  })
  @IsOptional()
  @IsIn(["Technology", "Leadership", "Healthcare", "Ministry"])
  category?: string;
}

export class DemoUserDto {
  @ApiProperty({
    example: "learner@example.com",
    description: "Mock sign-in only; no password accepted.",
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
