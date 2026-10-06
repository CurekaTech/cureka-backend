import { NotFoundException } from '@nestjs/common';
import { PublicMediaService } from './public-media.service';

describe('PublicMediaService', () => {
  const storage = {
    createReadStream: jest.fn(),
  };
  const service = new PublicMediaService(storage as never);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('streams merchandising objects with public cache headers', async () => {
    const stream = { pipe: jest.fn() };
    storage.createReadStream.mockResolvedValue(stream);

    const result = await service.openStream('banners/hero.png');
    expect(result.key).toBe('banners/hero.png');
    expect(result.contentType).toBe('image/png');
    expect(result.cacheControl).toBe('public, max-age=86400');
    expect(result.contentDisposition).toBe('inline; filename="hero.png"');
    expect(result.stream).toBe(stream);
  });

  it('uses a long immutable TTL for derivatives', async () => {
    storage.createReadStream.mockResolvedValue({});
    const result = await service.openStream('derivatives/v1/abc/w800.webp');
    expect(result.cacheControl).toBe('public, max-age=31536000, immutable');
    expect(result.contentType).toBe('image/webp');
  });

  it('returns 404 for private folders without probing storage', async () => {
    await expect(service.openStream('avatars/secret.png')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.openStream('return-evidence/photo.jpg')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.createReadStream).not.toHaveBeenCalled();
  });

  it('returns 404 for path traversal', async () => {
    await expect(service.openStream('banners/../avatars/x.png')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.createReadStream).not.toHaveBeenCalled();
  });
});
