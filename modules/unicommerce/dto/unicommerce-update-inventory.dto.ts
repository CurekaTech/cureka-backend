import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class UnicommerceInventoryListItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @IsString()
  @IsNotEmpty()
  inventory!: string;

  @IsOptional()
  @IsString()
  hsnCode?: string;

  @IsOptional()
  @IsString()
  facilityCode?: string;
}

export class UnicommerceUpdateInventoryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnicommerceInventoryListItemDto)
  inventoryList!: UnicommerceInventoryListItemDto[];
}
