import { IssueStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsEnum, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../common/pagination';

export class IssueLineDto {
  @IsString() productId: string;
  @IsInt() @Min(1) quantity: number;
  /** domyślnie cena sprzedaży z kartoteki */
  @IsOptional() @IsInt() @Min(0) unitPrice?: number;
  @IsOptional() @IsIn([23, 8, 5, 0]) vatRate?: number;
}

export class CreateIssueDto {
  @IsString() customerId: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Dodaj co najmniej jedną pozycję' })
  @ValidateNested({ each: true })
  @Type(() => IssueLineDto)
  lines: IssueLineDto[];
}

export class UpdateIssueDto extends CreateIssueDto {}

export class IssueQuery extends PaginationQuery {
  @IsOptional() @IsEnum(IssueStatus) status?: IssueStatus;
  @IsOptional() @IsString() customerId?: string;

  /** tylko zatwierdzone, niezafakturowane */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  uninvoiced?: boolean;
}
