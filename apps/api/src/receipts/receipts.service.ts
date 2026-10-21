import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  HandlingUnitType, LocationType, MovementType, Prisma, ReceiptMode, ReceiptStatus,
} from '@prisma/client';
import { paginated } from '../common/pagination';
import { Tx } from '../common/types';
import { weightedAverageCost } from '../common/utils/money';
import { EventsService } from '../events/events.service';
import { StockService } from '../inventory/stock.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';
import {
  CreateReceiptDto, ReceiptLineDto, ReceiptQuery, ReceiveDto, UpdateReceiptDto, UpdateReceiptLineDto,
} from './receipts.dto';

const OPEN_STATUSES: ReceiptStatus[] = [ReceiptStatus.DRAFT, ReceiptStatus.RECEIVING];

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly sequence: SequenceService,
    private readonly events: EventsService,
  ) {}

  async findAll(q: ReceiptQuery) {
    const where: Prisma.GoodsReceiptWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.supplierId ? { supplierId: q.supplierId } : {}),
      ...(q.search
        ? {
            OR: [
              { number: { contains: q.search, mode: 'insensitive' } },
              { supplierDocNo: { contains: q.search, mode: 'insensitive' } },
              { supplier: { name: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [receipts, total] = await this.prisma.$transaction([
      this.prisma.goodsReceipt.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          lines: { select: { expectedQty: true, receivedQty: true, unitPrice: true } },
          purchaseInvoice: { select: { id: true, number: true } },
          _count: { select: { handlingUnits: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: q.skip,
        take: q.pageSize,
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);
    const items = receipts.map(({ lines, _count, ...r }) => {
      const expected = lines.reduce((s, l) => s + l.expectedQty, 0);
      const received = lines.reduce((s, l) => s + l.receivedQty, 0);
      return {
        ...r,
        lineCount: lines.length,
        expectedQty: expected,
        receivedQty: received,
        receivedValue: lines.reduce((s, l) => s + l.receivedQty * l.unitPrice, 0),
        progress: expected ? Math.round((received / expected) * 100) : 0,
        palletCount: _count.handlingUnits,
      };
    });
    return paginated(items, total, q);
  }

  async findOne(id: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      include: {
        supplier: true,
        createdBy: { select: { name: true } },
        purchaseInvoice: { select: { id: true, number: true, externalNumber: true, netTotal: true, grossTotal: true } },
        lines: {
          include: {
            product: {
              select: { id: true, sku: true, name: true, unit: true, ean: true, unitsPerPallet: true, unitsPerCarton: true, trackBatches: true, vatRate: true },
            },
            entries: {
              include: {
                handlingUnit: { select: { id: true, code: true, type: true, parentId: true } },
                user: { select: { name: true } },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { product: { sku: 'asc' } },
        },
        handlingUnits: {
          where: { parentId: null },
          include: { location: { select: { code: true, type: true } }, _count: { select: { children: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!receipt) throw new NotFoundException('Nie znaleziono przyjęcia');

    const lines = receipt.lines.map((l) => ({
      ...l,
      difference: l.receivedQty - l.expectedQty,
      value: l.receivedQty * l.unitPrice,
    }));
    return {
      ...receipt,
      lines,
      totals: {
        expectedQty: lines.reduce((s, l) => s + l.expectedQty, 0),
        receivedQty: lines.reduce((s, l) => s + l.receivedQty, 0),
        expectedValue: lines.reduce((s, l) => s + l.expectedQty * l.unitPrice, 0),
        receivedValue: lines.reduce((s, l) => s + l.value, 0),
        discrepancies: lines.filter((l) => l.difference !== 0).length,
      },
    };
  }

  async create(dto: CreateReceiptDto, userId: string) {
    const lines = await this.prepareLines(dto.lines);
    const receipt = await this.prisma.$transaction(async (tx) =>
      tx.goodsReceipt.create({
        data: {
          number: await this.sequence.documentNumber(tx, 'PZ'),
          supplierId: dto.supplierId,
          supplierDocNo: dto.supplierDocNo,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
          notes: dto.notes,
          createdById: userId,
          lines: { create: lines },
        },
      }),
    );
    this.events.emit('receipt.changed', { id: receipt.id });
    return receipt;
  }

  async update(id: string, dto: UpdateReceiptDto) {
    await this.assertOpen(this.prisma, id);
    return this.prisma.goodsReceipt.update({
      where: { id },
      data: { ...dto, expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined },
    });
  }

  async addLine(id: string, dto: ReceiptLineDto) {
    await this.assertOpen(this.prisma, id);
    const [line] = await this.prepareLines([dto]);
    return this.prisma.goodsReceiptLine.create({ data: { ...line, receiptId: id } });
  }

  async updateLine(id: string, lineId: string, dto: UpdateReceiptLineDto) {
    await this.assertOpen(this.prisma, id);
    const line = await this.prisma.goodsReceiptLine.findFirstOrThrow({ where: { id: lineId, receiptId: id } });
    if (dto.unitPrice !== undefined && line.receivedQty > 0 && dto.unitPrice !== line.unitPrice) {
      throw new BadRequestException('Nie można zmienić ceny pozycji, która została już częściowo przyjęta');
    }
    return this.prisma.goodsReceiptLine.update({
      where: { id: lineId },
      data: { ...dto, expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined },
    });
  }

  async removeLine(id: string, lineId: string) {
    await this.assertOpen(this.prisma, id);
    const line = await this.prisma.goodsReceiptLine.findFirstOrThrow({ where: { id: lineId, receiptId: id } });
    if (line.receivedQty > 0) throw new BadRequestException('Nie można usunąć pozycji z przyjętym towarem');
    return this.prisma.goodsReceiptLine.delete({ where: { id: lineId } });
  }

  /**
   * Zaksięgowanie przyjęcia towaru. Tworzy stany, jednostki logistyczne (palety / kartony)
   * z numerami SSCC, ruchy magazynowe oraz aktualizuje średni koszt zakupu.
   */
  async receive(id: string, dto: ReceiveDto, userId: string) {
    const result = await this.stock.run(async (tx, touched) => {
      const receipt = await this.assertOpen(tx, id);
      const line = await tx.goodsReceiptLine.findFirst({
        where: { id: dto.lineId, receiptId: id },
        include: { product: true },
      });
      if (!line) throw new NotFoundException('Nie znaleziono pozycji przyjęcia');

      const batch = dto.batch ?? line.batch ?? null;
      const expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : line.expiryDate;
      if (line.product.trackBatches && !batch) {
        throw new BadRequestException(`Produkt ${line.product.sku} wymaga podania numeru partii`);
      }

      const location = dto.locationId
        ? await this.stock.assertLocationActive(tx, dto.locationId)
        : await tx.location.findFirst({ where: { type: LocationType.RECEIVING, active: true }, orderBy: { code: 'asc' } });
      if (!location) throw new BadRequestException('Brak aktywnej lokalizacji przyjęć — utwórz lokalizację typu RECEIVING');

      const totalQty =
        dto.mode === ReceiptMode.PIECE
          ? dto.quantity!
          : dto.mode === ReceiptMode.PALLET
            ? dto.palletCount! * dto.qtyPerPallet!
            : dto.cartonCount! * dto.qtyPerCarton!;

      // średni ważony koszt — przed dodaniem nowego towaru
      const currentQty = await this.stock.totalQuantity(tx, line.productId);
      await tx.product.update({
        where: { id: line.productId },
        data: { avgCost: weightedAverageCost(currentQty, line.product.avgCost, totalQty, line.unitPrice) },
      });

      const createdUnits: { id: string; code: string; type: HandlingUnitType }[] = [];
      const put = async (quantity: number, handlingUnitId: string | null) => {
        await this.stock.add(tx, {
          productId: line.productId,
          locationId: location.id,
          handlingUnitId,
          batch,
          expiryDate,
          quantity,
        });
        await this.stock.movement(tx, {
          type: MovementType.RECEIPT,
          productId: line.productId,
          quantity,
          userId,
          toLocationId: location.id,
          handlingUnitId,
          batch,
          documentNo: receipt.number,
        });
      };
      const newUnit = async (type: HandlingUnitType, parentId?: string) => {
        const unit = await tx.handlingUnit.create({
          data: {
            code: await this.sequence.sscc(tx, type),
            type,
            parentId,
            locationId: location.id,
            receiptId: receipt.id,
          },
        });
        createdUnits.push({ id: unit.id, code: unit.code, type });
        return unit;
      };
      const entry = (quantity: number, handlingUnitId: string | null) =>
        tx.receiptEntry.create({
          data: { lineId: line.id, mode: dto.mode, quantity, handlingUnitId, locationId: location.id, userId },
        });

      switch (dto.mode) {
        case ReceiptMode.PIECE: {
          let huId: string | null = null;
          if (dto.targetHandlingUnitId) {
            const hu = await tx.handlingUnit.findUnique({ where: { id: dto.targetHandlingUnitId } });
            if (!hu || hu.locationId !== location.id) {
              throw new BadRequestException('Wskazana paleta nie znajduje się w lokalizacji przyjęcia');
            }
            huId = hu.id;
          }
          await put(dto.quantity!, huId);
          await entry(dto.quantity!, huId);
          if (huId) await this.stock.refreshHandlingUnits(tx, [huId]);
          break;
        }
        case ReceiptMode.PALLET: {
          if (dto.palletCount! > 100) throw new BadRequestException('Maksymalnie 100 palet w jednej operacji');
          for (let i = 0; i < dto.palletCount!; i++) {
            const pallet = await newUnit(HandlingUnitType.PALLET);
            await put(dto.qtyPerPallet!, pallet.id);
            await entry(dto.qtyPerPallet!, pallet.id);
          }
          break;
        }
        case ReceiptMode.MIXED_PALLET: {
          if (dto.cartonCount! > 500) throw new BadRequestException('Maksymalnie 500 kartonów w jednej operacji');
          let mother;
          if (dto.motherPalletId) {
            mother = await tx.handlingUnit.findUnique({ where: { id: dto.motherPalletId } });
            if (!mother || mother.type !== HandlingUnitType.PALLET || mother.receiptId !== receipt.id) {
              throw new BadRequestException('Paleta matczyna musi pochodzić z tego przyjęcia');
            }
            if (mother.locationId !== location.id) {
              throw new BadRequestException('Paleta matczyna została już przeniesiona z miejsca przyjęcia');
            }
          } else {
            mother = await newUnit(HandlingUnitType.PALLET);
          }
          for (let i = 0; i < dto.cartonCount!; i++) {
            const carton = await newUnit(HandlingUnitType.CARTON, mother.id);
            await put(dto.qtyPerCarton!, carton.id);
          }
          await entry(totalQty, mother.id);
          await this.stock.refreshHandlingUnits(tx, [mother.id]);
          break;
        }
      }

      await tx.goodsReceiptLine.update({ where: { id: line.id }, data: { receivedQty: { increment: totalQty } } });
      if (receipt.status === ReceiptStatus.DRAFT) {
        await tx.goodsReceipt.update({ where: { id }, data: { status: ReceiptStatus.RECEIVING } });
      }
      touched.add(line.productId);

      return {
        received: totalQty,
        location: location.code,
        handlingUnits: createdUnits,
        overReceipt: line.receivedQty + totalQty > line.expectedQty,
      };
    });
    this.events.emit('receipt.changed', { id });
    return result;
  }

  async complete(id: string) {
    const receipt = await this.prisma.goodsReceipt.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    if (receipt.status !== ReceiptStatus.RECEIVING) {
      throw new BadRequestException(
        receipt.status === ReceiptStatus.DRAFT ? 'Nie przyjęto jeszcze żadnego towaru' : 'Przyjęcie jest już zamknięte',
      );
    }
    // pozycje bez przyjęcia usuwamy z dokumentu, aby PZ odzwierciedlał stan faktyczny
    const empty = receipt.lines.filter((l) => l.receivedQty === 0);
    await this.prisma.$transaction([
      this.prisma.goodsReceiptLine.deleteMany({ where: { id: { in: empty.map((l) => l.id) } } }),
      this.prisma.goodsReceipt.update({
        where: { id },
        data: { status: ReceiptStatus.COMPLETED, completedAt: new Date() },
      }),
    ]);
    this.events.emit('receipt.changed', { id });
    return this.findOne(id);
  }

  async cancel(id: string) {
    const receipt = await this.prisma.goodsReceipt.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    if (receipt.status !== ReceiptStatus.DRAFT || receipt.lines.some((l) => l.receivedQty > 0)) {
      throw new BadRequestException('Anulować można tylko przyjęcie, na którym nie przyjęto towaru');
    }
    this.events.emit('receipt.changed', { id });
    return this.prisma.goodsReceipt.update({ where: { id }, data: { status: ReceiptStatus.CANCELLED } });
  }

  private async assertOpen(tx: Tx, id: string) {
    const receipt = await tx.goodsReceipt.findUnique({ where: { id } });
    if (!receipt) throw new NotFoundException('Nie znaleziono przyjęcia');
    if (!OPEN_STATUSES.includes(receipt.status)) {
      throw new BadRequestException(`Przyjęcie ${receipt.number} jest zamknięte`);
    }
    return receipt;
  }

  private async prepareLines(lines: ReceiptLineDto[]) {
    const products = await this.prisma.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } } });
    return lines.map((l) => {
      const product = products.find((p) => p.id === l.productId);
      if (!product) throw new BadRequestException('Nieznany produkt na pozycji przyjęcia');
      if (!product.active) throw new BadRequestException(`Produkt ${product.sku} jest nieaktywny`);
      return {
        productId: l.productId,
        expectedQty: l.expectedQty,
        unitPrice: l.unitPrice ?? product.purchasePrice,
        batch: l.batch || null,
        expiryDate: l.expiryDate ? new Date(l.expiryDate) : null,
      };
    });
  }
}
