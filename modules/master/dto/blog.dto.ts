import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { BlogCategoryStatus } from '../enums/blog-category-status.enum';
import { BlogCommentStatus } from '../enums/blog-comment-status.enum';
import { BlogPostStatus } from '../enums/blog-post-status.enum';
import { BlogPostVisibility } from '../enums/blog-post-visibility.enum';

export class BlogFaqDto {
  @ApiProperty({ example: 'What is this blog about?' })
  @IsNotEmpty()
  @IsString()
  question!: string;

  @ApiProperty({ example: 'This article explains…' })
  @IsNotEmpty()
  @IsString()
  answer!: string;
}

const parseBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
};

const parseStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return undefined;
};

/**
 * Multipart mergeFormFields JSON.stringifies nested arrays.
 * Parse them back and return BlogFaqDto class instances so ValidateNested works
 * (@Transform conflicts with @Type for nested objects).
 */
const parseFaqArray = ({ value }: { value: unknown }): BlogFaqDto[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;

  let parsed: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return undefined;
    }
  }

  if (!Array.isArray(parsed)) return undefined;

  const items = parsed
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      question: String(item.question ?? '').trim(),
      answer: String(item.answer ?? '').trim(),
    }))
    .filter((item) => item.question && item.answer);

  return plainToInstance(BlogFaqDto, items);
};

export class BlogCategoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BlogCategoryStatus })
  @IsOptional()
  @IsEnum(BlogCategoryStatus)
  status?: BlogCategoryStatus;
}

export class CreateBlogCategoryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  slug!: string;

  @ApiPropertyOptional({ description: 'Up to 3000 characters (~500 words)' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: BlogCategoryStatus })
  @IsOptional()
  @IsEnum(BlogCategoryStatus)
  status?: BlogCategoryStatus;
}

export class UpdateBlogCategoryDto extends PartialType(CreateBlogCategoryDto) {
  @ApiPropertyOptional({
    description: "Set true to remove the existing category icon",
  })
  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  removeIcon?: boolean;
}

export class UpdateBlogCategoryStatusDto {
  @ApiProperty({ enum: BlogCategoryStatus })
  @IsEnum(BlogCategoryStatus)
  status!: BlogCategoryStatus;
}

export class BlogPostQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryRefId?: string;

  @ApiPropertyOptional({ enum: BlogPostStatus })
  @IsOptional()
  @IsEnum(BlogPostStatus)
  status?: BlogPostStatus;

  @ApiPropertyOptional({ enum: BlogPostVisibility })
  @IsOptional()
  @IsEnum(BlogPostVisibility)
  visibility?: BlogPostVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isFeatured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isTrending?: boolean;
}

export class CreateBlogPostDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  excerpt?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  categoryRefId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  author?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(parseStringArray)
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(parseStringArray)
  @IsArray()
  @IsString({ each: true })
  productRefIds?: string[];

  @ApiPropertyOptional({
    type: [BlogFaqDto],
    description: 'FAQ Q&A pairs for FAQPage schema and blog detail accordion',
  })
  @IsOptional()
  @Transform(parseFaqArray)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlogFaqDto)
  faqs?: BlogFaqDto[];

  @ApiPropertyOptional({ enum: BlogPostStatus })
  @IsOptional()
  @IsEnum(BlogPostStatus)
  status?: BlogPostStatus;

  @ApiPropertyOptional({ enum: BlogPostVisibility })
  @IsOptional()
  @IsEnum(BlogPostVisibility)
  visibility?: BlogPostVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isTrending?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaKeywords?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdateBlogPostDto extends PartialType(CreateBlogPostDto) {
  // Re-declare so multipart JSON-stringified faqs keep Transform + nested class instances
  // after PartialType (edit uses the same FormData path as create).
  @ApiPropertyOptional({ type: [BlogFaqDto] })
  @IsOptional()
  @Transform(parseFaqArray)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlogFaqDto)
  faqs?: BlogFaqDto[];
}

export class UpdateBlogPostStatusDto {
  @ApiProperty({ enum: BlogPostStatus })
  @IsEnum(BlogPostStatus)
  status!: BlogPostStatus;
}

export class BlogCommentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  blogPostRefId?: string;

  @ApiPropertyOptional({ enum: BlogCommentStatus })
  @IsOptional()
  @IsEnum(BlogCommentStatus)
  status?: BlogCommentStatus;
}

export class CreateBlogCommentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  guestName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  guestEmail?: string;
}

export class UpdateBlogCommentStatusDto {
  @ApiProperty({ enum: BlogCommentStatus })
  @IsEnum(BlogCommentStatus)
  status!: BlogCommentStatus;
}

export class PublicBlogSearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryRefId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tag?: string;
}
