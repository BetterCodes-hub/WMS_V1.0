import { LocationType, MovementType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { PaginationQuery } from '../common/pagination';

export class InventoryQuery extends PaginationQuery {
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsEnum(LocationType) locationType?: LocationType;
  @IsOptional() @IsString() zone?: string;
}

export class SummaryQuery extends PaginationQuery {
  @IsOptional() @IsString() category?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyInStock?: boolean;
}

export class MovementQuery extends PaginationQuery {
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsEnum(MovementType) type?: MovementType;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class ExpiringQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) days?: number;
}

export class TransferDto {
  @IsString() stockItemId: string;
  @IsInt() @Min(1) quantity: number;
  @IsString() toLocationId: string;
  @IsOptional() @IsString() toHandlingUnitId?: string;
}

export class AdjustDto {
  @IsIn(['PLUS', 'MINUS', 'CONSUMPTION'])
  kind: 'PLUS' | 'MINUS' | 'CONSUMPTION';

  @IsString() productId: string;
  @IsString() locationId: string;
  /** wymagane przy zdjęciu ze stanu — konkretna pozycja */
  @IsOptional() @IsString() stockItemId?: string;
  @IsOptional() @IsString() handlingUnitId?: string;
  @IsInt() @Min(1) quantity: number;

  @IsString()
  @MinLength(3, { message: 'Podaj powód korekty' })
  reason: string;

  @IsOptional() @IsString() batch?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
}
