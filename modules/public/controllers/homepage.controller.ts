import { Controller, Get, Query } from '@nestjs/common';
import { ResponseMessage } from '@packages/common';
import { HomepageSectionsQueryDto, resolveHomepageSectionsFromFlags } from '../dto/homepage-sections-query.dto';
import { HomepageSectionsService } from '../services/homepage-sections.service';
import { HomepageService } from '../services/homepage.service';

@Controller('public/homepage')
export class HomepageController {
  constructor(
    private readonly homepageService: HomepageService,
    private readonly homepageSectionsService: HomepageSectionsService,
  ) {}

  @ResponseMessage('Homepage sections retrieved successfully')
  @Get('sections')
  getSections(@Query() query: HomepageSectionsQueryDto) {
    return this.homepageSectionsService.getSections(resolveHomepageSectionsFromFlags(query));
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
