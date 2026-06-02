import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountryEntity } from '../entities/country.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

@Injectable()
export class CountriesRepository {
  constructor(
    @InjectRepository(CountryEntity)
    private readonly repo: Repository<CountryEntity>,
  ) {}

  async create(data: Partial<CountryEntity>): Promise<CountryEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<CountryEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async update(id: string, data: Partial<CountryEntity>): Promise<CountryEntity | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: CountryEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'country.createdAt',
      name: 'country.name',
      code: 'country.code',
      status: 'country.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'country.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('country')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where('(country.name ILIKE :search OR country.code ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async existsByName(name: string): Promise<boolean> {
    return (await this.repo.count({ where: { name } })) > 0;
  }

  async existsByNameExcluding(name: string, excludeId: string): Promise<boolean> {
    return (
      (await this.repo
        .createQueryBuilder('country')
        .where('country.name = :name', { name })
        .andWhere('country.id != :excludeId', { excludeId })
        .getCount()) > 0
    );
  }

  async existsByCode(code: string): Promise<boolean> {
    return (await this.repo.count({ where: { code } })) > 0;
  }

  async existsByCodeExcluding(code: string, excludeId: string): Promise<boolean> {
    return (
      (await this.repo
        .createQueryBuilder('country')
        .where('country.code = :code', { code })
        .andWhere('country.id != :excludeId', { excludeId })
        .getCount()) > 0
    );
  }

  async countStates(countryId: string): Promise<number> {
    const result = await this.repo.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'count')
      .from('states', 'state')
      .where('state.country_id = :countryId', { countryId })
      .andWhere('state.deleted_at IS NULL')
      .getRawOne<{ count: string }>();

    return Number(result?.count ?? 0);
  }
}
