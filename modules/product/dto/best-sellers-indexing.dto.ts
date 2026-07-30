import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsRefId } from '@packages/common';

export class ReorderBestSellerCategoryItemDto {
  @IsNotEmpty()
  @IsRefId()
  refId!: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  position!: number;
}

export class ReorderBestSellerCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderBestSellerCategoryItemDto)
  categories!: ReorderBestSellerCategoryItemDto[];
}

export class ReorderBestSellerProductItemDto {
  @IsNotEmpty()
  @IsRefId()
  refId!: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  position!: number;
}

export class ReorderBestSellerProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderBestSellerProductItemDto)
  products!: ReorderBestSellerProductItemDto[];
}
