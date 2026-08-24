import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
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

  @ApiOperation({ summary: 'Nested child sitemap XML, e.g. products/products-1.xml' })
  @Get('sitemaps/:group/:file')
  async getNestedChild(
    @Param('group') group: string,
    @Param('file') file: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.sendLiveFile(reply, `${group}/${file}`);
  }

  @ApiOperation({ summary: 'Child sitemap XML, e.g. brands.xml' })
  @Get('sitemaps/:file')
  async getChild(@Param('file') file: string, @Res() reply: FastifyReply): Promise<void> {
    await this.sendLiveFile(reply, file);
  }

  private assertSafeRelative(relative: string): void {
    const normalized = relative.replace(/\\/g, '/').replace(/^\/+/, '');
    if (
      !normalized ||
      normalized.includes('..') ||
      normalized.includes('.staging') ||
      !normalized.endsWith('.xml') ||
      !/^[a-z0-9][a-z0-9./-]*\.xml$/i.test(normalized)
    ) {
      throw new NotFoundException('Sitemap file not found');
    }
  }

  private async sendLiveFile(reply: FastifyReply, relativePath: string): Promise<void> {
    try {
      this.assertSafeRelative(relativePath);
      const stream = await this.storageService.createLiveReadStream(relativePath);
      await reply
        .header('Content-Type', SITEMAP_CONTENT_TYPE)
        .header('Cache-Control', SITEMAP_CACHE_CONTROL)
        .send(stream);
    } catch (error) {
      if (error instanceof NotFoundException && !reply.sent) {
        await reply.code(404).type('text/plain; charset=utf-8').send('Sitemap file not found');
        return;
      }
      throw error;
    }
  }
}
