import { ImageBackfillService } from './image-backfill.service';
import { ImageBackfillEntityType } from '../enums/image-backfill-entity.enum';
import { ImageAssetStatus } from '../enums/image-asset-status.enum';

describe('ImageBackfillService', () => {
  const dataSource = {
    query: jest.fn(),
  };
  const storage = {
    getBucketName: jest.fn(() => 'bucket'),
    exists: jest.fn(),
  };
  const pipeline = {
    isProcessingEnabled: jest.fn(() => true),
    pipelineVersion: jest.fn(() => 'v1'),
    scheduleSource: jest.fn(),
  };
  const assets = {
    findBySource: jest.fn(),
  };
  const emptyStats = {
    scanned: 0,
    eligible: 0,
    alreadyComplete: 0,
    queued: 0,
    unsupported: 0,
    missingSource: 0,
    failed: 0,
    skippedDuplicate: 0,
  };
  const checkpoints = {
    emptyStats: jest.fn(() => ({ ...emptyStats })),
    get: jest.fn(),
    saveProgress: jest.fn(),
  };

  const service = new ImageBackfillService(
    dataSource as never,
    { get: () => 'derivatives' } as never,
    storage as never,
    pipeline as never,
    assets as never,
    checkpoints as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    checkpoints.emptyStats.mockReturnValue({ ...emptyStats });
    storage.getBucketName.mockReturnValue('bucket');
    pipeline.isProcessingEnabled.mockReturnValue(true);
    pipeline.pipelineVersion.mockReturnValue('v1');
  });

  it('should dry-run without enqueueing and skip already-current variants', async () => {
    dataSource.query.mockResolvedValueOnce([
      { cursor_id: '1', ref: { key: 'banners/hero.jpg', name: 'bucket' } },
      { cursor_id: '2', ref: { key: 'banners/hero.jpg', name: 'bucket' } },
    ]);
    storage.exists.mockResolvedValue(true);
    assets.findBySource.mockResolvedValue({
      pipelineVersion: 'v1',
      status: ImageAssetStatus.READY,
    });

    const stats = await service.run({
      apply: false,
      resume: false,
      retryFailed: false,
      entityTypes: [ImageBackfillEntityType.BANNERS],
      batchSize: 50,
      rateLimitMs: 0,
      checkpointId: 'test',
    });

    expect(pipeline.scheduleSource).not.toHaveBeenCalled();
    expect(stats.scanned).toBe(2);
    expect(stats.skippedDuplicate).toBe(1);
    expect(stats.alreadyComplete).toBe(1);
  });

  it('should resume from checkpoint cursor and enqueue on apply', async () => {
    checkpoints.get.mockResolvedValue({
      entityType: ImageBackfillEntityType.BANNERS,
      cursorId: '10',
      stats: { ...emptyStats, scanned: 4 },
    });
    dataSource.query
      .mockResolvedValueOnce([{ cursor_id: '11', ref: { key: 'banners/new.jpg', name: 'bucket' } }])
      .mockResolvedValueOnce([]);
    storage.exists.mockResolvedValue(true);
    assets.findBySource.mockResolvedValue(null);
    pipeline.scheduleSource.mockResolvedValue('queued');

    const stats = await service.run({
      apply: true,
      resume: true,
      retryFailed: false,
      entityTypes: [ImageBackfillEntityType.BANNERS],
      batchSize: 50,
      rateLimitMs: 0,
      checkpointId: 'test',
    });

    expect(dataSource.query.mock.calls[0][1][0]).toBe('10');
    expect(pipeline.scheduleSource).toHaveBeenCalledWith({
      key: 'banners/new.jpg',
      bucket: 'bucket',
    });
    expect(stats.queued).toBe(1);
    expect(checkpoints.saveProgress).toHaveBeenCalled();
  });

  it('should count missing sources without scheduling', async () => {
    dataSource.query.mockResolvedValueOnce([
      { cursor_id: '1', ref: { key: 'banners/missing.jpg', name: 'bucket' } },
    ]);
    storage.exists.mockResolvedValue(false);

    const stats = await service.run({
      apply: true,
      resume: false,
      retryFailed: false,
      entityTypes: [ImageBackfillEntityType.BANNERS],
      sampleLimit: 5,
      batchSize: 50,
      rateLimitMs: 0,
      checkpointId: 'test',
    });

    expect(stats.missingSource).toBe(1);
    expect(pipeline.scheduleSource).not.toHaveBeenCalled();
  });

  it('should put homepage merchandising types first', () => {
    expect(service.defaultEntityTypes(true).slice(0, 6)).toEqual([
      ImageBackfillEntityType.BANNERS,
      ImageBackfillEntityType.HOME_SECTIONS,
      ImageBackfillEntityType.PRODUCTS,
      ImageBackfillEntityType.BRANDS,
      ImageBackfillEntityType.CATEGORIES,
      ImageBackfillEntityType.HEALTH_CONCERNS,
    ]);
  });

  it('should queue explicit object keys without a table scan', async () => {
    storage.exists.mockResolvedValue(true);
    assets.findBySource.mockResolvedValue(null);
    pipeline.scheduleSource.mockResolvedValue('queued');

    const stats = await service.enqueueKeys(
      ['banners/068fa179-05ff-4848-a3a8-6988d3fbd4fe.png'],
      true,
    );

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(pipeline.scheduleSource).toHaveBeenCalledWith({
      key: 'banners/068fa179-05ff-4848-a3a8-6988d3fbd4fe.png',
      bucket: 'bucket',
    });
    expect(stats.queued).toBe(1);
  });
});
