import { Injectable, NotFoundException } from '@nestjs/common';
import { StorageService } from '@packages/storage';
import { Readable } from 'stream';
import {
  guessMimeFromKey,
  isAllowedPublicMediaKey,
  normalizeStorageKey,
} from '../utils/google-merchant-media-key.util';

@Injectable()
export class PublicMediaService {
  constructor(private readonly storageService: StorageService) {}

  async openStream(rawKey: string): Promise<{ stream: Readable; contentType: string; key: string }> {
    const key = normalizeStorageKey(rawKey);
    if (!key || !isAllowedPublicMediaKey(key)) {
      throw new NotFoundException('Media not found');
    }

    try {
      const stream = await this.storageService.createReadStream(key);
      return {
        stream,
        contentType: guessMimeFromKey(key),
        key,
      };
    } catch {
      throw new NotFoundException('Media not found');
    }
  }
}
