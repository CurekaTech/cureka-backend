import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { CreateProductReviewDto } from '../dto/product-review.dto';
import { ProductReviewsService } from '../services/product-reviews.service';

@ApiTags('Public Product Reviews')
@Controller('public/products')
export class PublicProductReviewsController {
  constructor(private readonly productReviewsService: ProductReviewsService) {}

  @ApiOperation({ summary: 'List approved reviews + stats for a product' })
  @ResponseMessage('Product reviews retrieved successfully')
  @Get(':slug/reviews')
  getApprovedReviews(@Param('slug') slug: string) {
    return this.productReviewsService.findApprovedByProductSlug(slug);
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
