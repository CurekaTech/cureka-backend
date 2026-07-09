import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';
import { ReasonPickupMode } from '../enums/reason-pickup-mode.enum';
import { ReasonWorkflow } from '../enums/reason-workflow.enum';

@Entity('reason_masters')
export class ReasonMasterEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  code!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  workflows!: ReasonWorkflow[];

  @Column({ name: 'category_ref_ids', type: 'jsonb', nullable: true, default: () => "'[]'" })
  categoryRefIds!: string[];

  @Column({ name: 'sku_refs', type: 'jsonb', nullable: true, default: () => "'[]'" })
  skuRefs!: string[];

  @Column({
    name: 'pickup_mode',
    type: 'enum',
    enum: ReasonPickupMode,
    enumName: 'reason_pickup_mode_enum',
    default: ReasonPickupMode.PICKUP_REQUIRED,
  })
  pickupMode!: ReasonPickupMode;

  @Column({ name: 'is_mandatory', type: 'boolean', default: true })
  isMandatory!: boolean;

  @Column({ name: 'comments_required', type: 'boolean', default: false })
  commentsRequired!: boolean;

  @Column({ name: 'images_required', type: 'boolean', default: false })
  imagesRequired!: boolean;

  @Column({ name: 'video_required', type: 'boolean', default: false })
  videoRequired!: boolean;

  @Column({ name: 'qc_required', type: 'boolean', default: false })
  qcRequired!: boolean;

  @Column({ name: 'auto_approval_eligible', type: 'boolean', default: false })
  autoApprovalEligible!: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;
}
