import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StateEntity } from '../entities/state.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

interface StateFindOptions extends PaginationOptions {
  countryId?: string;
}

@Injectable()
export class StatesRepository {
  constructor(
    @InjectRepository(StateEntity)
    private readonly repo: Repository<StateEntity>,
  ) {}

  async create(data: Partial<StateEntity>): Promise<StateEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<StateEntity | null> {
    return this.repo
      .createQueryBuilder('state')
      .leftJoinAndSelect('state.country', 'country')
      .where('state.id = :id', { id })
      .getOne();
  }

  async findByRefId(refId: string): Promise<StateEntity | null> {
    return this.repo
      .createQueryBuilder('state')
      .leftJoinAndSelect('state.country', 'country')
      .where('state.refId = :refId', { refId })
      .getOne();
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(refId: string, data: Partial<StateEntity>): Promise<StateEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async update(id: string, data: Partial<StateEntity>): Promise<StateEntity | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async findAllPaginated(
    options: StateFindOptions,
  ): Promise<{ data: StateEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'state.createdAt',
      name: 'state.name',
      status: 'state.status',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'state.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('state')
      .leftJoinAndSelect('state.country', 'country')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.countryId) {
      qb.andWhere('state.countryId = :countryId', { countryId: options.countryId });
    }

    if (options.search) {
      qb.andWhere('(state.name ILIKE :search OR state.code ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async existsByNameInCountry(name: string, countryId: string): Promise<boolean> {
    return (
      (await this.repo.count({
        where: { name, countryId },
      })) > 0
    );
  }

  async existsByNameInCountryExcluding(
    name: string,
    countryId: string,
    excludeId: string,
  ): Promise<boolean> {
    return (
      (await this.repo
        .createQueryBuilder('state')
        .where('state.name = :name', { name })
        .andWhere('state.countryId = :countryId', { countryId })
        .andWhere('state.id != :excludeId', { excludeId })
        .getCount()) > 0
    );
  }

  async countCities(stateId: string): Promise<number> {
    const result = await this.repo.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'count')
      .from('cities', 'city')
      .where('city.state_id = :stateId', { stateId })
      .andWhere('city.deleted_at IS NULL')
      .getRawOne<{ count: string }>();

    return Number(result?.count ?? 0);
  }
}
