import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { WishlistItemEntity } from '../entities/wishlist-item.entity';

@Injectable()
export class WishlistItemsRepository {
  constructor(
    @InjectRepository(WishlistItemEntity)
    private readonly repo: Repository<WishlistItemEntity>,
  ) {}

  create(data: Partial<WishlistItemEntity>, manager?: EntityManager): Promise<WishlistItemEntity> {
    const repository = manager ? manager.getRepository(WishlistItemEntity) : this.repo;
    const entity = repository.create(data);
    return repository.save(entity);
  }

  findAllByUserId(userId: string): Promise<WishlistItemEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  findPaginatedByUserId(
    userId: string,
    page: number,
    limit: number,
  ): Promise<[WishlistItemEntity[], number]> {
    return this.repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findProductIdsByUserId(userId: string, manager?: EntityManager): Promise<string[]> {
    const repository = manager ? manager.getRepository(WishlistItemEntity) : this.repo;
    return repository
      .createQueryBuilder('item')
      .select('item.product_id', 'productId')
      .where('item.user_id = :userId', { userId })
      .andWhere('item.deleted_at IS NULL')
      .orderBy('item.created_at', 'DESC')
      .getRawMany<{ productId: string }>()
      .then((rows) => rows.map((row) => row.productId));
  }

  findByUserAndProduct(
    userId: string,
    productId: string,
    manager?: EntityManager,
  ): Promise<WishlistItemEntity | null> {
    const repository = manager ? manager.getRepository(WishlistItemEntity) : this.repo;
    return repository.findOne({ where: { userId, productId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  async softDeleteByUserAndProduct(
    userId: string,
    productId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(WishlistItemEntity) : this.repo;
    await repository.softDelete({ userId, productId });
  }
}
