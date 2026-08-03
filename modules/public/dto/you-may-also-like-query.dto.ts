import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsUUID, ArrayMaxSize, Max, Min } from 'class-validator';

export class YouMayAlsoLikeQueryDto {
  /**
   * Comma-separated variant UUIDs from the customer's cart (or viewed product).
   * Maximum 50 variant IDs per request.
   */
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
  @ArrayMaxSize(50)
  variantIds!: string[];

  /** Page number. Default 1. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** Results per page. Default 20, max 40. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  limit?: number = 20;
}
