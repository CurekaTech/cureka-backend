import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FastifyRequest } from 'fastify';
import {
  buildQueryCacheHash,
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
} from '@packages/cache';
import { EVENTS, ImporterUpdatedEvent } from '@packages/events';
import { ImportersRepository } from '../repositories/importers.repository';
import {
  CreateImporterDto,
  UpdateImporterDto,
  UpdateImporterStatusDto,
} from '../dto/importer.dto';
import { IImporter } from '../interfaces/importer.interface';
import {
  mapImporterEntityToResponse,
  mapImporterEntitiesToResponse,
} from '../mappers/importer.mapper';
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
import { ImporterEntity } from '../entities/importer.entity';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { MasterDeletionGuardService } from './master-deletion-guard.service';

const IMPORTER_MEDIA_FIELDS = ['logo'] as const;

const IMPORTER_UPLOAD_FIELDS = {
  logo: UploadFolder.LOGOS,
} as const;

@Injectable()
export class ImportersService {
  constructor(
    private readonly importersRepository: ImportersRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly eventEmitter: EventEmitter2,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly deletionGuard: MasterDeletionGuardService,
  ) {}

  async createFromRequest(req: FastifyRequest, createdBy: string): Promise<IImporter> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateImporterDto,
      IMPORTER_UPLOAD_FIELDS,
    );
    return this.create(dto, uploadedUrls['logo'] ?? null, createdBy);
  }

  async create(
    dto: CreateImporterDto,
    logo: string | null,
    createdBy: string,
  ): Promise<IImporter> {
    if (await this.importersRepository.existsByCode(dto.code)) {
      throw new ConflictException(`An importer with code "${dto.code}" already exists`);
    }

    const entity = await this.importersRepository.create({
      name: dto.name,
      code: dto.code,
      iec: dto.iec ?? null,
      logo: this.storageUrlEnricher.persist(logo),
      contactPerson: dto.contactPerson ?? null,
      email: dto.email ?? null,
      mobileNumber: dto.mobileNumber ?? null,
      address: dto.address ?? null,
      gstNumber: dto.gstNumber ?? null,
      drugLicenseNumber: dto.drugLicenseNumber ?? null,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.importersRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    const loaded = await this.importersRepository.findByRefId(entity.refId);
    await this.emitImporterUpdated(entity.refId, 'created');
    return this.enrichImporter(mapImporterEntityToResponse(loaded!));
  }

  async findAll(query: MasterListQueryDto): Promise<PaginatedResult<IImporter>> {
    const queryHash = buildQueryCacheHash({
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      search: query.search ?? '',
      sortBy: query.sortBy ?? '',
      sortOrder: query.sortOrder ?? '',
      status: query.status ?? 'all',
    });

    return this.cacheStrategy
      .cacheAside({
        key: CacheKeys.importers.list(queryHash),
        module: CacheModuleName.IMPORTER,
        loader: async () => {
          const paginationOptions = buildMasterListOptions(query);
          const { data, total } =
            await this.importersRepository.findAllPaginated(paginationOptions);
          return buildPaginatedResult(mapImporterEntitiesToResponse(data), total, paginationOptions);
        },
      })
      .then((result) => this.storageUrlEnricher.enrichPaginated(result, [...IMPORTER_MEDIA_FIELDS]));
  }

  async findOne(refId: string): Promise<IImporter> {
    const entity = await this.importersRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException(`Importer with refId ${refId} not found`);
    return this.enrichImporter(mapImporterEntityToResponse(entity));
  }

  async updateFromRequest(
    refId: string,
    req: FastifyRequest,
    updatedBy: string,
  ): Promise<IImporter> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateImporterDto,
      IMPORTER_UPLOAD_FIELDS,
    );
    return this.update(refId, dto, updatedBy, uploadedUrls['logo']);
  }

  async update(
    refId: string,
    dto: UpdateImporterDto,
    updatedBy: string,
    logo?: string,
  ): Promise<IImporter> {
    const existing = await this.importersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Importer with refId ${refId} not found`);

    if (dto.code && dto.code !== existing.code) {
      if (await this.importersRepository.existsByCodeExcluding(dto.code, existing.id)) {
        throw new ConflictException(`An importer with code "${dto.code}" already exists`);
      }
    }

    const payload: Partial<ImporterEntity> = { updatedBy };

    if (dto.name !== undefined) payload.name = dto.name;
    if (dto.code !== undefined) payload.code = dto.code;
    if (dto.iec !== undefined) payload.iec = dto.iec ?? null;
    if (dto.contactPerson !== undefined) payload.contactPerson = dto.contactPerson;
    if (dto.email !== undefined) payload.email = dto.email;
    if (dto.mobileNumber !== undefined) payload.mobileNumber = dto.mobileNumber;
    if (dto.address !== undefined) payload.address = dto.address ?? null;
    if (dto.gstNumber !== undefined) payload.gstNumber = dto.gstNumber;
    if (dto.drugLicenseNumber !== undefined) payload.drugLicenseNumber = dto.drugLicenseNumber;
    if (dto.status !== undefined) payload.status = dto.status;
    if (logo !== undefined) payload.logo = this.storageUrlEnricher.persist(logo);

    const result = await this.importersRepository.updateByRefId(refId, payload);
    if (!result) throw new NotFoundException(`Importer with refId ${refId} not found after update`);
    await this.emitImporterUpdated(refId, 'updated');
    return this.enrichImporter(mapImporterEntityToResponse(result));
  }

  async updateStatus(
    refId: string,
    dto: UpdateImporterStatusDto,
    updatedBy: string,
  ): Promise<IImporter> {
    const existing = await this.importersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Importer with refId ${refId} not found`);

    const updated = await this.importersRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });
    if (!updated) {
      throw new NotFoundException(`Importer with refId ${refId} not found after status update`);
    }
    await this.emitImporterUpdated(refId, 'status_updated');
    return this.enrichImporter(mapImporterEntityToResponse(updated));
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.importersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Importer with refId ${refId} not found`);
    await this.deletionGuard.assertImporterDeletable(existing.id, existing.name);
    await this.importersRepository.softDeleteByRefId(refId);
    await this.emitImporterUpdated(refId, 'deleted');
  }

  private async emitImporterUpdated(
    refId: string,
    action: 'created' | 'updated' | 'deleted' | 'status_updated',
  ): Promise<void> {
    await this.eventEmitter.emitAsync(
      EVENTS.IMPORTER_UPDATED,
      new ImporterUpdatedEvent(refId, action),
    );
  }

  private enrichImporter(importer: IImporter): Promise<IImporter> {
    return this.storageUrlEnricher.enrichFields(importer, [...IMPORTER_MEDIA_FIELDS]);
  }
}
