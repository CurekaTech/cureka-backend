import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
  PaginationQueryDto,
} from '@packages/common';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import {
  CreateProductTagDto,
  UpdateProductTagDto,
  UpdateProductTagStatusDto,
} from '../dto/product-tag.dto';
import { IProductTagMaster } from '../interfaces/product-tag-master.interface';
import {
  mapProductTagEntitiesToResponse,
  mapProductTagEntityToResponse,
} from '../mappers/product-tag.mapper';
import { ProductTagsRepository } from '../repositories/product-tags.repository';
import { generateTagSlug } from '../utils/product-slug.util';

@Injectable()
export class ProductTagsService {
  constructor(private readonly productTagsRepository: ProductTagsRepository) {}

  async create(dto: CreateProductTagDto, createdBy: string): Promise<IProductTagMaster> {
    const slug = generateTagSlug(dto.name);

    if (await this.productTagsRepository.existsByName(dto.name)) {
      throw new ConflictException(`A product tag with name "${dto.name}" already exists`);
    }
    if (await this.productTagsRepository.existsBySlug(slug)) {
      throw new ConflictException(`A product tag with slug "${slug}" already exists`);
    }

    const entity = await this.productTagsRepository.create({
      name: dto.name,
      slug,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.productTagsRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    return mapProductTagEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IProductTagMaster>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.productTagsRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(
      mapProductTagEntitiesToResponse(data),
      total,
      paginationOptions,
    );
  }

  async findOne(refId: string): Promise<IProductTagMaster> {
    const entity = await this.productTagsRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Product tag with refId ${refId} not found`);
    }
    return mapProductTagEntityToResponse(entity);
  }

  async update(
    refId: string,
    dto: UpdateProductTagDto,
    updatedBy: string,
  ): Promise<IProductTagMaster> {
    const existing = await this.productTagsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Product tag with refId ${refId} not found`);
    }

    const payload: { name?: string; slug?: string; status?: MasterStatus; updatedBy: string } = {
      updatedBy,
    };

    if (dto.name !== undefined && dto.name !== existing.name) {
      const slug = generateTagSlug(dto.name);
      if (await this.productTagsRepository.existsByName(dto.name, refId)) {
        throw new ConflictException(`A product tag with name "${dto.name}" already exists`);
      }
      if (await this.productTagsRepository.existsBySlug(slug, refId)) {
        throw new ConflictException(`A product tag with slug "${slug}" already exists`);
      }
      payload.name = dto.name;
      payload.slug = slug;
    }

    if (dto.status !== undefined) {
      payload.status = dto.status;
    }

    const updated = await this.productTagsRepository.updateByRefId(refId, payload);
    if (!updated) {
      throw new NotFoundException(`Product tag with refId ${refId} not found after update`);
    }

    return mapProductTagEntityToResponse(updated);
  }

  async updateStatus(
    refId: string,
    dto: UpdateProductTagStatusDto,
    updatedBy: string,
  ): Promise<IProductTagMaster> {
    const existing = await this.productTagsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Product tag with refId ${refId} not found`);
    }

    const updated = await this.productTagsRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Product tag with refId ${refId} not found after status update`);
    }

    return mapProductTagEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.productTagsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Product tag with refId ${refId} not found`);
    }

    const mappingCount = await this.productTagsRepository.countProductMappings(existing.id);
    if (mappingCount > 0) {
      throw new ConflictException(
        `Cannot delete product tag "${existing.name}" — it is linked to ${mappingCount} product(s). Remove those references first.`,
      );
    }

    await this.productTagsRepository.softDeleteByRefId(refId);
  }
}
