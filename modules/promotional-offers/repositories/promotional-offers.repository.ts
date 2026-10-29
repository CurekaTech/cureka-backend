import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { PromotionalOfferEntity } from '../entities/promotional-offer.entity';
import { PromotionalOfferType } from '../enums/promotional-offer-type.enum';
import { MasterStatus } from '@modules/master/enums/master-status.enum';

@Injectable()
export class PromotionalOffersRepository {
  constructor(
    @InjectRepository(PromotionalOfferEntity)
    private readonly repo: Repository<PromotionalOfferEntity>,
  ) {}

  create(data: Partial<PromotionalOfferEntity>, manager?: EntityManager): Promise<PromotionalOfferEntity> {
    const repository = manager ? manager.getRepository(PromotionalOfferEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  findByRefId(refId: string, manager?: EntityManager): Promise<PromotionalOfferEntity | null> {
    const repository = manager ? manager.getRepository(PromotionalOfferEntity) : this.repo;
    return repository.findOne({
      where: { refId },
      relations: { targets: { variant: { product: true } } },
    });
  }

  findById(id: string, manager?: EntityManager): Promise<PromotionalOfferEntity | null> {
    const repository = manager ? manager.getRepository(PromotionalOfferEntity) : this.repo;
    return repository.findOne({ where: { id }, relations: { targets: true } });
  }

  findByNormalizedCode(code: string, manager?: EntityManager): Promise<PromotionalOfferEntity | null> {
    const repository = manager ? manager.getRepository(PromotionalOfferEntity) : this.repo;
    return repository
      .createQueryBuilder('offer')
      .leftJoinAndSelect('offer.targets', 'target')
      .where('UPPER(offer.code) = :code', { code: code.trim().toUpperCase() })
      .getOne();
  }

  findByIdForUpdate(id: string, manager: EntityManager): Promise<PromotionalOfferEntity | null> {
    return manager
      .getRepository(PromotionalOfferEntity)
      .createQueryBuilder('offer')
      .setLock('pessimistic_write')
      .where('offer.id = :id', { id })
      .getOne();
  }

  async findLive(now = new Date()): Promise<PromotionalOfferEntity[]> {
    await this.deactivateExpired(now);
    return this.repo
      .createQueryBuilder('offer')
      .leftJoinAndSelect('offer.targets', 'target')
      .where('offer.status = :status', { status: MasterStatus.ACTIVE })
      .andWhere('offer.startDate <= :now', { now })
      .andWhere('offer.expiryDate >= :now', { now })
      .andWhere('offer.code IS NOT NULL')
      .orderBy('offer.createdAt', 'ASC')
      .getMany();
  }

  /** Mark active offers as inactive once their expiry date/time has passed. */
  async deactivateExpired(now = new Date(), manager?: EntityManager): Promise<number> {
    const repository = manager ? manager.getRepository(PromotionalOfferEntity) : this.repo;
    const result = await repository.update(
      {
        status: MasterStatus.ACTIVE,
        expiryDate: LessThanOrEqual(now),
      },
      { status: MasterStatus.INACTIVE },
    );
    return result.affected ?? 0;
  }

  async search(params: {
    page: number;
    limit: number;
    search?: string;
    offerType?: PromotionalOfferType;
    status?: MasterStatus;
  }): Promise<{ rows: PromotionalOfferEntity[]; total: number }> {
    const qb = this.repo.createQueryBuilder('offer').leftJoinAndSelect('offer.targets', 'target');
    if (params.search) {
      qb.andWhere('(offer.name ILIKE :search OR offer.code ILIKE :search)', { search: `%${params.search}%` });
    }
    if (params.offerType) qb.andWhere('offer.offerType = :offerType', { offerType: params.offerType });
    if (params.status) qb.andWhere('offer.status = :status', { status: params.status });
    qb.orderBy('offer.createdAt', 'DESC')
      .skip((params.page - 1) * params.limit)
      .take(params.limit);
    const [rows, total] = await qb.getManyAndCount();
    return { rows, total };
  }
}
