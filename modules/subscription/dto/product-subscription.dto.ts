import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '@packages/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';
import { ProductSubscriptionStatus } from '../enums/product-subscription-status.enum';
import { SubscriptionPaymentStatus } from '../enums/subscription-payment-status.enum';

export class CreateProductSubscriptionDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty()
  @IsUUID()
  productVariantId!: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ enum: ProductSubscriptionFrequency })
  @IsEnum(ProductSubscriptionFrequency)
  frequency!: ProductSubscriptionFrequency;

  @ApiProperty()
  @IsUUID()
  addressId!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  termsAccepted?: boolean;
}

export class PauseProductSubscriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ResumeProductSubscriptionDto {}

export class CancelProductSubscriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SkipNextProductSubscriptionDto {}

export class ChangeProductSubscriptionFrequencyDto {
  @ApiProperty({ enum: ProductSubscriptionFrequency })
  @IsEnum(ProductSubscriptionFrequency)
  frequency!: ProductSubscriptionFrequency;
}

export class UpdateProductSubscriptionAddressDto {
  @ApiProperty()
  @IsUUID()
  addressId!: string;
}

export class ProductSubscriptionConfigQueryDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productVariantId?: string;
}

export class AdminProductSubscriptionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProductSubscriptionStatus })
  @IsOptional()
  @IsEnum(ProductSubscriptionStatus)
  status?: ProductSubscriptionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class AdminSubscriptionPaymentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SubscriptionPaymentStatus })
  @IsOptional()
  @IsEnum(SubscriptionPaymentStatus)
  status?: SubscriptionPaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}
