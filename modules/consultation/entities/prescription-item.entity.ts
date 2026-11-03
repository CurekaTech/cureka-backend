import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { PrescriptionEntity } from './prescription.entity';

@Entity('prescription_items')
export class PrescriptionItemEntity extends BaseEntity {
  @Index('IDX_prescription_items_prescription_id')
  @Column({ name: 'prescription_id', type: 'uuid' })
  prescriptionId!: string;

  @ManyToOne(() => PrescriptionEntity, (rx) => rx.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'prescription_id' })
  prescription!: PrescriptionEntity;

  @Column({ name: 'medicine_name', type: 'varchar', length: 255 })
  medicineName!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  dosage!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  frequency!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  duration!: string | null;

  @Column({ type: 'text', nullable: true })
  instructions!: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
