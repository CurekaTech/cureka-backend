import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
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
}

export class UpdateProductInformationLabelDto extends PartialType(CreateProductInformationLabelDto) {}

export class UpdateProductInformationLabelStatusDto {
  @ApiProperty({ enum: MasterStatus })
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}
