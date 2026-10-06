import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { RawResponse } from '@packages/common';
import {
  GOOGLE_MERCHANT_CACHE_CONTROL,
  GOOGLE_MERCHANT_CONTENT_TYPE,
} from '../constants/google-merchant.constants';
import { GoogleMerchantFeedService } from '../services/google-merchant-feed.service';

@ApiTags('Public Google Merchant')
@RawResponse()
@Controller('public')
export class GoogleMerchantFeedController {
  constructor(private readonly feedService: GoogleMerchantFeedService) {}

  @ApiOperation({ summary: 'Google Merchant Center product feed (RSS XML)' })
  @Get('google-merchant-feed.xml')
  async getFeed(@Res() reply: FastifyReply): Promise<void> {
    const { xml, stats } = await this.feedService.buildXml();
    reply
      .header('Content-Type', GOOGLE_MERCHANT_CONTENT_TYPE)
      .header('Cache-Control', GOOGLE_MERCHANT_CACHE_CONTROL)
      .header('X-Feed-Item-Count', String(stats.itemCount))
      .send(xml);
  }
}
