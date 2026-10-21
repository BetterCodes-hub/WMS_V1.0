import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize = 25;

  @IsOptional()
  @IsString()
  search?: string;

  get skip() {
    return (this.page - 1) * this.pageSize;
  }
}

export function paginated<T>(items: T[], total: number, q: PaginationQuery) {
  return { items, total, page: q.page, pageSize: q.pageSize };
}
