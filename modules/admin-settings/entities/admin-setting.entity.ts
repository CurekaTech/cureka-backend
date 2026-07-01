import { BaseEntity } from '@packages/database';
import { Column, Entity, Index } from 'typeorm';
import { AdminSettingStatus } from '../enums/admin-setting-status.enum';

@Entity('admin_setting')
export class AdminSettingEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  key!: string;

  @Column({ type: 'text' })
  value!: string;

  @Column({
    type: 'enum',
    enum: AdminSettingStatus,
    enumName: 'admin_settings_status_enum',
    default: AdminSettingStatus.ACTIVE,
  })
  status!: AdminSettingStatus;

  @Column({ type: 'text', nullable: true })
  description!: string | null;
}
