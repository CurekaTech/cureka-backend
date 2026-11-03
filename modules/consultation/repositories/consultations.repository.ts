import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { buildSkipTake } from '@packages/database';
import { ConsultationEntity } from '../entities/consultation.entity';
import { ConsultationStatus } from '../enums/consultation-status.enum';

export type ConsultationListOptions = {
  page?: number;
  limit?: number;
  customerId?: string;
  doctorId?: string;
  status?: ConsultationStatus;
};

@Injectable()
export class ConsultationsRepository {
  constructor(
    @InjectRepository(ConsultationEntity)
    private readonly repo: Repository<ConsultationEntity>,
  ) {}

  private getRepo(manager?: EntityManager): Repository<ConsultationEntity> {
    return manager ? manager.getRepository(ConsultationEntity) : this.repo;
  }

  create(data: Partial<ConsultationEntity>, manager?: EntityManager): Promise<ConsultationEntity> {
    const repo = this.getRepo(manager);
    return repo.save(repo.create(data));
  }

  existsByRefId(refId: string, manager?: EntityManager): Promise<boolean> {
    return this.getRepo(manager).exists({ where: { refId } });
  }

  findByRefId(refId: string): Promise<ConsultationEntity | null> {
    return this.repo.findOne({
      where: { refId },
      relations: {
        doctor: true,
        clinic: true,
        slot: true,
        payment: true,
        followUpRecommendation: true,
        prescription: { items: true },
        documents: true,
      },
    });
  }

  findById(id: string, manager?: EntityManager): Promise<ConsultationEntity | null> {
    return this.getRepo(manager).findOne({ where: { id } });
  }

  async updateByRefId(
    refId: string,
    data: Partial<ConsultationEntity>,
    manager?: EntityManager,
  ): Promise<ConsultationEntity | null> {
    const repo = this.getRepo(manager);
    const existing = await repo.findOne({ where: { refId } });
    if (!existing) return null;
    Object.assign(existing, data);
    await repo.save(existing);
    return this.findByRefId(refId);
  }

  async findAllPaginated(options: ConsultationListOptions) {
    const { skip, take } = buildSkipTake(options.page ?? 1, options.limit ?? 20);
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.doctor', 'doctor')
      .leftJoinAndSelect('c.clinic', 'clinic')
      .leftJoinAndSelect('c.slot', 'slot')
      .where('c.deletedAt IS NULL')
      .orderBy('c.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.customerId) qb.andWhere('c.customer_id = :customerId', { customerId: options.customerId });
    if (options.doctorId) qb.andWhere('c.doctor_id = :doctorId', { doctorId: options.doctorId });
    if (options.status) qb.andWhere('c.status = :status', { status: options.status });

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
