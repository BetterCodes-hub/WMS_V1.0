import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto, GenerateLocationsDto, LocationQuery, UpdateLocationDto } from './locations.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(q: LocationQuery) {
    const where: Prisma.LocationWhereInput = {
      ...(q.includeInactive ? {} : { active: true }),
      ...(q.type ? { type: q.type } : {}),
      ...(q.zone ? { zone: q.zone } : {}),
      ...(q.search ? { code: { contains: q.search.toUpperCase() } } : {}),
    };
    const locations = await this.prisma.location.findMany({ where, orderBy: { code: 'asc' } });

    const usage = await this.prisma.stockItem.groupBy({
      by: ['locationId'],
      where: { locationId: { in: locations.map((l) => l.id) }, quantity: { gt: 0 } },
      _sum: { quantity: true },
      _count: { productId: true },
    });
    const pallets = await this.prisma.handlingUnit.groupBy({
      by: ['locationId'],
      where: { locationId: { in: locations.map((l) => l.id) }, status: 'ACTIVE', parentId: null, type: 'PALLET' },
      _count: { _all: true },
    });
    const usageMap = new Map(usage.map((u) => [u.locationId, u]));
    const palletMap = new Map(pallets.map((p) => [p.locationId, p._count._all]));

    return locations.map((l) => ({
      ...l,
      totalQty: usageMap.get(l.id)?._sum.quantity ?? 0,
      stockLines: usageMap.get(l.id)?._count.productId ?? 0,
      pallets: palletMap.get(l.id) ?? 0,
    }));
  }

  async findOne(id: string) {
    return this.prisma.location.findUniqueOrThrow({
      where: { id },
      include: {
        stock: {
          where: { quantity: { gt: 0 } },
          include: { product: true, handlingUnit: { select: { id: true, code: true, type: true } } },
          orderBy: { product: { sku: 'asc' } },
        },
        pickFaces: { include: { product: true } },
      },
    });
  }

  async findByCode(code: string) {
    return this.prisma.location.findUniqueOrThrow({ where: { code: code.toUpperCase() } });
  }

  create(dto: CreateLocationDto) {
    return this.prisma.location.create({ data: dto });
  }

  async update(id: string, dto: UpdateLocationDto) {
    if (dto.active === false) {
      const stock = await this.prisma.stockItem.count({ where: { locationId: id, quantity: { gt: 0 } } });
      if (stock > 0) throw new BadRequestException('Nie można dezaktywować lokalizacji, na której jest towar');
    }
    return this.prisma.location.update({ where: { id }, data: dto });
  }

  async generate(dto: GenerateLocationsDto) {
    const data: Prisma.LocationCreateManyInput[] = [];
    const pad = (n: number) => String(n).padStart(2, '0');
    for (let a = 1; a <= dto.aisles; a++)
      for (let r = 1; r <= dto.racks; r++)
        for (let l = 1; l <= dto.levels; l++)
          data.push({
            code: `${dto.zone}-${pad(a)}-${pad(r)}-${pad(l)}`,
            zone: dto.zone,
            type: dto.type,
            maxPallets: dto.maxPallets ?? null,
          });
    const result = await this.prisma.location.createMany({ data, skipDuplicates: true });
    return { created: result.count, skipped: data.length - result.count };
  }

  async zones(): Promise<string[]> {
    const rows = await this.prisma.location.findMany({ distinct: ['zone'], select: { zone: true }, orderBy: { zone: 'asc' } });
    return rows.map((r) => r.zone);
  }
}
