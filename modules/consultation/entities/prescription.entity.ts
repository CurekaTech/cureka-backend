import { Column, Entity, Index, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { ConsultationEntity } from './consultation.entity';
import { PrescriptionItemEntity } from './prescription-item.entity';

@Entity('prescriptions')
export class PrescriptionEntity extends BaseEntity {
  @Index('UQ_prescriptions_consultation_id', { unique: true })
  @Column({ name: 'consultation_id', type: 'uuid' })
  consultationId!: string;

  @OneToOne(() => ConsultationEntity, (c) => c.prescription, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'consultation_id' })
  consultation!: ConsultationEntity;

  @Column({ name: 'additional_notes', type: 'text', nullable: true })
  additionalNotes!: string | null;

  @Column(storageFileReferenceColumn({ name: 'pdf_file', nullable: true }))
  pdfFile!: IStorageFileReference | null;

  @OneToMany(() => PrescriptionItemEntity, (item) => item.prescription, { cascade: true })
  items?: PrescriptionItemEntity[];
}
