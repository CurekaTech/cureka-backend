import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsRefId } from '@packages/common';

export class ProductCategoryFilterBindingDto {
  @ApiProperty({ example: 'CFL20261234' })
  @IsNotEmpty()
  @IsRefId()
  categoryFilterRefId!: string;

  @ApiPropertyOptional({ type: [String], example: ['Cotton', 'Polyester'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  values?: string[];
}

export class ProductCategoryFilterQueryDto {
  @ApiPropertyOptional({
    description:
      'JSON array of filter bindings, e.g. [{"categoryFilterRefId":"CFL20261234","values":["Red","Blue"]}]',
  })
  @IsOptional()
  @IsString()
  categoryFilters?: string;

  @ApiPropertyOptional({ example: 'CFL20261234' })
  @IsOptional()
  @IsRefId()
  categoryFilterRefId?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['Red', 'Blue'],
    description: 'Comma-separated or repeated query param',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  categoryFilterValues?: string[];
}
