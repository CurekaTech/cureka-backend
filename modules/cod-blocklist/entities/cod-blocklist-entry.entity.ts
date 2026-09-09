import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { UserEntity } from '@modules/users/entities/user.entity';
import { CodBlocklistType } from '../enums/cod-blocklist-type.enum';

@Entity('cod_blocklist_entries')
@Index('IDX_cod_blocklist_entries_created_at', ['createdAt'])
@Index('UQ_cod_blocklist_active_pincode', ['pincode'], {
  unique: true,
  where: `"type" = 'PINCODE' AND "is_active" = true AND "deleted_at" IS NULL AND "pincode" IS NOT NULL`,
})
@Index('UQ_cod_blocklist_active_customer_id', ['customerId'], {
  unique: true,
  where: `"type" = 'CUSTOMER' AND "is_active" = true AND "deleted_at" IS NULL AND "customer_id" IS NOT NULL`,
})
@Index('UQ_cod_blocklist_active_mobile_number', ['mobileNumber'], {
  unique: true,
  where: `"type" = 'CUSTOMER' AND "is_active" = true AND "deleted_at" IS NULL AND "mobile_number" IS NOT NULL`,
})
export class CodBlocklistEntryEntity extends BaseEntity {
  @Index('IDX_cod_blocklist_entries_type')
  @Column({
    type: 'enum',
    enum: CodBlocklistType,
    enumName: 'cod_blocklist_entry_type_enum',
  })
  type!: CodBlocklistType;

  @Index('IDX_cod_blocklist_entries_pincode')
  @Column({ type: 'varchar', length: 6, nullable: true })
  pincode!: string | null;

  @Index('IDX_cod_blocklist_entries_customer_id')
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer?: UserEntity | null;

  @Index('IDX_cod_blocklist_entries_mobile_number')
  @Column({ name: 'mobile_number', type: 'varchar', length: 20, nullable: true })
  mobileNumber!: string | null;

  @Column({ name: 'customer_name_snapshot', type: 'varchar', length: 255, nullable: true })
  customerNameSnapshot!: string | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Index('IDX_cod_blocklist_entries_is_active')
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
