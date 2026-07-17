import { BaseEntity } from '@packages/database';
import { Column, Entity, Index } from 'typeorm';

@Entity('gokwik_abandoned_carts')
export class GokwikAbandonedCartEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'external_cart_id', type: 'varchar', length: 200 })
  externalCartId!: string;

  @Index()
  @Column({ name: 'merchant_cart_id', type: 'varchar', length: 200, nullable: true })
  merchantCartId!: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 200, nullable: true })
  requestId!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;
}
