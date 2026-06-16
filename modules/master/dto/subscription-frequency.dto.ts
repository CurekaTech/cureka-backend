import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { MasterStatus } from '../enums/master-status.enum';
import { SubscriptionFrequencyUnit } from '../enums/subscription-frequency-unit.enum';

export class CreateSubscriptionFrequencyDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  value!: number;

  @IsNotEmpty()
  @IsEnum(SubscriptionFrequencyUnit)
  unit!: SubscriptionFrequencyUnit;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateSubscriptionFrequencyDto extends PartialType(CreateSubscriptionFrequencyDto) {}

export class UpdateSubscriptionFrequencyStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}
