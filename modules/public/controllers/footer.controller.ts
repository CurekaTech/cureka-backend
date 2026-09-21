import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { FastifyReply } from 'fastify';
import { PUBLIC_CHROME_CACHE_CONTROL } from '../constants/public-chrome-cache.constant';
import { HomepageService } from '../services/homepage.service';

@ApiTags('Public Footer')
@Controller('public/footer')
export class FooterController {
  constructor(private readonly homepageService: HomepageService) {}

  @ApiOperation({
    summary: 'Footer nav (categories, brands, policy links)',
    description:
      'Lightweight chrome for every page. Max 8 categories + 8 brands (text only) + active policy links without HTML bodies.',
  })
  @ResponseMessage('Footer nav retrieved successfully')
  @Get('nav')
  async getNav(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Cache-Control', PUBLIC_CHROME_CACHE_CONTROL);
    return this.homepageService.getFooterNav();
  }
}
