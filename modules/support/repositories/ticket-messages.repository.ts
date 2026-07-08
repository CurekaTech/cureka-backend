import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { TicketMessageEntity } from '../entities/ticket-message.entity';
import { SupportMessageSenderType } from '../enums/support-message-sender-type.enum';

@Injectable()
export class TicketMessagesRepository {
  constructor(
    @InjectRepository(TicketMessageEntity)
    private readonly repo: Repository<TicketMessageEntity>,
  ) {}

  async create(data: Partial<TicketMessageEntity>): Promise<TicketMessageEntity> {
    const refId = await generateUniqueRefId('message', (id) => this.existsByRefId(id));
    const entity = this.repo.create({ ...data, refId });
    return this.repo.save(entity);
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async findByTicketId(
    ticketId: string,
    includeInternalNotes = false,
  ): Promise<TicketMessageEntity[]> {
    const qb = this.repo
      .createQueryBuilder('message')
      .where('message.ticket_id = :ticketId', { ticketId })
      .orderBy('message.createdAt', 'ASC');

    if (!includeInternalNotes) {
      qb.andWhere('message.sender_type != :internal', {
        internal: SupportMessageSenderType.INTERNAL_NOTE,
      });
    }

    return qb.getMany();
  }
}
