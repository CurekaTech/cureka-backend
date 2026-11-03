import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsultationEntity } from '../entities/consultation.entity';
import { ConsultationPaymentStatus } from '../enums/consultation-payment-status.enum';
import { ConsultationStatus } from '../enums/consultation-status.enum';

export type ConsultationReportSummary = {
  total: number;
  byStatus: Record<string, number>;
  byPaymentStatus: Record<string, number>;
  from: string | null;
  to: string | null;
};

@Injectable()
export class ConsultationReportsService {
  constructor(
    @InjectRepository(ConsultationEntity)
    private readonly consultationRepo: Repository<ConsultationEntity>,
  ) {}

  async summary(from?: Date, to?: Date): Promise<ConsultationReportSummary> {
    const qb = this.consultationRepo
      .createQueryBuilder('c')
      .where('c.deleted_at IS NULL');

    if (from) qb.andWhere('c.created_at >= :from', { from });
    if (to) qb.andWhere('c.created_at <= :to', { to });

    const rows = await qb.select(['c.status', 'c.paymentStatus']).getMany();

    const byStatus: Record<string, number> = {};
    const byPaymentStatus: Record<string, number> = {};

    for (const status of Object.values(ConsultationStatus)) {
      byStatus[status] = 0;
    }
    for (const ps of Object.values(ConsultationPaymentStatus)) {
      byPaymentStatus[ps] = 0;
    }

    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      byPaymentStatus[row.paymentStatus] = (byPaymentStatus[row.paymentStatus] ?? 0) + 1;
    }

    return {
      total: rows.length,
      byStatus,
      byPaymentStatus,
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    };
  }
}
