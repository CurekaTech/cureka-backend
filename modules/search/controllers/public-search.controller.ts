import { Controller, Get, Query } from '@nestjs/common';
import { ResponseMessage } from '@packages/common';
import { AdminSettingsService } from '@modules/admin-settings/services/admin-settings.service';
import { PublicSearchPopularQueryDto } from '../dto/public-search-popular-query.dto';
import { PublicSearchQueryDto } from '../dto/public-search-query.dto';
import { PublicSearchService } from '../services/public-search.service';

@Controller('public/search')
export class PublicSearchController {
  constructor(
    private readonly publicSearchService: PublicSearchService,
    private readonly adminSettingsService: AdminSettingsService,
  ) {}

  @ResponseMessage('Popular search items retrieved successfully')
  @Get('popular')
  popular(@Query() query: PublicSearchPopularQueryDto) {
    return this.publicSearchService.getPopular(query.per_page ?? 4);
  }

  @ResponseMessage('Search config retrieved successfully')
  @Get('config')
  getConfig() {
    return this.adminSettingsService.getEnableTypesense();
  }

  @ResponseMessage('Search results retrieved successfully')
  @Get()
  search(@Query() query: PublicSearchQueryDto) {
    return this.publicSearchService.search(query.q, query.per_page ?? 10);
  }
}
