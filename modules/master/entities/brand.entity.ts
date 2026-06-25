import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { MasterStatus } from '../enums/master-status.enum';

@Entity('brands')
export class BrandEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 300 })
  slug!: string;

  @Column(storageFileReferenceColumn())
  logo!: IStorageFileReference | null;

  @Column(storageFileReferenceColumn())
  banner!: IStorageFileReference | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle!: string | null;

  @Column({ name: 'meta_description', type: 'text', nullable: true })
  metaDescription!: string | null;

  @Column({ name: 'meta_keywords', type: 'text', array: true, nullable: true })
  metaKeywords!: string[] | null;

  @Column({ name: 'in_home_page', type: 'boolean', default: false })
  inHomePage!: boolean;
}
