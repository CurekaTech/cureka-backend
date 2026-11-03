import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DoctorSessionEntity } from '../entities/doctor-session.entity';

@Injectable()
export class DoctorSessionsRepository {
  constructor(
    @InjectRepository(DoctorSessionEntity)
    private readonly repo: Repository<DoctorSessionEntity>,
  ) {}

  private getRepo(manager?: EntityManager): Repository<DoctorSessionEntity> {
    return manager ? manager.getRepository(DoctorSessionEntity) : this.repo;
  }

  create(data: Partial<DoctorSessionEntity>, manager?: EntityManager): Promise<DoctorSessionEntity> {
    const repo = this.getRepo(manager);
    return repo.save(repo.create(data));
  }

  findById(id: string): Promise<DoctorSessionEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByRefreshTokenHash(hash: string): Promise<DoctorSessionEntity | null> {
    return this.repo.findOne({ where: { refreshTokenHash: hash } });
  }

  findActiveByRefreshTokenHash(hash: string): Promise<DoctorSessionEntity | null> {
    return this.repo.findOne({
      where: { refreshTokenHash: hash, isRevoked: false },
      relations: { doctor: true },
    });
  }

  async updateById(
    id: string,
    data: Partial<DoctorSessionEntity>,
    manager?: EntityManager,
  ): Promise<DoctorSessionEntity | null> {
    const repo = this.getRepo(manager);
    await repo.update({ id }, data);
    return repo.findOne({ where: { id } });
  }

  async revoke(id: string, manager?: EntityManager): Promise<boolean> {
    const repo = this.getRepo(manager);
    const result = await repo.update(
      { id, isRevoked: false },
      { isRevoked: true, revokedAt: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }

  async revokeAllForDoctor(doctorId: string, exceptSessionId?: string): Promise<number> {
    const qb = this.repo
      .createQueryBuilder()
      .update(DoctorSessionEntity)
      .set({ isRevoked: true, revokedAt: new Date() })
      .where('doctor_id = :doctorId', { doctorId })
      .andWhere('is_revoked = false');

    if (exceptSessionId) {
      qb.andWhere('id != :exceptSessionId', { exceptSessionId });
    }

    const result = await qb.execute();
    return result.affected ?? 0;
  }

  async rotateHash(
    id: string,
    newHash: string,
    expiresAt: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.getRepo(manager);
    await repo.update(
      { id, isRevoked: false },
      { refreshTokenHash: newHash, lastActivity: new Date(), expiresAt },
    );
  }
}
