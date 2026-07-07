import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { AddWishlistItemDto } from '../dto/wishlist.dto';
import { WishlistService } from '../services/wishlist.service';

@ApiTags('Wishlist')
@ApiBearerAuth()
@Controller('wishlist')
@UseGuards(SessionCookieGuard, VerifiedUserGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @ApiOperation({ summary: 'List wishlist products for the authenticated user' })
  @ResponseMessage('Wishlist retrieved successfully')
  @Get()
  findAll(@CurrentSessionUser() user: IUserSessionContext) {
    return this.wishlistService.findAll(user.sub);
  }

  @ApiOperation({ summary: 'List wishlisted product ids for the authenticated user' })
  @ResponseMessage('Wishlist ids retrieved successfully')
  @Get('ids')
  findProductIds(@CurrentSessionUser() user: IUserSessionContext) {
    return this.wishlistService.findProductIds(user.sub);
  }

  @ApiOperation({ summary: 'Add a product to the wishlist' })
  @ResponseMessage('Product added to wishlist')
  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  add(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: AddWishlistItemDto,
  ) {
    return this.wishlistService.add(user.sub, dto);
  }

  @ApiOperation({ summary: 'Remove a product from the wishlist' })
  @ResponseMessage('Product removed from wishlist')
  @Delete('items/:productId')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.wishlistService.remove(user.sub, productId);
  }
}
