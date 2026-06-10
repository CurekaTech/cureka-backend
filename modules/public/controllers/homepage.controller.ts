import { Controller, Get } from '@nestjs/common';
import { ResponseMessage } from '@packages/common';
import { HomepageService } from '../services/homepage.service';

@Controller('public/homepage')
export class HomepageController {
  constructor(private readonly homepageService: HomepageService) {}

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
