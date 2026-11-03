import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { ConsultationEntity } from './consultation.entity';

@Entity('consultation_documents')
export class ConsultationDocumentEntity extends BaseEntity {
  @Index('IDX_consultation_documents_consultation_id')
  @Column({ name: 'consultation_id', type: 'uuid' })
  consultationId!: string;

  @ManyToOne(() => ConsultationEntity, (c) => c.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'consultation_id' })
  consultation!: ConsultationEntity;

  @Column(storageFileReferenceColumn({ name: 'file', nullable: false }))
  file!: IStorageFileReference;

  @Column({ name: 'mime_type', type: 'varchar', length: 120, nullable: true })
  mimeType!: string | null;

  @Column({ name: 'original_name', type: 'varchar', length: 255, nullable: true })
  originalName!: string | null;
}
