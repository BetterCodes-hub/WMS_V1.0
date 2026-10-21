import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AccountingModule } from './accounting/accounting.module';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ContractorsModule } from './contractors/contractors.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EventsModule } from './events/events.module';
import { HandlingUnitsModule } from './handling-units/handling-units.module';
import { HealthController } from './health.controller';
import { InventoryModule } from './inventory/inventory.module';
import { InvoicesModule } from './invoices/invoices.module';
import { IssuesModule } from './issues/issues.module';
import { LocationsModule } from './locations/locations.module';
import { PdfModule } from './pdf/pdf.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { ReplenishmentModule } from './replenishment/replenishment.module';
import { SequenceModule } from './sequence/sequence.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '12h') },
      }),
    }),
    PrismaModule,
    SequenceModule,
    EventsModule,
    SettingsModule,
    AlertsModule,
    InventoryModule,
    PdfModule,
    AuthModule,
    UsersModule,
    ContractorsModule,
    ProductsModule,
    LocationsModule,
    HandlingUnitsModule,
    ReplenishmentModule,
    ReceiptsModule,
    IssuesModule,
    InvoicesModule,
    AccountingModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
