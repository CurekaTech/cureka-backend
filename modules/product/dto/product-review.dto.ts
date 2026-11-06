import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
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

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  variantSlug?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  reviewDescription!: string;
}

export class PublicProductReviewQueryDto {
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  variantSlug?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  pincode?: string;
}

export class UpdateProductReviewStatusDto {
  @IsEnum(ProductReviewStatus)
  status!: ProductReviewStatus;
}

/** Customer edit of their own review (rating / title / description). */
export class UpdateMyProductReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  review!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  reviewDescription!: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  variantSlug?: string;
}

export class ProductReviewQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ProductReviewStatus)
  status?: ProductReviewStatus;

  @IsOptional()
  @IsString()
  productRefId?: string;
}
