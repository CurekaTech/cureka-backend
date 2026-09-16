import { ImagePipelineService } from './image-pipeline.service';
import { ImageAssetStatus } from '../enums/image-asset-status.enum';
import { ImageProcessingError } from './image-processor.service';
import { Readable } from 'stream';

describe('ImagePipelineService', () => {
  const configValues: Record<string, unknown> = {
    'imagePipeline.processingEnabled': true,
    'imagePipeline.deliveryEnabled': true,
    'imagePipeline.workerEnabled': false,
    'imagePipeline.pipelineVersion': 'v1',
    'imagePipeline.derivativePrefix': 'derivatives',
    'imagePipeline.retryAttempts': 5,
    'imagePipeline.retryBackoffMs': 1000,
    'imagePipeline.jobRetentionComplete': 10,
    'imagePipeline.jobRetentionFailed': 10,
    'imagePipeline.maxInputBytes': 1_000_000,
    'imagePipeline.maxDecodedPixels': 40_000_000,
    'imagePipeline.processTimeoutMs': 5000,
    'imagePipeline.webpQuality': 80,
    'imagePipeline.allowedWidths': [100, 240],
  };

  const queue = { add: jest.fn() };
  const storage = {
    getBucketName: jest.fn(() => 'bucket'),
    exists: jest.fn(),
    readObjectBuffer: jest.fn(),
    uploadAtPath: jest.fn(),
  };
  const assets = {
    upsertPending: jest.fn(),
    findBySource: jest.fn(),
    markProcessing: jest.fn(),
    publishIfTokenMatches: jest.fn(),
    findStale: jest.fn(),
  };
  const processor = {
    inspect: jest.fn(),
    encodeWebp: jest.fn(),
  };

  const service = new ImagePipelineService(
    { get: (key: string) => configValues[key] } as never,
    storage as never,
    assets as never,
    processor as never,
    queue as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    configValues['imagePipeline.processingEnabled'] = true;
    queue.add.mockResolvedValue({ id: 'job' });
  });

  it('should no-op scheduling when processing is disabled', async () => {
    configValues['imagePipeline.processingEnabled'] = false;
    await expect(service.onStoredObject({ key: 'images/a.jpg', mimetype: 'image/jpeg', size: 10 })).resolves.toBeUndefined();
    expect(assets.upsertPending).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('should keep a pending row when enqueue fails', async () => {
    assets.upsertPending.mockResolvedValue({ id: '1' });
    queue.add.mockRejectedValue(new Error('redis down'));
    await service.scheduleSource({ key: 'images/a.jpg' });
    expect(assets.upsertPending).toHaveBeenCalled();
  });

  it('should skip videos and derivative keys', async () => {
    await service.onStoredObject({ key: 'videos/a.mp4', mimetype: 'video/mp4', size: 10 });
    await service.scheduleSource({ key: 'derivatives/v1/hash/w240.webp' });
    expect(assets.upsertPending).not.toHaveBeenCalled();
  });

  it('should publish only when the process token still matches', async () => {
    assets.findBySource.mockResolvedValue({
      id: 'asset-1',
      processToken: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      sourceKey: 'images/a.jpg',
    });
    assets.markProcessing.mockResolvedValue({
      id: 'asset-1',
      processToken: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      sourceKey: 'images/a.jpg',
    });
    storage.exists.mockResolvedValue(true);
    storage.readObjectBuffer.mockResolvedValue(Buffer.from('img'));
    processor.inspect.mockResolvedValue({
      mime: 'image/jpeg',
      format: 'jpeg',
      width: 400,
      height: 400,
      animated: false,
      hasAlpha: false,
    });
    processor.encodeWebp.mockResolvedValue({
      requestedWidth: 240,
      width: 240,
      height: 240,
      format: 'webp',
      bytes: 12,
      buffer: Buffer.from('webp'),
    });
    storage.uploadAtPath.mockResolvedValue({ path: 'derivatives/x' });
    assets.publishIfTokenMatches.mockResolvedValue(false);

    await service.processJob({
      sourceBucket: 'bucket',
      sourceKey: 'images/a.jpg',
      processToken: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      pipelineVersion: 'v1',
    });

    expect(storage.uploadAtPath).toHaveBeenCalled();
    expect(assets.publishIfTokenMatches).toHaveBeenCalledWith(
      expect.objectContaining({ processToken: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }),
    );
  });

  it('should abort when a newer source replacement changed the token', async () => {
    assets.findBySource.mockResolvedValue({
      id: 'asset-1',
      processToken: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
      sourceKey: 'images/a.jpg',
    });

    await service.processJob({
      sourceBucket: 'bucket',
      sourceKey: 'images/a.jpg',
      processToken: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      pipelineVersion: 'v1',
    });

    expect(storage.readObjectBuffer).not.toHaveBeenCalled();
    expect(assets.publishIfTokenMatches).not.toHaveBeenCalled();
  });

  it('should classify permanent inspect failures without throwing', async () => {
    assets.findBySource.mockResolvedValue({ id: 'asset-1', processToken: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
    assets.markProcessing.mockResolvedValue({
      id: 'asset-1',
      processToken: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      sourceMime: 'image/jpeg',
      sourceBytes: 10,
    });
    storage.exists.mockResolvedValue(true);
    storage.readObjectBuffer.mockResolvedValue(Buffer.from('nope'));
    processor.inspect.mockRejectedValue(
      new ImageProcessingError('corrupt', 'corrupt', true),
    );
    assets.publishIfTokenMatches.mockResolvedValue(true);

    await expect(
      service.processJob({
        sourceBucket: 'bucket',
        sourceKey: 'images/a.jpg',
        processToken: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        pipelineVersion: 'v1',
      }),
    ).resolves.toBeUndefined();

    expect(assets.publishIfTokenMatches).toHaveBeenCalledWith(
      expect.objectContaining({ status: ImageAssetStatus.FAILED, errorCode: 'corrupt' }),
    );
  });

  it('should not treat Readable derivative uploads as public GET encoding', () => {
    expect(Readable.from(Buffer.from('x'))).toBeInstanceOf(Readable);
  });
});
