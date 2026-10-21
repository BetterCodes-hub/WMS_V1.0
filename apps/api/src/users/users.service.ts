import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';

const select = { id: true, email: true, name: true, role: true, active: true, createdAt: true };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({ select, orderBy: { name: 'asc' } });
  }

  async create(dto: CreateUserDto) {
    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        role: dto.role,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
      select,
    });
  }

  async update(id: string, dto: UpdateUserDto, currentUserId: string) {
    if (id === currentUserId && (dto.active === false || (dto.role && dto.role !== 'ADMIN'))) {
      throw new BadRequestException('Nie możesz dezaktywować ani odebrać uprawnień własnemu kontu');
    }
    const { password, email, ...rest } = dto;
    return this.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(email ? { email: email.toLowerCase() } : {}),
        ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      },
      select,
    });
  }
}
