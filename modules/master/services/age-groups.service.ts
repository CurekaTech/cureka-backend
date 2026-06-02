import {
  BadRequestException,
  ConflictException,
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
  generateRefId,
  PaginatedResult,
} from '@packages/common';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { MasterStatus } from '../enums/master-status.enum';

@Injectable()
export class AgeGroupsService {
  constructor(private readonly ageGroupsRepository: AgeGroupsRepository) {}

  async create(dto: CreateAgeGroupDto, createdBy: string): Promise<IAgeGroup> {
    this.validateAgeRange(dto.fromYears, dto.fromMonths, dto.toYears, dto.toMonths);

    if (await this.ageGroupsRepository.existsByName(dto.name)) {
      throw new ConflictException(`An age group with name "${dto.name}" already exists`);
    }

    const entity = await this.ageGroupsRepository.create({
      name: dto.name,
      fromYears: dto.fromYears,
      fromMonths: dto.fromMonths,
      toYears: dto.toYears,
      toMonths: dto.toMonths,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: generateRefId(dto.name),
      createdBy,
    });

    return mapAgeGroupEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IAgeGroup>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.ageGroupsRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapAgeGroupEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(id: string): Promise<IAgeGroup> {
    const entity = await this.ageGroupsRepository.findById(id);
    if (!entity) {
      throw new NotFoundException(`Age group with id ${id} not found`);
    }
    return mapAgeGroupEntityToResponse(entity);
  }

  async update(id: string, dto: UpdateAgeGroupDto, updatedBy: string): Promise<IAgeGroup> {
    const existing = await this.ageGroupsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Age group with id ${id} not found`);
    }

    const fromYears = dto.fromYears ?? existing.fromYears;
    const fromMonths = dto.fromMonths ?? existing.fromMonths;
    const toYears = dto.toYears ?? existing.toYears;
    const toMonths = dto.toMonths ?? existing.toMonths;
    this.validateAgeRange(fromYears, fromMonths, toYears, toMonths);

    if (dto.name && dto.name !== existing.name) {
      if (await this.ageGroupsRepository.existsByNameExcluding(dto.name, id)) {
        throw new ConflictException(`An age group with name "${dto.name}" already exists`);
      }
    }

    const updated = await this.ageGroupsRepository.update(id, {
      ...dto,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Age group with id ${id} not found after update`);
    }

    return mapAgeGroupEntityToResponse(updated);
  }

  async updateStatus(
    id: string,
    dto: UpdateAgeGroupStatusDto,
    updatedBy: string,
  ): Promise<IAgeGroup> {
    const existing = await this.ageGroupsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Age group with id ${id} not found`);
    }

    const updated = await this.ageGroupsRepository.update(id, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Age group with id ${id} not found after status update`);
    }

    return mapAgeGroupEntityToResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.ageGroupsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Age group with id ${id} not found`);
    }
    await this.ageGroupsRepository.softDelete(id);
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
