import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RejectProductDto {
  @ApiProperty({ example: 'Missing mandatory product images' })
  @IsNotEmpty()
  @IsString()
  reason!: string;
}
