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
    const resolved = await this.resolveLiveRelativePath(relativePath);
    if (!resolved) {
      throw new NotFoundException('Sitemap file not found');
    }
    return this.storageService.createReadStream(this.liveKey(resolved));
  }

  /** Read live XML as utf8 text, or null if the object is missing. */
  async readLiveText(relativePath: string): Promise<string | null> {
    const resolved = await this.resolveLiveRelativePath(relativePath);
    if (!resolved) return null;
    const stream = await this.storageService.createReadStream(this.liveKey(resolved));
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  /** Accepts `brands.xml` or legacy `brands/brands.xml`. */
  async resolveLiveRelativePath(relativePath: string): Promise<string | null> {
    for (const candidate of this.livePathAliases(relativePath)) {
      if (await this.existsLive(candidate)) return candidate;
    }
    return null;
  }

  private livePathAliases(relativePath: string): string[] {
    const normalized = relativePath.replace(/^\/+/, '');
    const aliases = [normalized];
    const nested = normalized.match(/^([a-z0-9-]+)\/\1\.xml$/i);
    if (nested) aliases.push(`${nested[1]}.xml`);
    const flat = normalized.match(/^([a-z0-9-]+)\.xml$/i);
    if (flat && flat[1] !== 'static' && flat[1] !== 'sitemap') {
      aliases.push(`${flat[1]}/${flat[1]}.xml`);
    }
    return [...new Set(aliases)];
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
