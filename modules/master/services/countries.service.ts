import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CountriesRepository } from '../repositories/countries.repository';
import {
  CreateCountryDto,
  UpdateCountryDto,
  UpdateCountryStatusDto,
} from '../dto/country.dto';
import { ICountry } from '../interfaces/country.interface';
import {
  mapCountryEntityToResponse,
  mapCountryEntitiesToResponse,
} from '../mappers/country.mapper';
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
export class CountriesService {
  constructor(
    private readonly countriesRepository: CountriesRepository,
    private readonly deletionGuard: MasterDeletionGuardService,
  ) {}

  async create(dto: CreateCountryDto, createdBy: string): Promise<ICountry> {
    const code = dto.code.toUpperCase();

    if (await this.countriesRepository.existsByName(dto.name)) {
      throw new ConflictException(`A country with name "${dto.name}" already exists`);
    }
    if (await this.countriesRepository.existsByCode(code)) {
      throw new ConflictException(`A country with code "${code}" already exists`);
    }

    const entity = await this.countriesRepository.create({
      name: dto.name,
      code,
      phoneCode: dto.phoneCode ?? null,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.countriesRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    return mapCountryEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<ICountry>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.countriesRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapCountryEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(refId: string): Promise<ICountry> {
    const entity = await this.countriesRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Country with refId ${refId} not found`);
    }
    return mapCountryEntityToResponse(entity);
  }

  async update(refId: string, dto: UpdateCountryDto, updatedBy: string): Promise<ICountry> {
    const existing = await this.countriesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Country with refId ${refId} not found`);
    }

    if (
      dto.name !== undefined &&
      (await this.countriesRepository.existsByName(dto.name, refId))
    ) {
      throw new ConflictException(`A country with name "${dto.name}" already exists`);
    }

    const code = dto.code?.toUpperCase();
    if (code && code !== existing.code) {
      if (await this.countriesRepository.existsByCodeExcluding(code, existing.id)) {
        throw new ConflictException(`A country with code "${code}" already exists`);
      }
    }

    const updated = await this.countriesRepository.updateByRefId(refId, {
      ...dto,
      code,
      phoneCode: dto.phoneCode !== undefined ? dto.phoneCode ?? null : undefined,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Country with refId ${refId} not found after update`);
    }

    return mapCountryEntityToResponse(updated);
  }

  async updateStatus(
    refId: string,
    dto: UpdateCountryStatusDto,
    updatedBy: string,
  ): Promise<ICountry> {
    const existing = await this.countriesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Country with refId ${refId} not found`);
    }

    const updated = await this.countriesRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Country with refId ${refId} not found after status update`);
    }

    return mapCountryEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.countriesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Country with refId ${refId} not found`);
    }

    await this.deletionGuard.assertCountryDeletable(existing.id, existing.name);
    await this.countriesRepository.softDeleteByRefId(refId);
  }
}
