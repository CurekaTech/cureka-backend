import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ResponseMessage } from '@packages/common';
import { HomepageSectionsQueryDto, resolveHomepageSectionsFromFlags } from '../dto/homepage-sections-query.dto';
import { HomepageViewAllQueryDto } from '../dto/homepage-view-all-query.dto';
import { PublicProductQueryDto } from '../dto/public-product-query.dto';
import { HomepageSectionsService } from '../services/homepage-sections.service';
import { HomeSectionsService } from '@modules/master/services/home-sections.service';
import { HomepageService } from '../services/homepage.service';
import { PublicProductsService } from '../services/public-products.service';

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

  @ResponseMessage('Active brands retrieved successfully')
  @Get('brands')
  getBrandsViewAll(@Query() query: HomepageViewAllQueryDto) {
    return this.homepageService.getBrandsViewAll(query);
  }

  @ResponseMessage('Active wellness goals retrieved successfully')
  @Get('wellness-goals')
  getWellnessGoalsViewAll(@Query() query: HomepageViewAllQueryDto) {
    return this.homepageService.getWellnessGoalsViewAll(query);
  }

  /** Must be declared before any `health-concerns/:param` route if one is added later. */
  @ResponseMessage('Active health concerns retrieved successfully')
  @Get('health-concerns/view-all')
  getHealthConcernsViewAll(@Query() query: HomepageViewAllQueryDto) {
    return this.homepageService.getHealthConcernsViewAll(query);
  }

  @ResponseMessage('Homepage health concerns retrieved successfully')
  @Get('health-concerns')
  getHomePageHealthConcerns() {
    return this.homepageService.getHomePageHealthConcerns();
  }
}
