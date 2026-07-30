import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { CmsPagesService } from '../services/cms-pages.service';

@ApiTags('CMS (Public)')
@Controller('cms')
export class PublicCmsPagesController {
  constructor(private readonly cmsPagesService: CmsPagesService) {}

  @ApiOperation({
    summary: 'Get an active CMS static page by slug',
    description:
      'Examples: /cms/about-cureka, /cms/privacy-policy, /cms/terms-and-conditions, /cms/returns-refunds, /cms/shipping-policy',
  })
  @ResponseMessage('CMS page retrieved successfully')
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.cmsPagesService.findPublicBySlug(slug);
  }
}
