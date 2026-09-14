import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import {
  CreateSupportCategoryDto,
  SupportCategoryQueryDto,
  UpdateSupportCategoryDto,
  UpdateSupportCategoryStatusDto,
} from '../dto/support.dto';
import { SupportCategoryEntity } from '../entities/support-category.entity';
import { SupportCategoryType } from '../enums/support-category-type.enum';
import { SupportContentStatus } from '../enums/support-content-status.enum';
import { mapSupportCategory } from '../mappers/support.mapper';
import { SupportCategoriesRepository } from '../repositories/support-categories.repository';

@Injectable()
export class SupportCategoriesService {
  constructor(private readonly categoriesRepo: SupportCategoriesRepository) {}

  async create(dto: CreateSupportCategoryDto, actor: string) {
    if (await this.categoriesRepo.existsByName(dto.name)) {
      throw new ConflictException(`A support category with name "${dto.name}" already exists`);
    }
    if (await this.categoriesRepo.existsBySlug(dto.slug)) {
      throw new ConflictException('Category slug already exists');
    }

    const refId = await generateUniqueRefId(dto.name, (id) =>
      this.categoriesRepo.existsByRefId(id),
    );

    const entity = await this.categoriesRepo.create({
      refId,
      name: dto.name,
      slug: dto.slug,
      type: dto.type ?? SupportCategoryType.BOTH,
      status: dto.status ?? SupportContentStatus.ACTIVE,
      createdBy: actor,
      updatedBy: actor,
    });

    return mapSupportCategory(entity);
  }

  async findAll(query: SupportCategoryQueryDto): Promise<PaginatedResult<ReturnType<typeof mapSupportCategory>>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.categoriesRepo.findAllPaginated({
      ...pagination,
      type: query.type,
      status: query.status,
    });

    return buildPaginatedResult(data.map(mapSupportCategory), total, pagination);
  }

  async findAllActive(type?: SupportCategoryType) {
    const data = await this.categoriesRepo.findAllActive(type);
    return data.map(mapSupportCategory);
  }

  async findOne(refId: string) {
    const entity = await this.categoriesRepo.findByRefId(refId);
    if (!entity) throw new NotFoundException('Support category not found');
    return mapSupportCategory(entity);
  }

  async update(refId: string, dto: UpdateSupportCategoryDto, actor: string) {
    const existing = await this.categoriesRepo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Support category not found');

    if (dto.name !== undefined && (await this.categoriesRepo.existsByName(dto.name, refId))) {
      throw new ConflictException(`A support category with name "${dto.name}" already exists`);
    }

    if (dto.slug && dto.slug !== existing.slug) {
      if (await this.categoriesRepo.existsBySlug(dto.slug, refId)) {
        throw new ConflictException('Category slug already exists');
      }
    }

    const updated = await this.categoriesRepo.updateByRefId(refId, {
      ...dto,
      updatedBy: actor,
    });

    return mapSupportCategory(updated as SupportCategoryEntity);
  }

  async updateStatus(refId: string, dto: UpdateSupportCategoryStatusDto, actor: string) {
    return this.update(refId, { status: dto.status }, actor);
  }

  async remove(refId: string) {
    const existing = await this.categoriesRepo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Support category not found');
    await this.categoriesRepo.softDeleteByRefId(refId);
  }

  async assertCategoryExists(refId: string, type?: SupportCategoryType) {
    const category = await this.categoriesRepo.findByRefId(refId);
    if (!category) throw new BadRequestException('Invalid category');
    if (type && category.type !== SupportCategoryType.BOTH && category.type !== type) {
      throw new BadRequestException('Category type mismatch');
    }
    return category;
  }
}
