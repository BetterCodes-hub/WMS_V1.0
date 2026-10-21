import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AlertStatus, Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/types';
import { AlertsService } from './alerts.service';

@ApiTags('alerts')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', ...Object.values(AlertStatus)] })
  @Get()
  findAll(@Query('status') status?: AlertStatus | 'ACTIVE') {
    return this.alerts.findAll(status);
  }

  @Get('summary')
  summary() {
    return this.alerts.summary();
  }

  @Post(':id/acknowledge')
  acknowledge(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.alerts.acknowledge(id, user.id);
  }

  @Roles(Role.MANAGER)
  @Post('recalculate')
  recalculate() {
    return this.alerts.recalculateAll();
  }
}
