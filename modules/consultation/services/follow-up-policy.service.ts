import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DoctorsRepository } from '@modules/doctor/repositories/doctors.repository';
import { ConsultationFollowUpPolicyEntity } from '../entities/consultation-follow-up-policy.entity';
import { ConsultationEntity } from '../entities/consultation.entity';
import { ConsultationPricingType } from '../enums/consultation-pricing-type.enum';
import { FollowUpPricingMode } from '../enums/follow-up-pricing-mode.enum';
import { UpsertFollowUpPolicyDto } from '../dto/follow-up-policy.dto';

export type FollowUpPricingResolution = {
  pricingType: ConsultationPricingType;
  amount: number;
};

function createDefaultPolicy(): ConsultationFollowUpPolicyEntity {
  return {
    doctorId: null,
    isGlobal: true,
    followUpAllowed: true,
    pricingMode: FollowUpPricingMode.INHERIT_DOCTOR_FEE,
    freeWindowDays: 7,
    paidFeeAmount: null,
  } as ConsultationFollowUpPolicyEntity;
}

@Injectable()
export class FollowUpPolicyService {
  constructor(
    @InjectRepository(ConsultationFollowUpPolicyEntity)
    private readonly policyRepo: Repository<ConsultationFollowUpPolicyEntity>,
    private readonly doctorsRepository: DoctorsRepository,
  ) {}

  async getEffectivePolicy(doctorId: string): Promise<ConsultationFollowUpPolicyEntity> {
    const doctorPolicy = await this.policyRepo.findOne({
      where: { doctorId, isGlobal: false },
    });
    if (doctorPolicy) return doctorPolicy;

    const global = await this.policyRepo.findOne({ where: { isGlobal: true } });
    if (global) return global;

    return createDefaultPolicy();
  }

  async getPolicyForAdmin(doctorId?: string): Promise<ConsultationFollowUpPolicyEntity> {
    if (doctorId) {
      return this.getEffectivePolicy(doctorId);
    }
    const global = await this.policyRepo.findOne({ where: { isGlobal: true } });
    if (global) return global;
    return createDefaultPolicy();
  }

  async upsertGlobalPolicy(
    dto: UpsertFollowUpPolicyDto,
    actor: string,
  ): Promise<ConsultationFollowUpPolicyEntity> {
    return this.upsertPolicy(null, true, dto, actor);
  }

  async upsertDoctorPolicy(
    doctorId: string,
    dto: UpsertFollowUpPolicyDto,
    actor: string,
  ): Promise<ConsultationFollowUpPolicyEntity> {
    const doctor = await this.doctorsRepository.findById(doctorId);
    if (!doctor) throw new NotFoundException('Doctor not found');
    return this.upsertPolicy(doctorId, false, dto, actor);
  }

  async upsertDoctorPolicyByRefId(
    doctorRefId: string,
    dto: UpsertFollowUpPolicyDto,
    actor: string,
  ): Promise<ConsultationFollowUpPolicyEntity> {
    const doctor = await this.doctorsRepository.findByRefId(doctorRefId);
    if (!doctor) throw new NotFoundException('Doctor not found');
    return this.upsertDoctorPolicy(doctor.id, dto, actor);
  }

  resolveFollowUpPricing(
    sourceConsultation: ConsultationEntity,
    policy: ConsultationFollowUpPolicyEntity,
    eligibleUntil: Date | null,
  ): FollowUpPricingResolution {
    if (!policy.followUpAllowed) {
      throw new BadRequestException('Follow-up is not allowed for this doctor');
    }

    const withinFreeWindow =
      eligibleUntil != null && eligibleUntil.getTime() >= Date.now();

    switch (policy.pricingMode) {
      case FollowUpPricingMode.FREE:
        return { pricingType: ConsultationPricingType.FREE, amount: 0 };
      case FollowUpPricingMode.PAID:
        return {
          pricingType: ConsultationPricingType.PAID,
          amount: policy.paidFeeAmount ?? 0,
        };
      case FollowUpPricingMode.INHERIT_DOCTOR_FEE:
      default:
        if (withinFreeWindow && policy.freeWindowDays > 0) {
          return { pricingType: ConsultationPricingType.FREE, amount: 0 };
        }
        if (sourceConsultation.pricingType === ConsultationPricingType.FREE) {
          return { pricingType: ConsultationPricingType.FREE, amount: 0 };
        }
        return {
          pricingType: ConsultationPricingType.PAID,
          amount: sourceConsultation.amountCharged,
        };
    }
  }

  defaultEligibleUntil(policy: ConsultationFollowUpPolicyEntity): Date {
    const days = policy.freeWindowDays > 0 ? policy.freeWindowDays : 7;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private async upsertPolicy(
    doctorId: string | null,
    isGlobal: boolean,
    dto: UpsertFollowUpPolicyDto,
    actor: string,
  ): Promise<ConsultationFollowUpPolicyEntity> {
    if (dto.pricingMode === FollowUpPricingMode.PAID && (dto.paidFeeAmount ?? 0) <= 0) {
      throw new BadRequestException('Paid follow-up policy requires a positive paidFeeAmount');
    }

    let row: ConsultationFollowUpPolicyEntity | null;
    if (isGlobal) {
      row = await this.policyRepo.findOne({ where: { isGlobal: true } });
    } else {
      row = await this.policyRepo.findOne({
        where: { doctorId: doctorId!, isGlobal: false },
      });
    }

    if (!row) {
      row = this.policyRepo.create({
        doctorId,
        isGlobal,
        followUpAllowed: dto.followUpAllowed ?? true,
        pricingMode: dto.pricingMode ?? FollowUpPricingMode.INHERIT_DOCTOR_FEE,
        freeWindowDays: dto.freeWindowDays ?? 7,
        paidFeeAmount: dto.paidFeeAmount ?? null,
        createdBy: actor,
        updatedBy: actor,
      });
    } else {
      if (dto.followUpAllowed !== undefined) row.followUpAllowed = dto.followUpAllowed;
      if (dto.pricingMode !== undefined) row.pricingMode = dto.pricingMode;
      if (dto.freeWindowDays !== undefined) row.freeWindowDays = dto.freeWindowDays;
      if (dto.paidFeeAmount !== undefined) row.paidFeeAmount = dto.paidFeeAmount;
      row.updatedBy = actor;
    }

    return this.policyRepo.save(row);
  }
}
