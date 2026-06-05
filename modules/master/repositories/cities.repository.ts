import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CityEntity } from '../entities/city.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

interface CityFindOptions extends PaginationOptions {
  stateId?: string;
  countryId?: string;
}

@Injectable()
export class CitiesRepository {
  constructor(
    @InjectRepository(CityEntity)
    private readonly repo: Repository<CityEntity>,
  ) {}

  async create(data: Partial<CityEntity>): Promise<CityEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<CityEntity | null> {
    return this.repo
      .createQueryBuilder('city')
      .leftJoinAndSelect('city.state', 'state')
      .where('city.id = :id', { id })
      .getOne();
  }

  async findByRefId(refId: string): Promise<CityEntity | null> {
    return this.repo
      .createQueryBuilder('city')
      .leftJoinAndSelect('city.state', 'state')
      .where('city.refId = :refId', { refId })
      .getOne();
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(refId: string, data: Partial<CityEntity>): Promise<CityEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async update(id: string, data: Partial<CityEntity>): Promise<CityEntity | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async findAllPaginated(
    options: CityFindOptions,
  ): Promise<{ data: CityEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'city.createdAt',
      name: 'city.name',
      status: 'city.status',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'city.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('city')
      .leftJoinAndSelect('city.state', 'state')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.stateId) {
      qb.andWhere('city.stateId = :stateId', { stateId: options.stateId });
    }

    if (options.countryId) {
      qb.andWhere('state.countryId = :countryId', { countryId: options.countryId });
    }

    if (options.search) {
      qb.andWhere('city.name ILIKE :search', { search: `%${options.search}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async existsByNameInState(name: string, stateId: string): Promise<boolean> {
    return (
      (await this.repo.count({
        where: { name, stateId },
      })) > 0
    );
  }

  async existsByNameInStateExcluding(
    name: string,
    stateId: string,
    excludeId: string,
  ): Promise<boolean> {
    return (
      (await this.repo
        .createQueryBuilder('city')
        .where('city.name = :name', { name })
        .andWhere('city.stateId = :stateId', { stateId })
        .andWhere('city.id != :excludeId', { excludeId })
        .getCount()) > 0
    );
  }
}
