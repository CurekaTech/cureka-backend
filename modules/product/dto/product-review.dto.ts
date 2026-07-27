import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { ProductReviewStatus } from '../enums/product-review-status.enum';

export class CreateProductReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  review!: string;
}

export class UpdateProductReviewStatusDto {
  @IsEnum(ProductReviewStatus)
  status!: ProductReviewStatus;
}

export class ProductReviewQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ProductReviewStatus)
  status?: ProductReviewStatus;

  @IsOptional()
  @IsString()
  productRefId?: string;
}
