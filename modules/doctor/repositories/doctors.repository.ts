import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { buildSkipTake } from '@packages/database';
import { DoctorEntity } from '../entities/doctor.entity';
import { DoctorCategory } from '../enums/doctor-category.enum';
import { DoctorStatus } from '../enums/doctor-status.enum';

export const DOCTOR_DETAIL_RELATIONS = {
  qualifications: { qualification: true },
  specializations: { specialization: true },
  languages: { language: true },
  clinics: true,
  consultationConfig: true,
  bankDetails: true,
  documents: true,
} as const;

export type DoctorListOptions = {
  page?: number;
  limit?: number;
  search?: string;
  status?: DoctorStatus;
  category?: DoctorCategory;
  isBookable?: boolean;
  isActive?: boolean;
  sortBy?: 'createdAt' | 'fullName' | 'status';
  sortOrder?: 'ASC' | 'DESC';
};

@Injectable()
export class DoctorsRepository {
  constructor(
    @InjectRepository(DoctorEntity)
    private readonly repo: Repository<DoctorEntity>,
  ) {}

  private getRepo(manager?: EntityManager): Repository<DoctorEntity> {
    return manager ? manager.getRepository(DoctorEntity) : this.repo;
  }

  create(data: Partial<DoctorEntity>, manager?: EntityManager): Promise<DoctorEntity> {
    const repo = this.getRepo(manager);
    return repo.save(repo.create(data));
  }

  existsByRefId(refId: string, manager?: EntityManager): Promise<boolean> {
    return this.getRepo(manager).exists({ where: { refId } });
  }

  existsByEmail(email: string, excludeId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('d')
      .where('LOWER(d.email) = LOWER(:email)', { email })
      .andWhere('d.deletedAt IS NULL');
    if (excludeId) qb.andWhere('d.id != :excludeId', { excludeId });
    return qb.getCount().then((c) => c > 0);
  }

  existsBySlug(slug: string, excludeId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('d')
      .where('d.slug = :slug', { slug })
      .andWhere('d.deletedAt IS NULL');
    if (excludeId) qb.andWhere('d.id != :excludeId', { excludeId });
    return qb.getCount().then((c) => c > 0);
  }

  findByEmail(email: string): Promise<DoctorEntity | null> {
    return this.repo.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  findByEmailWithPassword(email: string): Promise<DoctorEntity | null> {
    return this.repo
      .createQueryBuilder('d')
      .addSelect('d.passwordHash')
      .where('LOWER(d.email) = LOWER(:email)', { email: email.trim() })
      .andWhere('d.deletedAt IS NULL')
      .getOne();
  }

  findByIdWithPassword(id: string): Promise<DoctorEntity | null> {
    return this.repo
      .createQueryBuilder('d')
      .addSelect('d.passwordHash')
      .where('d.id = :id', { id })
      .andWhere('d.deletedAt IS NULL')
      .getOne();
  }

  findByRefId(refId: string): Promise<DoctorEntity | null> {
    return this.repo.findOne({
      where: { refId },
      relations: DOCTOR_DETAIL_RELATIONS,
    });
  }

  findBySlug(slug: string): Promise<DoctorEntity | null> {
    return this.repo.findOne({
      where: { slug },
      relations: DOCTOR_DETAIL_RELATIONS,
    });
  }

  findById(id: string, manager?: EntityManager): Promise<DoctorEntity | null> {
    return this.getRepo(manager).findOne({
      where: { id },
      relations: DOCTOR_DETAIL_RELATIONS,
    });
  }

  async updateByRefId(
    refId: string,
    data: Partial<DoctorEntity>,
    manager?: EntityManager,
  ): Promise<DoctorEntity | null> {
    const repo = this.getRepo(manager);
    const existing = await repo.findOne({ where: { refId } });
    if (!existing) return null;
    Object.assign(existing, data);
    await repo.save(existing);
    return repo.findOne({ where: { refId }, relations: DOCTOR_DETAIL_RELATIONS });
  }

  async updateById(
    id: string,
    data: Partial<DoctorEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getRepo(manager).update({ id }, data);
  }

  async findAllPaginated(
    options: DoctorListOptions,
  ): Promise<{ data: DoctorEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page ?? 1, options.limit ?? 20);
    const qb = this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.consultationConfig', 'consultationConfig')
      .leftJoinAndSelect('d.specializations', 'specializations')
      .leftJoinAndSelect('specializations.specialization', 'specialization')
      .where('d.deletedAt IS NULL')
      .skip(skip)
      .take(take);

    const sortCol =
      options.sortBy === 'fullName'
        ? 'd.fullName'
        : options.sortBy === 'status'
          ? 'd.status'
          : 'd.createdAt';
    qb.orderBy(sortCol, options.sortOrder ?? 'DESC');

    if (options.search) {
      qb.andWhere(
        '(d.fullName ILIKE :search OR d.email ILIKE :search OR d.phone ILIKE :search OR d.refId ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }
    if (options.status) qb.andWhere('d.status = :status', { status: options.status });
    if (options.category) qb.andWhere('d.category = :category', { category: options.category });
    if (options.isBookable !== undefined) {
      qb.andWhere('d.isBookable = :isBookable', { isBookable: options.isBookable });
    }
    if (options.isActive !== undefined) {
      qb.andWhere('d.isActive = :isActive', { isActive: options.isActive });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findBookablePublic(options: {
    page?: number;
    limit?: number;
    search?: string;
    category?: DoctorCategory;
  }): Promise<{ data: DoctorEntity[]; total: number }> {
    return this.findAllPaginated({
      ...options,
      isBookable: true,
      isActive: true,
      status: DoctorStatus.APPROVED,
    });
  }
}
