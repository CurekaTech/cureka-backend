import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CitiesRepository } from '../repositories/cities.repository';
import { StatesRepository } from '../repositories/states.repository';
import {
  CreateCityDto,
  UpdateCityDto,
  UpdateCityStatusDto,
  CityQueryDto,
} from '../dto/city.dto';
import { ICity } from '../interfaces/city.interface';
import { mapCityEntityToResponse, mapCityEntitiesToResponse } from '../mappers/city.mapper';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateRefId,
  PaginatedResult,
} from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';

@Injectable()
export class CitiesService {
  constructor(
    private readonly citiesRepository: CitiesRepository,
    private readonly statesRepository: StatesRepository,
  ) {}

  async create(dto: CreateCityDto, createdBy: string): Promise<ICity> {
    const state = await this.statesRepository.findById(dto.stateId);
    if (!state) {
      throw new NotFoundException(`State with id "${dto.stateId}" not found`);
    }

    if (await this.citiesRepository.existsByNameInState(dto.name, dto.stateId)) {
      throw new ConflictException(`A city with name "${dto.name}" already exists in this state`);
    }

    const entity = await this.citiesRepository.create({
      name: dto.name,
      stateId: dto.stateId,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: generateRefId(dto.name),
      createdBy,
    });

    const loaded = await this.citiesRepository.findById(entity.id);
    return mapCityEntityToResponse(loaded!);
  }

  async findAll(query: CityQueryDto): Promise<PaginatedResult<ICity>> {
    const options = {
      ...buildPaginationOptions(query),
      stateId: query.stateId,
      countryId: query.countryId,
    };
    const { data, total } = await this.citiesRepository.findAllPaginated(options);
    return buildPaginatedResult(mapCityEntitiesToResponse(data), total, options);
  }

  async findOne(id: string): Promise<ICity> {
    const entity = await this.citiesRepository.findById(id);
    if (!entity) {
      throw new NotFoundException(`City with id ${id} not found`);
    }
    return mapCityEntityToResponse(entity);
  }

  async update(id: string, dto: UpdateCityDto, updatedBy: string): Promise<ICity> {
    const existing = await this.citiesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`City with id ${id} not found`);
    }

    const stateId = dto.stateId ?? existing.stateId;
    if (dto.stateId) {
      const state = await this.statesRepository.findById(dto.stateId);
      if (!state) {
        throw new NotFoundException(`State with id "${dto.stateId}" not found`);
      }
    }

    const name = dto.name ?? existing.name;
    if (dto.name && dto.name !== existing.name) {
      if (await this.citiesRepository.existsByNameInStateExcluding(name, stateId, id)) {
        throw new ConflictException(`A city with name "${name}" already exists in this state`);
      }
    } else if (dto.stateId && dto.stateId !== existing.stateId) {
      if (await this.citiesRepository.existsByNameInStateExcluding(name, stateId, id)) {
        throw new ConflictException(`A city with name "${name}" already exists in the target state`);
      }
    }

    const updated = await this.citiesRepository.update(id, {
      ...dto,
      stateId,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`City with id ${id} not found after update`);
    }

    return mapCityEntityToResponse(updated);
  }

  async updateStatus(
    id: string,
    dto: UpdateCityStatusDto,
    updatedBy: string,
  ): Promise<ICity> {
    const existing = await this.citiesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`City with id ${id} not found`);
    }

    const updated = await this.citiesRepository.update(id, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`City with id ${id} not found after status update`);
    }

    return mapCityEntityToResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.citiesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`City with id ${id} not found`);
    }
    await this.citiesRepository.softDelete(id);
  }
}
