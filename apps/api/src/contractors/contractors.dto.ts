import { PartialType } from '@nestjs/swagger';
import { ContractorType } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength, ValidateIf } from 'class-validator';
import { PaginationQuery } from '../common/pagination';

export class CreateContractorDto {
  @IsEnum(ContractorType)
  type: ContractorType;

  @IsString()
  @MinLength(2, { message: 'Nazwa jest wymagana' })
  name: string;

  @IsOptional()
  @IsString()
  shortName?: string;

  @IsOptional()
  @ValidateIf((o) => o.nip !== '')
  @Matches(/^\d{10}$/, { message: 'NIP musi składać się z 10 cyfr' })
  nip?: string;

  @IsOptional() @IsString() street?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;

  @IsOptional()
  @ValidateIf((o) => o.email !== '')
  @IsEmail({}, { message: 'Nieprawidłowy adres e-mail' })
  email?: string;

  @IsOptional() @IsString() phone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  paymentDays?: number;
}

export class UpdateContractorDto extends PartialType(CreateContractorDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ContractorQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(ContractorType)
  type?: ContractorType;
}
