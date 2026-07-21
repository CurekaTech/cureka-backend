import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { MasterStatus } from '../enums/master-status.enum';

@Entity('testimonials')
@Index('IDX_testimonials_status_sort', ['status', 'sortOrder'])
export class TestimonialEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 150 })
  city!: string;

  @Column({ type: 'decimal', precision: 2, scale: 1, default: 5.0 })
  rating!: number;

  @Column({ type: 'text' })
  description!: string;

  @Column(storageFileReferenceColumn({ name: 'image', nullable: true }))
  image!: IStorageFileReference | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'testimonials_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;
}
