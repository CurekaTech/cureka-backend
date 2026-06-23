import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MasterStatus } from '@modules/master/enums/master-status.enum';

export class CreateProductTagDto {
  @ApiProperty({ example: 'Trending' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(15)
  name!: string;

  @ApiPropertyOptional({ enum: MasterStatus, default: MasterStatus.ACTIVE })
  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateProductTagDto extends PartialType(CreateProductTagDto) {}

export class UpdateProductTagStatusDto {
  @ApiProperty({ enum: MasterStatus })
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}
