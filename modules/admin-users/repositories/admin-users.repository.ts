import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminUserEntity } from '../entities/admin-user.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

@Injectable()
export class AdminUsersRepository {
  constructor(
    @InjectRepository(AdminUserEntity)
    private readonly repo: Repository<AdminUserEntity>,
  ) {}

  async create(data: Partial<AdminUserEntity>): Promise<AdminUserEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<AdminUserEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<AdminUserEntity | null> {
    return this.repo.findOne({ where: { email } });
  }

  async findByEmailWithPassword(email: string): Promise<AdminUserEntity | null> {
    return this.repo
      .createQueryBuilder('admin_user')
      .addSelect('admin_user.password')
      .where('admin_user.email = :email', { email })
      .getOne();
  }

  async update(id: string, data: Partial<AdminUserEntity>): Promise<AdminUserEntity | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: AdminUserEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page ?? 1, options.limit ?? 20);

    const [data, total] = await this.repo
      .createQueryBuilder('admin_user')
      .orderBy('admin_user.created_at', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return { data, total };
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.repo.count({ where: { email } });
    return count > 0;
  }

  async updateLastLoginAt(id: string): Promise<void> {
    await this.repo.update(id, { lastLoginAt: new Date() });
  }
}
