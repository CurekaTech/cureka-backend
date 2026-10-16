import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { ResponseMessage } from '@packages/common';
import { RefundWalletService } from '../services/refund-wallet.service';

class WalletTransactionsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

@ApiTags('Customer Wallet')
@ApiBearerAuth()
@UseGuards(SessionCookieGuard, VerifiedUserGuard)
@Controller('wallet')
export class CustomerWalletController {
  constructor(private readonly walletService: RefundWalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get the authenticated customer wallet overview' })
  @ResponseMessage('Wallet overview retrieved successfully')
  overview(@CurrentSessionUser() user: IUserSessionContext) {
    return this.walletService.getOverview(user.sub);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get paginated wallet transactions for the authenticated customer' })
  @ResponseMessage('Wallet transactions retrieved successfully')
  transactions(
    @CurrentSessionUser() user: IUserSessionContext,
    @Query() query: WalletTransactionsQueryDto,
  ) {
    return this.walletService.getCustomerTransactions(user.sub, query.page, query.limit);
  }
}
