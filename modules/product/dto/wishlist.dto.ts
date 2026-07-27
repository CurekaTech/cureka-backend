import { IsNotEmpty, IsUUID } from 'class-validator';

export class AddWishlistItemDto {
  @IsNotEmpty()
  @IsUUID()
  productId!: string;
}
