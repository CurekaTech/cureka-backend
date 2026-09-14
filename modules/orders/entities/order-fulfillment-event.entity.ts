import { BaseEntity } from '@packages/database';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { OrderEntity } from './order.entity';
import {
  OrderFulfillmentEventType,
  OrderFulfillmentRequestType,
} from '../enums/order-fulfillment-event-type.enum';

@Entity('order_fulfillment_events')
export class OrderFulfillmentEventEntity extends BaseEntity {
  @Index()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => OrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;

  @Index()
  @Column({ name: 'request_type', type: 'varchar', length: 30 })
  requestType!: OrderFulfillmentRequestType;

  @Index()
  @Column({ name: 'event_type', type: 'varchar', length: 80 })
  eventType!: OrderFulfillmentEventType;

  @Column({ name: 'from_status', type: 'varchar', length: 60, nullable: true })
  fromStatus!: string | null;

  @Column({ name: 'to_status', type: 'varchar', length: 60, nullable: true })
  toStatus!: string | null;

  @Column({ name: 'actor_id', type: 'varchar', length: 255 })
  actorId!: string;

  @Column({ name: 'actor_type', type: 'varchar', length: 30 })
  actorType!: string;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  /** Sanitized operational metadata. Never store credentials or raw provider secrets. */
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'is_customer_visible', type: 'boolean', default: false })
  isCustomerVisible!: boolean;
}
