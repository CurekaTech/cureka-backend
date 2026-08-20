import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RawResponse } from '@packages/common';
import {
  BobCreateOrderDto,
  BobPlaceOrderDto,
  BobUpdateProductTagsDto,
} from '../dto/bob.dto';
import { BobApiKeyGuard } from '../guards/bob-api-key.guard';
import { BobCatalogService } from '../services/bob-catalog.service';
import { BobOrdersService } from '../services/bob-orders.service';

@ApiTags('BOB / BusinessOnBot commerce')
@ApiHeader({ name: 'x-guest-id', required: true })
@UseGuards(BobApiKeyGuard)
@RawResponse()
@Controller('bob')
export class BobCommerceController {
  constructor(
    private readonly bobCatalogService: BobCatalogService,
    private readonly bobOrdersService: BobOrdersService,
  ) {}

  @ApiOperation({ summary: 'BOB: list categories' })
  @Get('categories')
  listCategories() {
    return this.bobCatalogService.listCategories();
  }

  @ApiOperation({ summary: 'BOB: products in a category' })
  @Get('categories/:categoryId/products')
  listProductsByCategory(@Param('categoryId') categoryId: string) {
    return this.bobCatalogService.listProductsByCategory(categoryId);
  }

  @ApiOperation({ summary: 'BOB: all products, or filter with ?ids=' })
  @Get('products')
  listProducts(@Query('ids') ids?: string) {
    return this.bobCatalogService.listProducts(ids);
  }

  @ApiOperation({ summary: 'BOB: product + variants' })
  @Get('products/:productId')
  getProduct(@Param('productId') productId: string) {
    return this.bobCatalogService.getProduct(productId);
  }

  @ApiOperation({ summary: 'BOB: replace product tags' })
  @Put('products/:productId')
  updateTags(@Param('productId') productId: string, @Body() dto: BobUpdateProductTagsDto) {
    return this.bobCatalogService.updateTags(productId, dto.tags);
  }

  @ApiOperation({ summary: 'BOB: variant by id' })
  @Get('variants/:variantId')
  getVariant(@Param('variantId') variantId: string) {
    return this.bobCatalogService.getVariant(variantId);
  }

  @ApiOperation({ summary: 'BOB: create pending draft order (not a real order)' })
  @Post('create-order')
  createOrder(@Body() dto: BobCreateOrderDto) {
    return this.bobOrdersService.createDraft(dto);
  }

  @ApiOperation({
    summary: 'BOB: place draft order (PROCESSING). COD: paymentPending=true. Prepaid: send paymentId.',
  })
  @Post('place-order')
  placeOrder(@Body() dto: BobPlaceOrderDto) {
    return this.bobOrdersService.place(dto);
  }
}
