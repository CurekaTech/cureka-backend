import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsUUID, ArrayMaxSize, Max, Min } from 'class-validator';

export class FrequentlyBoughtTogetherQueryDto {
  /**
   * Comma-separated variant UUIDs from the cart and/or the product details page (up to 20).
   * Optional — when omitted/empty (empty cart on PDP), the API falls back to bestsellers.
   * Example: ?variantIds=uuid1,uuid2,uuid3
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return Array.isArray(value) ? value : [];
  })
  @IsArray()
  @IsUUID(4, { each: true })
  @ArrayMaxSize(20)
  variantIds?: string[] = [];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 10;
}
