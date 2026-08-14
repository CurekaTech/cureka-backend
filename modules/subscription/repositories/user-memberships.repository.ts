import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buildSkipTake } from '@packages/database';
import { EntityManager, In, LessThanOrEqual, Repository } from 'typeorm';
import { UserMembershipEntity } from '../entities/user-membership.entity';
import { MembershipStatus } from '../enums/membership-status.enum';

@Injectable()
export class UserMembershipsRepository {
  constructor(
    @InjectRepository(UserMembershipEntity)
    private readonly repo: Repository<UserMembershipEntity>,
  ) {}

  create(data: Partial<UserMembershipEntity>, manager?: EntityManager): Promise<UserMembershipEntity> {
    const repository = manager ? manager.getRepository(UserMembershipEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  findById(id: string, manager?: EntityManager): Promise<UserMembershipEntity | null> {
    const repository = manager ? manager.getRepository(UserMembershipEntity) : this.repo;
    return repository.findOne({ where: { id } });
  }

  findByRefId(refId: string, manager?: EntityManager): Promise<UserMembershipEntity | null> {
    const repository = manager ? manager.getRepository(UserMembershipEntity) : this.repo;
    return repository.findOne({ where: { refId } });
  }

  findByIdAndUserId(
    id: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<UserMembershipEntity | null> {
    const repository = manager ? manager.getRepository(UserMembershipEntity) : this.repo;
    return repository.findOne({ where: { id, userId } });
  }

  findByUserId(userId: string, manager?: EntityManager): Promise<UserMembershipEntity[]> {
    const repository = manager ? manager.getRepository(UserMembershipEntity) : this.repo;
    return repository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  findActiveByUserId(userId: string, manager?: EntityManager): Promise<UserMembershipEntity | null> {
    const repository = manager ? manager.getRepository(UserMembershipEntity) : this.repo;
    return repository.findOne({
      where: {
        userId,
        status: In([
          MembershipStatus.ACTIVE,
          MembershipStatus.RENEWAL_PAYMENT_PENDING,
          MembershipStatus.PAST_DUE,
        ]),
      },
      order: { createdAt: 'DESC' },
    });
  }

  findDueForRenewal(
    statuses: MembershipStatus[],
    asOfDate: Date,
    manager?: EntityManager,
  ): Promise<UserMembershipEntity[]> {
    const repository = manager ? manager.getRepository(UserMembershipEntity) : this.repo;
    return repository.find({
      where: {
        status: In(statuses),
        nextBillingDate: LessThanOrEqual(asOfDate),
      },
      order: { nextBillingDate: 'ASC' },
    });
  }

  async findPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    status?: MembershipStatus;
    userId?: string;
  }): Promise<{ data: UserMembershipEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo
      .createQueryBuilder('membership')
      .orderBy('membership.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('membership.status = :status', { status: options.status });
    }
    if (options.userId) {
      qb.andWhere('membership.userId = :userId', { userId: options.userId });
    }
    if (options.search) {
      qb.andWhere('(membership.refId ILIKE :search OR CAST(membership.id AS text) ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async updateById(
    id: string,
    data: Partial<UserMembershipEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(UserMembershipEntity) : this.repo;
    await repository.update({ id }, data);
  }

  async softDeleteById(id: string, _deletedBy?: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(UserMembershipEntity) : this.repo;
    await repository.softDelete(id);
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }
}
