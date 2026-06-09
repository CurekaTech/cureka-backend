import { Controller, Get } from '@nestjs/common';
import { ResponseMessage } from '@packages/common';
import { BannersService } from '../services/banners.service';

/** Public storefront endpoints — no auth required. */
@Controller('storefront/homepage')
export class StorefrontBannersController {
  constructor(private readonly bannersService: BannersService) {}

  @ResponseMessage('Homepage banners retrieved successfully')
  @Get('banners')
  getHomepageBanners() {
    return this.bannersService.getHomepageBanners();
  }
}
