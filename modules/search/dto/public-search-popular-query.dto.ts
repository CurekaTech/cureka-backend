import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PublicSearchPopularQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  per_page?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  pincode?: string;
}
