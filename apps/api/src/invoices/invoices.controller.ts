import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/types';
import { PdfService } from '../pdf/pdf.service';
import { FromIssuesDto, InvoiceQuery, ManualInvoiceDto, MarkPaidDto, PurchaseFromReceiptDto } from './invoices.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@ApiBearerAuth()
@Roles(Role.MANAGER, Role.ACCOUNTANT)
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly pdf: PdfService,
  ) {}

  @Get()
  findAll(@Query() q: InvoiceQuery) {
    return this.invoices.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoices.findOne(id);
  }

  @Get(':id/pdf')
  async document(@Param('id') id: string, @Res() res: Response) {
    const invoice = await this.invoices.findOne(id);
    const buffer = await this.pdf.invoice(invoice);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.number.replace(/\//g, '-')}.pdf"`,
    });
    res.send(buffer);
  }

  @Post('from-issues')
  fromIssues(@Body() dto: FromIssuesDto, @CurrentUser() user: AuthUser) {
    return this.invoices.createFromIssues(dto, user.id);
  }

  @Post('manual')
  manual(@Body() dto: ManualInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoices.createManual(dto, user.id);
  }

  @Post('purchase')
  purchase(@Body() dto: PurchaseFromReceiptDto, @CurrentUser() user: AuthUser) {
    return this.invoices.createPurchase(dto, user.id);
  }

  @Post(':id/paid')
  markPaid(@Param('id') id: string, @Body() dto: MarkPaidDto) {
    return this.invoices.markPaid(id, dto);
  }

  @Post(':id/unpaid')
  markUnpaid(@Param('id') id: string) {
    return this.invoices.markUnpaid(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.invoices.cancel(id);
  }
}
