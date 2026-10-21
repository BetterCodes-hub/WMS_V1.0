import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/types';
import { HandlingUnitsService } from '../handling-units/handling-units.service';
import { PdfService } from '../pdf/pdf.service';
import {
  CreateReceiptDto, ReceiptLineDto, ReceiptQuery, ReceiveDto, UpdateReceiptDto, UpdateReceiptLineDto,
} from './receipts.dto';
import { ReceiptsService } from './receipts.service';

@ApiTags('receipts')
@ApiBearerAuth()
@Controller('receipts')
export class ReceiptsController {
  constructor(
    private readonly receipts: ReceiptsService,
    private readonly pdf: PdfService,
    private readonly units: HandlingUnitsService,
  ) {}

  @Get()
  findAll(@Query() q: ReceiptQuery) {
    return this.receipts.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.receipts.findOne(id);
  }

  @Get(':id/pdf')
  async document(@Param('id') id: string, @Res() res: Response) {
    const receipt = await this.receipts.findOne(id);
    const buffer = await this.pdf.goodsReceipt(receipt);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${receipt.number.replace(/\//g, '-')}.pdf"`,
    });
    res.send(buffer);
  }

  /** Etykiety wszystkich palet z przyjęcia (wielostronicowy PDF A6). */
  @Get(':id/labels')
  async labels(@Param('id') id: string, @Res() res: Response) {
    const receipt = await this.receipts.findOne(id);
    const units = await Promise.all(receipt.handlingUnits.map((h) => this.units.findOne(h.id)));
    if (!units.length) throw new NotFoundException('Przyjęcie nie zawiera palet');
    const buffer = await this.pdf.palletLabel(units);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="etykiety.pdf"` });
    res.send(buffer);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post()
  create(@Body() dto: CreateReceiptDto, @CurrentUser() user: AuthUser) {
    return this.receipts.create(dto, user.id);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateReceiptDto) {
    return this.receipts.update(id, dto);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: ReceiptLineDto) {
    return this.receipts.addLine(id, dto);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Patch(':id/lines/:lineId')
  updateLine(@Param('id') id: string, @Param('lineId') lineId: string, @Body() dto: UpdateReceiptLineDto) {
    return this.receipts.updateLine(id, lineId, dto);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Delete(':id/lines/:lineId')
  removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    return this.receipts.removeLine(id, lineId);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post(':id/receive')
  receive(@Param('id') id: string, @Body() dto: ReceiveDto, @CurrentUser() user: AuthUser) {
    return this.receipts.receive(id, dto, user.id);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.receipts.complete(id);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.receipts.cancel(id);
  }
}
