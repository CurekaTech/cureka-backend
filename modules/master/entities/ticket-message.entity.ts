import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { SupportMessageSenderType } from '../enums/support-message-sender-type.enum';
import { SupportTicketEntity } from './support-ticket.entity';

@Entity('ticket_messages')
export class TicketMessageEntity extends BaseEntity {
  @Index()
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId!: string;

  @ManyToOne(() => SupportTicketEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket?: SupportTicketEntity;

  @Column({
    name: 'sender_type',
    type: 'enum',
    enum: SupportMessageSenderType,
    enumName: 'ticket_messages_sender_type_enum',
  })
  senderType!: SupportMessageSenderType;

  @Column({ name: 'sender_id', type: 'varchar', length: 255, nullable: true })
  senderId!: string | null;

  @Column({ type: 'text' })
  message!: string;

  @Column(storageFileReferenceColumn({ name: 'attachment_url', nullable: true }))
  attachmentUrl!: IStorageFileReference | null;
}
