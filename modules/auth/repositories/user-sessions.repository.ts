import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { UserSessionEntity } from '../entities/user-session.entity';

@Injectable()
export class UserSessionsRepository {
  constructor(
    @InjectRepository(UserSessionEntity)
    private readonly repo: Repository<UserSessionEntity>,
  ) {}

  create(data: Partial<UserSessionEntity>): Promise<UserSessionEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  findById(id: string): Promise<UserSessionEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByRefreshTokenHash(hash: string): Promise<UserSessionEntity | null> {
    return this.repo.findOne({ where: { refreshTokenHash: hash } });
  }

  /** Single round-trip: session + user for auth guard (indexed on refresh_token_hash). */
  findActiveSessionWithUserByTokenHash(
    hash: string,
  ): Promise<UserSessionEntity | null> {
    return this.repo.findOne({
      where: { refreshTokenHash: hash, isRevoked: false },
      relations: { user: true },
    });
  }

  findActiveByUserId(userId: string): Promise<UserSessionEntity[]> {
    const now = new Date();
    return this.repo.find({
      where: {
        userId,
        isRevoked: false,
        expiresAt: MoreThan(now),
      },
      order: { lastActivity: 'DESC' },
    });
  }

  async updateById(id: string, data: Partial<UserSessionEntity>): Promise<UserSessionEntity | null> {
    await this.repo.update({ id }, data);
    return this.findById(id);
  }

  async revokeById(id: string): Promise<void> {
    await this.repo.update(
      { id },
      { isRevoked: true, revokedAt: new Date() },
    );
  }

  async revokeAllByUserId(userId: string, exceptSessionId?: string): Promise<void> {
    const qb = this.repo
      .createQueryBuilder()
      .update(UserSessionEntity)
      .set({ isRevoked: true, revokedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('is_revoked = false');

    if (exceptSessionId) {
      qb.andWhere('id != :exceptSessionId', { exceptSessionId });
    }

    await qb.execute();
  }

  async touchLastActivity(id: string): Promise<void> {
    await this.repo.update({ id }, { lastActivity: new Date() });
  }
}
