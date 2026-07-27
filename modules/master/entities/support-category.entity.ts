import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { SupportCategoryType } from '../enums/support-category-type.enum';
import { SupportContentStatus } from '../enums/support-content-status.enum';

@Entity('support_categories')
export class SupportCategoryEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 180 })
  slug!: string;

  @Column({
    type: 'enum',
    enum: SupportCategoryType,
    enumName: 'support_categories_type_enum',
    default: SupportCategoryType.BOTH,
  })
  type!: SupportCategoryType;

  @Index()
  @Column({
    type: 'enum',
    enum: SupportContentStatus,
    enumName: 'support_content_status_enum',
    default: SupportContentStatus.ACTIVE,
  })
  status!: SupportContentStatus;
}
