import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@wms.local' })
  @IsEmail({}, { message: 'Nieprawidłowy adres e-mail' })
  email: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(1)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'Hasło musi mieć co najmniej 8 znaków' })
  newPassword: string;
}
