import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ManufacturersRepository } from '../repositories/manufacturers.repository';
import { CategoriesRepository } from '../repositories/categories.repository';
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
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { MasterListQueryDto } from '../dto/master-list-query.dto';
import { buildMasterListOptions } from '../utils/master-list-query.util';
import { MasterStatus } from '../enums/master-status.enum';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { ManufacturerEntity } from '../entities/manufacturer.entity';
import { CategoryEntity } from '../entities/category.entity';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { MasterDeletionGuardService } from './master-deletion-guard.service';

const MANUFACTURER_MEDIA_FIELDS = ['logo'] as const;

const MANUFACTURER_UPLOAD_FIELDS = {
  logo: UploadFolder.LOGOS,
} as const;

@Injectable()
export class ManufacturersService {
  constructor(
    private readonly manufacturersRepository: ManufacturersRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly deletionGuard: MasterDeletionGuardService,
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
    if (await this.manufacturersRepository.existsByCode(dto.code)) {
      throw new ConflictException(`A manufacturer with code "${dto.code}" already exists`);
    }
    if (await this.manufacturersRepository.existsByName(dto.name)) {
      throw new ConflictException(`A manufacturer with name "${dto.name}" already exists`);
    }

    const categories: CategoryEntity[] = await this.resolveCategoryRefIds(
      dto.categoryRefIds ?? [],
    );

    const entity = await this.manufacturersRepository.create(
      {
        name: dto.name,
        code: dto.code,
        logo: this.storageUrlEnricher.persist(logo),
        description: dto.description ?? null,
        contactPerson: dto.contactPerson ?? null,
        email: dto.email ?? null,
        mobileNumber: dto.mobileNumber ?? null,
        address: dto.address ?? null,
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
    return this.enrichManufacturer(mapManufacturerEntityToResponse(loaded!));
  }

  async findAll(query: MasterListQueryDto): Promise<PaginatedResult<IManufacturer>> {
    const paginationOptions = buildMasterListOptions(query);
    const { data, total } =
      await this.manufacturersRepository.findAllPaginated(paginationOptions);
    const result = buildPaginatedResult(
      mapManufacturerEntitiesToResponse(data),
      total,
      paginationOptions,
    );
    return this.storageUrlEnricher.enrichPaginated(result, [...MANUFACTURER_MEDIA_FIELDS]);
  }

  async findOne(refId: string): Promise<IManufacturer> {
    const entity = await this.manufacturersRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException(`Manufacturer with refId ${refId} not found`);
    return this.enrichManufacturer(mapManufacturerEntityToResponse(entity));
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
    logo?: string | null,
  ): Promise<IManufacturer> {
    const existing = await this.manufacturersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Manufacturer with refId ${refId} not found`);

    if (dto.code && dto.code !== existing.code) {
      if (await this.manufacturersRepository.existsByCodeExcluding(dto.code, existing.id)) {
        throw new ConflictException(`A manufacturer with code "${dto.code}" already exists`);
      }
    }

    if (dto.name !== undefined && dto.name !== existing.name) {
      if (await this.manufacturersRepository.existsByName(dto.name, refId)) {
        throw new ConflictException(`A manufacturer with name "${dto.name}" already exists`);
      }
    }

    const payload: Partial<ManufacturerEntity> = { updatedBy };

    if (dto.name !== undefined) payload.name = dto.name;
    if (dto.code !== undefined) payload.code = dto.code;
    if (dto.description !== undefined) payload.description = dto.description;
    if (dto.contactPerson !== undefined) payload.contactPerson = dto.contactPerson;
    if (dto.email !== undefined) payload.email = dto.email;
    if (dto.mobileNumber !== undefined) payload.mobileNumber = dto.mobileNumber;
    if (dto.address !== undefined) payload.address = dto.address ?? null;
    if (dto.gstNumber !== undefined) payload.gstNumber = dto.gstNumber;
    if (dto.drugLicenseNumber !== undefined) payload.drugLicenseNumber = dto.drugLicenseNumber;
    if (dto.status !== undefined) payload.status = dto.status;
    if (logo !== undefined) payload.logo = this.storageUrlEnricher.persist(logo);

    let categories: CategoryEntity[] | undefined;
    if (dto.categoryRefIds !== undefined) {
      categories = await this.resolveCategoryRefIds(dto.categoryRefIds);
    }

    const result = await this.manufacturersRepository.updateByRefId(refId, payload, categories);
    if (!result)
      throw new NotFoundException(`Manufacturer with refId ${refId} not found after update`);
    return this.enrichManufacturer(mapManufacturerEntityToResponse(result));
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
    return this.enrichManufacturer(mapManufacturerEntityToResponse(updated));
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.manufacturersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Manufacturer with refId ${refId} not found`);
    await this.deletionGuard.assertManufacturerDeletable(existing.id, existing.name);
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

  private enrichManufacturer(manufacturer: IManufacturer): Promise<IManufacturer> {
    return this.storageUrlEnricher.enrichFields(manufacturer, [...MANUFACTURER_MEDIA_FIELDS]);
  }
}
