import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { ProductEntity } from './product.entity';
import { ProductFaqEntity } from './product-faq.entity';

@Entity('product_faq_mappings')
export class ProductFaqMappingEntity {
  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @PrimaryColumn({ name: 'product_faq_id', type: 'uuid' })
  productFaqId!: string;

  @Index()
  @ManyToOne('ProductEntity', 'faqMappings', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @ManyToOne(() => ProductFaqEntity, (productFaq) => productFaq.productMappings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_faq_id' })
  productFaq!: ProductFaqEntity;
}
