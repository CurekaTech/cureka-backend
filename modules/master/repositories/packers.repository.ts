import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PackerEntity } from '../entities/packer.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

@Injectable()
export class PackersRepository {
  constructor(
    @InjectRepository(PackerEntity)
    private readonly repo: Repository<PackerEntity>,
  ) {}

  async create(data: Partial<PackerEntity>): Promise<PackerEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<PackerEntity | null> {
    return this.repo
      .createQueryBuilder('packer')
      .leftJoinAndSelect('packer.city', 'city')
      .leftJoinAndSelect('packer.state', 'state')
      .leftJoinAndSelect('packer.country', 'country')
      .where('packer.refId = :refId', { refId })
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
      .createQueryBuilder('packer')
      .where('packer.code = :code', { code })
      .andWhere('packer.id != :excludeId', { excludeId })
      .getCount();
    return count > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<PackerEntity>,
  ): Promise<PackerEntity | null> {
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
  ): Promise<{ data: PackerEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'packer.createdAt',
      name: 'packer.name',
      code: 'packer.code',
      status: 'packer.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'packer.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('packer')
      .leftJoinAndSelect('packer.city', 'city')
      .leftJoinAndSelect('packer.state', 'state')
      .leftJoinAndSelect('packer.country', 'country')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where(
        '(packer.name ILIKE :search OR packer.code ILIKE :search OR packer.gstNumber ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
