import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { PublicBundleQueryDto } from '../dto/public-bundle-query.dto';
import { PublicBundlesService } from '../services/public-bundles.service';

@ApiTags('Public Bundles')
@Controller('public/bundles')
export class PublicBundlesController {
  constructor(private readonly publicBundlesService: PublicBundlesService) {}

  @ApiOperation({
    summary: 'List published bundle products (paginated)',
    description:
      'Returns active/published bundles with name, bundleIcon, brand (name/logo/etc), curatedBy, curatedFor, pricing, and OOS.',
  })
  @ResponseMessage('Bundles retrieved successfully')
  @Get()
  findAll(@Query() query: PublicBundleQueryDto) {
    return this.publicBundlesService.findAll(query);
  }

  @ApiOperation({
    summary: 'Get published bundle detail by slug',
    description:
      'Returns full bundle detail including bundleIcon, brand, curated fields, media, pricing variant, and child bundleItems.',
  })
  @ResponseMessage('Bundle retrieved successfully')
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.publicBundlesService.findBySlug(slug);
  }
}
