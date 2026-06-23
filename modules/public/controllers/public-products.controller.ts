import { Controller, Get, Param, Query } from '@nestjs/common';
import { ResponseMessage } from '@packages/common';
import { PublicProductQueryDto } from '../dto/public-product-query.dto';
import { PublicProductsService } from '../services/public-products.service';

@Controller('public/products')
export class PublicProductsController {
  constructor(private readonly publicProductsService: PublicProductsService) {}

  @ResponseMessage('Products retrieved successfully')
  @Get()
  findAll(@Query() query: PublicProductQueryDto) {
    return this.publicProductsService.findAll(query);
  }

  @ResponseMessage('Product variants retrieved successfully')
  @Get('search')
  search(@Query() query: PublicProductQueryDto) {
    return this.publicProductsService.searchVariants(query);
  }

  @ResponseMessage('Product retrieved successfully')
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.publicProductsService.findBySlug(slug);
  }
}
