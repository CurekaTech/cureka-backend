import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '@modules/master/enums/master-status.enum';

@Entity('product_information_labels')
export class ProductInformationLabelEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;
}
