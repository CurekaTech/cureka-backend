import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgeGroupsRepository } from '../repositories/age-groups.repository';
import {
  CreateAgeGroupDto,
  UpdateAgeGroupDto,
  UpdateAgeGroupStatusDto,
} from '../dto/age-group.dto';
import { IAgeGroup } from '../interfaces/age-group.interface';
import {
  mapAgeGroupEntityToResponse,
  mapAgeGroupEntitiesToResponse,
} from '../mappers/age-group.mapper';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { PaginationQueryDto } from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';

@Injectable()
export class AgeGroupsService {
  constructor(private readonly ageGroupsRepository: AgeGroupsRepository) {}

  async create(dto: CreateAgeGroupDto, createdBy: string): Promise<IAgeGroup> {
    this.validateAgeRange(dto.fromYears, dto.fromMonths, dto.toYears, dto.toMonths);

    const entity = await this.ageGroupsRepository.create({
      name: dto.name,
      fromYears: dto.fromYears,
      fromMonths: dto.fromMonths,
      toYears: dto.toYears,
      toMonths: dto.toMonths,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.ageGroupsRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    return mapAgeGroupEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IAgeGroup>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.ageGroupsRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapAgeGroupEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(refId: string): Promise<IAgeGroup> {
    const entity = await this.ageGroupsRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Age group with refId ${refId} not found`);
    }
    return mapAgeGroupEntityToResponse(entity);
  }

  async update(refId: string, dto: UpdateAgeGroupDto, updatedBy: string): Promise<IAgeGroup> {
    const existing = await this.ageGroupsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Age group with refId ${refId} not found`);
    }

    const fromYears = dto.fromYears ?? existing.fromYears;
    const fromMonths = dto.fromMonths ?? existing.fromMonths;
    const toYears = dto.toYears ?? existing.toYears;
    const toMonths = dto.toMonths ?? existing.toMonths;
    this.validateAgeRange(fromYears, fromMonths, toYears, toMonths);

    const updated = await this.ageGroupsRepository.updateByRefId(refId, {
      ...dto,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Age group with refId ${refId} not found after update`);
    }

    return mapAgeGroupEntityToResponse(updated);
  }

  async updateStatus(
    refId: string,
    dto: UpdateAgeGroupStatusDto,
    updatedBy: string,
  ): Promise<IAgeGroup> {
    const existing = await this.ageGroupsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Age group with refId ${refId} not found`);
    }

    const updated = await this.ageGroupsRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Age group with refId ${refId} not found after status update`);
    }

    return mapAgeGroupEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.ageGroupsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Age group with refId ${refId} not found`);
    }
    await this.ageGroupsRepository.softDeleteByRefId(refId);
  }

  private validateAgeRange(
    fromYears: number,
    fromMonths: number,
    toYears: number,
    toMonths: number,
  ): void {
    const fromTotal = fromYears * 12 + fromMonths;
    const toTotal = toYears * 12 + toMonths;

    if (toTotal < fromTotal) {
      throw new BadRequestException('End age must be greater than or equal to start age');
    }
  }
}
