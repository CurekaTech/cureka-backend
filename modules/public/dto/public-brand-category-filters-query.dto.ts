import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsRefId } from '@packages/common';

/**
 * Brand-scoped category filter facets for the website product listing.
 * Provide exactly one of `brandSlug` or `brandRefId`.
 */
export class PublicBrandCategoryFiltersQueryDto {
  @ValidateIf((o: PublicBrandCategoryFiltersQueryDto) => !o.brandSlug?.trim())
  @IsRefId()
  brandRefId?: string;

  @ValidateIf((o: PublicBrandCategoryFiltersQueryDto) => !o.brandRefId?.trim())
  @IsString()
  @MaxLength(255)
  brandSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

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
}
