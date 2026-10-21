import { Global, Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockService } from './stock.service';

@Global()
@Module({
  controllers: [InventoryController],
  providers: [StockService, InventoryService],
  exports: [StockService, InventoryService],
})
export class InventoryModule {}
