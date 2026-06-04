import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ManufacturersRepository } from '../repositories/manufacturers.repository';
import { CategoriesRepository } from '../repositories/categories.repository';
import { CitiesRepository } from '../repositories/cities.repository';
import { StatesRepository } from '../repositories/states.repository';
import { CountriesRepository } from '../repositories/countries.repository';
import {
  CreateManufacturerDto,
  UpdateManufacturerDto,
  UpdateManufacturerStatusDto,
} from '../dto/manufacturer.dto';
import { IManufacturer } from '../interfaces/manufacturer.interface';
import {
  mapManufacturerEntityToResponse,
  mapManufacturerEntitiesToResponse,
} from '../mappers/manufacturer.mapper';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { MasterStatus } from '../enums/master-status.enum';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { ManufacturerEntity } from '../entities/manufacturer.entity';
import { CategoryEntity } from '../entities/category.entity';

const MANUFACTURER_UPLOAD_FIELDS = {
  logo: UploadFolder.LOGOS,
} as const;

@Injectable()
export class ManufacturersService {
  constructor(
    private readonly manufacturersRepository: ManufacturersRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly citiesRepository: CitiesRepository,
    private readonly statesRepository: StatesRepository,
    private readonly countriesRepository: CountriesRepository,
    private readonly multipartFormService: MultipartFormService,
  ) {}

  async createFromRequest(req: FastifyRequest, createdBy: string): Promise<IManufacturer> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateManufacturerDto,
      MANUFACTURER_UPLOAD_FIELDS,
    );
    return this.create(dto, uploadedUrls['logo'] ?? null, createdBy);
  }

  async create(
    dto: CreateManufacturerDto,
    logo: string | null,
    createdBy: string,
  ): Promise<IManufacturer> {
    if (await this.manufacturersRepository.existsByName(dto.name)) {
      throw new ConflictException(`A manufacturer with name "${dto.name}" already exists`);
    }
    if (await this.manufacturersRepository.existsByCode(dto.code)) {
      throw new ConflictException(`A manufacturer with code "${dto.code}" already exists`);
    }

    let cityId: string | null = null;
    let stateId: string | null = null;
    let countryId: string | null = null;

    if (dto.cityRefId) {
      const city = await this.citiesRepository.findByRefId(dto.cityRefId);
      if (!city) throw new NotFoundException(`City with refId "${dto.cityRefId}" not found`);
      cityId = city.id;
    }
    if (dto.stateRefId) {
      const state = await this.statesRepository.findByRefId(dto.stateRefId);
      if (!state) throw new NotFoundException(`State with refId "${dto.stateRefId}" not found`);
      stateId = state.id;
    }
    if (dto.countryRefId) {
      const country = await this.countriesRepository.findByRefId(dto.countryRefId);
      if (!country)
        throw new NotFoundException(`Country with refId "${dto.countryRefId}" not found`);
      countryId = country.id;
    }

    const categories: CategoryEntity[] = await this.resolveCategoryRefIds(
      dto.categoryRefIds ?? [],
    );

    const entity = await this.manufacturersRepository.create(
      {
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
        refId: await generateUniqueRefId(dto.name, (refId) =>
          this.manufacturersRepository.existsByRefId(refId),
        ),
        createdBy,
      },
      categories,
    );

    const loaded = await this.manufacturersRepository.findByRefId(entity.refId);
    return mapManufacturerEntityToResponse(loaded!);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IManufacturer>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } =
      await this.manufacturersRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapManufacturerEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(refId: string): Promise<IManufacturer> {
    const entity = await this.manufacturersRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException(`Manufacturer with refId ${refId} not found`);
    return mapManufacturerEntityToResponse(entity);
  }

  async updateFromRequest(
    refId: string,
    req: FastifyRequest,
    updatedBy: string,
  ): Promise<IManufacturer> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateManufacturerDto,
      MANUFACTURER_UPLOAD_FIELDS,
    );
    return this.update(refId, dto, updatedBy, uploadedUrls['logo']);
  }

  async update(
    refId: string,
    dto: UpdateManufacturerDto,
    updatedBy: string,
    logo?: string,
  ): Promise<IManufacturer> {
    const existing = await this.manufacturersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Manufacturer with refId ${refId} not found`);

    if (dto.name && dto.name !== existing.name) {
      if (await this.manufacturersRepository.existsByNameExcluding(dto.name, existing.id)) {
        throw new ConflictException(`A manufacturer with name "${dto.name}" already exists`);
      }
    }
    if (dto.code && dto.code !== existing.code) {
      if (await this.manufacturersRepository.existsByCodeExcluding(dto.code, existing.id)) {
        throw new ConflictException(`A manufacturer with code "${dto.code}" already exists`);
      }
    }

    const payload: Partial<ManufacturerEntity> = { updatedBy };

    if (dto.name !== undefined) payload.name = dto.name;
    if (dto.code !== undefined) payload.code = dto.code;
    if (dto.description !== undefined) payload.description = dto.description;
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
    if (logo !== undefined) payload.logo = logo;

    if (dto.cityRefId !== undefined) {
      if (dto.cityRefId) {
        const city = await this.citiesRepository.findByRefId(dto.cityRefId);
        if (!city) throw new NotFoundException(`City with refId "${dto.cityRefId}" not found`);
        payload.cityId = city.id;
      } else {
        payload.cityId = null;
      }
    }
    if (dto.stateRefId !== undefined) {
      if (dto.stateRefId) {
        const state = await this.statesRepository.findByRefId(dto.stateRefId);
        if (!state) throw new NotFoundException(`State with refId "${dto.stateRefId}" not found`);
        payload.stateId = state.id;
      } else {
        payload.stateId = null;
      }
    }
    if (dto.countryRefId !== undefined) {
      if (dto.countryRefId) {
        const country = await this.countriesRepository.findByRefId(dto.countryRefId);
        if (!country)
          throw new NotFoundException(`Country with refId "${dto.countryRefId}" not found`);
        payload.countryId = country.id;
      } else {
        payload.countryId = null;
      }
    }

    let categories: CategoryEntity[] | undefined;
    if (dto.categoryRefIds !== undefined) {
      categories = await this.resolveCategoryRefIds(dto.categoryRefIds);
    }

    const result = await this.manufacturersRepository.updateByRefId(refId, payload, categories);
    if (!result)
      throw new NotFoundException(`Manufacturer with refId ${refId} not found after update`);
    return mapManufacturerEntityToResponse(result);
  }

  async updateStatus(
    refId: string,
    dto: UpdateManufacturerStatusDto,
    updatedBy: string,
  ): Promise<IManufacturer> {
    const existing = await this.manufacturersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Manufacturer with refId ${refId} not found`);

    const updated = await this.manufacturersRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });
    if (!updated)
      throw new NotFoundException(
        `Manufacturer with refId ${refId} not found after status update`,
      );
    return mapManufacturerEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.manufacturersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Manufacturer with refId ${refId} not found`);
    await this.manufacturersRepository.softDeleteByRefId(refId);
  }

  private async resolveCategoryRefIds(refIds: string[]): Promise<CategoryEntity[]> {
    const categories: CategoryEntity[] = [];
    for (const categoryRefId of refIds) {
      const category = await this.categoriesRepository.findByRefId(categoryRefId);
      if (!category)
        throw new NotFoundException(`Category with refId "${categoryRefId}" not found`);
      categories.push(category);
    }
    return categories;
  }
}
