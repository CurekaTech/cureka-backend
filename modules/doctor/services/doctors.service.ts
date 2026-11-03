import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  hashPassword,
  PaginatedResult,
} from '@packages/common';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import {
  CreateDoctorDto,
  DoctorListQueryDto,
  RejectDoctorDto,
  UpdateDoctorActiveStatusDto,
  UpdateDoctorDto,
} from '../dto/admin-doctor.dto';
import { DoctorBankDetailsEntity } from '../entities/doctor-bank-details.entity';
import { DoctorClinicAssociationEntity } from '../entities/doctor-clinic-association.entity';
import { DoctorConsultationConfigEntity } from '../entities/doctor-consultation-config.entity';
import { DoctorLanguageMapEntity } from '../entities/doctor-language-map.entity';
import { DoctorQualificationMapEntity } from '../entities/doctor-qualification-map.entity';
import { DoctorSpecializationMapEntity } from '../entities/doctor-specialization-map.entity';
import { DoctorEntity } from '../entities/doctor.entity';
import { DoctorPricingType } from '../enums/doctor-pricing-type.enum';
import { DoctorStatus } from '../enums/doctor-status.enum';
import { IDoctorResponse, mapDoctorEntityToResponse } from '../mappers/doctor.mapper';
import { LanguagesRepository } from '../repositories/languages.repository';
import { QualificationsRepository } from '../repositories/qualifications.repository';
import { SpecializationsRepository } from '../repositories/specializations.repository';
import { DoctorsRepository } from '../repositories/doctors.repository';
import { DoctorAuthService } from './doctor-auth.service';
import {
  encryptBankAccountNumber,
  maskAccountLast4,
} from '../utils/bank-crypto.util';
import { toSlug } from '../utils/slug.util';

