import { IsNotEmpty, IsString } from 'class-validator';

export class GokwikGetCartDto {
  @IsNotEmpty()
  @IsString()
  cart_id!: string;
}
