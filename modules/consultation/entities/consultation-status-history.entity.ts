import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { ConsultationStatus } from '../enums/consultation-status.enum';
import { ConsultationEntity } from './consultation.entity';

@Entity('consultation_status_history')
export class ConsultationStatusHistoryEntity extends BaseEntity {
  @Index('IDX_consultation_status_history_consultation_id')
  @Column({ name: 'consultation_id', type: 'uuid' })
  consultationId!: string;

  @ManyToOne(() => ConsultationEntity, (c) => c.statusHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'consultation_id' })
  consultation!: ConsultationEntity;

  @Column({
    name: 'from_status',
    type: 'enum',
    enum: ConsultationStatus,
    enumName: 'consultations_status_enum',
    nullable: true,
  })
  fromStatus!: ConsultationStatus | null;

  @Column({
    name: 'to_status',
    type: 'enum',
    enum: ConsultationStatus,
    enumName: 'consultations_status_enum',
  })
  toStatus!: ConsultationStatus;

  @Column({ name: 'actor_type', type: 'varchar', length: 40 })
  actorType!: string;

  @Column({ name: 'actor_id', type: 'varchar', length: 64, nullable: true })
  actorId!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;
}
