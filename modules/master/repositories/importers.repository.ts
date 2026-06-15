import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImporterEntity } from '../entities/importer.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

@Injectable()
export class ImportersRepository {
  constructor(
    @InjectRepository(ImporterEntity)
    private readonly repo: Repository<ImporterEntity>,
  ) {}

  async create(data: Partial<ImporterEntity>): Promise<ImporterEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<ImporterEntity | null> {
    return this.repo
      .createQueryBuilder('importer')
      .leftJoinAndSelect('importer.city', 'city')
      .leftJoinAndSelect('importer.state', 'state')
      .leftJoinAndSelect('importer.country', 'country')
      .where('importer.refId = :refId', { refId })
      .getOne();
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsByCode(code: string): Promise<boolean> {
    return (await this.repo.count({ where: { code } })) > 0;
  }

  async existsByCodeExcluding(code: string, excludeId: string): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('importer')
      .where('importer.code = :code', { code })
      .andWhere('importer.id != :excludeId', { excludeId })
      .getCount();
    return count > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<ImporterEntity>,
  ): Promise<ImporterEntity | null> {
    const entity = await this.findByRefId(refId);
    if (!entity) return null;
    Object.assign(entity, data);
    await this.repo.save(entity);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: ImporterEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'importer.createdAt',
      name: 'importer.name',
      code: 'importer.code',
      iec: 'importer.iec',
      status: 'importer.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'importer.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('importer')
      .leftJoinAndSelect('importer.city', 'city')
      .leftJoinAndSelect('importer.state', 'state')
      .leftJoinAndSelect('importer.country', 'country')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where(
        '(importer.name ILIKE :search OR importer.code ILIKE :search OR importer.iec ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
