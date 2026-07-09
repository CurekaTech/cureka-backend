import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { SupportAuditAction } from '../enums/support-audit-action.enum';

@Entity('support_ticket_audit_logs')
export class SupportTicketAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId!: string;

  @Column({
    type: 'enum',
    enum: SupportAuditAction,
    enumName: 'support_ticket_audit_action_enum',
  })
  action!: SupportAuditAction;

  @Column({ name: 'performed_by', type: 'varchar', length: 255 })
  performedBy!: string;

  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
