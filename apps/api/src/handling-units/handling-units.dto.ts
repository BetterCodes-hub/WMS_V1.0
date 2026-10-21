import { HandlingUnitStatus, HandlingUnitType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQuery } from '../common/pagination';

export class HandlingUnitQuery extends PaginationQuery {
  @IsOptional() @IsEnum(HandlingUnitType) type?: HandlingUnitType;
  @IsOptional() @IsEnum(HandlingUnitStatus) status?: HandlingUnitStatus;
  @IsOptional() @IsString() locationId?: string;

  /** tylko jednostki najwyższego poziomu (palety matczyne i palety samodzielne) */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  rootOnly?: boolean;
}

export class CreateHandlingUnitDto {
  @IsEnum(HandlingUnitType) type: HandlingUnitType;
  @IsString() locationId: string;
  @IsOptional() @IsString() parentId?: string;
}

export class MoveHandlingUnitDto {
  @IsString() toLocationId: string;
}

export class AttachDto {
  @IsString() parentId: string;
}
