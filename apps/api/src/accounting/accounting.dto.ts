import { InvoiceType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class PeriodQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class ExportQuery extends PeriodQuery {
  @IsOptional() @IsEnum(InvoiceType) type?: InvoiceType;
}
