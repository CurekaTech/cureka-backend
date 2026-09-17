import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { AdminNotificationEmailType } from '../enums/admin-notification-email-type.enum';

@Entity('admin_notification_emails')
@Index('UQ_admin_notification_emails_email_type_active', ['email', 'type'], {
  unique: true,
  where: `"deleted_at" IS NULL`,
})
export class AdminNotificationEmailEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Index('IDX_admin_notification_emails_type')
  @Column({
    type: 'enum',
    enum: AdminNotificationEmailType,
    enumName: 'admin_notification_email_type_enum',
    default: AdminNotificationEmailType.PRODUCT_OOS,
  })
  type!: AdminNotificationEmailType;

  @Index('IDX_admin_notification_emails_is_active')
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
