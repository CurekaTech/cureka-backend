import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { ResponseMessage } from '@packages/common';
import { ShipmentsService } from '../services/shipments.service';

@ApiTags('Shipments')
@ApiBearerAuth()
@UseGuards(SessionCookieGuard, VerifiedUserGuard)
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @ApiOperation({ summary: 'Get shipment details for my order' })
  @ResponseMessage('Shipment fetched successfully')
  @Get('orders/:orderId')
  getShipmentForOrder(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.shipmentsService.getShipmentForOrder(user.sub, orderId);
  }
}
