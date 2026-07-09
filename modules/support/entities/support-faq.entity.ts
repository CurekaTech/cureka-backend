import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { SupportContentStatus } from '../enums/support-content-status.enum';

@Entity('support_faqs')
export class SupportFaqEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 500 })
  question!: string;

  @Column({ type: 'text' })
  answer!: string;

  @Index()
  @Column({ name: 'category_ref_id', type: 'varchar', length: 11 })
  categoryRefId!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Index()
  @Column({
    type: 'enum',
    enum: SupportContentStatus,
    enumName: 'support_content_status_enum',
    default: SupportContentStatus.ACTIVE,
  })
  status!: SupportContentStatus;
}
