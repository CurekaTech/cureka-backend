import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { OptionalSessionCookieGuard } from '@modules/auth/guards/optional-session-cookie.guard';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { SupportCategoryType } from '../enums/support-category-type.enum';
import {
  PublicOrderSupportReasonsQueryDto,
  PublicSupportSearchQueryDto,
  SupportArticleQueryDto,
  SupportFaqQueryDto,
} from '../dto/support.dto';
import { OrderSupportReasonsService } from '../services/order-support-reasons.service';
import { SupportArticlesService } from '../services/support-articles.service';
import { SupportCategoriesService } from '../services/support-categories.service';
import { SupportFaqsService } from '../services/support-faqs.service';

@ApiTags('Public Support')
@Controller('public/support')
export class PublicSupportController {
  constructor(
    private readonly categoriesService: SupportCategoriesService,
    private readonly articlesService: SupportArticlesService,
    private readonly faqsService: SupportFaqsService,
    private readonly orderSupportReasonsService: OrderSupportReasonsService,
  ) {}

  @ApiOperation({ summary: 'List active support categories' })
  @ResponseMessage('Support categories retrieved successfully')
  @Get('categories')
  getCategories(@Query('type') type?: SupportCategoryType) {
    return this.categoriesService.findAllActive(type);
  }

  @ApiOperation({ summary: 'Search help center articles' })
  @ResponseMessage('Support articles retrieved successfully')
  @Get('articles')
  getArticles(@Query() query: SupportArticleQueryDto) {
    return this.articlesService.findAllPublic(query);
  }

  @ApiOperation({ summary: 'Get help center article by slug' })
  @ResponseMessage('Support article retrieved successfully')
  @Get('articles/:slug')
  getArticleBySlug(@Param('slug') slug: string) {
    return this.articlesService.findOneBySlug(slug);
  }

  @ApiOperation({ summary: 'Search FAQs' })
  @ResponseMessage('Support FAQs retrieved successfully')
  @Get('faqs')
  getFaqs(@Query() query: SupportFaqQueryDto) {
    return this.faqsService.findAllPublic(query);
  }

  @ApiOperation({ summary: 'List active order-support reasons for a workflow' })
  @ResponseMessage('Order support reasons retrieved successfully')
  @UseGuards(OptionalSessionCookieGuard)
  @Get('reasons')
  getOrderSupportReasons(
    @Query() query: PublicOrderSupportReasonsQueryDto,
    @CurrentSessionUser() user?: IUserSessionContext,
  ) {
    return this.orderSupportReasonsService.findActiveReasons(
      query.workflow,
      query.orderId,
      user?.isRegistered ? user.sub : undefined,
    );
  }

  @ApiOperation({ summary: 'Combined search across articles and FAQs' })
  @ResponseMessage('Support search results retrieved successfully')
  @Get('search')
  async search(@Query() query: PublicSupportSearchQueryDto) {
    const [articles, faqs] = await Promise.all([
      this.articlesService.findAllPublic({
        ...query,
        page: query.page,
        limit: query.limit,
      }),
      this.faqsService.findAllPublic({
        ...query,
        page: query.page,
        limit: query.limit,
      }),
    ]);

    return { articles: articles.data, faqs: faqs.data };
  }
}
