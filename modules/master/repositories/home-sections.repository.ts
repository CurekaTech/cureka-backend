import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HomeSectionEntity } from '../entities/home-section.entity';
import { HomeSectionType } from '../enums/home-section-type.enum';
import { MasterStatus } from '../enums/master-status.enum';

@Injectable()
export class HomeSectionsRepository {
  constructor(
    @InjectRepository(HomeSectionEntity)
    private readonly repo: Repository<HomeSectionEntity>,
  ) {}

  async findAllSorted(): Promise<HomeSectionEntity[]> {
    return this.repo
      .createQueryBuilder('section')
      .orderBy('section.sectionIndex', 'ASC')
      .addOrderBy('section.createdAt', 'ASC')
      .getMany();
  }

  async findActiveSorted(): Promise<HomeSectionEntity[]> {
    return this.repo
      .createQueryBuilder('section')
      .where('section.status = :status', { status: MasterStatus.ACTIVE })
      .orderBy('section.sectionIndex', 'ASC')
      .addOrderBy('section.createdAt', 'ASC')
      .getMany();
  }

  async findByRefId(refId: string): Promise<HomeSectionEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsByType(type: HomeSectionType): Promise<boolean> {
    return (await this.repo.count({ where: { type } })) > 0;
  }

  async removeDuplicateTypes(): Promise<void> {
    const all = await this.repo
      .createQueryBuilder('section')
      .orderBy('section.type', 'ASC')
      .addOrderBy('section.createdAt', 'ASC')
      .getMany();

    const keepIds = new Set<string>();
    const seenTypes = new Set<string>();

    for (const entity of all) {
      if (seenTypes.has(entity.type)) {
        continue;
      }
      seenTypes.add(entity.type);
      keepIds.add(entity.id);
    }

    const duplicateIds = all.filter((entity) => !keepIds.has(entity.id)).map((entity) => entity.id);
    if (duplicateIds.length > 0) {
      await this.repo.softDelete(duplicateIds);
    }
  }

  async getMaxSectionIndex(): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('section')
      .select('MAX(section.sectionIndex)', 'max')
      .getRawOne<{ max: string | null }>();

    if (result?.max === null || result?.max === undefined) return 0;
    return parseInt(result.max, 10);
  }

  async createSection(data: Partial<HomeSectionEntity>): Promise<HomeSectionEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async updateByRefId(
    refId: string,
    data: Partial<HomeSectionEntity>,
  ): Promise<HomeSectionEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async reorderSections(updates: Array<{ refId: string; sectionIndex: number }>): Promise<void> {
    await Promise.all(
      updates.map(({ refId, sectionIndex }) =>
        this.repo.update({ refId }, { sectionIndex }),
      ),
    );
  }

  async countAll(): Promise<number> {
    return this.repo.count();
  }
}
