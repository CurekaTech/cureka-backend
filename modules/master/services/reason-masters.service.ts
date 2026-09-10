import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { generateSlug } from '@packages/common/pagination.util';
import { DataSource } from 'typeorm';
import { ReasonMastersRepository } from '../repositories/reason-masters.repository';
import {
  CreateReasonMasterDto,
  ReasonMasterQueryDto,
  UpdateReasonMasterDto,
  UpdateReasonMasterStatusDto,
} from '../dto/reason-master.dto';
import { IReasonMaster } from '../interfaces/reason-master.interface';
import {
  mapReasonMasterEntitiesToResponse,
  mapReasonMasterEntityToResponse,
} from '../mappers/reason-master.mapper';
import { MasterStatus } from '../enums/master-status.enum';
import { ReasonPickupMode } from '../enums/reason-pickup-mode.enum';

const generateReasonCode = (title: string): string =>
  generateSlug(title).replace(/-/g, '_').toUpperCase();

const REASON_DEFAULT_MAX_IMAGES = 5;
const REASON_DEFAULT_MAX_VIDEOS = 1;

const assertMediaCountRange = (counts: {
  minImages: number;
  maxImages: number;
  minVideos: number;
  maxVideos: number;
}): void => {
  if (counts.minImages > counts.maxImages) {
    throw new BadRequestException('minImages cannot be greater than maxImages');
  }
  if (counts.minVideos > counts.maxVideos) {
    throw new BadRequestException('minVideos cannot be greater than maxVideos');
  }
};

@Injectable()
export class ReasonMastersService {
  constructor(
    private readonly reasonMastersRepository: ReasonMastersRepository,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateReasonMasterDto, createdBy: string): Promise<IReasonMaster> {
    if (!dto.workflows?.length) {
      throw new BadRequestException('At least one workflow must be selected');
    }

    const code = (dto.code?.trim() || generateReasonCode(dto.title)).toUpperCase();
    if (await this.reasonMastersRepository.existsByCode(code)) {
      throw new ConflictException(`A reason with code "${code}" already exists`);
    }

    const minImages = dto.minImages ?? 0;
    const maxImages = dto.maxImages ?? Math.max(REASON_DEFAULT_MAX_IMAGES, minImages);
    const minVideos = dto.minVideos ?? 0;
    const maxVideos = dto.maxVideos ?? Math.max(REASON_DEFAULT_MAX_VIDEOS, minVideos);
    assertMediaCountRange({ minImages, maxImages, minVideos, maxVideos });

    const entity = await this.reasonMastersRepository.create({
      title: dto.title.trim(),
      code,
      description: dto.description?.trim() ?? null,
      internalDescription: dto.internalDescription?.trim() ?? null,
      workflows: dto.workflows,
      categoryRefIds: dto.categoryRefIds ?? [],
      skuRefs: dto.skuRefs ?? [],
      pickupMode: dto.pickupMode ?? ReasonPickupMode.PICKUP_REQUIRED,
      isMandatory: dto.isMandatory ?? true,
      commentsRequired: dto.commentsRequired ?? false,
      imagesRequired: dto.imagesRequired ?? false,
      videoRequired: dto.videoRequired ?? false,
      qcRequired: dto.qcRequired ?? false,
      autoApprovalEligible: dto.autoApprovalEligible ?? false,
      minImages,
      maxImages,
      minVideos,
      maxVideos,
      isCustomerVisible: dto.isCustomerVisible ?? true,
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.title, (refId) =>
        this.reasonMastersRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    return mapReasonMasterEntityToResponse(entity);
  }

  async findAll(query: ReasonMasterQueryDto): Promise<PaginatedResult<IReasonMaster>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.reasonMastersRepository.findAllPaginated({
      ...paginationOptions,
      status: query.status,
      workflow: query.workflow,
      pickupMode: query.pickupMode,
    });

    return buildPaginatedResult(
      mapReasonMasterEntitiesToResponse(data),
      total,
      paginationOptions,
    );
  }

  async findOne(refId: string): Promise<IReasonMaster> {
    const entity = await this.reasonMastersRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Reason with refId ${refId} not found`);
    }
    return mapReasonMasterEntityToResponse(entity);
  }

  async update(
    refId: string,
    dto: UpdateReasonMasterDto,
    updatedBy: string,
  ): Promise<IReasonMaster> {
    const existing = await this.reasonMastersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Reason with refId ${refId} not found`);
    }