@Injectable()
export class DoctorsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly doctorsRepository: DoctorsRepository,
    private readonly qualificationsRepository: QualificationsRepository,
    private readonly specializationsRepository: SpecializationsRepository,
    private readonly languagesRepository: LanguagesRepository,
    private readonly doctorAuthService: DoctorAuthService,
  ) {}

  async create(dto: CreateDoctorDto, actor: string): Promise<IDoctorResponse> {
    const email = dto.email.trim().toLowerCase();
    if (await this.doctorsRepository.existsByEmail(email)) {
      throw new ConflictException('A doctor with this email already exists');
    }

    if (dto.pricingType === DoctorPricingType.PAID && (dto.amount ?? 0) <= 0) {
      throw new BadRequestException('Paid consultations require a positive amount');
    }

    const qualificationIds = await this.resolveQualificationIds(dto.qualificationRefIds);
    const specializationIds = await this.resolveSpecializationIds(dto.specializationRefIds);
    const languageIds = await this.resolveLanguageIds(dto.languageRefIds);

    const slug = await this.allocateUniqueSlug(dto.fullName);
    const passwordHash = await hashPassword(dto.password);

    const doctorId = await this.dataSource.transaction(async (manager) => {
      const refId = await generateUniqueRefId('doc', (id) =>
        this.doctorsRepository.existsByRefId(id, manager),
      );

      const doctorRepo = manager.getRepository(DoctorEntity);
      const doctor = await doctorRepo.save(
        doctorRepo.create({
          refId,
          category: dto.category,
          fullName: dto.fullName.trim(),
          email,
          passwordHash,
          mustChangePassword: true,
          phone: dto.phone?.trim() ?? null,
          registrationNumber: dto.registrationNumber?.trim() ?? null,
          yearsExperience: dto.yearsExperience ?? 0,
          bio: dto.bio ?? null,
          status: DoctorStatus.DRAFT,
          isActive: false,
          isBookable: false,
          slug,
          createdBy: actor,
          updatedBy: actor,
        }),
      );

      await this.syncMaps(manager, doctor.id, qualificationIds, specializationIds, languageIds);
      await this.syncClinics(manager, doctor.id, dto.clinics, actor);
      await this.upsertConsultationConfig(manager, doctor.id, dto, actor);
      await this.upsertBankDetails(manager, doctor.id, dto, actor);

      return doctor.id;
    });

    const entity = await this.doctorsRepository.findById(doctorId);
    return mapDoctorEntityToResponse(entity!);
  }

  async update(refId: string, dto: UpdateDoctorDto, actor: string): Promise<IDoctorResponse> {
    const existing = await this.doctorsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Doctor not found');

    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      if (await this.doctorsRepository.existsByEmail(email, existing.id)) {
        throw new ConflictException('Email already in use');
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const doctorRepo = manager.getRepository(DoctorEntity);
      const patch: Partial<DoctorEntity> = { updatedBy: actor };
      if (dto.fullName) patch.fullName = dto.fullName.trim();
      if (dto.email) patch.email = dto.email.trim().toLowerCase();
      if (dto.category) patch.category = dto.category;
      if (dto.phone !== undefined) patch.phone = dto.phone?.trim() ?? null;
      if (dto.registrationNumber !== undefined) {
        patch.registrationNumber = dto.registrationNumber?.trim() ?? null;
      }
      if (dto.yearsExperience !== undefined) patch.yearsExperience = dto.yearsExperience;
      if (dto.bio !== undefined) patch.bio = dto.bio ?? null;
      if (dto.password) {
        patch.passwordHash = await hashPassword(dto.password);
        patch.mustChangePassword = true;
      }

      await doctorRepo.update({ id: existing.id }, patch);

      if (dto.qualificationRefIds) {
        const ids = await this.resolveQualificationIds(dto.qualificationRefIds);
        await this.replaceMaps(
          manager,
          DoctorQualificationMapEntity,
          existing.id,
          'qualificationId',
          ids,
        );
      }
      if (dto.specializationRefIds) {
        const ids = await this.resolveSpecializationIds(dto.specializationRefIds);
        await this.replaceMaps(
          manager,
          DoctorSpecializationMapEntity,
          existing.id,
          'specializationId',
          ids,
        );
      }
      if (dto.languageRefIds) {
        const ids = await this.resolveLanguageIds(dto.languageRefIds);
        await this.replaceMaps(manager, DoctorLanguageMapEntity, existing.id, 'languageId', ids);
      }
      if (dto.clinics) {
        await manager.getRepository(DoctorClinicAssociationEntity).delete({ doctorId: existing.id });
        await this.syncClinics(manager, existing.id, dto.clinics, actor);
      }
      if (dto.pricingType || dto.amount !== undefined) {
        await this.upsertConsultationConfig(manager, existing.id, dto as CreateDoctorDto, actor);
      }
      if (dto.bankDetails) {
        await this.upsertBankDetails(manager, existing.id, dto as CreateDoctorDto, actor);
      }
    });

    const updated = await this.doctorsRepository.findByRefId(refId);
    return mapDoctorEntityToResponse(updated!);
  }

  async findAll(query: DoctorListQueryDto): Promise<PaginatedResult<IDoctorResponse>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.doctorsRepository.findAllPaginated({
      page: pagination.page,
      limit: pagination.limit,
      search: query.search,
      status: query.status,
      category: query.category,
      isBookable: query.isBookable,
      isActive: query.isActive,
    });
    return buildPaginatedResult(data.map(mapDoctorEntityToResponse), total, pagination);
  }

  async findOne(refId: string): Promise<IDoctorResponse> {
    const entity = await this.doctorsRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException('Doctor not found');
    return mapDoctorEntityToResponse(entity);
  }

  async findPublicProfile(slug: string): Promise<IDoctorResponse> {
    const entity = await this.doctorsRepository.findBySlug(slug);
    if (!entity || !entity.isBookable) throw new NotFoundException('Doctor not found');
    return mapDoctorEntityToResponse(entity);
  }

  async approve(refId: string, actor: string): Promise<IDoctorResponse> {
    const entity = await this.doctorsRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException('Doctor not found');
    if (entity.status === DoctorStatus.REJECTED) {
      throw new BadRequestException('Rejected doctors must be updated before approval');
    }

    await this.doctorsRepository.updateByRefId(refId, {
      status: DoctorStatus.APPROVED,
      rejectionReason: null,
      isActive: true,
      isBookable: true,
      updatedBy: actor,
    });

    return this.findOne(refId);
  }

  async reject(refId: string, dto: RejectDoctorDto, actor: string): Promise<IDoctorResponse> {
    const entity = await this.doctorsRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException('Doctor not found');

    await this.doctorsRepository.updateByRefId(refId, {
      status: DoctorStatus.REJECTED,
      rejectionReason: dto.rejectionReason.trim(),
      isBookable: false,
      updatedBy: actor,
    });

    return this.findOne(refId);
  }

  async setActiveStatus(
    refId: string,
    dto: UpdateDoctorActiveStatusDto,
    actor: string,
  ): Promise<IDoctorResponse> {
    const entity = await this.doctorsRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException('Doctor not found');

    const isBookable = dto.isActive && entity.status === DoctorStatus.APPROVED;

    await this.doctorsRepository.updateByRefId(refId, {
      isActive: dto.isActive,
      isBookable,
      updatedBy: actor,
    });

    if (!dto.isActive) {
      await this.doctorAuthService.revokeAllSessions(entity.id);
    }

    return this.findOne(refId);
  }

  private async allocateUniqueSlug(fullName: string): Promise<string> {
    const base = toSlug(fullName);
    let candidate = base;
    let suffix = 1;
    while (await this.doctorsRepository.existsBySlug(candidate)) {
      candidate = `${base}-${suffix++}`;
    }
    return candidate;
  }

  private async resolveQualificationIds(refIds: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const refId of refIds) {
      const row = await this.qualificationsRepository.findByRefId(refId);
      if (!row || row.status !== MasterStatus.ACTIVE) {
        throw new BadRequestException(`Invalid qualification: ${refId}`);
      }
      ids.push(row.id);
    }
    return ids;
  }

  private async resolveSpecializationIds(refIds: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const refId of refIds) {
      const row = await this.specializationsRepository.findByRefId(refId);
      if (!row || row.status !== MasterStatus.ACTIVE) {
        throw new BadRequestException(`Invalid specialization: ${refId}`);
      }
      ids.push(row.id);
    }
    return ids;
  }

  private async resolveLanguageIds(refIds: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const refId of refIds) {
      const row = await this.languagesRepository.findByRefId(refId);
      if (!row || row.status !== MasterStatus.ACTIVE) {
        throw new BadRequestException(`Invalid language: ${refId}`);
      }
      ids.push(row.id);
    }
    return ids;
  }

  private async syncMaps(
    manager: EntityManager,
    doctorId: string,
    qualificationIds: string[],
    specializationIds: string[],
    languageIds: string[],
  ): Promise<void> {
    const qualRepo = manager.getRepository(DoctorQualificationMapEntity);
    for (const qualificationId of qualificationIds) {
      await qualRepo.save(qualRepo.create({ doctorId, qualificationId }));
    }
    const specRepo = manager.getRepository(DoctorSpecializationMapEntity);
    for (const specializationId of specializationIds) {
      await specRepo.save(specRepo.create({ doctorId, specializationId }));
    }
    const langRepo = manager.getRepository(DoctorLanguageMapEntity);
    for (const languageId of languageIds) {
      await langRepo.save(langRepo.create({ doctorId, languageId }));
    }
  }

  private async replaceMaps(
    manager: EntityManager,
    entityClass:
      | typeof DoctorQualificationMapEntity
      | typeof DoctorSpecializationMapEntity
      | typeof DoctorLanguageMapEntity,
    doctorId: string,
    foreignKey: 'qualificationId' | 'specializationId' | 'languageId',
    ids: string[],
  ): Promise<void> {
    const repo = manager.getRepository(entityClass);
    await repo.delete({ doctorId });
    for (const fkId of ids) {
      await repo.save(repo.create({ doctorId, [foreignKey]: fkId }));
    }
  }

  private async syncClinics(
    manager: EntityManager,
    doctorId: string,
    clinics: CreateDoctorDto['clinics'],
    actor: string,
  ): Promise<void> {
    const repo = manager.getRepository(DoctorClinicAssociationEntity);
    let hasPrimary = clinics.some((c) => c.isPrimary);
    for (const [index, clinic] of clinics.entries()) {
      await repo.save(
        repo.create({
          doctorId,
          name: clinic.name.trim(),
          addressLine1: clinic.addressLine1.trim(),
          addressLine2: clinic.addressLine2?.trim() ?? null,
          city: clinic.city.trim(),
          state: clinic.state.trim(),
          pincode: clinic.pincode.trim(),
          latitude: clinic.latitude ?? null,
          longitude: clinic.longitude ?? null,
          isPrimary: clinic.isPrimary ?? (!hasPrimary && index === 0),
          createdBy: actor,
          updatedBy: actor,
        }),
      );
    }
  }

  private async upsertConsultationConfig(
    manager: EntityManager,
    doctorId: string,
    dto: Pick<CreateDoctorDto, 'pricingType' | 'amount'>,
    actor: string,
  ): Promise<void> {
    const repo = manager.getRepository(DoctorConsultationConfigEntity);
    let row = await repo.findOne({ where: { doctorId } });
    const amount =
      dto.pricingType === DoctorPricingType.FREE ? null : (dto.amount ?? row?.amount ?? 0);
    if (!row) {
      await repo.save(
        repo.create({
          doctorId,
          pricingType: dto.pricingType,
          amount,
          createdBy: actor,
          updatedBy: actor,
        }),
      );
      return;
    }
    row.pricingType = dto.pricingType ?? row.pricingType;
    row.amount = amount;
    row.updatedBy = actor;
    await repo.save(row);
  }

  private async upsertBankDetails(
    manager: EntityManager,
    doctorId: string,
    dto: Pick<CreateDoctorDto, 'bankDetails'>,
    actor: string,
  ): Promise<void> {
    if (!dto.bankDetails) return;
    const repo = manager.getRepository(DoctorBankDetailsEntity);
    const encrypted = encryptBankAccountNumber(dto.bankDetails.accountNumber.trim());
    const last4 = maskAccountLast4(dto.bankDetails.accountNumber.trim());
    let row = await repo.findOne({ where: { doctorId } });
    if (!row) {
      await repo.save(
        repo.create({
          doctorId,
          accountHolderName: dto.bankDetails.accountHolderName.trim(),
          accountNumberEncrypted: encrypted,
          accountLast4: last4,
          ifscCode: dto.bankDetails.ifscCode.trim().toUpperCase(),
          bankName: dto.bankDetails.bankName?.trim() ?? null,
          createdBy: actor,
          updatedBy: actor,
        }),
      );
      return;
    }
    row.accountHolderName = dto.bankDetails.accountHolderName.trim();
    row.accountNumberEncrypted = encrypted;
    row.accountLast4 = last4;
    row.ifscCode = dto.bankDetails.ifscCode.trim().toUpperCase();
    row.bankName = dto.bankDetails.bankName?.trim() ?? null;
    row.updatedBy = actor;
    await repo.save(row);
  }
}
