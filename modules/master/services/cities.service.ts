import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CitiesRepository } from '../repositories/cities.repository';
import { StatesRepository } from '../repositories/states.repository';
import { CountriesRepository } from '../repositories/countries.repository';
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
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';

@Injectable()
export class CitiesService {
  constructor(
    private readonly citiesRepository: CitiesRepository,
    private readonly statesRepository: StatesRepository,
    private readonly countriesRepository: CountriesRepository,
  ) {}

  async create(dto: CreateCityDto, createdBy: string): Promise<ICity> {
    const state = await this.statesRepository.findByRefId(dto.stateRefId);
    if (!state) {
      throw new NotFoundException(`State with refId "${dto.stateRefId}" not found`);
    }

    if (await this.citiesRepository.existsByName(dto.name, state.id)) {
      throw new ConflictException(
        `A city with name "${dto.name}" already exists in this state`,
      );
    }

    const entity = await this.citiesRepository.create({
      name: dto.name,
      stateId: state.id,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.citiesRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    const loaded = await this.citiesRepository.findByRefId(entity.refId);
    return mapCityEntityToResponse(loaded!);
  }

  async findAll(query: CityQueryDto): Promise<PaginatedResult<ICity>> {
    let stateId: string | undefined;
    let countryId: string | undefined;

    if (query.stateRefId) {
      const state = await this.statesRepository.findByRefId(query.stateRefId);
      if (!state) {
        throw new NotFoundException(`State with refId "${query.stateRefId}" not found`);
      }
      stateId = state.id;
    }

    if (query.countryRefId) {
      const country = await this.countriesRepository.findByRefId(query.countryRefId);
      if (!country) {
        throw new NotFoundException(`Country with refId "${query.countryRefId}" not found`);
      }
      countryId = country.id;
    }

    const options = {
      ...buildPaginationOptions(query),
      stateId,
      countryId,
    };
    const { data, total } = await this.citiesRepository.findAllPaginated(options);
    return buildPaginatedResult(mapCityEntitiesToResponse(data), total, options);
  }

  async findOne(refId: string): Promise<ICity> {
    const entity = await this.citiesRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`City with refId ${refId} not found`);
    }
    return mapCityEntityToResponse(entity);
  }

  async update(refId: string, dto: UpdateCityDto, updatedBy: string): Promise<ICity> {
    const existing = await this.citiesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`City with refId ${refId} not found`);
    }

    let stateId = existing.stateId;
    if (dto.stateRefId) {
      const state = await this.statesRepository.findByRefId(dto.stateRefId);
      if (!state) {
        throw new NotFoundException(`State with refId "${dto.stateRefId}" not found`);
      }
      stateId = state.id;
    }

    const nextName = dto.name ?? existing.name;
    if (await this.citiesRepository.existsByName(nextName, stateId, refId)) {
      throw new ConflictException(
        `A city with name "${nextName}" already exists in this state`,
      );
    }

    const updated = await this.citiesRepository.updateByRefId(refId, {
      name: dto.name,
      stateId,
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`City with refId ${refId} not found after update`);
    }

    return mapCityEntityToResponse(updated);
  }

  async updateStatus(
    refId: string,
    dto: UpdateCityStatusDto,
    updatedBy: string,
  ): Promise<ICity> {
    const existing = await this.citiesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`City with refId ${refId} not found`);
    }

    const updated = await this.citiesRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`City with refId ${refId} not found after status update`);
    }

    return mapCityEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.citiesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`City with refId ${refId} not found`);
    }
    await this.citiesRepository.softDeleteByRefId(refId);
  }
}
