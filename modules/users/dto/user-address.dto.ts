import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Allow,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsRefId } from '@packages/common';
import {
  INDIAN_MOBILE_REGEX,
  INDIAN_MOBILE_VALIDATION_MESSAGE,
  normalizeMobileNumber,
} from '@modules/auth/utils/mobile-number.util';
import { UserAddressType } from '../enums/user-address-type.enum';

const INDIAN_PINCODE_REGEX = /^\d{6}$/;
const INDIAN_PINCODE_MESSAGE = 'pincode must be a valid 6-digit Indian pincode';

const normalizePhoneField = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeMobileNumber(value) : value;

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateUserAddressDto {
  @ApiProperty({ example: 'Rahul Sharma' })
  @Transform(trimString)
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  recipientName!: string;

  @ApiProperty({ example: '9876543210' })
  @Transform(normalizePhoneField)
  @IsNotEmpty()
  @IsString()
  @Matches(INDIAN_MOBILE_REGEX, { message: INDIAN_MOBILE_VALIDATION_MESSAGE })
  phoneNumber!: string;

  @ApiProperty({ example: '560001' })
  @Transform(trimString)
  @IsNotEmpty()
  @IsString()
  @Matches(INDIAN_PINCODE_REGEX, { message: INDIAN_PINCODE_MESSAGE })
  pincode!: string;

  @ApiProperty({ example: '42, MG Road' })
  @Transform(trimString)
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  addressLine1!: string;

  @ApiPropertyOptional({ example: 'Near Metro Station' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @ApiPropertyOptional({ example: 'Opposite City Mall' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  landmark?: string;

  @ApiProperty({ example: 'Bengaluru' })
  @Transform(trimString)
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  city!: string;

  @ApiProperty({ example: 'Karnataka' })
  @Transform(trimString)
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  state!: string;

  @ApiProperty({ enum: UserAddressType, example: UserAddressType.HOME })
  @IsNotEmpty()
  @IsEnum(UserAddressType)
  addressType!: UserAddressType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateUserAddressDto extends PartialType(CreateUserAddressDto) {}

/** Admin customer wizard — create or update an address (id or refId present = update). */
export class AdminCustomerAddressDto extends CreateUserAddressDto {
  @ApiPropertyOptional({
    example: '2701a5b8-501b-402c-aef6-92d507ad62d2',
    description: 'Existing address UUID from GET customer. Omit with refId to create.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({ example: 'RAH20261234', description: 'Omit to create; include to update existing address' })
  @IsOptional()
  @IsRefId()
  refId?: string;

  @IsOptional()
  @Allow()
  userId?: string;

  @IsOptional()
  @Allow()
  createdBy?: string;

  @IsOptional()
  @Allow()
  updatedBy?: string;

  @IsOptional()
  @Allow()
  createdAt?: Date;

  @IsOptional()
  @Allow()
  updatedAt?: Date;

  @IsOptional()
  @Allow()
  deletedAt?: Date;
}
