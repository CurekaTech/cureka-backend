import {
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { CategoryHierarchyLevel } from '../enums/category-hierarchy-level.enum';
import { MasterStatus } from '../enums/master-status.enum';
import { AttributeEntity } from './attribute.entity';
import { CategoryFilterEntity } from './category-filter.entity';

@Entity('categories')
export class CategoryEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index({ unique: true })
  @Column({ name: 'hierarchy_id', type: 'int' })
  hierarchyId!: number;

  @Index()
  @Column({ name: 'parent_category_id', type: 'uuid', nullable: true })
  parentCategoryId!: string | null;

  @Index()
  @Column({ type: 'int', default: 0 })
  position!: number;

  @Index()
  @Column({
    name: 'hierarchy_level',
    type: 'enum',
    enum: CategoryHierarchyLevel,
    default: CategoryHierarchyLevel.ROOT,
  })
  hierarchyLevel!: CategoryHierarchyLevel;

  @Column(storageFileReferenceColumn())
  image!: IStorageFileReference | null;

  @Column(storageFileReferenceColumn())
  banner!: IStorageFileReference | null;

  @Column(storageFileReferenceColumn({ name: 'faq_banner' }))
  faqBanner!: IStorageFileReference | null;

  @Column({ type: 'varchar', length: 300 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle!: string | null;

  @Column({ name: 'meta_description', type: 'text', nullable: true })
  metaDescription!: string | null;

  @Column({ name: 'meta_keywords', type: 'text', array: true, nullable: true })
  metaKeywords!: string[] | null;

  // Self-referencing: parent
  @ManyToOne(() => CategoryEntity, (category) => category.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_category_id' })
  parent!: CategoryEntity | null;

  // Self-referencing: children
  @OneToMany(() => CategoryEntity, (category) => category.parent)
  children!: CategoryEntity[];

  // Many-to-many with attributes via junction table
  @ManyToMany(() => AttributeEntity, (attribute) => attribute.categories)
  @JoinTable({
    name: 'category_attributes',
    joinColumn: { name: 'category_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'attribute_id', referencedColumnName: 'id' },
  })
  attributes!: AttributeEntity[];

  @ManyToMany(() => CategoryFilterEntity, (filter) => filter.categories)
  @JoinTable({
    name: 'category_filter_mappings',
    joinColumn: { name: 'category_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_filter_id', referencedColumnName: 'id' },
  })
  categoryFilters!: CategoryFilterEntity[];

  @Column({ name: 'above_the_fold', type: 'text', nullable: true })
  aboveTheFold!: string | null;

  @Column({ name: 'below_the_fold', type: 'text', nullable: true })
  belowTheFold!: string | null;

  @Column({ type: 'jsonb', nullable: false, default: () => "'[]'" })
  faqs!: Array<{ question: string; answer: string }>;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @Column({ name: 'is_in_header', type: 'boolean', default: false })
  isInHeader!: boolean;

  /** Show on homepage Shop by Category (root, subcategory, or sub-subcategory). */
  @Column({ name: 'is_in_shop_by', type: 'boolean', default: false })
  isInShopBy!: boolean;

  /** Homepage Best Sellers tab order (lower first; null = unordered / fallback). */
  @Index()
  @Column({ name: 'bestseller_sort_index', type: 'int', nullable: true })
  bestsellerSortIndex!: number | null;
}
