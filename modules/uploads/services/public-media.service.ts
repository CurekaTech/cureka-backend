import { Injectable, NotFoundException } from '@nestjs/common';
import {
  cacheControlForPublicMediaKey,
  guessMimeFromKey,
  isAllowedPublicMediaKey,
  normalizePublicMediaKey,
  publicMediaFilename,
  StorageService,
} from '@packages/storage';
import { Readable } from 'stream';

@Injectable()
export class PublicMediaService {
  constructor(private readonly storageService: StorageService) {}

  async openStream(rawKey: string): Promise<{
    stream: Readable;
    contentType: string;
    key: string;
    cacheControl: string;
    contentDisposition: string;
  }> {
    const key = normalizePublicMediaKey(rawKey);
    if (!key || !isAllowedPublicMediaKey(key)) {
      throw new NotFoundException('Media not found');
    }

    try {
      const stream = await this.storageService.createReadStream(key);
      const filename = publicMediaFilename(key);
      return {
        stream,
        contentType: guessMimeFromKey(key),
        key,
        cacheControl: cacheControlForPublicMediaKey(key),
        contentDisposition: `inline; filename="${filename}"`,
      };
    } catch {
      throw new NotFoundException('Media not found');
    }
  }
}
