import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConsultationsService } from './consultations.service';
import { ConsultationsRepository } from '../repositories/consultations.repository';
import { DoctorSlotsService } from '@modules/doctor/services/doctor-slots.service';
import { FollowUpPolicyService } from './follow-up-policy.service';
import { ConsultationNotificationsService } from './consultation-notifications.service';
import { ConsultationEntity } from '../entities/consultation.entity';
import { ConsultationStatus } from '../enums/consultation-status.enum';
import { ConsultationPaymentStatus } from '../enums/consultation-payment-status.enum';
import { ConsultationPricingType } from '../enums/consultation-pricing-type.enum';
import { FollowUpPricingMode } from '../enums/follow-up-pricing-mode.enum';

describe('ConsultationsService', () => {
  let service: ConsultationsService;
  let consultationsRepository: jest.Mocked<ConsultationsRepository>;
  let doctorSlotsService: jest.Mocked<DoctorSlotsService>;
  let followUpPolicyService: jest.Mocked<FollowUpPolicyService>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(() => {
    consultationsRepository = {
      findByRefId: jest.fn(),
      existsByRefId: jest.fn(),
      updateByRefId: jest.fn(),
      findAllPaginated: jest.fn(),
    } as unknown as jest.Mocked<ConsultationsRepository>;

    doctorSlotsService = {
      holdSlot: jest.fn(),
      releaseSlot: jest.fn(),
      releaseBookedSlot: jest.fn(),
      bookSlot: jest.fn(),
    } as unknown as jest.Mocked<DoctorSlotsService>;

    followUpPolicyService = {
      getEffectivePolicy: jest.fn(),
      defaultEligibleUntil: jest.fn(),
      resolveFollowUpPricing: jest.fn(),
    } as unknown as jest.Mocked<FollowUpPolicyService>;

    dataSource = {
      transaction: jest.fn(async (cb) =>
        cb({
          getRepository: () => ({
            save: jest.fn(async (v) => v),
            create: jest.fn((v) => v),
            update: jest.fn(),
          }),
        }),
      ),
    } as unknown as jest.Mocked<DataSource>;

    service = new ConsultationsService(
      dataSource,
      consultationsRepository,
      { findById: jest.fn() } as never,
      doctorSlotsService,
      followUpPolicyService,
      { cancelled: jest.fn(), bookingConfirmed: jest.fn(), paymentVerified: jest.fn(), followUpRecommended: jest.fn(), rescheduled: jest.fn() } as unknown as ConsultationNotificationsService,
      {} as never,
      {} as never,
      { save: jest.fn(), create: jest.fn((v) => v) } as never,
      {} as never,
      {} as never,
    );
  });

  describe('cancel', () => {
    it('releases booked slot for confirmed paid consultation and marks refund pending', async () => {
      const consultation = {
        id: 'con-id',
        refId: 'con-abc',
        customerId: 'cust-1',
        status: ConsultationStatus.CONFIRMED,
        paymentStatus: ConsultationPaymentStatus.PAID,
        slotId: 'slot-1',
      } as ConsultationEntity;

      consultationsRepository.findByRefId.mockImplementation(async () => consultation);

      await service.cancelByCustomer('con-abc', 'cust-1', {});

      expect(doctorSlotsService.releaseBookedSlot).toHaveBeenCalledWith('slot-1', 'con-id');
      expect(doctorSlotsService.releaseSlot).not.toHaveBeenCalled();
    });
  });

  describe('recommendFollowUp', () => {
    it('uses follow-up policy pricing instead of inheriting parent blindly', async () => {
      const consultation = {
        id: 'src-id',
        refId: 'con-src',
        doctorId: 'doc-1',
        status: ConsultationStatus.COMPLETED,
        pricingType: ConsultationPricingType.PAID,
        amountCharged: 500,
      } as ConsultationEntity;

      consultationsRepository.findByRefId.mockResolvedValue(consultation);
      followUpPolicyService.getEffectivePolicy.mockResolvedValue({
        followUpAllowed: true,
        pricingMode: FollowUpPricingMode.PAID,
        paidFeeAmount: 200,
        freeWindowDays: 7,
      } as never);
      followUpPolicyService.defaultEligibleUntil.mockReturnValue(new Date('2026-12-31T00:00:00Z'));
      followUpPolicyService.resolveFollowUpPricing.mockReturnValue({
        pricingType: ConsultationPricingType.PAID,
        amount: 200,
      });

      const followUpRepo = (service as any).followUpRepo as { save: jest.Mock; create: jest.Mock };
      followUpRepo.create = jest.fn((v) => v);
      followUpRepo.save = jest.fn(async (v) => v);

      await service.recommendFollowUp('con-src', 'doc-1', {});

      expect(followUpPolicyService.resolveFollowUpPricing).toHaveBeenCalled();
      expect(followUpRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          pricingType: ConsultationPricingType.PAID,
          amount: 200,
        }),
      );
    });

    it('rejects when followUpAllowed is false', async () => {
      consultationsRepository.findByRefId.mockResolvedValue({
        id: 'src-id',
        doctorId: 'doc-1',
        status: ConsultationStatus.COMPLETED,
      } as ConsultationEntity);
      followUpPolicyService.getEffectivePolicy.mockResolvedValue({
        followUpAllowed: false,
      } as never);

      await expect(service.recommendFollowUp('con-src', 'doc-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('verifyPaid', () => {
    it('throws when consultation is not awaiting payment', async () => {
      consultationsRepository.findByRefId.mockResolvedValue({
        refId: 'con-1',
        status: ConsultationStatus.CONFIRMED,
      } as ConsultationEntity);

      await expect(service.verifyPaid('con-1', 'pay-1')).rejects.toThrow(BadRequestException);
    });
  });
});
