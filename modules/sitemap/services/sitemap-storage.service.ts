import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { StorageService } from '@packages/storage';

const XML_MIME = 'application/xml';

@Injectable()
export class SitemapStorageService {
  private readonly logger = new Logger(SitemapStorageService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  storageRoot(): string {
    return (this.configService.get<string>('sitemap.storagePath') ?? 'sitemaps').replace(
      /^\/+|\/+$/g,
      '',
    );
  }

  liveKey(relativePath: string): string {
    return `${this.storageRoot()}/${relativePath.replace(/^\/+/, '')}`;
  }

  stagingKey(generationId: string, relativePath: string): string {
    return `${this.storageRoot()}/.staging/${generationId}/${relativePath.replace(/^\/+/, '')}`;
  }

  async writeStagingXml(generationId: string, relativePath: string, xml: string): Promise<void> {
    await this.storageService.uploadAtPath({
      relativePath: this.stagingKey(generationId, relativePath),
      stream: Readable.from([Buffer.from(xml, 'utf8')]),
      mimetype: XML_MIME,
    });
  }

  async copyStagingToLive(generationId: string, relativePath: string): Promise<void> {
    await this.storageService.copy(
      this.stagingKey(generationId, relativePath),
      this.liveKey(relativePath),
    );
  }

  async existsLive(relativePath: string): Promise<boolean> {
    return this.storageService.exists(this.liveKey(relativePath));
  }

  async listLive(prefix: string): Promise<string[]> {
    const keys = await this.storageService.list(this.liveKey(prefix));
    const root = `${this.storageRoot()}/`;
    return keys
      .filter((key) => !key.includes('/.staging/'))
      .map((key) => (key.startsWith(root) ? key.slice(root.length) : key));
  }

  async deleteLive(relativePath: string): Promise<void> {
    await this.storageService.delete(this.liveKey(relativePath));
  }

  async deleteStaging(generationId: string): Promise<void> {
    const prefix = `${this.storageRoot()}/.staging/${generationId}/`;
    const keys = await this.storageService.list(prefix);
    await Promise.all(keys.map((key) => this.storageService.delete(key)));
  }

  async cleanupStaleStaging(): Promise<void> {
    const prefix = `${this.storageRoot()}/.staging/`;
    const keys = await this.storageService.list(prefix);
    if (!keys.length) return;
    this.logger.warn({ count: keys.length }, 'Removing leftover sitemap staging objects');
    await Promise.all(keys.map((key) => this.storageService.delete(key)));
  }

  async createLiveReadStream(relativePath: string): Promise<Readable> {
    const exists = await this.existsLive(relativePath);
    if (!exists) {
      throw new NotFoundException('Sitemap file not found');
    }
    return this.storageService.createReadStream(this.liveKey(relativePath));
  }

  /**
   * Copy children first, overwrite index last, then prune obsolete live shards.
   * Staging is always deleted afterwards (success or caller catch).
   */
  async publishLive(options: {
    generationId: string;
    childRelativePaths: string[];
    indexRelativePath: string;
    obsoleteLivePaths: string[];
  }): Promise<void> {
    for (const relativePath of options.childRelativePaths) {
      await this.copyStagingToLive(options.generationId, relativePath);
    }
    await this.copyStagingToLive(options.generationId, options.indexRelativePath);
    for (const relativePath of options.obsoleteLivePaths) {
      await this.deleteLive(relativePath);
    }
  }
}
