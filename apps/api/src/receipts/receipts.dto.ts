import { ReceiptMode, ReceiptStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../common/pagination';

export class ReceiptLineDto {
  @IsString() productId: string;
  @IsInt() @Min(1) expectedQty: number;
  /** domyślnie cena zakupu z kartoteki produktu */
  @IsOptional() @IsInt() @Min(0) unitPrice?: number;
  @IsOptional() @IsString() batch?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
}

export class CreateReceiptDto {
  @IsString() supplierId: string;
  @IsOptional() @IsString() supplierDocNo?: string;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Dodaj co najmniej jedną pozycję' })
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines: ReceiptLineDto[];
}

export class UpdateReceiptDto {
  @IsOptional() @IsString() supplierDocNo?: string;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateReceiptLineDto {
  @IsOptional() @IsInt() @Min(1) expectedQty?: number;
  @IsOptional() @IsInt() @Min(0) unitPrice?: number;
  @IsOptional() @IsString() batch?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
}

export class ReceiveDto {
  @IsString() lineId: string;
  @IsEnum(ReceiptMode) mode: ReceiptMode;
  /** lokalizacja przyjęcia — domyślnie pierwsza strefa przyjęć */
  @IsOptional() @IsString() locationId?: string;

  // PIECE — przyjęcie na sztuki (luzem lub na istniejącą paletę)
  @ValidateIf((o) => o.mode === ReceiptMode.PIECE)
  @IsInt() @Min(1)
  quantity?: number;

  @IsOptional() @IsString() targetHandlingUnitId?: string;

  // PALLET — N palet jednorodnych po X sztuk
  @ValidateIf((o) => o.mode === ReceiptMode.PALLET)
  @IsInt() @Min(1)
  palletCount?: number;

  @ValidateIf((o) => o.mode === ReceiptMode.PALLET)
  @IsInt() @Min(1)
  qtyPerPallet?: number;

  // MIXED_PALLET — paleta matczyna z K kartonami po Y sztuk
  @ValidateIf((o) => o.mode === ReceiptMode.MIXED_PALLET)
  @IsInt() @Min(1)
  cartonCount?: number;

  @ValidateIf((o) => o.mode === ReceiptMode.MIXED_PALLET)
  @IsInt() @Min(1)
  qtyPerCarton?: number;

  /** istniejąca paleta matczyna z tego przyjęcia (np. kolejny produkt na tę samą paletę) */
  @IsOptional() @IsString() motherPalletId?: string;

  @IsOptional() @IsString() batch?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
}

export class ReceiptQuery extends PaginationQuery {
  @IsOptional() @IsEnum(ReceiptStatus) status?: ReceiptStatus;
  @IsOptional() @IsString() supplierId?: string;
}
