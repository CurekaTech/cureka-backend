import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { ReturnEvidenceMediaType, ReturnEvidenceSource } from '../enums/return-evidence.enum';
import { ReturnRequestEntity } from './return-request.entity';

@Entity('return_evidences')
export class ReturnEvidenceEntity extends BaseEntity {
  @Index('IDX_return_evidences_return_request_id')
  @Column({ name: 'return_request_id', type: 'uuid' })
  returnRequestId!: string;

  @ManyToOne(() => ReturnRequestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_request_id' })
  returnRequest?: ReturnRequestEntity;

  /** Null when the evidence covers the whole request rather than one line. */
  @Column({ name: 'return_request_item_id', type: 'uuid', nullable: true })
  returnRequestItemId!: string | null;

  @Column({
    name: 'media_type',
    type: 'enum',
    enum: ReturnEvidenceMediaType,
    enumName: 'return_evidences_media_type_enum',
  })
  mediaType!: ReturnEvidenceMediaType;

  @Index('IDX_return_evidences_source')
  @Column({
    type: 'enum',
    enum: ReturnEvidenceSource,
    enumName: 'return_evidences_source_enum',
    default: ReturnEvidenceSource.CUSTOMER,
  })
  source!: ReturnEvidenceSource;

  /** Private storage reference; served to clients only as a short-lived signed URL. */
  @Column(storageFileReferenceColumn({ name: 'file', nullable: false }))
  file!: IStorageFileReference;

  @Column({ name: 'original_filename', type: 'varchar', length: 255, nullable: true })
  originalFilename!: string | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 120, nullable: true })
  mimeType!: string | null;

  @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
  sizeBytes!: string | null;

  @Column({ name: 'uploaded_by_id', type: 'varchar', length: 64, nullable: true })
  uploadedById!: string | null;
}
