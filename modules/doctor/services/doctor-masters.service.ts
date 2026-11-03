import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { buildPaginatedResult, generateUniqueRefId, PaginatedResult } from '@packages/common';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import {
  CreateLanguageDto,
  CreateQualificationDto,
  CreateSpecializationDto,
  DoctorMasterListQueryDto,
  UpdateDoctorMasterStatusDto,
  UpdateLanguageDto,
  UpdateQualificationDto,
  UpdateSpecializationDto,
} from '../dto/doctor-master.dto';
import { LanguagesRepository } from '../repositories/languages.repository';
import { QualificationsRepository } from '../repositories/qualifications.repository';
import { SpecializationsRepository } from '../repositories/specializations.repository';
import { toSlug } from '../utils/slug.util';

const mapMaster = <T extends { id: string; refId: string; name: string; status: MasterStatus }>(
  entity: T & {
    slug?: string;
    code?: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy?: string;
    updatedBy?: string;
    deletedAt?: Date;
  },
) => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  code: entity.code,
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

@Injectable()
export class DoctorMastersService {
  constructor(
    private readonly specializationsRepository: SpecializationsRepository,
    private readonly languagesRepository: LanguagesRepository,
    private readonly qualificationsRepository: QualificationsRepository,
  ) {}

  // ── Specializations ────────────────────────────────────────────────────────

  async createSpecialization(dto: CreateSpecializationDto, createdBy: string) {
    if (await this.specializationsRepository.existsByName(dto.name)) {
      throw new ConflictException(`Specialization "${dto.name}" already exists`);
    }
    const slug = toSlug(dto.slug || dto.name);
    if (await this.specializationsRepository.existsBySlug(slug)) {
      throw new ConflictException(`Specialization slug "${slug}" already exists`);
    }
    const entity = await this.specializationsRepository.create({
      name: dto.name,
      slug,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.specializationsRepository.existsByRefId(refId),
      ),
      createdBy,
    });
    return mapMaster(entity);
  }

  async listSpecializations(query: DoctorMasterListQueryDto): Promise<PaginatedResult<unknown>> {
    const { data, total } = await this.specializationsRepository.findAllPaginated({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status as MasterStatus | undefined,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return buildPaginatedResult(data.map(mapMaster), total, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sortOrder: query.sortOrder ?? 'DESC',
    });
  }

  async getSpecialization(refId: string) {
    const entity = await this.specializationsRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException('Specialization not found');
    return mapMaster(entity);
  }

  async updateSpecialization(refId: string, dto: UpdateSpecializationDto, updatedBy: string) {
    const existing = await this.specializationsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Specialization not found');
    if (dto.name && (await this.specializationsRepository.existsByName(dto.name, refId))) {
      throw new ConflictException(`Specialization "${dto.name}" already exists`);
    }
    const slug = dto.slug ? toSlug(dto.slug) : dto.name ? toSlug(dto.name) : undefined;
    if (slug && (await this.specializationsRepository.existsBySlug(slug, refId))) {
      throw new ConflictException(`Specialization slug "${slug}" already exists`);
    }
    const updated = await this.specializationsRepository.updateByRefId(refId, {
      ...dto,
      ...(slug ? { slug } : {}),
      updatedBy,
    });
    return mapMaster(updated!);
  }

  async updateSpecializationStatus(
    refId: string,
    dto: UpdateDoctorMasterStatusDto,
    updatedBy: string,
  ) {
    const existing = await this.specializationsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Specialization not found');
    const updated = await this.specializationsRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });
    return mapMaster(updated!);
  }

  async removeSpecialization(refId: string) {
    const existing = await this.specializationsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Specialization not found');
    await this.specializationsRepository.softDeleteByRefId(refId);
  }

  // ── Languages ──────────────────────────────────────────────────────────────

  async createLanguage(dto: CreateLanguageDto, createdBy: string) {
    if (await this.languagesRepository.existsByCode(dto.code)) {
      throw new ConflictException(`Language code "${dto.code}" already exists`);
    }
    const entity = await this.languagesRepository.create({
      name: dto.name,
      code: dto.code.toLowerCase(),
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.languagesRepository.existsByRefId(refId),
      ),
      createdBy,
    });
    return mapMaster(entity);
  }

  async listLanguages(query: DoctorMasterListQueryDto) {
    const { data, total } = await this.languagesRepository.findAllPaginated({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status as MasterStatus | undefined,
      sortOrder: query.sortOrder,
    });
    return buildPaginatedResult(data.map(mapMaster), total, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sortOrder: query.sortOrder ?? 'DESC',
    });
  }

  async getLanguage(refId: string) {
    const entity = await this.languagesRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException('Language not found');
    return mapMaster(entity);
  }

  async updateLanguage(refId: string, dto: UpdateLanguageDto, updatedBy: string) {
    const existing = await this.languagesRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Language not found');
    if (dto.code && (await this.languagesRepository.existsByCode(dto.code, refId))) {
      throw new ConflictException(`Language code "${dto.code}" already exists`);
    }
    const updated = await this.languagesRepository.updateByRefId(refId, {
      ...dto,
      ...(dto.code ? { code: dto.code.toLowerCase() } : {}),
      updatedBy,
    });
    return mapMaster(updated!);
  }

  async updateLanguageStatus(refId: string, dto: UpdateDoctorMasterStatusDto, updatedBy: string) {
    const existing = await this.languagesRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Language not found');
    const updated = await this.languagesRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });
    return mapMaster(updated!);
  }

  async removeLanguage(refId: string) {
    const existing = await this.languagesRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Language not found');
    await this.languagesRepository.softDeleteByRefId(refId);
  }

  // ── Qualifications ─────────────────────────────────────────────────────────

  async createQualification(dto: CreateQualificationDto, createdBy: string) {
    if (await this.qualificationsRepository.existsByName(dto.name)) {
      throw new ConflictException(`Qualification "${dto.name}" already exists`);
    }
    const entity = await this.qualificationsRepository.create({
      name: dto.name,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.qualificationsRepository.existsByRefId(refId),
      ),
      createdBy,
    });
    return mapMaster(entity);
  }

  async listQualifications(query: DoctorMasterListQueryDto) {
    const { data, total } = await this.qualificationsRepository.findAllPaginated({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status as MasterStatus | undefined,
      sortOrder: query.sortOrder,
    });
    return buildPaginatedResult(data.map(mapMaster), total, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sortOrder: query.sortOrder ?? 'DESC',
    });
  }

  async getQualification(refId: string) {
    const entity = await this.qualificationsRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException('Qualification not found');
    return mapMaster(entity);
  }

  async updateQualification(refId: string, dto: UpdateQualificationDto, updatedBy: string) {
    const existing = await this.qualificationsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Qualification not found');
    if (dto.name && (await this.qualificationsRepository.existsByName(dto.name, refId))) {
      throw new ConflictException(`Qualification "${dto.name}" already exists`);
    }
    const updated = await this.qualificationsRepository.updateByRefId(refId, {
      ...dto,
      updatedBy,
    });
    return mapMaster(updated!);
  }

  async updateQualificationStatus(
    refId: string,
    dto: UpdateDoctorMasterStatusDto,
    updatedBy: string,
  ) {
    const existing = await this.qualificationsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Qualification not found');
    const updated = await this.qualificationsRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });
    return mapMaster(updated!);
  }

  async removeQualification(refId: string) {
    const existing = await this.qualificationsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Qualification not found');
    await this.qualificationsRepository.softDeleteByRefId(refId);
  }
}
