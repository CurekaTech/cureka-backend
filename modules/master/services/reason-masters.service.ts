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

@Injectable()
export class ReasonMastersService {
  constructor(private readonly reasonMastersRepository: ReasonMastersRepository) {}

  async create(dto: CreateReasonMasterDto, createdBy: string): Promise<IReasonMaster> {
    if (!dto.workflows?.length) {
      throw new BadRequestException('At least one workflow must be selected');
    }

    const code = (dto.code?.trim() || generateReasonCode(dto.title)).toUpperCase();
    if (await this.reasonMastersRepository.existsByCode(code)) {
      throw new ConflictException(`A reason with code "${code}" already exists`);
    }

    const entity = await this.reasonMastersRepository.create({
      title: dto.title.trim(),
      code,
      description: dto.description?.trim() ?? null,
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

    const updated = await this.reasonMastersRepository.updateByRefId(refId, {
      title: dto.title?.trim() ?? existing.title,
      code,
      description:
        dto.description !== undefined ? dto.description?.trim() ?? null : existing.description,
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

    await this.reasonMastersRepository.softDeleteByRefId(refId);
  }
}
