import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateCompanyDto } from './settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('company')
  get() {
    return this.settings.get();
  }

  @Roles(Role.MANAGER, Role.ACCOUNTANT)
  @Put('company')
  update(@Body() dto: UpdateCompanyDto) {
    return this.settings.update(dto);
  }
}
