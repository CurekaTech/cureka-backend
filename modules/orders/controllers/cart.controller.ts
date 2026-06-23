import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { ResponseMessage } from '@packages/common';
import { AddCartItemDto, UpdateCartItemDto } from '../dto/cart.dto';
import { CartService } from '../services/cart.service';

@ApiTags('Cart')
@ApiBearerAuth()
@UseGuards(SessionCookieGuard, VerifiedUserGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @ApiOperation({ summary: 'Add item to cart' })
  @ResponseMessage('Item added to cart')
  @Post('items')
  addItem(@CurrentSessionUser() user: IUserSessionContext, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.sub, dto);
  }

  @ApiOperation({ summary: 'Get active cart' })
  @ResponseMessage('Cart fetched successfully')
  @Get()
  getCart(@CurrentSessionUser() user: IUserSessionContext) {
    return this.cartService.getCart(user.sub);
  }

  @ApiOperation({ summary: 'Update cart item quantity' })
  @ResponseMessage('Cart updated successfully')
  @Patch('items/:itemId')
  updateQuantity(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateQuantity(user.sub, itemId, dto);
  }

  @ApiOperation({ summary: 'Remove cart item' })
  @ResponseMessage('Item removed from cart')
  @Delete('items/:itemId')
  removeItem(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.cartService.removeItem(user.sub, itemId);
  }

  @ApiOperation({ summary: 'Clear active cart' })
  @ResponseMessage('Cart cleared successfully')
  @Delete()
  async clear(@CurrentSessionUser() user: IUserSessionContext): Promise<void> {
    await this.cartService.clear(user.sub);
  }
}
