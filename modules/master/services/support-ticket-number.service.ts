import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicketEntity } from '../entities/support-ticket.entity';

@Injectable()
export class SupportTicketNumberService {
  constructor(
    @InjectRepository(SupportTicketEntity)
    private readonly ticketRepo: Repository<SupportTicketEntity>,
  ) {}

  async generate(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `SUP-${year}${month}`;

    const count = await this.ticketRepo
      .createQueryBuilder('ticket')
      .withDeleted()
      .where('ticket.ticket_number LIKE :prefix', { prefix: `${prefix}-%` })
      .getCount();

    const sequence = String(count + 1).padStart(4, '0');
    return `${prefix}-${sequence}`;
  }
}
