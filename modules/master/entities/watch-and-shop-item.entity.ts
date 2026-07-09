import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { MasterStatus } from '../enums/master-status.enum';
import { WatchAndShopMediaType } from '../enums/watch-and-shop-media-type.enum';

@Entity('watch_and_shop_items')
@Index('IDX_watch_and_shop_items_status_sort', ['status', 'sortOrder'])
export class WatchAndShopItemEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({
    name: 'media_type',
    type: 'enum',
    enum: WatchAndShopMediaType,
    enumName: 'watch_and_shop_items_media_type_enum',
    default: WatchAndShopMediaType.VIDEO,
  })
  mediaType!: WatchAndShopMediaType;

  @Column(storageFileReferenceColumn({ name: 'media_url', nullable: true }))
  mediaUrl!: IStorageFileReference | null;

  @Column({ name: 'video_url', type: 'varchar', length: 2000, nullable: true })
  videoUrl!: string | null;

  @Index()
  @Column({ name: 'product_ref_id', type: 'varchar', length: 11 })
  productRefId!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'watch_and_shop_items_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt!: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt!: Date | null;
}
