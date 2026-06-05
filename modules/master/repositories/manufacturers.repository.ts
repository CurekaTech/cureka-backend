import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ManufacturerEntity } from '../entities/manufacturer.entity';
import { CategoryEntity } from '../entities/category.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

@Injectable()
export class ManufacturersRepository {
  constructor(
    @InjectRepository(ManufacturerEntity)
    private readonly repo: Repository<ManufacturerEntity>,
  ) {}

  async create(
    data: Partial<ManufacturerEntity>,
    categories: CategoryEntity[],
  ): Promise<ManufacturerEntity> {
    const entity = this.repo.create({ ...data, categories });
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<ManufacturerEntity | null> {
    return this.repo
      .createQueryBuilder('manufacturer')
      .leftJoinAndSelect('manufacturer.categories', 'category')
      .leftJoinAndSelect('manufacturer.city', 'city')
      .leftJoinAndSelect('manufacturer.state', 'state')
      .leftJoinAndSelect('manufacturer.country', 'country')
      .where('manufacturer.id = :id', { id })
      .getOne();
  }

  async findByRefId(refId: string): Promise<ManufacturerEntity | null> {
    return this.repo
      .createQueryBuilder('manufacturer')
      .leftJoinAndSelect('manufacturer.categories', 'category')
      .leftJoinAndSelect('manufacturer.city', 'city')
      .leftJoinAndSelect('manufacturer.state', 'state')
      .leftJoinAndSelect('manufacturer.country', 'country')
      .where('manufacturer.refId = :refId', { refId })
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
      .createQueryBuilder('manufacturer')
      .where('manufacturer.code = :code', { code })
      .andWhere('manufacturer.id != :excludeId', { excludeId })
      .getCount();
    return count > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<ManufacturerEntity>,
    categories?: CategoryEntity[],
  ): Promise<ManufacturerEntity | null> {
    const entity = await this.findByRefId(refId);
    if (!entity) return null;
    Object.assign(entity, data);
    if (categories !== undefined) {
      entity.categories = categories;
    }
    await this.repo.save(entity);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: ManufacturerEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'manufacturer.createdAt',
      name: 'manufacturer.name',
      code: 'manufacturer.code',
      status: 'manufacturer.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'manufacturer.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('manufacturer')
      .leftJoinAndSelect('manufacturer.categories', 'category')
      .leftJoinAndSelect('manufacturer.city', 'city')
      .leftJoinAndSelect('manufacturer.state', 'state')
      .leftJoinAndSelect('manufacturer.country', 'country')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where('(manufacturer.name ILIKE :search OR manufacturer.code ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
