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
  generateRefId,
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
      refId: generateRefId(dto.name),
      createdBy,
    });

    return mapAttributeEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IAttribute>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.attributesRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapAttributeEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(id: string): Promise<IAttribute> {
    const entity = await this.attributesRepository.findById(id);
    if (!entity) {
      throw new NotFoundException(`Attribute with id ${id} not found`);
    }
    return mapAttributeEntityToResponse(entity);
  }

  async update(id: string, dto: UpdateAttributeDto, updatedBy: string): Promise<IAttribute> {
    const existing = await this.attributesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Attribute with id ${id} not found`);
    }

    if (dto.name && dto.name !== existing.name) {
      const nameConflict = await this.attributesRepository.existsByNameExcluding(dto.name, id);
      if (nameConflict) {
        throw new ConflictException(`An attribute with name "${dto.name}" already exists`);
      }
    }

    const updated = await this.attributesRepository.update(id, {
      ...dto,
      dataType: dto.dataType !== undefined ? dto.dataType ?? null : undefined,
      values: dto.values !== undefined ? dto.values ?? null : undefined,
      updatedBy,
    });
    if (!updated) {
      throw new NotFoundException(`Attribute with id ${id} not found after update`);
    }

    return mapAttributeEntityToResponse(updated);
  }

  async updateStatus(
    id: string,
    dto: UpdateAttributeStatusDto,
    updatedBy: string,
  ): Promise<IAttribute> {
    const existing = await this.attributesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Attribute with id ${id} not found`);
    }

    const updated = await this.attributesRepository.update(id, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Attribute with id ${id} not found after status update`);
    }

    return mapAttributeEntityToResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.attributesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Attribute with id ${id} not found`);
    }
    await this.attributesRepository.softDelete(id);
  }
}
