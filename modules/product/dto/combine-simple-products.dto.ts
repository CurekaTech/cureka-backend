import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { IsRefId } from '@packages/common';
import { VariantAttributeValueDto } from './variant.dto';

export class CombineSimpleProductsPreviewDto {
  @ApiProperty({
    type: [String],
    example: ['PRO20261234', 'PRO20265678'],
    description: 'Simple product refIds to combine. Minimum 2.',
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

  @ApiProperty({ description: 'The simple product’s single variant UUID from combine-preview' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({ type: [VariantAttributeValueDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VariantAttributeValueDto)
  attributes!: VariantAttributeValueDto[];
}

export class CombineSimpleProductsDto {
  @ApiProperty({
    description: 'Canonical simple product that stays as the variable parent listing',
    example: 'PRO20261234',
  })
  @IsNotEmpty()
  @IsRefId()
  targetProductRefId!: string;

  @ApiProperty({ type: [String], description: 'Attribute masters for the variable product' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsRefId({ each: true })
  attributeRefIds!: string[];

  @ApiProperty({ type: [CombineSimpleProductAssignmentDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CombineSimpleProductAssignmentDto)
  assignments!: CombineSimpleProductAssignmentDto[];
}
