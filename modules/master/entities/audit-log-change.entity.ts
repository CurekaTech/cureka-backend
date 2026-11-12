import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditLogEntity } from './audit-log.entity';

@Entity('audit_log_changes')
@Index('IDX_audit_log_changes_audit_log_id', ['auditLogId'])
export class AuditLogChangeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'audit_log_id', type: 'uuid' })
  auditLogId!: string;

  @ManyToOne(() => AuditLogEntity, (log) => log.changes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'audit_log_id' })
  auditLog?: AuditLogEntity;

  @Column({ name: 'table_name', type: 'varchar', length: 64 })
  tableName!: string;

  @Column({ name: 'record_id', type: 'uuid', nullable: true })
  recordId!: string | null;

  @Column({ name: 'column_name', type: 'varchar', length: 64 })
  columnName!: string;

  @Column({ type: 'varchar', length: 64 })
  field!: string;

  @Column({ name: 'change_type', type: 'varchar', length: 16 })
  changeType!: string;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue!: unknown;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue!: unknown;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
