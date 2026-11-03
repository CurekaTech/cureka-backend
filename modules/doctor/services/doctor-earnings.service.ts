import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsultationEntity } from '@modules/consultation/entities/consultation.entity';
import { ConsultationPaymentStatus } from '@modules/consultation/enums/consultation-payment-status.enum';
import { ConsultationPricingType } from '@modules/consultation/enums/consultation-pricing-type.enum';
import { ConsultationStatus } from '@modules/consultation/enums/consultation-status.enum';

export type DoctorEarningsSummary = {
  doctorId: string;
  totalPaidAmount: number;
  paidCount: number;
  freeCount: number;
  cancelledCount: number;
  completedCount: number;
  refundPendingAmount: number;
  from: string | null;
  to: string | null;
};

@Injectable()
export class DoctorEarningsService {
  constructor(
    @InjectRepository(ConsultationEntity)
    private readonly consultationRepo: Repository<ConsultationEntity>,
  ) {}

  async summary(
    doctorId: string,
    from?: Date,
    to?: Date,
  ): Promise<DoctorEarningsSummary> {
    const qb = this.consultationRepo
      .createQueryBuilder('c')
      .where('c.doctor_id = :doctorId', { doctorId })
      .andWhere('c.deleted_at IS NULL');

    if (from) qb.andWhere('c.created_at >= :from', { from });
    if (to) qb.andWhere('c.created_at <= :to', { to });

    const rows = await qb.getMany();

    let totalPaidAmount = 0;
    let paidCount = 0;
    let freeCount = 0;
    let cancelledCount = 0;
    let completedCount = 0;
    let refundPendingAmount = 0;

    const cancelledStatuses = new Set<ConsultationStatus>([
      ConsultationStatus.CANCELLED_BY_CUSTOMER,
      ConsultationStatus.CANCELLED_BY_DOCTOR,
      ConsultationStatus.CANCELLED_BY_ADMIN,
    ]);

    for (const row of rows) {
      if (row.pricingType === ConsultationPricingType.FREE) {
        freeCount += 1;
      }
      if (row.paymentStatus === ConsultationPaymentStatus.PAID) {
        paidCount += 1;
        totalPaidAmount += row.amountCharged;
      }
      if (row.paymentStatus === ConsultationPaymentStatus.REFUND_PENDING) {
        refundPendingAmount += row.amountCharged;
      }
      if (cancelledStatuses.has(row.status)) {
        cancelledCount += 1;
      }
      if (row.status === ConsultationStatus.COMPLETED) {
        completedCount += 1;
      }
    }

    return {
      doctorId,
      totalPaidAmount,
      paidCount,
      freeCount,
      cancelledCount,
      completedCount,
      refundPendingAmount,
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    };
  }
}
