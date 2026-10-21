import { Module } from '@nestjs/common';
import { HandlingUnitsModule } from '../handling-units/handling-units.module';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

@Module({ imports: [HandlingUnitsModule], controllers: [ReceiptsController], providers: [ReceiptsService] })
export class ReceiptsModule {}
