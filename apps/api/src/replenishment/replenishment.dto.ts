import { TaskStatus } from '@prisma/client';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class GenerateTasksDto {
  /** gdy puste — dla wszystkich miejsc wymagających uzupełnienia */
  @IsOptional() @IsArray() @IsString({ each: true }) pickFaceIds?: string[];
}

export class CreateTaskDto {
  @IsString() productId: string;
  @IsString() fromLocationId: string;
  @IsString() toLocationId: string;
  @IsOptional() @IsString() handlingUnitId?: string;
  @IsInt() @Min(1) quantity: number;
}

export class CompleteTaskDto {
  /** faktycznie przeniesiona ilość (domyślnie — planowana) */
  @IsOptional() @IsInt() @Min(1) quantity?: number;
}

export class TaskQuery {
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
}
