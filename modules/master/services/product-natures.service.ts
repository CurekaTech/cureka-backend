import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ProductNaturesRepository } from '../repositories/product-natures.repository';
import {
  CreateProductNatureDto,
  UpdateProductNatureDto,
  UpdateProductNatureStatusDto,
} from '../dto/product-nature.dto';
import { IProductNature } from '../interfaces/product-nature.interface';
import {
  mapProductNatureEntityToResponse,
  mapProductNatureEntitiesToResponse,
} from '../mappers/product-nature.mapper';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { PaginationQueryDto } from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';
import { MasterDeletionGuardService } from './master-deletion-guard.service';

@Injectable()
export class ProductNaturesService {
  constructor(
    private readonly productNaturesRepository: ProductNaturesRepository,
    private readonly deletionGuard: MasterDeletionGuardService,
  ) {}

  async create(dto: CreateProductNatureDto, createdBy: string): Promise<IProductNature> {
    if (await this.productNaturesRepository.existsByName(dto.name)) {
      throw new ConflictException(`A product nature with name "${dto.name}" already exists`);
    }

    const entity = await this.productNaturesRepository.create({
      name: dto.name,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.productNaturesRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    return mapProductNatureEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IProductNature>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } =
      await this.productNaturesRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(
      mapProductNatureEntitiesToResponse(data),
      total,
      paginationOptions,
    );
  }

  async findOne(refId: string): Promise<IProductNature> {
    const entity = await this.productNaturesRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Product nature with refId ${refId} not found`);
    }
    return mapProductNatureEntityToResponse(entity);
  }

  async update(
    refId: string,
    dto: UpdateProductNatureDto,
    updatedBy: string,
  ): Promise<IProductNature> {
    const existing = await this.productNaturesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Product nature with refId ${refId} not found`);
    }

    if (
      dto.name !== undefined &&
      (await this.productNaturesRepository.existsByName(dto.name, refId))
    ) {
      throw new ConflictException(`A product nature with name "${dto.name}" already exists`);
    }

    const updated = await this.productNaturesRepository.updateByRefId(refId, {
      ...dto,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Product nature with refId ${refId} not found after update`);
    }

    return mapProductNatureEntityToResponse(updated);
  }

  async updateStatus(
    refId: string,
    dto: UpdateProductNatureStatusDto,
    updatedBy: string,
  ): Promise<IProductNature> {
    const existing = await this.productNaturesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Product nature with refId ${refId} not found`);
    }

    const updated = await this.productNaturesRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Product nature with refId ${refId} not found after status update`);
    }

    return mapProductNatureEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.productNaturesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Product nature with refId ${refId} not found`);
    }
    await this.deletionGuard.assertProductNatureDeletable(existing.id, existing.name);
    await this.productNaturesRepository.softDeleteByRefId(refId);
  }
}
