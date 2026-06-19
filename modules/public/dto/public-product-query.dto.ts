import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { IsRefId } from '@packages/common';
import { ProductType } from '@modules/product/enums/product-type.enum';

export class PublicProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['name', 'publishedAt', 'price'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional()
  @IsRefId()
  categoryRefId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  categorySlug?: string;

  @IsOptional()
  @IsRefId()
  brandRefId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  brandSlug?: string;

  @IsOptional()
  @IsRefId()
  productNatureRefId?: string;

  @IsOptional()
  @IsRefId()
  healthConcernRefId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  healthConcernSlug?: string;

  @IsOptional()
  @IsRefId()
  wellnessGoalRefId?: string;
}
