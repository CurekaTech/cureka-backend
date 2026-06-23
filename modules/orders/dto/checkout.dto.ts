import { IsNotEmpty, IsUUID } from 'class-validator';

export class CheckoutDto {
  @IsNotEmpty()
  @IsUUID()
  addressId!: string;
}
