import { Body, Controller, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/types';
import { PdfService } from '../pdf/pdf.service';
import { CreateIssueDto, IssueQuery, UpdateIssueDto } from './issues.dto';
import { IssuesService } from './issues.service';

@ApiTags('issues')
@ApiBearerAuth()
@Controller('issues')
export class IssuesController {
  constructor(
    private readonly issues: IssuesService,
    private readonly pdf: PdfService,
  ) {}

  @Get()
  findAll(@Query() q: IssueQuery) {
    return this.issues.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.issues.findOne(id);
  }

  @Get(':id/pdf')
  async document(@Param('id') id: string, @Res() res: Response) {
    const issue = await this.issues.findOne(id);
    const buffer = await this.pdf.goodsIssue(issue);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${issue.number.replace(/\//g, '-')}.pdf"`,
    });
    res.send(buffer);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post()
  create(@Body() dto: CreateIssueDto, @CurrentUser() user: AuthUser) {
    return this.issues.create(dto, user.id);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateIssueDto) {
    return this.issues.update(id, dto);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.issues.confirm(id, user.id);
  }

  @Roles(Role.MANAGER, Role.OPERATOR)
  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.issues.cancel(id);
  }

  @Roles(Role.MANAGER)
  @Post(':id/reverse')
  reverse(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.issues.reverse(id, user.id);
  }
}
