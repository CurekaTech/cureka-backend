import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { MasterStatus } from '../enums/master-status.enum';

@Entity('wellness_goals')
export class WellnessGoalEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column(storageFileReferenceColumn())
  image!: IStorageFileReference | null;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @Column({ name: 'in_home_page', type: 'boolean', default: false })
  inHomePage!: boolean;

  @Column({ type: 'jsonb', nullable: false, default: () => "'[]'" })
  faqs!: Array<{ question: string; answer: string }>;
}
