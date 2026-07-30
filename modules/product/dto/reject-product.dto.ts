import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RejectProductDto {
  @ApiProperty({
    example: 'Missing mandatory product images',
    description: 'Rejection reason. Alias `rejectionReason` is also accepted.',
  })
  @Transform(({ value, obj }) => {
    const raw = value ?? obj?.rejectionReason;
    return typeof raw === 'string' ? raw.trim() : raw;
  })
  @IsNotEmpty({ message: 'reason is required' })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({
    description: 'Alias for `reason` (frontend compatibility)',
    example: 'Missing mandatory product images',
  })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
