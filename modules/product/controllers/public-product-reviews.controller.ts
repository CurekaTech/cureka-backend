import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { OptionalSessionCookieGuard } from '@modules/auth/guards/optional-session-cookie.guard';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { CreateProductReviewDto, PublicProductReviewQueryDto } from '../dto/product-review.dto';
import { ProductReviewsService } from '../services/product-reviews.service';

@ApiTags('Public Product Reviews')
@Controller('public/products')
export class PublicProductReviewsController {
  constructor(private readonly productReviewsService: ProductReviewsService) {}

  @ApiOperation({ summary: 'List approved reviews + stats for a product' })
  @ResponseMessage('Product reviews retrieved successfully')
  @Get(':slug/reviews')
  getApprovedReviews(
    @Param('slug') slug: string,
    @Query() query: PublicProductReviewQueryDto,
  ) {
    return this.productReviewsService.findApprovedByProductSlug(slug, query);
  }

  @ApiOperation({
    summary:
      'Whether the current user can review this product/variant (ordered it and has not already reviewed the variant)',
  })
  @ResponseMessage('Review eligibility retrieved successfully')
  @UseGuards(OptionalSessionCookieGuard)
  @Get(':slug/can-review')
  canReview(
    @Param('slug') slug: string,
    @Query() query: PublicProductReviewQueryDto,
    @CurrentSessionUser() user: IUserSessionContext | undefined,
  ) {
    return this.productReviewsService.canReviewForProductSlug(slug, user, query);
  }

  @ApiOperation({ summary: 'Submit a product review (pending until admin approval)' })
  @ResponseMessage('Review submitted successfully and is pending approval')
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  @Post(':slug/reviews')
  createReview(
    @Param('slug') slug: string,
    @Body() dto: CreateProductReviewDto,
    @CurrentSessionUser() user: IUserSessionContext,
  ) {
    return this.productReviewsService.createForProductSlug(slug, dto, user);
  }
}
