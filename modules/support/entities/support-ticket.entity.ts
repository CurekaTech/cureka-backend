import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { SupportTicketCategory } from '../enums/support-ticket-category.enum';
import { SupportTicketPriority } from '../enums/support-ticket-priority.enum';
import { SupportTicketStatus } from '../enums/support-ticket-status.enum';

@Entity('support_tickets')
@Index('IDX_support_tickets_status_created', ['status', 'createdAt'])
export class SupportTicketEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'ticket_number', type: 'varchar', length: 20 })
  ticketNumber!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'guest_name', type: 'varchar', length: 150, nullable: true })
  guestName!: string | null;

  @Column({ name: 'guest_email', type: 'varchar', length: 255, nullable: true })
  guestEmail!: string | null;

  @Column({ name: 'guest_mobile', type: 'varchar', length: 20, nullable: true })
  guestMobile!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: SupportTicketCategory,
    enumName: 'support_tickets_category_enum',
  })
  category!: SupportTicketCategory;

  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @Column({ type: 'text' })
  description!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: SupportTicketStatus,
    enumName: 'support_tickets_status_enum',
    default: SupportTicketStatus.OPEN,
  })
  status!: SupportTicketStatus;

  @Column({
    type: 'enum',
    enum: SupportTicketPriority,
    enumName: 'support_tickets_priority_enum',
    default: SupportTicketPriority.MEDIUM,
  })
  priority!: SupportTicketPriority;

  @Column({ name: 'order_id', type: 'varchar', length: 50, nullable: true })
  orderId!: string | null;

  @Column({ name: 'assigned_to', type: 'varchar', length: 255, nullable: true })
  assignedTo!: string | null;

  @Column({ name: 'reason_ref_id', type: 'varchar', length: 11, nullable: true })
  reasonRefId!: string | null;

  @Column({ name: 'reason_title', type: 'varchar', length: 255, nullable: true })
  reasonTitle!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  workflow!: string | null;

  @Column({ name: 'pickup_mode', type: 'varchar', length: 30, nullable: true })
  pickupMode!: string | null;
}
