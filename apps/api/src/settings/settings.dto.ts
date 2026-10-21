import { IsEmail, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

export class UpdateCompanyDto {
  @IsString()
  @MinLength(2)
  name: string;

  @Matches(/^\d{10}$/, { message: 'NIP musi składać się z 10 cyfr' })
  nip: string;

  @IsString()
  street: string;

  @Matches(/^\d{2}-\d{3}$/, { message: 'Kod pocztowy w formacie 00-000' })
  postalCode: string;

  @IsString()
  city: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsInt()
  @Min(0)
  @Max(180)
  invoicePaymentDays: number;

  @IsInt()
  @Min(1)
  @Max(365)
  expiryWarningDays: number;
}
