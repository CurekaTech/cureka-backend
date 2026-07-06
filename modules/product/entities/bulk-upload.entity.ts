import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { BulkUploadStatus } from '../enums/bulk-upload-status.enum';

@Entity('bulk_uploads')
export class BulkUploadEntity extends BaseEntity {
  @Index()
  @Column({
    type: 'enum',
    enum: BulkUploadStatus,
    enumName: 'bulk_uploads_status_enum',
    default: BulkUploadStatus.PENDING,
  })
  status!: BulkUploadStatus;

  @Column({ name: 'file_url', type: 'varchar', length: 1000 })
  fileUrl!: string;

  @Column({ name: 'images_zip_url', type: 'varchar', length: 1000, nullable: true })
  imagesZipUrl!: string | null;

  @Column({ name: 'error_file_url', type: 'varchar', length: 1000, nullable: true })
  errorFileUrl!: string | null;

  @Column({ name: 'total_rows', type: 'integer', default: 0 })
  totalRows!: number;

  @Column({ name: 'processed_rows', type: 'integer', default: 0 })
  processedRows!: number;

  @Column({ name: 'successful_rows', type: 'integer', default: 0 })
  successfulRows!: number;

  @Column({ name: 'failed_rows', type: 'integer', default: 0 })
  failedRows!: number;

  @Column({ name: 'error_summary', type: 'jsonb', default: () => "'[]'" })
  errorSummary!: any[];

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
