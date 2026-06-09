import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';
import { BannerPlacement } from '../enums/banner-placement.enum';
import { BannerSlot } from '../enums/banner-slot.enum';
import { BannerResourceType } from '../enums/banner-resource-type.enum';

@Entity('banners')
@Index('IDX_banners_placement_slot_status_sort', ['placement', 'slot', 'status', 'sortOrder'])
export class BannerEntity extends BaseEntity {
  @Index()
  @Column({
    type: 'enum',
    enum: BannerPlacement,
    enumName: 'banners_placement_enum',
  })
  placement!: BannerPlacement;

  @Index()
  @Column({
    type: 'enum',
    enum: BannerSlot,
    enumName: 'banners_slot_enum',
    default: BannerSlot.DEFAULT,
  })
  slot!: BannerSlot;

  @Column({
    name: 'resource_type',
    type: 'enum',
    enum: BannerResourceType,
    enumName: 'banners_resource_type_enum',
  })
  resourceType!: BannerResourceType;

  @Column({ name: 'resource_ref_id', type: 'varchar', length: 11, nullable: true })
  resourceRefId!: string | null;

  @Column({ name: 'external_url', type: 'varchar', length: 2000, nullable: true })
  externalUrl!: string | null;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'image_url', type: 'varchar', length: 500 })
  imageUrl!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'banners_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt!: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt!: Date | null;
}
