import { Controller, Get, NotFoundException, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { RawResponse } from '@packages/common';
import { PublicMediaService } from '@modules/uploads/services/public-media.service';

@ApiTags('Public Media')
@RawResponse()
@Controller('public')
export class PublicMediaController {
  constructor(private readonly publicMediaService: PublicMediaService) {}

  @ApiOperation({ summary: 'Public merchandising media stream (stable URL; bucket stays private)' })
  @Get('media/*')
  async getMedia(@Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const pathname = (req.url ?? '').split('?')[0] ?? '';
    const marker = '/public/media/';
    const idx = pathname.indexOf(marker);
    const rawKey = idx >= 0 ? pathname.slice(idx + marker.length) : '';
    if (!rawKey.trim()) {
      throw new NotFoundException('Media not found');
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(rawKey);
    } catch {
      throw new NotFoundException('Media not found');
    }

    try {
      const { stream, contentType, cacheControl, contentDisposition } =
        await this.publicMediaService.openStream(decoded);
      await reply
        .header('Content-Type', contentType)
        .header('Cache-Control', cacheControl)
        .header('Content-Disposition', contentDisposition)
        .header('X-Content-Type-Options', 'nosniff')
        .send(req.method === 'HEAD' ? '' : stream);
    } catch (error) {
      if (error instanceof NotFoundException && !reply.sent) {
        await reply.code(404).type('text/plain; charset=utf-8').send('Media not found');
        return;
      }
      throw error;
    }
  }
}
