import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FastifyRequest } from 'fastify';
import {
  buildQueryCacheHash,
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
} from '@packages/cache';
import { EVENTS, PackerUpdatedEvent } from '@packages/events';
import { PackersRepository } from '../repositories/packers.repository';
import { CitiesRepository } from '../repositories/cities.repository';
import { StatesRepository } from '../repositories/states.repository';
import { CountriesRepository } from '../repositories/countries.repository';
import {
  CreatePackerDto,
  UpdatePackerDto,
  UpdatePackerStatusDto,
} from '../dto/packer.dto';
import { IPacker } from '../interfaces/packer.interface';
import {
  mapPackerEntityToResponse,
  mapPackerEntitiesToResponse,
} from '../mappers/packer.mapper';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { PaginationQueryDto } from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { PackerEntity } from '../entities/packer.entity';

const PACKER_UPLOAD_FIELDS = {
  logo: UploadFolder.LOGOS,
} as const;

@Injectable()
export class PackersService {
  constructor(
    private readonly packersRepository: PackersRepository,
    private readonly citiesRepository: CitiesRepository,
    private readonly statesRepository: StatesRepository,
    private readonly countriesRepository: CountriesRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createFromRequest(req: FastifyRequest, createdBy: string): Promise<IPacker> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreatePackerDto,
      PACKER_UPLOAD_FIELDS,
    );
    return this.create(dto, uploadedUrls['logo'] ?? null, createdBy);
  }

  async create(
    dto: CreatePackerDto,
    logo: string | null,
    createdBy: string,
  ): Promise<IPacker> {
    if (await this.packersRepository.existsByCode(dto.code)) {
      throw new ConflictException(`A packer with code "${dto.code}" already exists`);
    }

    const { cityId, stateId, countryId } = await this.resolveLocationRefIds(dto);

    const entity = await this.packersRepository.create({
      name: dto.name,
      code: dto.code,
      logo,
      description: dto.description ?? null,
      contactPerson: dto.contactPerson ?? null,
      email: dto.email ?? null,
      mobileNumber: dto.mobileNumber ?? null,
      addressLine1: dto.addressLine1 ?? null,
      addressLine2: dto.addressLine2 ?? null,
      landmark: dto.landmark ?? null,
      cityId,
      stateId,
      countryId,
      pinCode: dto.pinCode ?? null,
      gstNumber: dto.gstNumber ?? null,
      drugLicenseNumber: dto.drugLicenseNumber ?? null,
      status: dto.status ?? MasterStatus.ACTIVE,
      remarks: dto.remarks ?? null,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.packersRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    const loaded = await this.packersRepository.findByRefId(entity.refId);
    await this.emitPackerUpdated(entity.refId, 'created');
    return mapPackerEntityToResponse(loaded!);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IPacker>> {
    const queryHash = buildQueryCacheHash({
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      search: query.search ?? '',
      sortBy: query.sortBy ?? '',
      sortOrder: query.sortOrder ?? '',
    });

    return this.cacheStrategy.cacheAside({
      key: CacheKeys.packers.list(queryHash),
      module: CacheModuleName.PACKER,
      loader: async () => {
        const paginationOptions = buildPaginationOptions(query);
        const { data, total } =
          await this.packersRepository.findAllPaginated(paginationOptions);
        return buildPaginatedResult(mapPackerEntitiesToResponse(data), total, paginationOptions);
      },
    });
  }

  async findOne(refId: string): Promise<IPacker> {
    const entity = await this.packersRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException(`Packer with refId ${refId} not found`);
    return mapPackerEntityToResponse(entity);
  }

  async updateFromRequest(
    refId: string,
    req: FastifyRequest,
    updatedBy: string,
  ): Promise<IPacker> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdatePackerDto,
      PACKER_UPLOAD_FIELDS,
    );
    return this.update(refId, dto, updatedBy, uploadedUrls['logo']);
  }

  async update(
    refId: string,
    dto: UpdatePackerDto,
    updatedBy: string,
    logo?: string,
  ): Promise<IPacker> {
    const existing = await this.packersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Packer with refId ${refId} not found`);

    if (dto.code && dto.code !== existing.code) {
      if (await this.packersRepository.existsByCodeExcluding(dto.code, existing.id)) {
        throw new ConflictException(`A packer with code "${dto.code}" already exists`);
      }
    }

    const payload: Partial<PackerEntity> = { updatedBy };

    if (dto.name !== undefined) payload.name = dto.name;
    if (dto.code !== undefined) payload.code = dto.code;
    if (dto.description !== undefined) payload.description = dto.description ?? null;
    if (dto.contactPerson !== undefined) payload.contactPerson = dto.contactPerson;
    if (dto.email !== undefined) payload.email = dto.email;
    if (dto.mobileNumber !== undefined) payload.mobileNumber = dto.mobileNumber;
    if (dto.addressLine1 !== undefined) payload.addressLine1 = dto.addressLine1;
    if (dto.addressLine2 !== undefined) payload.addressLine2 = dto.addressLine2;
    if (dto.landmark !== undefined) payload.landmark = dto.landmark;
    if (dto.pinCode !== undefined) payload.pinCode = dto.pinCode;
    if (dto.gstNumber !== undefined) payload.gstNumber = dto.gstNumber;
    if (dto.drugLicenseNumber !== undefined) payload.drugLicenseNumber = dto.drugLicenseNumber;
    if (dto.status !== undefined) payload.status = dto.status;
    if (dto.remarks !== undefined) payload.remarks = dto.remarks ?? null;
    if (logo !== undefined) payload.logo = logo;

    if (dto.cityRefId !== undefined) {
      payload.cityId = dto.cityRefId
        ? (await this.requireCityByRefId(dto.cityRefId)).id
        : null;
    }
    if (dto.stateRefId !== undefined) {
      payload.stateId = dto.stateRefId
        ? (await this.requireStateByRefId(dto.stateRefId)).id
        : null;
    }
    if (dto.countryRefId !== undefined) {
      payload.countryId = dto.countryRefId
        ? (await this.requireCountryByRefId(dto.countryRefId)).id
        : null;
    }

    const result = await this.packersRepository.updateByRefId(refId, payload);
    if (!result) throw new NotFoundException(`Packer with refId ${refId} not found after update`);
    await this.emitPackerUpdated(refId, 'updated');
    return mapPackerEntityToResponse(result);
  }

  async updateStatus(
    refId: string,
    dto: UpdatePackerStatusDto,
    updatedBy: string,
  ): Promise<IPacker> {
    const existing = await this.packersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Packer with refId ${refId} not found`);

    const updated = await this.packersRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });
    if (!updated) {
      throw new NotFoundException(`Packer with refId ${refId} not found after status update`);
    }
    await this.emitPackerUpdated(refId, 'status_updated');
    return mapPackerEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.packersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Packer with refId ${refId} not found`);
    await this.packersRepository.softDeleteByRefId(refId);
    await this.emitPackerUpdated(refId, 'deleted');
  }

  private async emitPackerUpdated(
    refId: string,
    action: 'created' | 'updated' | 'deleted' | 'status_updated',
  ): Promise<void> {
    await this.eventEmitter.emitAsync(
      EVENTS.PACKER_UPDATED,
      new PackerUpdatedEvent(refId, action),
    );
  }

  private async resolveLocationRefIds(dto: CreatePackerDto) {
    let cityId: string | null = null;
    let stateId: string | null = null;
    let countryId: string | null = null;

    if (dto.cityRefId) {
      cityId = (await this.requireCityByRefId(dto.cityRefId)).id;
    }
    if (dto.stateRefId) {
      stateId = (await this.requireStateByRefId(dto.stateRefId)).id;
    }
    if (dto.countryRefId) {
      countryId = (await this.requireCountryByRefId(dto.countryRefId)).id;
    }

    return { cityId, stateId, countryId };
  }

  private async requireCityByRefId(refId: string) {
    const city = await this.citiesRepository.findByRefId(refId);
    if (!city) throw new NotFoundException(`City with refId "${refId}" not found`);
    return city;
  }

  private async requireStateByRefId(refId: string) {
    const state = await this.statesRepository.findByRefId(refId);
    if (!state) throw new NotFoundException(`State with refId "${refId}" not found`);
    return state;
  }

  private async requireCountryByRefId(refId: string) {
    const country = await this.countriesRepository.findByRefId(refId);
    if (!country) throw new NotFoundException(`Country with refId "${refId}" not found`);
    return country;
  }
}
