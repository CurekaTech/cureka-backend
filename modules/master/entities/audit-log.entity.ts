import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditLogChangeEntity } from './audit-log-change.entity';

@Entity('audit_logs')
@Index('IDX_audit_logs_entity_type_entity_id', ['entityType', 'entityId'])
@Index('IDX_audit_logs_entity_type_entity_ref_id', ['entityType', 'entityRefId'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 64 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId!: string | null;

  @Column({ name: 'entity_ref_id', type: 'varchar', length: 64, nullable: true })
  entityRefId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ name: 'performed_by', type: 'varchar', length: 255 })
  performedBy!: string;

  @Column({ name: 'actor_type', type: 'varchar', length: 16, nullable: true })
  actorType!: string | null;

  @Column({ name: 'actor_id', type: 'varchar', length: 255, nullable: true })
  actorId!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 64, nullable: true })
  requestId!: string | null;

  @Index('IDX_audit_logs_idempotency_key', {
    unique: true,
    where: '"idempotency_key" IS NOT NULL',
  })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 255, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  reliability!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, unknown> | null;

  @Column({ name: 'batch_id', type: 'varchar', length: 64, nullable: true })
  batchId!: string | null;

  @Column({ name: 'capture_status', type: 'varchar', length: 16, nullable: true })
  captureStatus!: string | null;

  @Column({ name: 'request_context', type: 'jsonb', nullable: true })
  requestContext!: Record<string, unknown> | null;

  @Column({ name: 'request_payload', type: 'jsonb', nullable: true })
  requestPayload!: Record<string, unknown> | null;

  @Column({ name: 'changed_fields_count', type: 'int', default: 0 })
  changedFieldsCount!: number;

  @OneToMany(() => AuditLogChangeEntity, (change) => change.auditLog)
  changes?: AuditLogChangeEntity[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
