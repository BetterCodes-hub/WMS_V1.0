import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { ContractorQuery, CreateContractorDto, UpdateContractorDto } from './contractors.dto';
import { ContractorsService } from './contractors.service';

@ApiTags('contractors')
@ApiBearerAuth()
@Controller('contractors')
export class ContractorsController {
  constructor(private readonly contractors: ContractorsService) {}

  @Get()
  findAll(@Query() q: ContractorQuery) {
    return this.contractors.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractors.findOne(id);
  }

  @Roles(Role.MANAGER, Role.ACCOUNTANT)
  @Post()
  create(@Body() dto: CreateContractorDto) {
    return this.contractors.create(dto);
  }

  @Roles(Role.MANAGER, Role.ACCOUNTANT)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContractorDto) {
    return this.contractors.update(id, dto);
  }
}
