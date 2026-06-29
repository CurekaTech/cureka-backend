import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UnicommerceProductsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize!: number;

  @IsIn(['PUBLISHED'])
  publishedStatus!: 'PUBLISHED';

  @IsOptional()
  @IsString()
  skus?: string;
}

export class UnicommerceProductsCountQueryDto {
  @IsIn(['PUBLISHED'])
  publishedStatus!: 'PUBLISHED';
}
