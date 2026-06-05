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
import { CategoryHierarchyLevel } from '../enums/category-hierarchy-level.enum';
import { MasterStatus } from '../enums/master-status.enum';
import { AttributeEntity } from './attribute.entity';

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

  @Column({ type: 'varchar', length: 500, nullable: true })
  image!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  banner!: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 300 })
  slug!: string;

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

  @Column({ name: 'is_in_shop_by', type: 'boolean', default: false })
  isInShopBy!: boolean;
}
