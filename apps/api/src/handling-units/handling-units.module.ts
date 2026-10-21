import { Module } from '@nestjs/common';
import { HandlingUnitsController } from './handling-units.controller';
import { HandlingUnitsService } from './handling-units.service';

@Module({ controllers: [HandlingUnitsController], providers: [HandlingUnitsService], exports: [HandlingUnitsService] })
export class HandlingUnitsModule {}