    if (dto.workflows && dto.workflows.length === 0) {
      throw new BadRequestException('At least one workflow must be selected');
    }

    let code = existing.code;
    if (dto.code?.trim()) {
      code = dto.code.trim().toUpperCase();
      if (
        code !== existing.code &&
        (await this.reasonMastersRepository.existsByCode(code, refId))
      ) {
        throw new ConflictException(`A reason with code "${code}" already exists`);
      }
    }

    const minImages = dto.minImages ?? existing.minImages;
    const maxImages = dto.maxImages ?? existing.maxImages;
    const minVideos = dto.minVideos ?? existing.minVideos;
    const maxVideos = dto.maxVideos ?? existing.maxVideos;
    assertMediaCountRange({ minImages, maxImages, minVideos, maxVideos });

    const updated = await this.reasonMastersRepository.updateByRefId(refId, {
      title: dto.title?.trim() ?? existing.title,
      code,
      description:
        dto.description !== undefined ? dto.description?.trim() ?? null : existing.description,
      internalDescription:
        dto.internalDescription !== undefined
          ? dto.internalDescription?.trim() ?? null
          : existing.internalDescription,
      workflows: dto.workflows ?? existing.workflows,
      categoryRefIds: dto.categoryRefIds ?? existing.categoryRefIds,
      skuRefs: dto.skuRefs ?? existing.skuRefs,
      pickupMode: dto.pickupMode ?? existing.pickupMode,
      isMandatory: dto.isMandatory ?? existing.isMandatory,
      commentsRequired: dto.commentsRequired ?? existing.commentsRequired,
      imagesRequired: dto.imagesRequired ?? existing.imagesRequired,
      videoRequired: dto.videoRequired ?? existing.videoRequired,
      qcRequired: dto.qcRequired ?? existing.qcRequired,
      autoApprovalEligible: dto.autoApprovalEligible ?? existing.autoApprovalEligible,
      minImages,
      maxImages,
      minVideos,
      maxVideos,
      isCustomerVisible: dto.isCustomerVisible ?? existing.isCustomerVisible,
      sortOrder: dto.sortOrder ?? existing.sortOrder,
      status: dto.status ?? existing.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Reason with refId ${refId} not found after update`);
    }

    return mapReasonMasterEntityToResponse(updated);
  }

  async updateStatus(
    refId: string,
    dto: UpdateReasonMasterStatusDto,
    updatedBy: string,
  ): Promise<IReasonMaster> {
    const existing = await this.reasonMastersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Reason with refId ${refId} not found`);
    }

    const updated = await this.reasonMastersRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Reason with refId ${refId} not found after status update`);
    }

    return mapReasonMasterEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.reasonMastersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Reason with refId ${refId} not found`);
    }

    if (await this.isReferencedByReturn(existing.id)) {
      throw new ConflictException(
        'This reason is already used by one or more return requests and cannot be deleted. Deactivate it instead.',
      );
    }

    await this.reasonMastersRepository.softDeleteByRefId(refId);
  }

  /**
   * Historical return records must keep resolving their reason, so a referenced
   * reason may only be deactivated. Queried directly instead of through the
   * returns module to keep MasterModule free of a circular import.
   */
  private async isReferencedByReturn(reasonId: string): Promise<boolean> {
    const tableExists = await this.dataSource.query<{ exists: boolean }[]>(
      `SELECT to_regclass('public.return_requests') IS NOT NULL AS exists`,
    );
    if (!tableExists[0]?.exists) {
      return false;
    }

    const rows = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM "return_requests" WHERE "reason_id" = $1`,
      [reasonId],
    );
    return Number(rows[0]?.count ?? 0) > 0;
  }
}
