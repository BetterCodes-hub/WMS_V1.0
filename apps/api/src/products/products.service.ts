import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType, Prisma } from '@prisma/client';
import { paginated } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from '../alerts/alerts.service';
import { CreateProductDto, PickFaceDto, ProductQuery, UpdateProductDto } from './products.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
  ) {}

  /** Łączne stany (bez kwarantanny) dla listy produktów. */
  async stockTotals(productIds: string[]): Promise<Map<string, number>> {
    if (!productIds.length) return new Map();
    const rows = await this.prisma.stockItem.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, location: { type: { not: LocationType.QUARANTINE } } },
      _sum: { quantity: true },
    });
    return new Map(rows.map((r) => [r.productId, r._sum.quantity ?? 0]));
  }

  async findAll(q: ProductQuery) {
    const where: Prisma.ProductWhereInput = {
      ...(q.includeInactive ? {} : { active: true }),
      ...(q.category ? { category: q.category } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { sku: { contains: q.search, mode: 'insensitive' } },
              { ean: { contains: q.search } },
            ],
          }
        : {}),
    };

    if (q.lowStock) {
      // filtr po wartości wyliczanej — produkty z otwartym alertem
      where.alerts = { some: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } } };
    }

    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { sku: 'asc' },
        skip: q.skip,
        take: q.pageSize,
        include: { pickFaces: { include: { location: { select: { code: true } } } } },
      }),
      this.prisma.product.count({ where }),
    ]);
    const totals = await this.stockTotals(products.map((p) => p.id));
    const items = products.map((p) => {
      const stock = totals.get(p.id) ?? 0;
      return { ...p, stock, belowMin: p.minStock > 0 && stock < p.minStock };
    });
    return paginated(items, total, q);
  }

  async categories(): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { category: { not: null } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return rows.map((r) => r.category!);
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        pickFaces: { include: { location: true } },
        stock: {
          where: { quantity: { gt: 0 } },
          include: { location: true, handlingUnit: { select: { id: true, code: true, type: true } } },
          orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
        },
        alerts: { where: { status: { not: 'RESOLVED' } } },
      },
    });
    if (!product) throw new NotFoundException('Nie znaleziono produktu');
    const stock = product.stock
      .filter((s) => s.location.type !== LocationType.QUARANTINE)
      .reduce((sum, s) => sum + s.quantity, 0);
    return { ...product, totalStock: stock, stockValue: stock * product.avgCost };
  }

  async findByCode(code: string) {
    const product = await this.prisma.product.findFirst({
      where: { OR: [{ sku: code.toUpperCase() }, { ean: code }] },
    });
    if (!product) throw new NotFoundException(`Nie znaleziono produktu o kodzie ${code}`);
    return product;
  }

  async create(dto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: { ...dto, ean: dto.ean || null, avgCost: dto.purchasePrice },
    });
    await this.alerts.evaluate([product.id]);
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.update({
      where: { id },
      data: { ...dto, ...(dto.ean !== undefined ? { ean: dto.ean || null } : {}) },
    });
    // zmiana progu minimalnego może otworzyć lub zamknąć alert
    if (dto.minStock !== undefined || dto.active !== undefined) await this.alerts.evaluate([id]);
    return product;
  }

  async setPickFace(productId: string, dto: PickFaceDto) {
    if (dto.minQty >= dto.maxQty) throw new BadRequestException('Minimum musi być mniejsze od maksimum');
    const location = await this.prisma.location.findUniqueOrThrow({ where: { id: dto.locationId } });
    if (location.type !== LocationType.PICKING) {
      throw new BadRequestException('Miejscem kompletacji może być tylko lokalizacja typu PICKING');
    }
    return this.prisma.pickFace.upsert({
      where: { productId_locationId: { productId, locationId: dto.locationId } },
      create: { productId, ...dto },
      update: { minQty: dto.minQty, maxQty: dto.maxQty },
      include: { location: true },
    });
  }

  removePickFace(productId: string, pickFaceId: string) {
    return this.prisma.pickFace.delete({ where: { id: pickFaceId, productId } });
  }
}
