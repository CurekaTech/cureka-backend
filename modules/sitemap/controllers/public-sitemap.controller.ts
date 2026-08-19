import { Controller, Get, NotFoundException, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { RawResponse } from '@packages/common';
import { SITEMAP_CACHE_CONTROL, SITEMAP_CONTENT_TYPE } from '../constants/sitemap-queue.constants';
import { SitemapStorageService } from '../services/sitemap-storage.service';

@ApiTags('Public Sitemap')
@RawResponse()
@Controller('public')
export class PublicSitemapController {
  constructor(private readonly storageService: SitemapStorageService) {}

  @ApiOperation({ summary: 'Sitemap index XML (pre-generated, no database query)' })
  @Get('sitemap.xml')
  async getIndex(@Res() reply: FastifyReply): Promise<void> {
    await this.sendLiveFile(reply, 'sitemap.xml');
  }

  @ApiOperation({ summary: 'Child sitemap XML (pre-generated, no database query)' })
  @Get('sitemaps/*')
  async getChild(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const urlPath = (request.url ?? '').split('?')[0] ?? '';
    const marker = '/sitemaps/';
    const index = urlPath.lastIndexOf(marker) >= 0 ? urlPath.indexOf(marker) : -1;
    const relative = index >= 0 ? urlPath.slice(index + marker.length) : '';
    this.assertSafeRelative(relative);
    await this.sendLiveFile(reply, relative);
  }

  private assertSafeRelative(relative: string): void {
    const normalized = relative.replace(/\\/g, '/').replace(/^\/+/, '');
    if (
      !normalized ||
      normalized.includes('..') ||
      normalized.includes('.staging') ||
      normalized.startsWith('/')
    ) {
      throw new NotFoundException('Sitemap file not found');
    }
  }

  private async sendLiveFile(reply: FastifyReply, relativePath: string): Promise<void> {
    const stream = await this.storageService.createLiveReadStream(relativePath);
    reply
      .header('Content-Type', SITEMAP_CONTENT_TYPE)
      .header('Cache-Control', SITEMAP_CACHE_CONTROL)
      .send(stream);
  }
}
