import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { BlogCategoryStatus } from '../enums/blog-category-status.enum';
import { BlogCommentStatus } from '../enums/blog-comment-status.enum';
import { BlogPostStatus } from '../enums/blog-post-status.enum';
import { BlogPostVisibility } from '../enums/blog-post-visibility.enum';
import { BlogVideoType } from '../enums/blog-video-type.enum';
import {
  FAQ_ANSWER_MAX_LENGTH,
  FAQ_ANSWER_MAX_LENGTH_MESSAGE,
  FAQ_ANSWER_REQUIRED_MESSAGE,
  FAQ_QUESTION_MAX_LENGTH,
  FAQ_QUESTION_MAX_LENGTH_MESSAGE,
  FAQ_QUESTION_REQUIRED_MESSAGE,
} from '../utils/master-faq.util';

export class BlogFaqDto {
  @ApiProperty({ example: 'What is this blog about?', maxLength: FAQ_QUESTION_MAX_LENGTH })
  @IsNotEmpty({ message: FAQ_QUESTION_REQUIRED_MESSAGE })
  @IsString({ message: FAQ_QUESTION_REQUIRED_MESSAGE })
  @MaxLength(FAQ_QUESTION_MAX_LENGTH, { message: FAQ_QUESTION_MAX_LENGTH_MESSAGE })
  question!: string;

  @ApiProperty({ example: 'This article explains…', maxLength: FAQ_ANSWER_MAX_LENGTH })
  @IsNotEmpty({ message: FAQ_ANSWER_REQUIRED_MESSAGE })
  @IsString({ message: FAQ_ANSWER_REQUIRED_MESSAGE })
  @MaxLength(FAQ_ANSWER_MAX_LENGTH, { message: FAQ_ANSWER_MAX_LENGTH_MESSAGE })
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

export class BlogVideoFileDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;
}

/**
 * Normalize video file from multipart JSON:
 * - storage path string → string
 * - { key, name } → BlogVideoFileDto
 */
const parseVideoFile = ({
  value,
}: {
  value: unknown;
}): string | BlogVideoFileDto | undefined => {
  if (value === undefined || value === null || value === '' || value === 'null') {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'null') return undefined;
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return plainToInstance(BlogVideoFileDto, parsed);
        }
      } catch {
        // treat as plain storage path
      }
    }
    return trimmed;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return plainToInstance(BlogVideoFileDto, value);
  }
  return undefined;
};

export class BlogVideoDto {
  @ApiProperty({ enum: BlogVideoType, example: BlogVideoType.FILE })
  @IsEnum(BlogVideoType)
  type!: BlogVideoType;

  @ApiPropertyOptional({ example: 'How to use this product' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ example: 'Quick demo and key benefits' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle?: string;

  @ApiPropertyOptional({
    description:
      'Required after upload merge when type is file. Accepts a storage path, { key, name }, or omit when sending videoFile_N.',
  })
  @IsOptional()
  @Transform(parseVideoFile)
  @ValidateIf(
    (item: BlogVideoDto) =>
      item.type === BlogVideoType.FILE && item.file !== undefined && typeof item.file === 'object',
  )
  @ValidateNested()
  @Type(() => BlogVideoFileDto)
  @Allow()
  file?: string | BlogVideoFileDto;

  @ApiPropertyOptional({ example: 'https://www.youtube.com/watch?v=example' })
  @ValidateIf((item: BlogVideoDto) => item.type === BlogVideoType.URL)
  @IsNotEmpty()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  url?: string;
}

/**
 * Multipart mergeFormFields JSON.stringifies nested arrays.
 * Parse them back and return BlogVideoDto class instances so ValidateNested works.
 */
const parseVideoArray = ({ value }: { value: unknown }): BlogVideoDto[] | undefined => {
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

  return parsed
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => plainToInstance(BlogVideoDto, item));
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

  @ApiPropertyOptional({
    type: [BlogVideoDto],
    description:
      'Blog videos. type=file stores a storage file reference; type=url stores an external video URL. File uploads may use indexed multipart fields videoFile_0, videoFile_1, …',
  })
  @IsOptional()
  @Transform(parseVideoArray)
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => BlogVideoDto)
  videos?: BlogVideoDto[];

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

  @ApiPropertyOptional({ type: [BlogVideoDto] })
  @IsOptional()
  @Transform(parseVideoArray)
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => BlogVideoDto)
  videos?: BlogVideoDto[];
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
