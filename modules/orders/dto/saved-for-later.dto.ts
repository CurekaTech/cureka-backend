import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@packages/common';

export class SavedForLaterListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['createdAt', 'updatedAt'] })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt'])
  override sortBy?: string;
}
