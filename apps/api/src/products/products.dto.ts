import { PartialType } from '@nestjs/swagger';
import { ProductUnit } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Min, MinLength, ValidateIf } from 'class-validator';
import { PaginationQuery } from '../common/pagination';

export class CreateProductDto {
  @IsString()
  @Matches(/^[A-Z0-9\-_.]{2,32}$/, { message: 'SKU: 2–32 znaki, wielkie litery, cyfry, - _ .' })
  sku: string;

  @IsOptional()
  @ValidateIf((o) => o.ean !== '' && o.ean !== null)
  @Matches(/^\d{8}$|^\d{13}$/, { message: 'EAN musi mieć 8 lub 13 cyfr' })
  ean?: string | null;

  @IsString()
  @MinLength(2, { message: 'Nazwa jest wymagana' })
  name: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;

  @IsEnum(ProductUnit)
  unit: ProductUnit;

  @IsInt() @Min(0) purchasePrice: number;
  @IsInt() @Min(0) salePrice: number;

  @IsIn([23, 8, 5, 0], { message: 'Stawka VAT: 23, 8, 5 lub 0' })
  vatRate: number;

  @IsInt() @Min(0) minStock: number;
  @IsOptional() @IsInt() @Min(0) reorderQty?: number;
  @IsOptional() @IsInt() @Min(1) unitsPerCarton?: number | null;
  @IsOptional() @IsInt() @Min(1) unitsPerPallet?: number | null;
  @IsOptional() @IsBoolean() isPackaging?: boolean;
  @IsOptional() @IsBoolean() trackBatches?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ProductQuery extends PaginationQuery {
  @IsOptional() @IsString() category?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  lowStock?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}

export class PickFaceDto {
  @IsString() locationId: string;
  @Type(() => Number) @IsInt() @Min(0) minQty: number;
  @Type(() => Number) @IsInt() @Min(1) maxQty: number;
}
