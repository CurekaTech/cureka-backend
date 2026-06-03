import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttributesRepository } from '../repositories/attributes.repository';
import { CreateAttributeDto, UpdateAttributeDto, UpdateAttributeStatusDto } from '../dto/attribute.dto';
import { IAttribute } from '../interfaces/attribute.interface';
import {
  mapAttributeEntityToResponse,
  mapAttributeEntitiesToResponse,
} from '../mappers/attribute.mapper';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { MasterStatus } from '../enums/master-status.enum';

@Injectable()
export class AttributesService {
  constructor(private readonly attributesRepository: AttributesRepository) {}

  async create(dto: CreateAttributeDto, createdBy: string): Promise<IAttribute> {
    const exists = await this.attributesRepository.existsByName(dto.name);
    if (exists) {
      throw new ConflictException(`An attribute with name "${dto.name}" already exists`);
    }

    const entity = await this.attributesRepository.create({
      name: dto.name,
      dataType: dto.dataType ?? null,
      values: dto.values ?? null,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.attributesRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    return mapAttributeEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IAttribute>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.attributesRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapAttributeEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(refId: string): Promise<IAttribute> {
    const entity = await this.attributesRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Attribute with refId ${refId} not found`);
    }
    return mapAttributeEntityToResponse(entity);
  }

  async update(refId: string, dto: UpdateAttributeDto, updatedBy: string): Promise<IAttribute> {
    const existing = await this.attributesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Attribute with refId ${refId} not found`);
    }

    if (dto.name && dto.name !== existing.name) {
      const nameConflict = await this.attributesRepository.existsByNameExcluding(
        dto.name,
        existing.id,
      );
      if (nameConflict) {
        throw new ConflictException(`An attribute with name "${dto.name}" already exists`);
      }
    }

    const updated = await this.attributesRepository.updateByRefId(refId, {
      ...dto,
      dataType: dto.dataType !== undefined ? dto.dataType ?? null : undefined,
      values: dto.values !== undefined ? dto.values ?? null : undefined,
      updatedBy,
    });
    if (!updated) {
      throw new NotFoundException(`Attribute with refId ${refId} not found after update`);
    }

    return mapAttributeEntityToResponse(updated);
  }

  async updateStatus(
    refId: string,
    dto: UpdateAttributeStatusDto,
    updatedBy: string,
  ): Promise<IAttribute> {
    const existing = await this.attributesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Attribute with refId ${refId} not found`);
    }

    const updated = await this.attributesRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Attribute with refId ${refId} not found after status update`);
    }

    return mapAttributeEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.attributesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Attribute with refId ${refId} not found`);
    }
    await this.attributesRepository.softDeleteByRefId(refId);
  }
}
