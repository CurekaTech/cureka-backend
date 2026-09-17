import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '@packages/common';
import { AdminNotificationEmailType } from '../enums/admin-notification-email-type.enum';

export class CreateAdminNotificationEmailDto {
  @ApiProperty({ example: 'ops@cureka.com' })
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiPropertyOptional({
    enum: AdminNotificationEmailType,
    default: AdminNotificationEmailType.PRODUCT_OOS,
  })
  @IsOptional()
  @IsEnum(AdminNotificationEmailType)
  type?: AdminNotificationEmailType;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminNotificationEmailDto extends PartialType(
  CreateAdminNotificationEmailDto,
) {}

export class AdminNotificationEmailQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: AdminNotificationEmailType,
    description: 'Defaults to product_oos on the Email Recipient page',
  })
  @IsOptional()
  @IsEnum(AdminNotificationEmailType)
  type?: AdminNotificationEmailType;

  @ApiPropertyOptional({ description: 'Filter by active flag' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}
