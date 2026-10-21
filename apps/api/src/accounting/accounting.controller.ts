import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { ExportQuery, PeriodQuery } from './accounting.dto';
import { AccountingService } from './accounting.service';

@ApiTags('accounting')
@ApiBearerAuth()
@Roles(Role.MANAGER, Role.ACCOUNTANT)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('summary')
  summary(@Query() q: PeriodQuery) {
    return this.accounting.summary(q);
  }

  @Get('pending')
  pending() {
    return this.accounting.pending();
  }

  @Get('export/invoices')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportInvoices(@Query() q: ExportQuery, @Res() res: Response) {
    res.set('Content-Disposition', `attachment; filename="rejestr-faktur.csv"`);
    res.send(await this.accounting.exportInvoices(q));
  }

  @Get('export/documents')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportDocuments(@Query() q: PeriodQuery, @Res() res: Response) {
    res.set('Content-Disposition', `attachment; filename="rejestr-dokumentow.csv"`);
    res.send(await this.accounting.exportDocuments(q));
  }
}
