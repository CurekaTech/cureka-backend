import { Controller, Get, Query } from '@nestjs/common';
import { ResponseMessage } from '@packages/common';
import { PublicSearchQueryDto } from '../dto/public-search-query.dto';
import { PublicSearchService } from '../services/public-search.service';

@Controller('public/search')
export class PublicSearchController {
  constructor(private readonly publicSearchService: PublicSearchService) {}

  @ResponseMessage('Search results retrieved successfully')
  @Get()
  search(@Query() query: PublicSearchQueryDto) {
    return this.publicSearchService.search(query.q, query.per_page ?? 10);
  }
}
