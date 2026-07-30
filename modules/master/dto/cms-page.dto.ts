import { PartialType } from '@nestjs/mapped-types';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';

export class CreateCmsPageDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(280)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase kebab-case (e.g. about-cureka)',
  })
  slug!: string;

  @IsNotEmpty()
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateCmsPageDto extends PartialType(CreateCmsPageDto) {}

export class UpdateCmsPageStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class CmsPageQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}
