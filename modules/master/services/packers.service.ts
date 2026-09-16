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
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { MasterListQueryDto } from '../dto/master-list-query.dto';
import { buildMasterListOptions } from '../utils/master-list-query.util';
import { MasterStatus } from '../enums/master-status.enum';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { PackerEntity } from '../entities/packer.entity';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { MasterDeletionGuardService } from './master-deletion-guard.service';

const PACKER_MEDIA_FIELDS = ['logo'] as const;

const PACKER_UPLOAD_FIELDS = {
  logo: UploadFolder.LOGOS,
} as const;

@Injectable()
export class PackersService {
  constructor(
    private readonly packersRepository: PackersRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly eventEmitter: EventEmitter2,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly deletionGuard: MasterDeletionGuardService,
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
    if (await this.packersRepository.existsByName(dto.name)) {
      throw new ConflictException(`A packer with name "${dto.name}" already exists`);
    }
    if (await this.packersRepository.existsByCode(dto.code)) {
      throw new ConflictException(`A packer with code "${dto.code}" already exists`);
    }

    const entity = await this.packersRepository.create({
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
      remarks: dto.remarks ?? null,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.packersRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    const loaded = await this.packersRepository.findByRefId(entity.refId);
    await this.emitPackerUpdated(entity.refId, 'created');
    return this.enrichPacker(mapPackerEntityToResponse(loaded!));
  }

  async findAll(query: MasterListQueryDto): Promise<PaginatedResult<IPacker>> {
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
        key: CacheKeys.packers.list(queryHash),
        module: CacheModuleName.PACKER,
        loader: async () => {
          const paginationOptions = buildMasterListOptions(query);
          const { data, total } =
            await this.packersRepository.findAllPaginated(paginationOptions);
          return buildPaginatedResult(mapPackerEntitiesToResponse(data), total, paginationOptions);
        },
      })
      .then((result) => this.storageUrlEnricher.enrichPaginated(result, [...PACKER_MEDIA_FIELDS]));
  }

  async findOne(refId: string): Promise<IPacker> {
    const entity = await this.packersRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException(`Packer with refId ${refId} not found`);
    return this.enrichPacker(mapPackerEntityToResponse(entity));
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
    logo?: string | null,
  ): Promise<IPacker> {
    const existing = await this.packersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Packer with refId ${refId} not found`);

    if (
      dto.name !== undefined &&
      (await this.packersRepository.existsByName(dto.name, refId))
    ) {
      throw new ConflictException(`A packer with name "${dto.name}" already exists`);
    }

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
    if (dto.address !== undefined) payload.address = dto.address ?? null;
    if (dto.gstNumber !== undefined) payload.gstNumber = dto.gstNumber;
    if (dto.drugLicenseNumber !== undefined) payload.drugLicenseNumber = dto.drugLicenseNumber;
    if (dto.status !== undefined) payload.status = dto.status;
    if (dto.remarks !== undefined) payload.remarks = dto.remarks ?? null;
    if (logo !== undefined) payload.logo = this.storageUrlEnricher.persist(logo);

    const result = await this.packersRepository.updateByRefId(refId, payload);
    if (!result) throw new NotFoundException(`Packer with refId ${refId} not found after update`);
    await this.emitPackerUpdated(refId, 'updated');
    return this.enrichPacker(mapPackerEntityToResponse(result));
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
    return this.enrichPacker(mapPackerEntityToResponse(updated));
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.packersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Packer with refId ${refId} not found`);
    await this.deletionGuard.assertPackerDeletable(existing.id, existing.name);
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

  private enrichPacker(packer: IPacker): Promise<IPacker> {
    return this.storageUrlEnricher.enrichFields(packer, [...PACKER_MEDIA_FIELDS]);
  }
}
