import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { ExpertTalkContentType } from '../enums/expert-talk-content-type.enum';
import { MasterStatus } from '../enums/master-status.enum';

@Entity('expert_talk_items')
@Index('IDX_expert_talk_items_status_sort', ['status', 'sortOrder'])
export class ExpertTalkItemEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'video_url', type: 'varchar', length: 2000 })
  videoUrl!: string;

  @Column(storageFileReferenceColumn({ name: 'thumbnail', nullable: true }))
  thumbnail!: IStorageFileReference | null;

  @Column({
    name: 'content_type',
    type: 'enum',
    enum: ExpertTalkContentType,
    enumName: 'expert_talk_items_content_type_enum',
    default: ExpertTalkContentType.TALK,
  })
  contentType!: ExpertTalkContentType;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'expert_talk_items_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;
}
