import {
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
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';
import { MasterDeletionGuardService } from './master-deletion-guard.service';

@Injectable()
export class StatesService {
  constructor(
    private readonly statesRepository: StatesRepository,
    private readonly countriesRepository: CountriesRepository,
    private readonly deletionGuard: MasterDeletionGuardService,
  ) {}

  async create(dto: CreateStateDto, createdBy: string): Promise<IState> {
    const country = await this.countriesRepository.findByRefId(dto.countryRefId);
    if (!country) {
      throw new NotFoundException(`Country with refId "${dto.countryRefId}" not found`);
    }

    if (await this.statesRepository.existsByName(dto.name, country.id)) {
      throw new ConflictException(
        `A state with name "${dto.name}" already exists in this country`,
      );
    }

    const entity = await this.statesRepository.create({
      name: dto.name,
      code: dto.code ?? null,
      countryId: country.id,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.statesRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    const loaded = await this.statesRepository.findByRefId(entity.refId);
    return mapStateEntityToResponse(loaded!);
  }

  async findAll(query: StateQueryDto): Promise<PaginatedResult<IState>> {
    let countryId: string | undefined;
    if (query.countryRefId) {
      const country = await this.countriesRepository.findByRefId(query.countryRefId);
      if (!country) {
        throw new NotFoundException(`Country with refId "${query.countryRefId}" not found`);
      }
      countryId = country.id;
    }

    const options = {
      ...buildPaginationOptions(query),
      countryId,
    };
    const { data, total } = await this.statesRepository.findAllPaginated(options);
    return buildPaginatedResult(mapStateEntitiesToResponse(data), total, options);
  }

  async findOne(refId: string): Promise<IState> {
    const entity = await this.statesRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`State with refId ${refId} not found`);
    }
    return mapStateEntityToResponse(entity);
  }

  async update(refId: string, dto: UpdateStateDto, updatedBy: string): Promise<IState> {
    const existing = await this.statesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`State with refId ${refId} not found`);
    }

    let countryId = existing.countryId;
    if (dto.countryRefId) {
      const country = await this.countriesRepository.findByRefId(dto.countryRefId);
      if (!country) {
        throw new NotFoundException(`Country with refId "${dto.countryRefId}" not found`);
      }
      countryId = country.id;
    }

    const nextName = dto.name ?? existing.name;
    if (await this.statesRepository.existsByName(nextName, countryId, refId)) {
      throw new ConflictException(
        `A state with name "${nextName}" already exists in this country`,
      );
    }

    const updated = await this.statesRepository.updateByRefId(refId, {
      name: dto.name,
      code: dto.code !== undefined ? dto.code ?? null : undefined,
      countryId,
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`State with refId ${refId} not found after update`);
    }

    return mapStateEntityToResponse(updated);
  }

  async updateStatus(
    refId: string,
    dto: UpdateStateStatusDto,
    updatedBy: string,
  ): Promise<IState> {
    const existing = await this.statesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`State with refId ${refId} not found`);
    }

    const updated = await this.statesRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`State with refId ${refId} not found after status update`);
    }

    return mapStateEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.statesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`State with refId ${refId} not found`);
    }

    await this.deletionGuard.assertStateDeletable(existing.id, existing.name);
    await this.statesRepository.softDeleteByRefId(refId);
  }
}
