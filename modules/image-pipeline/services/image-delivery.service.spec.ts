import { ImageDeliveryService } from './image-delivery.service';
import { ImageAssetStatus } from '../enums/image-asset-status.enum';
import { ImageAssetEntity } from '../entities/image-asset.entity';
import { IImageVariantRecord } from '../interfaces/image-pipeline.interface';

const BUCKET = 'from-storage-service';
const BANNER_KEY = 'banners/068fa179-05ff-4848-a3a8-6988d3fbd4fe.png';
const ORIGINAL_URL = `https://www.cureka.com/api/v1/public/media/${BANNER_KEY}`;

const derivative = (width: number): IImageVariantRecord => ({
  width,
  height: Math.round(width / 3),
  format: 'webp',
  bytes: width * 20,
  key: `derivatives/v1/abc/w${width}.webp`,
});

const publicUrl = (key: string): string => `https://www.cureka.com/api/v1/public/media/${key}`;

describe('ImageDeliveryService banner delivery', () => {
  const pipeline = { isDeliveryEnabled: jest.fn(() => true) };
  const assets = { findBySources: jest.fn() };
  const storage = {
    getBucketName: jest.fn(() => BUCKET),
    toFileReferenceResponses: jest.fn(
      async (refs: Array<{ key: string; name: string } | null>) =>
        refs.map((ref) =>
          ref
            ? { key: ref.key, name: ref.name, url: publicUrl(ref.key) }
            : null,
        ),
    ),
  };

  const service = () =>
    new ImageDeliveryService(pipeline as never, assets as never, storage as never);

  const reference = { key: BANNER_KEY, name: BUCKET };
  const signed = { ...reference, url: ORIGINAL_URL };

  const asset = (
    status: ImageAssetStatus,
    variants: IImageVariantRecord[],
    sourceWidth: number | null = 2400,
  ): ImageAssetEntity =>
    ({
      status,
      sourceBucket: BUCKET,
      sourceKey: BANNER_KEY,
      sourceWidth,
      sourceHeight: sourceWidth ? Math.round(sourceWidth / 3) : null,
      sourceMime: 'image/png',
      sourceBytes: 912_000,
      pipelineVersion: 'v1',
      variants,
      errorCode: null,
    }) as ImageAssetEntity;

  beforeEach(() => {
    jest.clearAllMocks();
    pipeline.isDeliveryEnabled.mockReturnValue(true);
    assets.findBySources.mockResolvedValue([]);
  });

  it('should point a ready banner url at the signed hero derivative', async () => {
    assets.findBySources.mockResolvedValue([
      asset(ImageAssetStatus.READY, [derivative(240), derivative(800), derivative(1200), derivative(1600)]),
    ]);

    const [result] = await service().attachToMany([reference], [signed]);

    expect(result?.url).toBe(publicUrl('derivatives/v1/abc/w800.webp'));
    expect(result?.key).toBe(BANNER_KEY);
    expect(result?.imageDelivery?.status).toBe('ready');
    expect(result?.imageDelivery?.original.url).toBe(ORIGINAL_URL);
    expect(result?.imageDelivery?.variants.map((item) => item.width)).toEqual([240, 800, 1200, 1600]);
    expect(storage.toFileReferenceResponses).toHaveBeenCalledWith([
      { key: 'derivatives/v1/abc/w240.webp', name: BUCKET },
      { key: 'derivatives/v1/abc/w800.webp', name: BUCKET },
      { key: 'derivatives/v1/abc/w1200.webp', name: BUCKET },
      { key: 'derivatives/v1/abc/w1600.webp', name: BUCKET },
    ]);
    expect(storage.getBucketName).toHaveBeenCalled();
  });

  it('should keep the original url when no image_assets record exists', async () => {
    const [result] = await service().attachToMany([reference], [signed]);

    expect(result?.url).toBe(ORIGINAL_URL);
    expect(result?.imageDelivery?.status).toBe('pending');
    expect(result?.imageDelivery?.original.url).toBe(ORIGINAL_URL);
    expect(result?.imageDelivery?.variants).toEqual([]);
    expect(storage.toFileReferenceResponses).not.toHaveBeenCalled();
  });

  it.each([ImageAssetStatus.PENDING, ImageAssetStatus.PROCESSING, ImageAssetStatus.FAILED, ImageAssetStatus.UNSUPPORTED])(
    'should keep the original url when the asset is %s',
    async (status) => {
      assets.findBySources.mockResolvedValue([asset(status, [])]);

      const [result] = await service().attachToMany([reference], [signed]);

      expect(result?.url).toBe(ORIGINAL_URL);
      expect(result?.imageDelivery?.variants).toEqual([]);
      expect(result?.imageDelivery?.original.url).toBe(ORIGINAL_URL);
    },
  );

  it('should keep the original url when no suitable derivative exists', async () => {
    assets.findBySources.mockResolvedValue([
      asset(ImageAssetStatus.PARTIAL, [derivative(100), derivative(240)]),
    ]);

    const [result] = await service().attachToMany([reference], [signed]);

    expect(result?.url).toBe(ORIGINAL_URL);
    expect(result?.imageDelivery?.status).toBe('partial');
    expect(result?.imageDelivery?.variants.map((item) => item.url)).toEqual([
      publicUrl('derivatives/v1/abc/w100.webp'),
      publicUrl('derivatives/v1/abc/w240.webp'),
    ]);
  });

  it('should point a product card at a webp at least 480px wide', async () => {
    const product = { key: 'images/product.jpg', name: BUCKET };
    assets.findBySources.mockResolvedValue([
      {
        ...asset(ImageAssetStatus.READY, [derivative(240), derivative(480), derivative(800)]),
        sourceKey: product.key,
      },
    ]);

    const [result] = await service().attachToMany(
      [product],
      [{ ...product, url: publicUrl(product.key) }],
    );

    expect(result?.url).toBe(publicUrl('derivatives/v1/abc/w480.webp'));
    expect(result?.imageDelivery?.status).toBe('ready');
    expect(result?.imageDelivery?.variants.map((item) => item.width)).toEqual([240, 480, 800]);
    expect(result?.imageDelivery?.variants.every((item) => item.format === 'webp')).toBe(true);
    expect(result?.imageDelivery?.original.url).toBe(publicUrl(product.key));
  });

  it('should omit delivery metadata when delivery is disabled', async () => {
    pipeline.isDeliveryEnabled.mockReturnValue(false);

    const result = await service().attachToResponse(reference, signed);

    expect(result).toEqual(signed);
    expect(result?.imageDelivery).toBeUndefined();
    expect(assets.findBySources).not.toHaveBeenCalled();
  });
});
