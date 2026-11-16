import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { OptionalSessionCookieGuard } from '@modules/auth/guards/optional-session-cookie.guard';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { CreateWebsiteExperienceReviewDto } from '../dto/website-experience-review.dto';
import { WebsiteExperienceReviewsService } from '../services/website-experience-reviews.service';

@ApiTags('Website Experience Reviews')
@Controller('orders')
export class PublicWebsiteExperienceReviewsController {
  constructor(private readonly reviewsService: WebsiteExperienceReviewsService) {}

  @ApiOperation({
    summary: 'Whether the current customer can rate the website experience for this order',
  })
  @ResponseMessage('Website experience review eligibility retrieved successfully')
  @UseGuards(OptionalSessionCookieGuard)
  @Get(':orderRef/website-experience-review')
  eligibility(
    @Param('orderRef') orderRef: string,
    @CurrentSessionUser() user: IUserSessionContext | undefined,
  ) {
    return this.reviewsService.eligibility(orderRef, user);
  }

  @ApiOperation({ summary: 'Submit website and shopping experience feedback for an order' })
  @ResponseMessage('Website experience review submitted successfully')
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  @Post(':orderRef/website-experience-review')
  create(
    @Param('orderRef') orderRef: string,
    @Body() dto: CreateWebsiteExperienceReviewDto,
    @CurrentSessionUser() user: IUserSessionContext,
  ) {
    return this.reviewsService.createForOrder(orderRef, dto, user);
  }
}
