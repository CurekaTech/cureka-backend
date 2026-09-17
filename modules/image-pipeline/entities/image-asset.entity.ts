import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ImageAssetStatus } from '../enums/image-asset-status.enum';
import { IImageVariantRecord } from '../interfaces/image-pipeline.interface';

@Entity('image_assets')
@Index('UQ_image_assets_source', ['sourceBucket', 'sourceKey'], { unique: true })
@Index('IDX_image_assets_status_updated', ['status', 'updatedAt'])
export class ImageAssetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'source_bucket', type: 'varchar', length: 255 })
  sourceBucket!: string;

  @Column({ name: 'source_key', type: 'varchar', length: 1024 })
  sourceKey!: string;

  @Column({ name: 'source_hash', type: 'varchar', length: 64, nullable: true })
  sourceHash!: string | null;

  @Column({ name: 'source_width', type: 'int', nullable: true })
  sourceWidth!: number | null;

  @Column({ name: 'source_height', type: 'int', nullable: true })
  sourceHeight!: number | null;

  @Column({ name: 'source_mime', type: 'varchar', length: 100, nullable: true })
  sourceMime!: string | null;

  @Column({ name: 'source_bytes', type: 'int', nullable: true })
  sourceBytes!: number | null;

  @Column({ name: 'pipeline_version', type: 'varchar', length: 32 })
  pipelineVersion!: string;

  @Column({
    type: 'varchar',
    length: 32,
  })
  status!: ImageAssetStatus;

  @Column({ name: 'process_token', type: 'varchar', length: 64 })
  processToken!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  variants!: IImageVariantRecord[];

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'error_message', type: 'varchar', length: 300, nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
