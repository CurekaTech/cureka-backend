import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { EntityManager, QueryDeepPartialEntity, Repository } from 'typeorm';
import { SavedForLaterItemEntity } from '../entities/saved-for-later-item.entity';

const SORTABLE: Record<string, string> = {
  createdAt: 'item.createdAt',
  updatedAt: 'item.updatedAt',
};

const LIST_RELATIONS = {
  product: { media: true, brand: true },
  variant: {
    attributeValues: {
      attribute: true,
    },
  },
} as const;

@Injectable()
export class SavedForLaterItemsRepository {
  constructor(
    @InjectRepository(SavedForLaterItemEntity)
    private readonly repo: Repository<SavedForLaterItemEntity>,
  ) {}

  create(
    data: Partial<SavedForLaterItemEntity>,
    manager?: EntityManager,
  ): Promise<SavedForLaterItemEntity> {
    const repository = manager?.getRepository(SavedForLaterItemEntity) ?? this.repo;
    return repository.save(repository.create(data));
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  findByIdForUser(
    id: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<SavedForLaterItemEntity | null> {
    const repository = manager?.getRepository(SavedForLaterItemEntity) ?? this.repo;
    return repository.findOne({
      where: { id, userId },
      relations: LIST_RELATIONS,
    });
  }

  findByUserAndIdentity(
    userId: string,
    identityKey: string,
    manager?: EntityManager,
  ): Promise<SavedForLaterItemEntity | null> {
    const repository = manager?.getRepository(SavedForLaterItemEntity) ?? this.repo;
    return repository.findOne({ where: { userId, identityKey } });
  }

  async lockByUserAndIdentity(
    userId: string,
    identityKey: string,
    manager: EntityManager,
  ): Promise<SavedForLaterItemEntity | null> {
    return manager
      .getRepository(SavedForLaterItemEntity)
      .createQueryBuilder('item')
      .setLock('pessimistic_write')
      .where('item.userId = :userId', { userId })
      .andWhere('item.identityKey = :identityKey', { identityKey })
      .getOne();
  }

  async lockByIdForUser(
    id: string,
    userId: string,
    manager: EntityManager,
  ): Promise<SavedForLaterItemEntity | null> {
    return manager
      .getRepository(SavedForLaterItemEntity)
      .createQueryBuilder('item')
      .setLock('pessimistic_write')
      .where('item.id = :id', { id })
      .andWhere('item.userId = :userId', { userId })
      .getOne();
  }

  async updateById(
    id: string,
    data: Partial<SavedForLaterItemEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager?.getRepository(SavedForLaterItemEntity) ?? this.repo;
    await repository.update({ id }, data as QueryDeepPartialEntity<SavedForLaterItemEntity>);
  }

  async deleteById(id: string, manager?: EntityManager): Promise<void> {
    const repository = manager?.getRepository(SavedForLaterItemEntity) ?? this.repo;
    await repository.delete({ id });
  }

  countByUserId(userId: string): Promise<number> {
    return this.repo.count({ where: { userId } });
  }

  async findAllByUserId(userId: string, manager?: EntityManager): Promise<SavedForLaterItemEntity[]> {
    const repository = manager?.getRepository(SavedForLaterItemEntity) ?? this.repo;
    return repository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAllPaginated(
    userId: string,
    options: PaginationOptions,
  ): Promise<{ data: SavedForLaterItemEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const sortColumn = (options.sortBy && SORTABLE[options.sortBy]) ?? SORTABLE.createdAt;
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('product.media', 'media')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('item.variant', 'variant')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValues')
      .leftJoinAndSelect('attributeValues.attribute', 'attribute')
      .where('item.userId = :userId', { userId })
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('item.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
