import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/types';
import { PdfService } from '../pdf/pdf.service';
import { AttachDto, CreateHandlingUnitDto, HandlingUnitQuery, MoveHandlingUnitDto } from './handling-units.dto';
import { HandlingUnitsService } from './handling-units.service';

@ApiTags('handling-units')
@ApiBearerAuth()
@Controller('handling-units')
export class HandlingUnitsController {
  constructor(
    private readonly units: HandlingUnitsService,
    private readonly pdf: PdfService,
  ) {}

  @Get()
  findAll(@Query() q: HandlingUnitQuery) {
    return this.units.findAll(q);
  }

  @Get('by-code/:code')
  findByCode(@Param('code') code: string) {
    return this.units.findByCode(code);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.units.findOne(id);
  }

  @Get(':id/label')
  async label(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdf.palletLabel(await this.units.findOne(id));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="label-${id}.pdf"` });
    res.send(buffer);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post()
  create(@Body() dto: CreateHandlingUnitDto) {
    return this.units.create(dto);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post(':id/move')
  move(@Param('id') id: string, @Body() dto: MoveHandlingUnitDto, @CurrentUser() user: AuthUser) {
    return this.units.move(id, dto, user.id);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post(':id/attach')
  attach(@Param('id') id: string, @Body() dto: AttachDto) {
    return this.units.attach(id, dto);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post(':id/detach')
  detach(@Param('id') id: string) {
    return this.units.detach(id);
  }
}
