import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { UserEntity } from './user.entity';
import { UserAddressType } from '../enums/user-address-type.enum';

@Entity('user_addresses')
export class UserAddressEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'recipient_name', type: 'varchar', length: 150 })
  recipientName!: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 10 })
  phoneNumber!: string;

  @Column({ type: 'varchar', length: 6 })
  pincode!: string;

  @Column({ name: 'address_line1', type: 'varchar', length: 255 })
  addressLine1!: string;

  @Column({ name: 'address_line2', type: 'varchar', length: 255, nullable: true })
  addressLine2!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  landmark!: string | null;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ type: 'varchar', length: 100 })
  state!: string;

  @Column({
    name: 'address_type',
    type: 'enum',
    enum: UserAddressType,
    enumName: 'user_addresses_address_type_enum',
  })
  addressType!: UserAddressType;

  @Index()
  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;
}
