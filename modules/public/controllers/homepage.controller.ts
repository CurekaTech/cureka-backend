import { Controller, Get, Query } from '@nestjs/common';
import { ResponseMessage } from '@packages/common';
import { HomepageSectionsQueryDto, resolveHomepageSectionsFromFlags } from '../dto/homepage-sections-query.dto';
import { HomepageSectionsService } from '../services/homepage-sections.service';
import { HomeSectionsService } from '@modules/master/services/home-sections.service';
import { HomepageService } from '../services/homepage.service';

@Controller('public/homepage')
export class HomepageController {
  constructor(
    private readonly homepageService: HomepageService,
    private readonly homepageSectionsService: HomepageSectionsService,
    private readonly homeSectionsService: HomeSectionsService,
  ) {}

  @ResponseMessage('Homepage sections retrieved successfully')
  @Get('sections')
  getSections(@Query() query: HomepageSectionsQueryDto) {
    const requested = resolveHomepageSectionsFromFlags(query);
    if (requested !== undefined) {
      return this.homepageSectionsService.getFlaggedSections(requested);
    }
    return this.homepageSectionsService.getActiveSectionsWithData();
  }

  @ResponseMessage('Active home sections retrieved successfully')
  @Get('home-sections/active')
  getActiveHomeSections() {
    return this.homeSectionsService.findActive();
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
}
