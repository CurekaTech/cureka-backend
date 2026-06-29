import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsRefId } from '@packages/common';
import { MasterStatus } from '@modules/master/enums/master-status.enum';

export class CreateProductInformationLabelDto {
  @ApiProperty({ example: 'Ingredients' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ enum: MasterStatus, default: MasterStatus.ACTIVE })
  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @ApiPropertyOptional({ example: 0, description: 'Display order (lower values appear first)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateProductInformationLabelDto extends PartialType(CreateProductInformationLabelDto) {}

export class UpdateProductInformationLabelStatusDto {
  @ApiProperty({ enum: MasterStatus })
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class ReorderProductInformationLabelItemDto {
  @ApiProperty({ example: 'ING20261234' })
  @IsNotEmpty()
  @IsRefId()
  refId!: string;

  @ApiProperty({ example: 0, description: 'New display order (lower values appear first)' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderProductInformationLabelsDto {
  @ApiProperty({ type: [ReorderProductInformationLabelItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderProductInformationLabelItemDto)
  items!: ReorderProductInformationLabelItemDto[];
}
