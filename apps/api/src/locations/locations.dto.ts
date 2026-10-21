import { PartialType } from '@nestjs/swagger';
import { LocationType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  @Matches(/^[A-Z0-9\-]{2,20}$/, { message: 'Kod lokalizacji: 2–20 znaków, wielkie litery, cyfry i myślniki' })
  code: string;

  @IsOptional() @IsString() name?: string;
  @IsString() zone: string;
  @IsEnum(LocationType) type: LocationType;
  @IsOptional() @IsInt() @Min(1) maxPallets?: number | null;
}

export class UpdateLocationDto extends PartialType(CreateLocationDto) {
  @IsOptional() @IsBoolean() active?: boolean;
}

/** Generator siatki lokalizacji regałowych: ZONE-AA-RR-PP (alejka-regał-poziom). */
export class GenerateLocationsDto {
  @IsString() @Matches(/^[A-Z]{1,3}$/) zone: string;
  @IsEnum(LocationType) type: LocationType;
  @IsInt() @Min(1) @Max(50) aisles: number;
  @IsInt() @Min(1) @Max(50) racks: number;
  @IsInt() @Min(1) @Max(10) levels: number;
  @IsOptional() @IsInt() @Min(1) maxPallets?: number;
}

export class LocationQuery {
  @IsOptional() @IsEnum(LocationType) type?: LocationType;
  @IsOptional() @IsString() zone?: string;
  @IsOptional() @IsString() search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}
