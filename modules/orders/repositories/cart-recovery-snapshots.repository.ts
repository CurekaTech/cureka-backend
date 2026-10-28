import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CartRecoverySnapshotEntity } from '../entities/cart-recovery-snapshot.entity';

@Injectable()
export class CartRecoverySnapshotsRepository {
  constructor(
    @InjectRepository(CartRecoverySnapshotEntity)
    private readonly repo: Repository<CartRecoverySnapshotEntity>,
  ) {}

  create(data: Partial<CartRecoverySnapshotEntity>): Promise<CartRecoverySnapshotEntity> {
    return this.repo.save(this.repo.create(data));
  }

  findByToken(token: string): Promise<CartRecoverySnapshotEntity | null> {
    return this.repo.findOne({ where: { token } });
  }

  markRestored(id: string): Promise<void> {
    return this.repo.update({ id }, { restoredAt: new Date() }).then(() => undefined);
  }
}
