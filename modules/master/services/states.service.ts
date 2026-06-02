import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StatesRepository } from '../repositories/states.repository';
import { CountriesRepository } from '../repositories/countries.repository';
import {
  CreateStateDto,
  UpdateStateDto,
  UpdateStateStatusDto,
  StateQueryDto,
} from '../dto/state.dto';
import { IState } from '../interfaces/state.interface';
import { mapStateEntityToResponse, mapStateEntitiesToResponse } from '../mappers/state.mapper';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateRefId,
  PaginatedResult,
} from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';

@Injectable()
export class StatesService {
  constructor(
    private readonly statesRepository: StatesRepository,
    private readonly countriesRepository: CountriesRepository,
  ) {}

  async create(dto: CreateStateDto, createdBy: string): Promise<IState> {
    const country = await this.countriesRepository.findById(dto.countryId);
    if (!country) {
      throw new NotFoundException(`Country with id "${dto.countryId}" not found`);
    }

    if (await this.statesRepository.existsByNameInCountry(dto.name, dto.countryId)) {
      throw new ConflictException(
        `A state with name "${dto.name}" already exists in this country`,
      );
    }

    const entity = await this.statesRepository.create({
      name: dto.name,
      code: dto.code ?? null,
      countryId: dto.countryId,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: generateRefId(dto.name),
      createdBy,
    });

    const loaded = await this.statesRepository.findById(entity.id);
    return mapStateEntityToResponse(loaded!);
  }

  async findAll(query: StateQueryDto): Promise<PaginatedResult<IState>> {
    const options = {
      ...buildPaginationOptions(query),
      countryId: query.countryId,
    };
    const { data, total } = await this.statesRepository.findAllPaginated(options);
    return buildPaginatedResult(mapStateEntitiesToResponse(data), total, options);
  }

  async findOne(id: string): Promise<IState> {
    const entity = await this.statesRepository.findById(id);
    if (!entity) {
      throw new NotFoundException(`State with id ${id} not found`);
    }
    return mapStateEntityToResponse(entity);
  }

  async update(id: string, dto: UpdateStateDto, updatedBy: string): Promise<IState> {
    const existing = await this.statesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`State with id ${id} not found`);
    }

    const countryId = dto.countryId ?? existing.countryId;
    if (dto.countryId) {
      const country = await this.countriesRepository.findById(dto.countryId);
      if (!country) {
        throw new NotFoundException(`Country with id "${dto.countryId}" not found`);
      }
    }

    const name = dto.name ?? existing.name;
    if (dto.name && dto.name !== existing.name) {
      if (await this.statesRepository.existsByNameInCountryExcluding(name, countryId, id)) {
        throw new ConflictException(
          `A state with name "${name}" already exists in this country`,
        );
      }
    } else if (dto.countryId && dto.countryId !== existing.countryId) {
      if (await this.statesRepository.existsByNameInCountryExcluding(name, countryId, id)) {
        throw new ConflictException(
          `A state with name "${name}" already exists in the target country`,
        );
      }
    }

    const updated = await this.statesRepository.update(id, {
      ...dto,
      code: dto.code !== undefined ? dto.code ?? null : undefined,
      countryId,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`State with id ${id} not found after update`);
    }

    return mapStateEntityToResponse(updated);
  }

  async updateStatus(
    id: string,
    dto: UpdateStateStatusDto,
    updatedBy: string,
  ): Promise<IState> {
    const existing = await this.statesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`State with id ${id} not found`);
    }

    const updated = await this.statesRepository.update(id, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`State with id ${id} not found after status update`);
    }

    return mapStateEntityToResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.statesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`State with id ${id} not found`);
    }

    const cityCount = await this.statesRepository.countCities(id);
    if (cityCount > 0) {
      throw new BadRequestException('Cannot delete a state that has cities');
    }

    await this.statesRepository.softDelete(id);
  }
}
