import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateLocationDto, GenerateLocationsDto, LocationQuery, UpdateLocationDto } from './locations.dto';
import { LocationsService } from './locations.service';

@ApiTags('locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  findAll(@Query() q: LocationQuery) {
    return this.locations.findAll(q);
  }

  @Get('zones')
  zones() {
    return this.locations.zones();
  }

  @Get('by-code/:code')
  findByCode(@Param('code') code: string) {
    return this.locations.findByCode(code);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.locations.findOne(id);
  }

  @Roles(Role.MANAGER)
  @Post()
  create(@Body() dto: CreateLocationDto) {
    return this.locations.create(dto);
  }

  @Roles(Role.MANAGER)
  @Post('generate')
  generate(@Body() dto: GenerateLocationsDto) {
    return this.locations.generate(dto);
  }

  @Roles(Role.MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.locations.update(id, dto);
  }
}
