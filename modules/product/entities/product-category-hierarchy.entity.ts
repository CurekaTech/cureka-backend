import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { ProductEntity } from './product.entity';
import { CategoryEntity } from '@modules/master/entities/category.entity';

@Entity('product_category_hierarchies')
export class ProductCategoryHierarchyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

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

  @ManyToOne('ProductEntity', 'categoryHierarchies', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

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
