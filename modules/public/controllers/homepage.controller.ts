import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { HomepageSectionsQueryDto, resolveHomepageSectionsFromFlags } from '../dto/homepage-sections-query.dto';
import { HomepageViewAllQueryDto } from '../dto/homepage-view-all-query.dto';
import { PublicProductQueryDto } from '../dto/public-product-query.dto';
import { HomepageSectionsService } from '../services/homepage-sections.service';
import { HomeSectionsService } from '@modules/master/services/home-sections.service';
import { HomepageService } from '../services/homepage.service';
import { PublicProductsService } from '../services/public-products.service';

@ApiTags('Public Homepage')
@Controller('public/homepage')
export class HomepageController {
  constructor(
    private readonly homepageService: HomepageService,
    private readonly homepageSectionsService: HomepageSectionsService,
    private readonly homeSectionsService: HomeSectionsService,
    private readonly publicProductsService: PublicProductsService,
  ) {}

  @ResponseMessage('Homepage sections retrieved successfully')
  @Get('sections')
  getSections(@Query() query: HomepageSectionsQueryDto) {
    return this.homepageSectionsService.getSections(resolveHomepageSectionsFromFlags(query));
  }

  @ResponseMessage('Best sellers retrieved successfully')
  @Get('best-sellers')
  getBestSellers(@Query() query: PublicProductQueryDto) {
    return this.publicProductsService.findBestSellers(query);
  }

  /**
   * All predefined CMS static pages in one payload, keyed for footer / legal links.
   * Keys: aboutCureka, privacyPolicy, termsAndConditions, returnsRefunds, shippingPolicy.
   * Inactive pages are `null`.
   */
  @ResponseMessage('CMS pages retrieved successfully')
  @Get('cms-pages')
  getCmsPages() {
    return this.homepageService.getPublicCmsPages();
  }

  /** View all brands (paginated) — use from Brands We Trust "View all". */
  @ResponseMessage('Brands retrieved successfully')
  @Get('brands')
  getAllBrands(@Query() query: HomepageViewAllQueryDto) {
    return this.homepageService.findAllBrandsPaginated(query);
  }

  /**
   * View all health concerns (paginated) — use from health-concern homepage "View all".
   * Must be declared before `health-concerns` if a param route is added later.
   */
  @ResponseMessage('Health concerns retrieved successfully')
  @Get('health-concerns/view-all')
  getAllHealthConcerns(@Query() query: HomepageViewAllQueryDto) {
    return this.homepageService.findAllHealthConcernsPaginated(query);
  }

  /** View all wellness goals (paginated) — use from Shop by Wellness Goals "View all". */
  @ResponseMessage('Wellness goals retrieved successfully')
  @Get('wellness-goals')
  getAllWellnessGoals(@Query() query: HomepageViewAllQueryDto) {
    return this.homepageService.findAllWellnessGoalsPaginated(query);
  }

  @ResponseMessage('Active home sections retrieved successfully')
  @Get('home-sections/active')
  getActiveHomeSections() {
    return this.homeSectionsService.findActive();
  }

  @ResponseMessage('Home section retrieved successfully')
  @Get('home-sections/:slug')
  getHomeSectionBySlug(@Param('slug') slug: string) {
    if (!slug?.trim()) {
      throw new NotFoundException('Home section slug is required');
    }
    return this.homepageSectionsService.getCustomSectionBySlug(slug.trim());
  }

  @ResponseMessage('Header categories retrieved successfully')
  @Get('category/header')
  getHeaderCategoryTree() {
    return this.homepageService.getHeaderCategoryTree();
  }

  @ResponseMessage('Homepage banners retrieved successfully')
  @Get('banners')
  getHomepageBanners() {
    return this.homepageService.getHomepageBanners();
  }

  /**
   * Active health concerns flagged for homepage (`inHomePage`), ordered by sortIndex.
   * Use this for the mobile (and web) homepage health-concern strip.
   * Tap-through: GET /public/products?healthConcernSlug={slug}
   */
  @ApiOperation({
    summary: 'Homepage health concerns (mobile + web strip)',
    description:
      'Returns active health concerns with inHomePage=true, ordered by sortIndex. Includes icon, banner, slug, and description for homepage cards.',
  })
  @ResponseMessage('Homepage health concerns retrieved successfully')
  @Get('health-concerns')
  getHomePageHealthConcerns() {
    return this.homepageService.getHomePageHealthConcerns();
  }
}
