import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '@packages/common';

export class CreateWebsiteExperienceReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string;
}

export class WebsiteExperienceReviewQueryDto extends PaginationQueryDto {}
