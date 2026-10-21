import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateProductDto, PickFaceDto, ProductQuery, UpdateProductDto } from './products.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  findAll(@Query() q: ProductQuery) {
    return this.products.findAll(q);
  }

  @Get('categories')
  categories() {
    return this.products.categories();
  }

  @Get('by-code/:code')
  findByCode(@Param('code') code: string) {
    return this.products.findByCode(code);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }

  @Roles(Role.MANAGER)
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Roles(Role.MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Roles(Role.MANAGER)
  @Put(':id/pick-faces')
  setPickFace(@Param('id') id: string, @Body() dto: PickFaceDto) {
    return this.products.setPickFace(id, dto);
  }

  @Roles(Role.MANAGER)
  @Delete(':id/pick-faces/:pickFaceId')
  removePickFace(@Param('id') id: string, @Param('pickFaceId') pickFaceId: string) {
    return this.products.removePickFace(id, pickFaceId);
  }
}
