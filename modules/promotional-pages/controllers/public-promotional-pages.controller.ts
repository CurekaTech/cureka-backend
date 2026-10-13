import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { PromotionalPagesService } from '../services/promotional-pages.service';

@ApiTags('Public Promotional Pages')
@Controller('public/promotional')
export class PublicPromotionalPagesController {
  constructor(private readonly promotionalPagesService: PromotionalPagesService) {}

  @ApiOperation({ summary: 'Published promotional landing page by slug' })
  @ResponseMessage('Promotional page retrieved successfully')
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.promotionalPagesService.findPublicBySlug(slug);
  }
}
