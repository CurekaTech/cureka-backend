import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { ResponseMessage } from '@packages/common';
import {
  CancelMembershipDto,
  ChangeMembershipPlanDto,
  PurchaseMembershipDto,
} from '../dto/membership.dto';
import { MembershipsService } from '../services/memberships.service';

@ApiTags('Memberships')
@ApiBearerAuth()
@UseGuards(SessionCookieGuard, VerifiedUserGuard)
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @ApiOperation({ summary: 'List active membership plans' })
  @ResponseMessage('Membership plans fetched successfully')
  @Get('plans')
  @HttpCode(HttpStatus.OK)
  listPlans() {
    return this.membershipsService.listPlans();
  }

  @ApiOperation({ summary: 'Get membership plan by id or refId' })
  @ResponseMessage('Membership plan fetched successfully')
  @Get('plans/:idOrRefId')
  @HttpCode(HttpStatus.OK)
  getPlan(@Param('idOrRefId') idOrRefId: string) {
    return this.membershipsService.getPlan(idOrRefId);
  }

  @ApiOperation({ summary: 'Purchase membership (returns payment link)' })
  @ResponseMessage('Membership purchase initiated successfully')
  @Post('purchase')
  @HttpCode(HttpStatus.OK)
  purchase(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: PurchaseMembershipDto,
  ) {
    return this.membershipsService.purchase(user.sub, dto);
  }

  @ApiOperation({ summary: 'Get my active membership' })
  @ResponseMessage('Membership fetched successfully')
  @Get('me')
  @HttpCode(HttpStatus.OK)
  me(@CurrentSessionUser() user: IUserSessionContext) {
    return this.membershipsService.me(user.sub);
  }

  @ApiOperation({ summary: 'Get my membership history' })
  @ResponseMessage('Membership history fetched successfully')
  @Get('history')
  @HttpCode(HttpStatus.OK)
  history(@CurrentSessionUser() user: IUserSessionContext) {
    return this.membershipsService.history(user.sub);
  }

  @ApiOperation({ summary: 'List my membership payments' })
  @ResponseMessage('Membership payments fetched successfully')
  @Get('payments')
  @HttpCode(HttpStatus.OK)
  payments(@CurrentSessionUser() user: IUserSessionContext) {
    return this.membershipsService.listPayments(user.sub);
  }

  @ApiOperation({ summary: 'Cancel active membership' })
  @ResponseMessage('Membership cancelled successfully')
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CancelMembershipDto,
  ) {
    return this.membershipsService.cancel(user.sub, dto);
  }

  @ApiOperation({ summary: 'Renew membership (returns payment link)' })
  @ResponseMessage('Membership renewal initiated successfully')
  @Post('renew')
  @HttpCode(HttpStatus.OK)
  renew(@CurrentSessionUser() user: IUserSessionContext) {
    return this.membershipsService.renew(user.sub);
  }

  @ApiOperation({ summary: 'Change membership plan (returns payment link)' })
  @ResponseMessage('Membership plan change initiated successfully')
  @Post('change-plan')
  @HttpCode(HttpStatus.OK)
  changePlan(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: ChangeMembershipPlanDto,
  ) {
    return this.membershipsService.changePlan(user.sub, dto);
  }
}
