import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { AdminNotificationEmailEntity } from '../entities/admin-notification-email.entity';
import { AdminNotificationEmailType } from '../enums/admin-notification-email-type.enum';

export interface AdminNotificationEmailFindOptions extends PaginationOptions {
  type?: AdminNotificationEmailType;
  isActive?: boolean;
}

@Injectable()
export class AdminNotificationEmailsRepository {
  constructor(
    @InjectRepository(AdminNotificationEmailEntity)
    private readonly repo: Repository<AdminNotificationEmailEntity>,
  ) {}

  async create(data: Partial<AdminNotificationEmailEntity>): Promise<AdminNotificationEmailEntity> {
    return this.repo.save(this.repo.create(data));
  }

  async findByRefId(refId: string): Promise<AdminNotificationEmailEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  async findByEmailAndType(
    email: string,
    type: AdminNotificationEmailType,
  ): Promise<AdminNotificationEmailEntity | null> {
    return this.repo.findOne({ where: { email, type } });
  }

  async updateByRefId(
    refId: string,
    data: Partial<AdminNotificationEmailEntity>,
  ): Promise<AdminNotificationEmailEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findActiveEmailsByType(type: AdminNotificationEmailType): Promise<string[]> {
    const rows = await this.repo.find({
      where: { type, isActive: true },
      select: ['email'],
      order: { email: 'ASC' },
    });
    return rows.map((row) => row.email);
  }

  async countActiveByType(type: AdminNotificationEmailType): Promise<number> {
    return this.repo.count({ where: { type, isActive: true } });
  }

  async findAllPaginated(
    options: AdminNotificationEmailFindOptions,
  ): Promise<{ data: AdminNotificationEmailEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo
      .createQueryBuilder('recipient')
      .orderBy('recipient.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.type) {
      qb.andWhere('recipient.type = :type', { type: options.type });
    }

    if (options.isActive !== undefined) {
      qb.andWhere('recipient.is_active = :isActive', { isActive: options.isActive });
    }

    if (options.search?.trim()) {
      qb.andWhere('recipient.email ILIKE :search', {
        search: `%${options.search.trim()}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
