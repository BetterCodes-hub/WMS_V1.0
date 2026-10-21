import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
/** Ogranicza endpoint do podanych ról. ADMIN ma zawsze dostęp. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
