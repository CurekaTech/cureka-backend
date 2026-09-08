import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  PublicListingContextType,
  PublicProductFacet,
} from '../enums/public-listing-context-type.enum';
import { PublicProductQueryDto } from './public-product-query.dto';

export class PublicProductFiltersQueryDto extends PublicProductQueryDto {
  @IsOptional()
  @IsEnum(PublicListingContextType)
  contextType?: PublicListingContextType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lockedFacets?: string;

  @IsOptional()
  @IsEnum(PublicProductFacet)
  facet?: PublicProductFacet;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  facetSearch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class PublicProductFilterBrandsQueryDto extends PublicProductFiltersQueryDto {}
