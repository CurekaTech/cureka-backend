import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { ProductFaqStatus } from '../enums/product-faq-status.enum';
import { ProductFaqMappingEntity } from './product-faq-mapping.entity';

@Entity('product_faqs')
export class ProductFaqEntity extends BaseEntity {
  @Column({ type: 'text' })
  question!: string;

  @Column({ type: 'text' })
  answer!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ProductFaqStatus,
    enumName: 'product_faqs_status_enum',
    default: ProductFaqStatus.ACTIVE,
  })
  status!: ProductFaqStatus;

  @OneToMany(() => ProductFaqMappingEntity, (mapping) => mapping.productFaq)
  productMappings!: ProductFaqMappingEntity[];
}
