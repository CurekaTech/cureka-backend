import {
  BadRequestException,
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
  generateRefId,
  PaginatedResult,
} from '@packages/common';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { MasterStatus } from '../enums/master-status.enum';

@Injectable()
export class CountriesService {
  constructor(private readonly countriesRepository: CountriesRepository) {}

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
      refId: generateRefId(dto.name),
      createdBy,
    });

    return mapCountryEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<ICountry>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.countriesRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapCountryEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(id: string): Promise<ICountry> {
    const entity = await this.countriesRepository.findById(id);
    if (!entity) {
      throw new NotFoundException(`Country with id ${id} not found`);
    }
    return mapCountryEntityToResponse(entity);
  }

  async update(id: string, dto: UpdateCountryDto, updatedBy: string): Promise<ICountry> {
    const existing = await this.countriesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Country with id ${id} not found`);
    }

    if (dto.name && dto.name !== existing.name) {
      if (await this.countriesRepository.existsByNameExcluding(dto.name, id)) {
        throw new ConflictException(`A country with name "${dto.name}" already exists`);
      }
    }

    const code = dto.code?.toUpperCase();
    if (code && code !== existing.code) {
      if (await this.countriesRepository.existsByCodeExcluding(code, id)) {
        throw new ConflictException(`A country with code "${code}" already exists`);
      }
    }

    const updated = await this.countriesRepository.update(id, {
      ...dto,
      code,
      phoneCode: dto.phoneCode !== undefined ? dto.phoneCode ?? null : undefined,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Country with id ${id} not found after update`);
    }

    return mapCountryEntityToResponse(updated);
  }

  async updateStatus(
    id: string,
    dto: UpdateCountryStatusDto,
    updatedBy: string,
  ): Promise<ICountry> {
    const existing = await this.countriesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Country with id ${id} not found`);
    }

    const updated = await this.countriesRepository.update(id, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Country with id ${id} not found after status update`);
    }

    return mapCountryEntityToResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.countriesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Country with id ${id} not found`);
    }

    const stateCount = await this.countriesRepository.countStates(id);
    if (stateCount > 0) {
      throw new BadRequestException('Cannot delete a country that has states');
    }

    await this.countriesRepository.softDelete(id);
  }
}
