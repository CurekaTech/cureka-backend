import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { IsRefId } from '@packages/common';

export class PublicBundleQueryDto {
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
  @IsRefId()
  brandRefId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  brandSlug?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  pincode?: string;
}
