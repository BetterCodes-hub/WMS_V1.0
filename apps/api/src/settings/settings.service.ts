import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCompanyDto } from './settings.dto';

const DEFAULTS = {
  name: 'Moja Firma Sp. z o.o.',
  nip: '0000000000',
  street: '',
  postalCode: '00-000',
  city: '',
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    return (
      (await this.prisma.companySettings.findUnique({ where: { id: 1 } })) ??
      this.prisma.companySettings.create({ data: { id: 1, ...DEFAULTS } })
    );
  }

  update(dto: UpdateCompanyDto) {
    return this.prisma.companySettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...dto },
      update: dto,
    });
  }
}
