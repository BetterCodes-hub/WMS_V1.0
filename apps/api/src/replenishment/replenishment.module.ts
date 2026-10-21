import { Module } from '@nestjs/common';
import { ReplenishmentController } from './replenishment.controller';
import { ReplenishmentService } from './replenishment.service';

@Module({ controllers: [ReplenishmentController], providers: [ReplenishmentService] })
export class ReplenishmentModule {}
