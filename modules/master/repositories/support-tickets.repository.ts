import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { SupportTicketEntity } from '../entities/support-ticket.entity';
import { SupportTicketCategory } from '../enums/support-ticket-category.enum';
import { SupportTicketStatus } from '../enums/support-ticket-status.enum';

export interface SupportTicketFindOptions extends PaginationOptions {
  status?: SupportTicketStatus;
  category?: SupportTicketCategory;
  userId?: string;
  assignedTo?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class SupportTicketsRepository {
  constructor(
    @InjectRepository(SupportTicketEntity)
    private readonly repo: Repository<SupportTicketEntity>,
  ) {}

  async create(data: Partial<SupportTicketEntity>): Promise<SupportTicketEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<SupportTicketEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async findById(id: string): Promise<SupportTicketEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<SupportTicketEntity>,
  ): Promise<SupportTicketEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async findAllPaginated(
    options: SupportTicketFindOptions,
  ): Promise<{ data: SupportTicketEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo
      .createQueryBuilder('ticket')
      .orderBy('ticket.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('ticket.status = :status', { status: options.status });
    }

    if (options.category) {
      qb.andWhere('ticket.category = :category', { category: options.category });
    }

    if (options.userId) {
      qb.andWhere('ticket.user_id = :userId', { userId: options.userId });
    }

    if (options.assignedTo) {
      qb.andWhere('ticket.assigned_to = :assignedTo', { assignedTo: options.assignedTo });
    }

    if (options.dateFrom) {
      qb.andWhere('ticket.created_at >= :dateFrom', { dateFrom: options.dateFrom });
    }

    if (options.dateTo) {
      qb.andWhere('ticket.created_at <= :dateTo', { dateTo: options.dateTo });
    }

    if (options.search) {
      qb.andWhere(
        '(ticket.ticket_number ILIKE :search OR ticket.subject ILIKE :search OR ticket.guest_email ILIKE :search OR ticket.order_id ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findUserSummariesPaginated(
    options: SupportTicketFindOptions & { userId: string },
  ): Promise<{ data: SupportTicketEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo
      .createQueryBuilder('ticket')
      .select([
        'ticket.refId',
        'ticket.ticketNumber',
        'ticket.category',
        'ticket.subject',
        'ticket.status',
        'ticket.priority',
        'ticket.orderId',
        'ticket.reasonRefId',
        'ticket.reasonTitle',
        'ticket.workflow',
        'ticket.pickupMode',
        'ticket.createdAt',
      ])
      .where('ticket.user_id = :userId', { userId: options.userId })
      .orderBy('ticket.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('ticket.status = :status', { status: options.status });
    }

    if (options.category) {
      qb.andWhere('ticket.category = :category', { category: options.category });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getReportsSummary(): Promise<{
    averageResolutionHours: number;
    topIssues: { category: string; count: number }[];
    totalOpen: number;
    totalResolved: number;
  }> {
    const topIssuesRaw = await this.repo
      .createQueryBuilder('ticket')
      .select('ticket.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('ticket.category')
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany<{ category: string; count: string }>();

    const resolutionRaw = await this.repo
      .createQueryBuilder('ticket')
      .select(
        `AVG(EXTRACT(EPOCH FROM (ticket.updated_at - ticket.created_at)) / 3600)`,
        'avgHours',
      )
      .where('ticket.status IN (:...statuses)', {
        statuses: [SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED],
      })
      .getRawOne<{ avgHours: string | null }>();

    const totalOpen = await this.repo.count({
      where: [
        { status: SupportTicketStatus.OPEN },
        { status: SupportTicketStatus.IN_PROGRESS },
      ],
    });

    const totalResolved = await this.repo.count({
      where: [
        { status: SupportTicketStatus.RESOLVED },
        { status: SupportTicketStatus.CLOSED },
      ],
    });

    return {
      averageResolutionHours: Number(resolutionRaw?.avgHours ?? 0),
      topIssues: topIssuesRaw.map((row) => ({
        category: row.category,
        count: Number(row.count),
      })),
      totalOpen,
      totalResolved,
    };
  }
}
