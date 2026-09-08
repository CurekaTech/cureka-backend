import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SaveCategoryTopProductsDto {
  /**
   * Variant UUIDs to mark as Top Products for the selected category.
   * Variants in this category that are omitted are cleared (`is_top = false`).
   * Variants outside this category are never modified.
   */
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  variantIds!: string[];
}

export class ReorderCategoryTopProductsDto {
  /**
   * Ordered Top Product variant UUIDs for the selected category.
   * Must include the full current top-product set for that category.
   */
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  variantIds!: string[];
}
