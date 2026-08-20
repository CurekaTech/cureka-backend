import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { AdminSettingEntity } from '../entities/admin-setting.entity';

@Injectable()
export class AdminSettingsRepository {
  constructor(
    @InjectRepository(AdminSettingEntity)
    private readonly repo: Repository<AdminSettingEntity>,
  ) {}

  findAll(manager?: EntityManager): Promise<AdminSettingEntity[]> {
    const repository = manager ? manager.getRepository(AdminSettingEntity) : this.repo;
    return repository.find({
      order: { key: 'ASC' },
    });
  }

  findByKey(key: string, manager?: EntityManager): Promise<AdminSettingEntity | null> {
    const repository = manager ? manager.getRepository(AdminSettingEntity) : this.repo;
    return repository.findOne({
      where: { key },
    });
  }

  findByKeys(keys: string[], manager?: EntityManager): Promise<AdminSettingEntity[]> {
    if (!keys.length) {
      return Promise.resolve([]);
    }

    const repository = manager ? manager.getRepository(AdminSettingEntity) : this.repo;
    return repository.find({
      where: { key: In(keys) },
    });
  }

  create(
    data: Partial<AdminSettingEntity>,
    manager?: EntityManager,
  ): Promise<AdminSettingEntity> {
    const repository = manager ? manager.getRepository(AdminSettingEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  updateByKey(
    key: string,
    data: Partial<AdminSettingEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(AdminSettingEntity) : this.repo;
    return repository.update({ key }, data).then(() => undefined);
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  transaction<T>(runInTransaction: (entityManager: EntityManager) => Promise<T>): Promise<T> {
    return this.repo.manager.transaction(runInTransaction);
  }
}
