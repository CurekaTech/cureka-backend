import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportNotificationEntity } from '../entities/support-notification.entity';

@Injectable()
export class SupportNotificationsRepository {
  constructor(
    @InjectRepository(SupportNotificationEntity)
    private readonly repo: Repository<SupportNotificationEntity>,
  ) {}

  async create(data: Partial<SupportNotificationEntity>): Promise<SupportNotificationEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByUserId(userId: string, unreadOnly = false): Promise<SupportNotificationEntity[]> {
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .orderBy('n.createdAt', 'DESC');

    if (unreadOnly) {
      qb.andWhere('n.is_read = false');
    }

    return qb.getMany();
  }

  async markAsRead(userId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.repo
      .createQueryBuilder()
      .update(SupportNotificationEntity)
      .set({ isRead: true })
      .where('user_id = :userId', { userId })
      .andWhere('id IN (:...ids)', { ids })
      .execute();
  }

  async countUnread(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, isRead: false } });
  }
}
