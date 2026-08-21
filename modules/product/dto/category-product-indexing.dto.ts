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
