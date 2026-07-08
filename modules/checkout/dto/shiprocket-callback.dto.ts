import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ShiprocketCheckoutCallbackDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  orderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  paymentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;
}
