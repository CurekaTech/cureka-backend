import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { VendorEntity } from './vendor.entity';

@Entity('vendor_category_hierarchies')
export class VendorCategoryHierarchyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Index()
  @Column({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  @Index()
  @Column({ name: 'sub_category_id', type: 'uuid', nullable: true })
  subCategoryId!: string | null;

  @Index()
  @Column({ name: 'sub_sub_category_id', type: 'uuid', nullable: true })
  subSubCategoryId!: string | null;

  @Index()
  @Column({ name: 'sub_sub_sub_category_id', type: 'uuid', nullable: true })
  subSubSubCategoryId!: string | null;

  @ManyToOne(() => VendorEntity, (vendor) => vendor.categoryHierarchies, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vendor_id' })
  vendor!: VendorEntity;

  @ManyToOne(() => CategoryEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category?: CategoryEntity;

  @ManyToOne(() => CategoryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sub_category_id' })
  subCategory?: CategoryEntity | null;

  @ManyToOne(() => CategoryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sub_sub_category_id' })
  subSubCategory?: CategoryEntity | null;

  @ManyToOne(() => CategoryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sub_sub_sub_category_id' })
  subSubSubCategory?: CategoryEntity | null;
}
