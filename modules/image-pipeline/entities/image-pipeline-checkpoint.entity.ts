import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { IImageBackfillCounts } from '../interfaces/image-pipeline.interface';

@Entity('image_pipeline_checkpoints')
export class ImagePipelineCheckpointEntity {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id!: string;

  @Column({ name: 'cursor_id', type: 'varchar', length: 64, nullable: true })
  cursorId!: string | null;

  @Column({ name: 'entity_type', type: 'varchar', length: 64, nullable: true })
  entityType!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  stats!: IImageBackfillCounts;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
