import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference } from '@packages/storage';
import { MasterStatus } from '../enums/master-status.enum';
import { HomeSectionType } from '../enums/home-section-type.enum';

export type HomeSectionBannerVariant = 'festive' | 'brand';

export type HomeSectionBannerItem = {
  imageUrl: IStorageFileReference | null;
  mobileImageUrl: IStorageFileReference | null;
  linkUrl: string;
  /** Storefront layout: full-width festive vs side-by-side brand. */
  variant?: HomeSectionBannerVariant;
};

@Entity('home_sections')
@Index('IDX_home_sections_status_index', ['status', 'sectionIndex'])
export class HomeSectionEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 255 })
  slug!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: HomeSectionType,
    enumName: 'home_sections_type_enum',
  })
  type!: HomeSectionType;

  @Column({ name: 'section_index', type: 'int' })
  sectionIndex!: number;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'home_sections_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  /** Custom `banner` sections — GCS storage refs per slide. */
  @Column({ type: 'jsonb', nullable: true })
  banners!: HomeSectionBannerItem[] | null;

  /** Custom `productSlider` — product refIds from existing catalog. */
  @Column({ name: 'product_ref_ids', type: 'jsonb', nullable: true })
  productRefIds!: string[] | null;

  /** Custom `categorySlider` — category refIds from existing masters. */
  @Column({ name: 'category_ref_ids', type: 'jsonb', nullable: true })
  categoryRefIds!: string[] | null;

  /** SEO — used for product/category custom sections. */
  @Column({ name: 'page_title', type: 'varchar', length: 255, nullable: true })
  pageTitle!: string | null;

  @Column({ name: 'page_description', type: 'text', nullable: true })
  pageDescription!: string | null;

  @Column({ name: 'page_canonical_url', type: 'varchar', length: 2000, nullable: true })
  pageCanonicalUrl!: string | null;
}
