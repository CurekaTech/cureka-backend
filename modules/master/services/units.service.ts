import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';
import { CreateUnitDto, UpdateUnitDto, UpdateUnitStatusDto } from '../dto/unit.dto';
import { IUnit } from '../interfaces/unit.interface';
import { mapUnitEntitiesToResponse, mapUnitEntityToResponse } from '../mappers/unit.mapper';
import { UnitsRepository } from '../repositories/units.repository';
import { MasterListQueryDto } from '../dto/master-list-query.dto';
import { buildMasterListOptions } from '../utils/master-list-query.util';

@Injectable()
export class UnitsService {
  constructor(private readonly unitsRepository: UnitsRepository) {}

  async create(dto: CreateUnitDto, createdBy: string): Promise<IUnit> {
    const entity = await this.unitsRepository.create({
      name: dto.name,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.unitsRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    return mapUnitEntityToResponse(entity);
  }

  async findAll(query: MasterListQueryDto): Promise<PaginatedResult<IUnit>> {
    const paginationOptions = buildMasterListOptions(query);
    const { data, total } = await this.unitsRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapUnitEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(refId: string): Promise<IUnit> {
    const entity = await this.unitsRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Unit with refId ${refId} not found`);
    }
    return mapUnitEntityToResponse(entity);
  }

  async update(refId: string, dto: UpdateUnitDto, updatedBy: string): Promise<IUnit> {
    const existing = await this.unitsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Unit with refId ${refId} not found`);
    }

    const updated = await this.unitsRepository.updateByRefId(refId, {
      ...dto,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Unit with refId ${refId} not found after update`);
    }

    return mapUnitEntityToResponse(updated);
  }

  async updateStatus(
    refId: string,
    dto: UpdateUnitStatusDto,
    updatedBy: string,
  ): Promise<IUnit> {
    const existing = await this.unitsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Unit with refId ${refId} not found`);
    }

    const updated = await this.unitsRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Unit with refId ${refId} not found after status update`);
    }

    return mapUnitEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.unitsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Unit with refId ${refId} not found`);
    }
    await this.unitsRepository.softDeleteByRefId(refId);
  }
}
