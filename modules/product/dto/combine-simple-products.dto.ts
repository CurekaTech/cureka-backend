import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsRefId } from '@packages/common';
import { VariantAttributeValueDto } from './variant.dto';

export class CombineSimpleProductsPreviewDto {
  @ApiProperty({
    type: [String],
    example: ['PRO20261234', 'PRO20265678'],
    description:
      'Simple and/or variable product refIds to combine. Minimum 2. Preview returns one row per active variant.',
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsRefId({ each: true })
  productRefIds!: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Attribute master refIds already chosen in the UI. Returned with name/values so combinations can be built.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsRefId({ each: true })
  attributeRefIds?: string[];
}

export class CombineSimpleProductAssignmentDto {
  @ApiProperty({ example: 'PRO20261234' })
  @IsNotEmpty()
  @IsRefId()
  productRefId!: string;

  @ApiProperty({
    description: 'Active variant UUID from combine-preview. Multiple assignments may share productRefId.',
  })
  @IsUUID()
  variantId!: string;

  @ApiProperty({ type: [VariantAttributeValueDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VariantAttributeValueDto)
  attributes!: VariantAttributeValueDto[];

  @ApiPropertyOptional({
    example: 'Whey Protein 500g',
    description:
      'Optional per-variant title set on combine. Persisted as the variant display name (PDP tab / listing label).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  variantTitle?: string;
}

export class CombineSimpleProductsDto {
  @ApiProperty({
    description: 'Canonical product that stays as the variable parent listing',
    example: 'PRO20261234',
  })
  @IsNotEmpty()
  @IsRefId()
  targetProductRefId!: string;

  @ApiProperty({
    type: [String],
    description:
      'Shared attribute masters for the merged variable product. Every assignment must include all of these.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsRefId({ each: true })
  attributeRefIds!: string[];

  @ApiProperty({ type: [CombineSimpleProductAssignmentDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CombineSimpleProductAssignmentDto)
  assignments!: CombineSimpleProductAssignmentDto[];
}
