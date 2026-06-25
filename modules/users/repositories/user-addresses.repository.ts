import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UserAddressEntity } from '../entities/user-address.entity';

@Injectable()
export class UserAddressesRepository {
  constructor(
    @InjectRepository(UserAddressEntity)
    private readonly repo: Repository<UserAddressEntity>,
  ) {}

  create(data: Partial<UserAddressEntity>, manager?: EntityManager): Promise<UserAddressEntity> {
    const repository = manager ? manager.getRepository(UserAddressEntity) : this.repo;
    const entity = repository.create(data);
    return repository.save(entity);
  }

  findByIdAndUserId(
    id: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<UserAddressEntity | null> {
    const repository = manager ? manager.getRepository(UserAddressEntity) : this.repo;
    return repository.findOne({ where: { id, userId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  findAllByUserId(userId: string): Promise<UserAddressEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { isDefault: 'DESC', updatedAt: 'DESC' },
    });
  }

  countByUserId(userId: string, manager?: EntityManager): Promise<number> {
    const repository = manager ? manager.getRepository(UserAddressEntity) : this.repo;
    return repository.count({ where: { userId } });
  }

  findLatestByUserId(userId: string, manager?: EntityManager): Promise<UserAddressEntity | null> {
    const repository = manager ? manager.getRepository(UserAddressEntity) : this.repo;
    return repository.findOne({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async clearDefaultForUser(
    userId: string,
    excludeId?: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(UserAddressEntity) : this.repo;
    const qb = repository
      .createQueryBuilder()
      .update(UserAddressEntity)
      .set({ isDefault: false })
      .where('user_id = :userId', { userId })
      .andWhere('is_default = true');

    if (excludeId) {
      qb.andWhere('id != :excludeId', { excludeId });
    }

    await qb.execute();
  }

  async updateById(
    id: string,
    data: Partial<UserAddressEntity>,
    manager?: EntityManager,
  ): Promise<UserAddressEntity | null> {
    const repository = manager ? manager.getRepository(UserAddressEntity) : this.repo;
    await repository.update({ id }, data);
    return repository.findOne({ where: { id } });
  }

  async softDeleteById(id: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(UserAddressEntity) : this.repo;
    await repository.softDelete(id);
  }
}
