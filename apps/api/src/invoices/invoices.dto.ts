import { InvoiceStatus, InvoiceType, PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../common/pagination';

export class InvoiceQuery extends PaginationQuery {
  @IsOptional() @IsEnum(InvoiceType) type?: InvoiceType;
  @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus;
  @IsOptional() @IsString() contractorId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  overdue?: boolean;
}

export class FromIssuesDto {
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) issueIds: string[];
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() saleDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @IsOptional() @IsString() notes?: string;
}

export class ManualLineDto {
  @IsOptional() @IsString() productId?: string;
  @IsString() @MinLength(2) name: string;
  @IsString() unit: string;
  @IsInt() @Min(1) quantity: number;
  @IsInt() @Min(0) unitNet: number;
  @IsIn([23, 8, 5, 0]) vatRate: number;
}

export class ManualInvoiceDto {
  @IsString() contractorId: string;
  @IsDateString() issueDate: string;
  @IsDateString() saleDate: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManualLineDto)
  lines: ManualLineDto[];
}

export class PurchaseLinePriceDto {
  @IsString() receiptLineId: string;
  @IsInt() @Min(0) unitNet: number;
}

export class PurchaseFromReceiptDto {
  @IsString() receiptId: string;
  @IsString() @MinLength(1, { message: 'Podaj numer faktury dostawcy' }) externalNumber: string;
  @IsDateString() issueDate: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @IsOptional() @IsString() notes?: string;

  /** ceny z faktury, jeśli różnią się od cen na PZ */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLinePriceDto)
  prices?: PurchaseLinePriceDto[];
}

export class MarkPaidDto {
  @IsOptional() @IsDateString() paidAt?: string;
}
