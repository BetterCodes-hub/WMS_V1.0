import { Injectable } from '@nestjs/common';
import { ContractorType, Prisma } from '@prisma/client';
import { paginated } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { ContractorQuery, CreateContractorDto, UpdateContractorDto } from './contractors.dto';

@Injectable()
export class ContractorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(q: ContractorQuery) {
    const where: Prisma.ContractorWhereInput = {
      ...(q.type ? { type: { in: [q.type, ContractorType.BOTH] } } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { nip: { contains: q.search } },
              { city: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contractor.findMany({ where, orderBy: { name: 'asc' }, skip: q.skip, take: q.pageSize }),
      this.prisma.contractor.count({ where }),
    ]);
    return paginated(items, total, q);
  }

  findOne(id: string) {
    return this.prisma.contractor.findUniqueOrThrow({ where: { id } });
  }

  create(dto: CreateContractorDto) {
    return this.prisma.contractor.create({ data: { ...dto, nip: dto.nip || null, email: dto.email || null } });
  }

  update(id: string, dto: UpdateContractorDto) {
    return this.prisma.contractor.update({ where: { id }, data: dto });
  }
}
