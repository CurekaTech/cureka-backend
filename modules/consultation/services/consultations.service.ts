import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { DoctorSlotsService } from '@modules/doctor/services/doctor-slots.service';
import { DoctorsRepository } from '@modules/doctor/repositories/doctors.repository';
import { DoctorPricingType } from '@modules/doctor/enums/doctor-pricing-type.enum';
import {
  BookFollowUpDto,
  CancelConsultationDto,
  CompleteConsultationDto,
  ConsultationListQueryDto,
  CreateBookingPricingOverride,
  CreateConsultationBookingDto,
  RecommendFollowUpDto,
  RescheduleConsultationDto,
  UpdateConsultationAttendanceDto,
  UpsertPrescriptionDto,
} from '../dto/consultation.dto';
import { ConsultationDocumentEntity } from '../entities/consultation-document.entity';
import { ConsultationFollowUpRecommendationEntity } from '../entities/consultation-follow-up-recommendation.entity';
import { ConsultationPaymentEntity } from '../entities/consultation-payment.entity';
import { ConsultationStatusHistoryEntity } from '../entities/consultation-status-history.entity';
import { ConsultationEntity } from '../entities/consultation.entity';
import { PrescriptionItemEntity } from '../entities/prescription-item.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import { ConsultationPaymentStatus } from '../enums/consultation-payment-status.enum';
import { ConsultationPricingType } from '../enums/consultation-pricing-type.enum';
import { ConsultationStatus } from '../enums/consultation-status.enum';
import { FollowUpRecommendationStatus } from '../enums/follow-up-recommendation-status.enum';
import { ConsultationsRepository } from '../repositories/consultations.repository';
import { ConsultationNotificationsService } from './consultation-notifications.service';
import { FollowUpPolicyService } from './follow-up-policy.service';

type BookingActor = { type: 'CUSTOMER' | 'DOCTOR' | 'ADMIN'; id: string };

