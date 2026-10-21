import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { HandlingUnitStatus, HandlingUnitType, LocationType, MovementType, Prisma } from '@prisma/client';
import { paginated } from '../common/pagination';
import { StockService } from '../inventory/stock.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';
import { AttachDto, CreateHandlingUnitDto, HandlingUnitQuery, MoveHandlingUnitDto } from './handling-units.dto';

type HuWithRelations = Prisma.HandlingUnitGetPayload<{
  include: {
    location: true;
    stock: { include: { product: { select: { id: true; sku: true; name: true; unit: true } } } };
  };
}>;

export interface HandlingUnitNode {
  id: string;
  code: string;
  type: HandlingUnitType;
  status: HandlingUnitStatus;
  stock: HuWithRelations['stock'];
  /** ilość sztuk bezpośrednio na jednostce */
  ownQty: number;
  /** ilość sztuk łącznie z jednostkami podrzędnymi */
  totalQty: number;
  children: HandlingUnitNode[];
}

@Injectable()
export class HandlingUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly sequence: SequenceService,
  ) {}

  async findAll(q: HandlingUnitQuery) {
    const where: Prisma.HandlingUnitWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      status: q.status ?? HandlingUnitStatus.ACTIVE,
      ...(q.locationId ? { locationId: q.locationId } : {}),
      ...(q.rootOnly ? { parentId: null } : {}),
      ...(q.search
        ? {
            OR: [
              { code: { contains: q.search } },
              { location: { code: { contains: q.search.toUpperCase() } } },
              { stock: { some: { product: { sku: { contains: q.search, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };
    const [units, total] = await this.prisma.$transaction([
      this.prisma.handlingUnit.findMany({
        where,
        include: {
          location: { select: { id: true, code: true, type: true } },
          parent: { select: { id: true, code: true } },
          receipt: { select: { id: true, number: true } },
          _count: { select: { children: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: q.skip,
        take: q.pageSize,
      }),
      this.prisma.handlingUnit.count({ where }),
    ]);

    // zawartość łącznie z jednostkami podrzędnymi
    const items = await Promise.all(
      units.map(async (u) => {
        const ids = await this.stock.descendantIds(this.prisma, u.id);
        const stock = await this.prisma.stockItem.groupBy({
          by: ['productId'],
          where: { handlingUnitId: { in: ids }, quantity: { gt: 0 } },
          _sum: { quantity: true },
        });
        const products = await this.prisma.product.findMany({
          where: { id: { in: stock.map((s) => s.productId) } },
          select: { id: true, sku: true, name: true },
        });
        return {
          ...u,
          childCount: u._count.children,
          totalQty: stock.reduce((s, r) => s + (r._sum.quantity ?? 0), 0),
          products: stock.map((s) => ({
            ...products.find((p) => p.id === s.productId)!,
            quantity: s._sum.quantity ?? 0,
          })),
        };
      }),
    );
    return paginated(items, total, q);
  }

  /** Szczegóły jednostki z pełnym drzewem zawartości i podsumowaniem per produkt. */
  async findOne(id: string) {
    const root = await this.prisma.handlingUnit.findUnique({
      where: { id },
      include: {
        location: true,
        parent: { select: { id: true, code: true, type: true } },
        receipt: { select: { id: true, number: true, supplier: { select: { name: true } } } },
      },
    });
    if (!root) throw new NotFoundException('Nie znaleziono jednostki logistycznej');

    const ids = await this.stock.descendantIds(this.prisma, id);
    const units: HuWithRelations[] = await this.prisma.handlingUnit.findMany({
      where: { id: { in: ids } },
      include: {
        location: true,
        stock: {
          where: { quantity: { gt: 0 } },
          include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });
    const parentOf = new Map<string, string | null>();
    const raw = await this.prisma.handlingUnit.findMany({ where: { id: { in: ids } }, select: { id: true, parentId: true } });
    raw.forEach((r) => parentOf.set(r.id, r.parentId));

    const build = (unitId: string): HandlingUnitNode => {
      const u = units.find((x) => x.id === unitId)!;
      const children = units.filter((x) => parentOf.get(x.id) === unitId).map((c) => build(c.id));
      const ownQty = u.stock.reduce((s, i) => s + i.quantity, 0);
      return {
        id: u.id,
        code: u.code,
        type: u.type,
        status: u.status,
        stock: u.stock,
        ownQty,
        totalQty: ownQty + children.reduce((s, c) => s + c.totalQty, 0),
        children,
      };
    };
    const tree = build(id);

    const byProduct = new Map<string, { product: HuWithRelations['stock'][number]['product']; quantity: number; units: number }>();
    for (const u of units) {
      for (const s of u.stock) {
        const entry = byProduct.get(s.productId) ?? { product: s.product, quantity: 0, units: 0 };
        entry.quantity += s.quantity;
        entry.units += 1;
        byProduct.set(s.productId, entry);
      }
    }

    const history = await this.prisma.stockMovement.findMany({
      where: { handlingUnitId: { in: ids } },
      include: {
        product: { select: { sku: true, name: true, unit: true } },
        fromLocation: { select: { code: true } },
        toLocation: { select: { code: true } },
        handlingUnit: { select: { code: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      ...root,
      tree,
      totalQty: tree.totalQty,
      cartonCount: units.filter((u) => u.type === HandlingUnitType.CARTON && u.id !== id).length,
      summary: [...byProduct.values()].sort((a, b) => a.product.sku.localeCompare(b.product.sku)),
      history,
    };
  }

  async findByCode(code: string) {
    const hu = await this.prisma.handlingUnit.findUnique({ where: { code: code.replace(/^\(00\)/, '') } });
    if (!hu) throw new NotFoundException(`Nie znaleziono jednostki ${code}`);
    return this.findOne(hu.id);
  }

  create(dto: CreateHandlingUnitDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.stock.assertLocationActive(tx, dto.locationId);
      if (dto.parentId) await this.assertCanBeParent(tx, dto.parentId, dto.locationId);
      const code = await this.sequence.sscc(tx, dto.type);
      // pusta jednostka jest "aktywna" — operator za chwilę na nią coś odłoży
      return tx.handlingUnit.create({
        data: { code, type: dto.type, locationId: dto.locationId, parentId: dto.parentId },
      });
    });
  }

  move(id: string, dto: MoveHandlingUnitDto, userId: string) {
    return this.stock.run(async (tx, touched) => {
      const [hu, target] = await Promise.all([
        tx.handlingUnit.findUniqueOrThrow({ where: { id }, include: { location: true } }),
        tx.location.findUniqueOrThrow({ where: { id: dto.toLocationId } }),
      ]);
      const type =
        hu.location?.type === LocationType.RECEIVING && target.type === LocationType.STORAGE
          ? MovementType.PUTAWAY
          : MovementType.TRANSFER;
      const result = await this.stock.moveHandlingUnit(tx, {
        handlingUnitId: id,
        toLocationId: dto.toLocationId,
        userId,
        type,
      });
      result.productIds.forEach((p) => touched.add(p));
      return { ok: true, movedItems: result.items, type };
    });
  }

  /** Dołączenie kartonu / palety do palety matczynej (w tej samej lokalizacji). */
  attach(id: string, dto: AttachDto) {
    return this.prisma.$transaction(async (tx) => {
      if (id === dto.parentId) throw new BadRequestException('Jednostka nie może być swoim rodzicem');
      const hu = await tx.handlingUnit.findUniqueOrThrow({ where: { id } });
      await this.assertCanBeParent(tx, dto.parentId, hu.locationId);
      const descendants = await this.stock.descendantIds(tx, id);
      if (descendants.includes(dto.parentId)) {
        throw new BadRequestException('Nie można utworzyć cyklu w hierarchii jednostek');
      }
      const updated = await tx.handlingUnit.update({ where: { id }, data: { parentId: dto.parentId } });
      await this.stock.refreshHandlingUnits(tx, [dto.parentId, ...(hu.parentId ? [hu.parentId] : [])]);
      return updated;
    });
  }

  detach(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const hu = await tx.handlingUnit.findUniqueOrThrow({ where: { id } });
      if (!hu.parentId) throw new BadRequestException('Jednostka nie jest przypisana do palety matczynej');
      const updated = await tx.handlingUnit.update({ where: { id }, data: { parentId: null } });
      await this.stock.refreshHandlingUnits(tx, [hu.parentId]);
      return updated;
    });
  }

  private async assertCanBeParent(tx: Prisma.TransactionClient, parentId: string, locationId: string | null) {
    const parent = await tx.handlingUnit.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Nie znaleziono palety matczynej');
    if (parent.type !== HandlingUnitType.PALLET) throw new BadRequestException('Jednostką nadrzędną może być tylko paleta');
    if (parent.locationId !== locationId) {
      throw new BadRequestException('Paleta matczyna znajduje się w innej lokalizacji');
    }
    return parent;
  }
}
