import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';
import {
  CategoryFilterQueryDto,
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
import { CategoriesRepository } from '../repositories/categories.repository';

@Injectable()
export class CategoryFiltersService {
  constructor(
    private readonly categoryFiltersRepository: CategoryFiltersRepository,
    private readonly categoriesRepository: CategoriesRepository,
  ) {}

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

  async findAll(query: CategoryFilterQueryDto): Promise<PaginatedResult<ICategoryFilter>> {
    let categoryId = query.categoryId;

    if (query.categoryRefId) {
      const category = await this.categoriesRepository.findByRefId(query.categoryRefId);
      if (!category) {
        throw new NotFoundException(`Category with refId "${query.categoryRefId}" not found`);
      }
      categoryId = category.id;
    } else if (categoryId) {
      const category = await this.categoriesRepository.findById(categoryId);
      if (!category) {
        throw new NotFoundException(`Category with id "${categoryId}" not found`);
      }
    }

    const options = {
      ...buildPaginationOptions(query),
      categoryId,
    };
    const { data, total } =
      await this.categoryFiltersRepository.findAllPaginated(options);
    return buildPaginatedResult(
      mapCategoryFilterEntitiesToResponse(data),
      total,
      options,
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