@Injectable()
export class ConsultationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly consultationsRepository: ConsultationsRepository,
    private readonly doctorsRepository: DoctorsRepository,
    private readonly doctorSlotsService: DoctorSlotsService,
    private readonly followUpPolicyService: FollowUpPolicyService,
    private readonly notifications: ConsultationNotificationsService,
    @InjectRepository(ConsultationStatusHistoryEntity)
    private readonly statusHistoryRepo: Repository<ConsultationStatusHistoryEntity>,
    @InjectRepository(ConsultationPaymentEntity)
    private readonly paymentRepo: Repository<ConsultationPaymentEntity>,
    @InjectRepository(ConsultationFollowUpRecommendationEntity)
    private readonly followUpRepo: Repository<ConsultationFollowUpRecommendationEntity>,
    @InjectRepository(PrescriptionEntity)
    private readonly prescriptionRepo: Repository<PrescriptionEntity>,
    @InjectRepository(ConsultationDocumentEntity)
    private readonly documentRepo: Repository<ConsultationDocumentEntity>,
  ) {}

  async createBooking(
    customerId: string,
    dto: CreateConsultationBookingDto,
    pricingOverride?: CreateBookingPricingOverride,
  ): Promise<ConsultationEntity> {
    const doctor = await this.doctorsRepository.findById(dto.doctorId);
    if (!doctor?.isBookable) {
      throw new BadRequestException('Doctor is not available for booking');
    }

    const pricingType =
      pricingOverride?.pricingType ??
      (doctor.consultationConfig?.pricingType === DoctorPricingType.FREE
        ? ConsultationPricingType.FREE
        : ConsultationPricingType.PAID);
    const amount =
      pricingOverride?.amount ??
      (pricingType === ConsultationPricingType.PAID
        ? (doctor.consultationConfig?.amount ?? 0)
        : 0);

    const refId = await generateUniqueRefId('con', (id) =>
      this.consultationsRepository.existsByRefId(id),
    );

    const consultationId = randomUUID();
    const held = await this.doctorSlotsService.holdSlot(dto.slotId, consultationId);

    try {
      await this.dataSource.transaction(async (manager) => {
        const otpVerifiedAt = dto.otp ? new Date() : new Date();

        const repo = manager.getRepository(ConsultationEntity);
        const initialStatus =
          pricingType === ConsultationPricingType.FREE
            ? ConsultationStatus.CONFIRMED
            : ConsultationStatus.AWAITING_PAYMENT;

        const row = await repo.save(
          repo.create({
            id: consultationId,
            refId,
            customerId,
            doctorId: dto.doctorId,
            clinicId: dto.clinicId,
            slotId: dto.slotId,
            status: initialStatus,
            pricingType,
            amountCharged: pricingType === ConsultationPricingType.PAID ? amount : 0,
            paymentStatus:
              pricingType === ConsultationPricingType.PAID
                ? ConsultationPaymentStatus.PENDING
                : ConsultationPaymentStatus.NONE,
            symptoms: dto.symptoms ?? null,
            patientName: dto.patientName.trim(),
            patientMobile: dto.patientMobile.trim(),
            scheduledStart: held.startAt,
            scheduledEnd: held.endAt,
            otpVerifiedAt,
            createdBy: customerId,
            updatedBy: customerId,
          }),
        );

        await this.recordStatus(manager, row.id, null, initialStatus, 'CUSTOMER', customerId);

        if (pricingType === ConsultationPricingType.FREE) {
          await this.doctorSlotsService.bookSlot(dto.slotId, row.id);
          this.notifications.bookingConfirmed({
            refId: row.refId,
            patientMobile: row.patientMobile,
          });
        } else {
          const paymentRepository = manager.getRepository(ConsultationPaymentEntity);
          await paymentRepository.save(
            paymentRepository.create({
              consultationId: row.id,
              provider: 'stub',
              amount,
              currency: doctor.consultationConfig?.currency ?? 'INR',
              status: ConsultationPaymentStatus.PENDING,
              gatewayOrderId: `stub-order-${row.refId}`,
              createdBy: customerId,
              updatedBy: customerId,
            }),
          );
        }
      });
    } catch (error) {
      await this.doctorSlotsService.releaseSlot(dto.slotId, consultationId);
      throw error;
    }

    return (await this.consultationsRepository.findByRefId(refId))!;
  }

  async verifyPaid(refId: string, gatewayPaymentId: string): Promise<ConsultationEntity> {
    const consultation = await this.consultationsRepository.findByRefId(refId);
    if (!consultation) throw new NotFoundException('Consultation not found');
    if (consultation.status !== ConsultationStatus.AWAITING_PAYMENT) {
      throw new BadRequestException('Consultation is not awaiting payment');
    }

    await this.dataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(ConsultationPaymentEntity);
      await paymentRepo.update(
        { consultationId: consultation.id },
        {
          status: ConsultationPaymentStatus.PAID,
          gatewayPaymentId,
          paidAt: new Date(),
        },
      );

      const repo = manager.getRepository(ConsultationEntity);
      await repo.update(
        { id: consultation.id },
        {
          status: ConsultationStatus.CONFIRMED,
          paymentStatus: ConsultationPaymentStatus.PAID,
        },
      );

      await this.recordStatus(
        manager,
        consultation.id,
        ConsultationStatus.AWAITING_PAYMENT,
        ConsultationStatus.CONFIRMED,
        'SYSTEM',
        gatewayPaymentId,
      );

      if (consultation.slotId) {
        await this.doctorSlotsService.bookSlot(consultation.slotId, consultation.id);
      }
    });

    this.notifications.paymentVerified({ refId });
    this.notifications.bookingConfirmed({
      refId,
      patientMobile: consultation.patientMobile,
    });

    return (await this.consultationsRepository.findByRefId(refId))!;
  }

  async cancelByCustomer(
    refId: string,
    customerId: string,
    dto: CancelConsultationDto,
  ): Promise<ConsultationEntity> {
    const row = await this.consultationsRepository.findByRefId(refId);
    if (!row || row.customerId !== customerId) throw new NotFoundException('Consultation not found');
    return this.cancel(refId, ConsultationStatus.CANCELLED_BY_CUSTOMER, 'CUSTOMER', customerId, dto);
  }

  async cancelByDoctor(
    refId: string,
    doctorId: string,
    dto: CancelConsultationDto,
  ): Promise<ConsultationEntity> {
    const row = await this.consultationsRepository.findByRefId(refId);
    if (!row || row.doctorId !== doctorId) throw new NotFoundException('Consultation not found');
    return this.cancel(refId, ConsultationStatus.CANCELLED_BY_DOCTOR, 'DOCTOR', doctorId, dto);
  }

  async cancelByAdmin(
    refId: string,
    adminId: string,
    dto: CancelConsultationDto,
  ): Promise<ConsultationEntity> {
    return this.cancel(refId, ConsultationStatus.CANCELLED_BY_ADMIN, 'ADMIN', adminId, dto);
  }

  async reschedule(
    refId: string,
    actor: BookingActor,
    dto: RescheduleConsultationDto,
  ): Promise<ConsultationEntity> {
    const consultation = await this.consultationsRepository.findByRefId(refId);
    if (!consultation) throw new NotFoundException('Consultation not found');

    this.assertActorCanManageConsultation(consultation, actor);

    if (consultation.status !== ConsultationStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed consultations can be rescheduled');
    }

    const oldSlotId = consultation.slotId;
    if (!oldSlotId) throw new BadRequestException('Consultation has no slot assigned');

    const held = await this.doctorSlotsService.holdSlot(dto.slotId, consultation.id);

    try {
      await this.dataSource.transaction(async (manager) => {
        await this.doctorSlotsService.releaseBookedSlot(oldSlotId, consultation.id);
        await this.doctorSlotsService.bookSlot(dto.slotId, consultation.id);

        await manager.getRepository(ConsultationEntity).update(
          { id: consultation.id },
          {
            slotId: dto.slotId,
            scheduledStart: held.startAt,
            scheduledEnd: held.endAt,
            updatedBy: actor.id,
          },
        );

        await this.recordStatus(
          manager,
          consultation.id,
          consultation.status,
          ConsultationStatus.CONFIRMED,
          actor.type,
          actor.id,
          'Rescheduled',
        );
      });
    } catch (error) {
      await this.doctorSlotsService.releaseSlot(dto.slotId, consultation.id);
      throw error;
    }

    this.notifications.rescheduled({ refId, slotId: dto.slotId });
    return (await this.consultationsRepository.findByRefId(refId))!;
  }

  async complete(
    refId: string,
    doctorId: string,
    dto: CompleteConsultationDto,
  ): Promise<ConsultationEntity> {
    const consultation = await this.consultationsRepository.findByRefId(refId);
    if (!consultation || consultation.doctorId !== doctorId) {
      throw new NotFoundException('Consultation not found');
    }
    if (consultation.status !== ConsultationStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed consultations can be completed');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ConsultationEntity).update(
        { id: consultation.id },
        {
          status: ConsultationStatus.COMPLETED,
          notes: dto.notes ?? consultation.notes,
          diagnosis: dto.diagnosis ?? consultation.diagnosis,
          completedAt: new Date(),
        },
      );
      await this.recordStatus(
        manager,
        consultation.id,
        consultation.status,
        ConsultationStatus.COMPLETED,
        'DOCTOR',
        doctorId,
      );
    });

    return (await this.consultationsRepository.findByRefId(refId))!;
  }

  async recommendFollowUp(
    refId: string,
    doctorId: string,
    dto: RecommendFollowUpDto,
  ): Promise<ConsultationFollowUpRecommendationEntity> {
    const consultation = await this.consultationsRepository.findByRefId(refId);
    if (!consultation || consultation.doctorId !== doctorId) {
      throw new NotFoundException('Consultation not found');
    }
    if (consultation.status !== ConsultationStatus.COMPLETED) {
      throw new BadRequestException('Follow-up can only be recommended after completion');
    }

    const policy = await this.followUpPolicyService.getEffectivePolicy(doctorId);
    if (!policy.followUpAllowed) {
      throw new BadRequestException('Follow-up is not allowed for this doctor');
    }

    const eligibleUntil = dto.eligibleUntil
      ? new Date(dto.eligibleUntil)
      : this.followUpPolicyService.defaultEligibleUntil(policy);

    const { pricingType, amount } = this.followUpPolicyService.resolveFollowUpPricing(
      consultation,
      policy,
      eligibleUntil,
    );

    const saved = await this.followUpRepo.save(
      this.followUpRepo.create({
        sourceConsultationId: consultation.id,
        doctorId,
        reason: dto.reason ?? null,
        instructions: dto.instructions ?? null,
        eligibleUntil,
        pricingType,
        amount,
        status: FollowUpRecommendationStatus.OPEN,
        createdBy: doctorId,
        updatedBy: doctorId,
      }),
    );

    this.notifications.followUpRecommended({ sourceRefId: refId, doctorId });
    return saved;
  }

  async bookFollowUp(
    customerId: string,
    dto: BookFollowUpDto,
  ): Promise<ConsultationEntity> {
    const recommendation = await this.followUpRepo.findOne({
      where: { refId: dto.recommendationRefId, status: FollowUpRecommendationStatus.OPEN },
      relations: { sourceConsultation: true },
    });
    if (!recommendation) throw new NotFoundException('Follow-up recommendation not found');

    if (
      recommendation.eligibleUntil &&
      recommendation.eligibleUntil.getTime() < Date.now()
    ) {
      throw new BadRequestException('Follow-up recommendation has expired');
    }

    const booking = await this.createBooking(
      customerId,
      {
        doctorId: recommendation.doctorId,
        clinicId: recommendation.sourceConsultation.clinicId,
        slotId: dto.slotId,
        patientName: dto.patientName,
        patientMobile: dto.patientMobile,
      },
      {
        pricingType: recommendation.pricingType,
        amount: recommendation.amount,
      },
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ConsultationEntity).update(
        { id: booking.id },
        {
          isFollowUp: true,
          parentConsultationId: recommendation.sourceConsultationId,
        },
      );
      await manager.getRepository(ConsultationFollowUpRecommendationEntity).update(
        { id: recommendation.id },
        {
          status: FollowUpRecommendationStatus.BOOKED,
          bookedConsultationId: booking.id,
        },
      );
    });

    return (await this.consultationsRepository.findByRefId(booking.refId))!;
  }

  async updateAttendance(
    refId: string,
    doctorId: string,
    dto: UpdateConsultationAttendanceDto,
  ): Promise<ConsultationEntity> {
    const consultation = await this.consultationsRepository.findByRefId(refId);
    if (!consultation || consultation.doctorId !== doctorId) {
      throw new NotFoundException('Consultation not found');
    }

    await this.consultationsRepository.updateByRefId(refId, {
      attendanceStatus: dto.attendanceStatus,
      updatedBy: doctorId,
    });

    return (await this.consultationsRepository.findByRefId(refId))!;
  }

  async upsertPrescription(
    refId: string,
    doctorId: string,
    dto: UpsertPrescriptionDto,
  ): Promise<PrescriptionEntity> {
    const consultation = await this.consultationsRepository.findByRefId(refId);
    if (!consultation || consultation.doctorId !== doctorId) {
      throw new NotFoundException('Consultation not found');
    }

    return this.dataSource.transaction(async (manager) => {
      const rxRepo = manager.getRepository(PrescriptionEntity);
      const itemRepo = manager.getRepository(PrescriptionItemEntity);

      let prescription = await rxRepo.findOne({
        where: { consultationId: consultation.id },
        relations: { items: true },
      });

      if (!prescription) {
        prescription = await rxRepo.save(
          rxRepo.create({
            consultationId: consultation.id,
            additionalNotes: dto.additionalNotes ?? null,
            createdBy: doctorId,
            updatedBy: doctorId,
          }),
        );
      } else {
        prescription.additionalNotes = dto.additionalNotes ?? prescription.additionalNotes;
        prescription.updatedBy = doctorId;
        await rxRepo.save(prescription);
        if (prescription.items?.length) {
          await itemRepo.delete({ prescriptionId: prescription.id });
        }
      }

      const items = dto.items.map((item, index) =>
        itemRepo.create({
          prescriptionId: prescription!.id,
          medicineName: item.medicineName.trim(),
          dosage: item.dosage ?? null,
          frequency: item.frequency ?? null,
          duration: item.duration ?? null,
          instructions: item.instructions ?? null,
          sortOrder: index,
          createdBy: doctorId,
          updatedBy: doctorId,
        }),
      );
      await itemRepo.save(items);

      return (await rxRepo.findOne({
        where: { id: prescription!.id },
        relations: { items: true },
      }))!;
    });
  }

  async listDocuments(refId: string, doctorId: string): Promise<ConsultationDocumentEntity[]> {
    const consultation = await this.consultationsRepository.findByRefId(refId);
    if (!consultation || consultation.doctorId !== doctorId) {
      throw new NotFoundException('Consultation not found');
    }
    return this.documentRepo.find({
      where: { consultationId: consultation.id },
      order: { createdAt: 'DESC' },
    });
  }

  async listForCustomer(
    customerId: string,
    query: ConsultationListQueryDto,
  ): Promise<PaginatedResult<ConsultationEntity>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.consultationsRepository.findAllPaginated({
      ...pagination,
      customerId,
      status: query.status,
    });
    return buildPaginatedResult(data, total, pagination);
  }

  async listForDoctor(
    doctorId: string,
    query: ConsultationListQueryDto,
  ): Promise<PaginatedResult<ConsultationEntity>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.consultationsRepository.findAllPaginated({
      ...pagination,
      doctorId,
      status: query.status,
    });
    return buildPaginatedResult(data, total, pagination);
  }

  async listAdmin(query: ConsultationListQueryDto): Promise<PaginatedResult<ConsultationEntity>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.consultationsRepository.findAllPaginated({
      ...pagination,
      status: query.status,
    });
    return buildPaginatedResult(data, total, pagination);
  }

  async getByRefId(refId: string): Promise<ConsultationEntity> {
    const row = await this.consultationsRepository.findByRefId(refId);
    if (!row) throw new NotFoundException('Consultation not found');
    return row;
  }

  async getByRefIdForCustomer(refId: string, customerId: string): Promise<ConsultationEntity> {
    const row = await this.getByRefId(refId);
    if (row.customerId !== customerId) throw new NotFoundException('Consultation not found');
    return row;
  }

  private async cancel(
    refId: string,
    status: ConsultationStatus,
    actorType: string,
    actorId: string,
    dto: CancelConsultationDto,
  ): Promise<ConsultationEntity> {
    const consultation = await this.consultationsRepository.findByRefId(refId);
    if (!consultation) throw new NotFoundException('Consultation not found');

    const cancellable = new Set<ConsultationStatus>([
      ConsultationStatus.AWAITING_PAYMENT,
      ConsultationStatus.CONFIRMED,
    ]);
    if (!cancellable.has(consultation.status)) {
      throw new BadRequestException('Consultation cannot be cancelled in its current status');
    }

    const needsRefund = consultation.paymentStatus === ConsultationPaymentStatus.PAID;

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ConsultationEntity).update(
        { id: consultation.id },
        {
          status,
          cancellationReason: dto.cancellationReason ?? null,
          cancelledAt: new Date(),
          ...(needsRefund ? { paymentStatus: ConsultationPaymentStatus.REFUND_PENDING } : {}),
        },
      );

      if (needsRefund) {
        await manager.getRepository(ConsultationPaymentEntity).update(
          { consultationId: consultation.id },
          { status: ConsultationPaymentStatus.REFUND_PENDING },
        );
      }

      await this.recordStatus(manager, consultation.id, consultation.status, status, actorType, actorId);

      if (consultation.slotId) {
        if (consultation.status === ConsultationStatus.CONFIRMED) {
          await this.doctorSlotsService.releaseBookedSlot(consultation.slotId, consultation.id);
        } else {
          await this.doctorSlotsService.releaseSlot(consultation.slotId, consultation.id);
        }
      }
    });

    this.notifications.cancelled({ refId, reason: dto.cancellationReason ?? null });
    return (await this.consultationsRepository.findByRefId(refId))!;
  }

  private assertActorCanManageConsultation(
    consultation: ConsultationEntity,
    actor: BookingActor,
  ): void {
    if (actor.type === 'ADMIN') return;
    if (actor.type === 'CUSTOMER' && consultation.customerId === actor.id) return;
    if (actor.type === 'DOCTOR' && consultation.doctorId === actor.id) return;
    throw new ForbiddenException('Not allowed to manage this consultation');
  }

  private async recordStatus(
    manager: import('typeorm').EntityManager,
    consultationId: string,
    fromStatus: ConsultationStatus | null,
    toStatus: ConsultationStatus,
    actorType: string,
    actorId: string,
    note?: string,
  ): Promise<void> {
    const repo = manager.getRepository(ConsultationStatusHistoryEntity);
    await repo.save(
      repo.create({
        consultationId,
        fromStatus,
        toStatus,
        actorType,
        actorId,
        note: note ?? null,
      }),
    );
  }
}
