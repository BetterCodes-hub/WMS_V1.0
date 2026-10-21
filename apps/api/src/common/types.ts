import { Prisma, Role } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
