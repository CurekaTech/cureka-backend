import { ProductUpdatedEvent } from '@packages/events';
import { ConfigService } from '@nestjs/config';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { UnicommerceProductQueueService } from '../services/unicommerce-product-queue.service';
import { UnicommerceProductListener } from './unicommerce-product.listener';

describe('UnicommerceProductListener', () => {
  const productsRepository = {
    findByRefId: jest.fn(),
  } as unknown as ProductsRepository;
  const queueService = {
    enqueuePushProduct: jest.fn(),
  } as unknown as UnicommerceProductQueueService;
  const configService = {
    get: jest.fn().mockReturnValue(true),
  } as unknown as ConfigService;
  const listener = new UnicommerceProductListener(
    configService,
    productsRepository,
    queueService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enqueues a versioned push for a published product', async () => {
    const updatedAt = new Date('2026-07-17T10:00:00.000Z');
    (productsRepository.findByRefId as jest.Mock).mockResolvedValue({
      refId: 'PRD-001',
      status: ProductStatus.PUBLISHED,
      publishedAt: new Date('2026-07-17T09:00:00.000Z'),
      updatedAt,
    });

    await listener.onProductUpdated(
      new ProductUpdatedEvent('PRD-001', 'status_updated'),
    );

    expect(queueService.enqueuePushProduct).toHaveBeenCalledWith(
      'PRD-001',
      updatedAt.getTime().toString(),
    );
  });

  it('does not enqueue drafts or unpublished records', async () => {
    (productsRepository.findByRefId as jest.Mock).mockResolvedValue({
      refId: 'PRD-001',
      status: ProductStatus.DRAFT,
      publishedAt: null,
      updatedAt: new Date(),
    });

    await listener.onProductUpdated(
      new ProductUpdatedEvent('PRD-001', 'updated'),
    );

    expect(queueService.enqueuePushProduct).not.toHaveBeenCalled();
  });
});
