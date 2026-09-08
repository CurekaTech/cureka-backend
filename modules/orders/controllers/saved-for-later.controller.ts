import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { ResponseMessage } from '@packages/common';
import { SavedForLaterListQueryDto } from '../dto/saved-for-later.dto';
import { SavedForLaterService } from '../services/saved-for-later.service';

@ApiTags('Save for Later')
@ApiBearerAuth()
@UseGuards(SessionCookieGuard)
@Controller('save-for-later')
export class SavedForLaterController {
  constructor(private readonly savedForLaterService: SavedForLaterService) {}

  @ApiOperation({
    summary: 'List Save for Later items',
    description:
      'Returns current product/price/availability. Saved items are not part of the cart or checkout. Inventory is not reserved.',
  })
  @ResponseMessage('Save for Later items retrieved successfully')
  @Get()
  list(@CurrentSessionUser() user: IUserSessionContext, @Query() query: SavedForLaterListQueryDto) {
    return this.savedForLaterService.list(user.sub, query);
  }

  @ApiOperation({ summary: 'Count Save for Later items' })
  @ResponseMessage('Save for Later count retrieved successfully')
  @Get('count')
  count(@CurrentSessionUser() user: IUserSessionContext) {
    return this.savedForLaterService.count(user.sub);
  }

  @ApiOperation({
    summary: 'Move a saved item back to the cart',
    description:
      'Reuses existing add-to-cart validation. The saved row is removed only after the cart add succeeds. Do not call add-to-cart and delete separately.',
  })
  @ResponseMessage('Item moved to cart successfully')
  @Post(':id/move-to-cart')
  @HttpCode(HttpStatus.OK)
  moveToCart(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.savedForLaterService.moveToCart(user.sub, id);
  }

  @ApiOperation({ summary: 'Remove a Save for Later item' })
  @ResponseMessage('Saved item removed successfully')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.savedForLaterService.remove(user.sub, id);
  }
}
