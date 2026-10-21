import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/types';
import { CompleteTaskDto, CreateTaskDto, GenerateTasksDto, TaskQuery } from './replenishment.dto';
import { ReplenishmentService } from './replenishment.service';

@ApiTags('replenishment')
@ApiBearerAuth()
@Controller('replenishment')
export class ReplenishmentController {
  constructor(private readonly replenishment: ReplenishmentService) {}

  @Get()
  overview() {
    return this.replenishment.overview();
  }

  @Get('tasks')
  tasks(@Query() q: TaskQuery) {
    return this.replenishment.listTasks(q);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post('generate')
  generate(@Body() dto: GenerateTasksDto, @CurrentUser() user: AuthUser) {
    return this.replenishment.generate(dto, user.id);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post('tasks')
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthUser) {
    return this.replenishment.createTask(dto, user.id);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post('tasks/:id/complete')
  complete(@Param('id') id: string, @Body() dto: CompleteTaskDto, @CurrentUser() user: AuthUser) {
    return this.replenishment.completeTask(id, dto, user.id);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post('tasks/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.replenishment.cancelTask(id);
  }
}
