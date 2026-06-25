import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
  PaginationQueryDto,
} from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';
import {
  CreateCategoryFilterDto,
  UpdateCategoryFilterDto,
  UpdateCategoryFilterStatusDto,
} from '../dto/category-filter.dto';
import { ICategoryFilter } from '../interfaces/category-filter.interface';
import {
  mapCategoryFilterEntitiesToResponse,
  mapCategoryFilterEntityToResponse,
} from '../mappers/category-filter.mapper';
import { CategoryFiltersRepository } from '../repositories/category-filters.repository';

@Injectable()
export class CategoryFiltersService {
  constructor(private readonly categoryFiltersRepository: CategoryFiltersRepository) {}

  async create(dto: CreateCategoryFilterDto, createdBy: string): Promise<ICategoryFilter> {
    const entity = await this.categoryFiltersRepository.create({
      name: dto.name,
      values: dto.values ?? null,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.categoryFiltersRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    return mapCategoryFilterEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<ICategoryFilter>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } =
      await this.categoryFiltersRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(
      mapCategoryFilterEntitiesToResponse(data),
      total,
      paginationOptions,
    );
  }

  async findOne(refId: string): Promise<ICategoryFilter> {
    const entity = await this.categoryFiltersRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Category filter with refId ${refId} not found`);
    }
    return mapCategoryFilterEntityToResponse(entity);
  }

  async update(
    refId: string,
    dto: UpdateCategoryFilterDto,
    updatedBy: string,
  ): Promise<ICategoryFilter> {
    const existing = await this.categoryFiltersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Category filter with refId ${refId} not found`);
    }

    const updated = await this.categoryFiltersRepository.updateByRefId(refId, {
      ...dto,
      values: dto.values !== undefined ? dto.values ?? null : undefined,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Category filter with refId ${refId} not found after update`);
    }

    return mapCategoryFilterEntityToResponse(updated);
  }

  async updateStatus(
    refId: string,
    dto: UpdateCategoryFilterStatusDto,
    updatedBy: string,
  ): Promise<ICategoryFilter> {
    const existing = await this.categoryFiltersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Category filter with refId ${refId} not found`);
    }

    const updated = await this.categoryFiltersRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(
        `Category filter with refId ${refId} not found after status update`,
      );
    }

    return mapCategoryFilterEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.categoryFiltersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Category filter with refId ${refId} not found`);
    }
    await this.categoryFiltersRepository.softDeleteByRefId(refId);
  }
}
