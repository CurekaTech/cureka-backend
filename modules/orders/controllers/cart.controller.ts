import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { AddCartItemDto, ApplyCouponDto, MergeGuestCartDto, UpdateCartItemDto } from '../dto/cart.dto';
import { CartService } from '../services/cart.service';

@ApiTags('Cart')
@ApiBearerAuth()
@UseGuards(SessionCookieGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @ApiOperation({ summary: 'Add item to cart' })
  @ResponseMessage('Item added to cart')
  @Post('items')
  @HttpCode(HttpStatus.OK)
  addItem(@CurrentSessionUser() user: IUserSessionContext, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.sub, dto);
  }

  @ApiOperation({ summary: 'Get active cart' })
  @ResponseMessage('Cart fetched successfully')
  @Get()
  @HttpCode(HttpStatus.OK)
  getCart(@CurrentSessionUser() user: IUserSessionContext) {
    return this.cartService.getCart(user.sub);
  }

  @ApiOperation({ summary: 'Apply coupon to cart' })
  @ResponseMessage('Coupon applied successfully')
  @Post('coupon')
  @HttpCode(HttpStatus.OK)
  applyCoupon(@CurrentSessionUser() user: IUserSessionContext, @Body() dto: ApplyCouponDto) {
    return this.cartService.applyCoupon(user.sub, dto);
  }

  @ApiOperation({ summary: 'Remove coupon from cart' })
  @ResponseMessage('Coupon removed successfully')
  @Delete('coupon')
  @HttpCode(HttpStatus.OK)
  removeCoupon(@CurrentSessionUser() user: IUserSessionContext) {
    return this.cartService.removeCoupon(user.sub);
  }

  @ApiOperation({ summary: 'Update cart item quantity' })
  @ResponseMessage('Cart updated successfully')
  @Patch('items/:itemId')
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.OK)
  removeItem(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.cartService.removeItem(user.sub, itemId);
  }

  @ApiOperation({ summary: 'Clear active cart' })
  @ResponseMessage('Cart cleared successfully')
  @Delete()
  @HttpCode(HttpStatus.OK)
  async clear(@CurrentSessionUser() user: IUserSessionContext): Promise<void> {
    await this.cartService.clear(user.sub);
  }

  @ApiOperation({ summary: 'Merge guest cart items into the logged-in user cart' })
  @ResponseMessage('Guest cart merged successfully')
  @UseGuards(VerifiedUserGuard)
  @Post('merge')
  @HttpCode(HttpStatus.OK)
  mergeGuestCart(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() body: MergeGuestCartDto,
  ) {
    return this.cartService
      .mergeGuestCartIntoUser(body.guestUserId, user.sub)
      .then(() => this.cartService.getCart(user.sub));
  }
}
