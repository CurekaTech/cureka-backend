import { Controller, Get, NotFoundException, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { RawResponse } from '@packages/common';
import {
  GOOGLE_MERCHANT_CACHE_CONTROL,
  GOOGLE_MERCHANT_CONTENT_TYPE,
  PUBLIC_MEDIA_CACHE_CONTROL,
} from '../constants/google-merchant.constants';
import { GoogleMerchantFeedService } from '../services/google-merchant-feed.service';
import { PublicMediaService } from '../services/public-media.service';

@ApiTags('Public Google Merchant')
@RawResponse()
@Controller('public')
export class GoogleMerchantFeedController {
  constructor(
    private readonly feedService: GoogleMerchantFeedService,
    private readonly publicMediaService: PublicMediaService,
  ) {}

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

  @ApiOperation({ summary: 'Public product media stream (stable URL for Merchant image_link)' })
  @Get('media/*')
  async getMedia(@Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const pathname = (req.url ?? '').split('?')[0] ?? '';
    const marker = '/public/media/';
    const idx = pathname.indexOf(marker);
    const rawKey = idx >= 0 ? pathname.slice(idx + marker.length) : '';
    if (!rawKey.trim()) {
      throw new NotFoundException('Media not found');
    }

    try {
      const decoded = decodeURIComponent(rawKey);
      const { stream, contentType } = await this.publicMediaService.openStream(decoded);
      await reply
        .header('Content-Type', contentType)
        .header('Cache-Control', PUBLIC_MEDIA_CACHE_CONTROL)
        .send(stream);
    } catch (error) {
      if (error instanceof NotFoundException && !reply.sent) {
        await reply.code(404).type('text/plain; charset=utf-8').send('Media not found');
        return;
      }
      throw error;
    }
  }
}
