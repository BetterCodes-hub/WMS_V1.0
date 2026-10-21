import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/types';
import { AdjustDto, ExpiringQuery, InventoryQuery, MovementQuery, SummaryQuery, TransferDto } from './inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(@Query() q: InventoryQuery) {
    return this.inventory.list(q);
  }

  @Get('summary')
  summary(@Query() q: SummaryQuery) {
    return this.inventory.summary(q);
  }

  @Get('value')
  value() {
    return this.inventory.totalValue();
  }

  @Get('movements')
  movements(@Query() q: MovementQuery) {
    return this.inventory.movements(q);
  }

  @Get('expiring')
  expiring(@Query() q: ExpiringQuery) {
    return this.inventory.expiring(q);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post('transfer')
  transfer(@Body() dto: TransferDto, @CurrentUser() user: AuthUser) {
    return this.inventory.transfer(dto, user.id);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post('adjust')
  adjust(@Body() dto: AdjustDto, @CurrentUser() user: AuthUser) {
    return this.inventory.adjust(dto, user.id);
  }
}
