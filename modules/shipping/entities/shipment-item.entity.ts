import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ShipmentEntity } from './shipment.entity';

@Entity('shipment_items')
@Index('UQ_shipment_items_shipment_order_item', ['shipmentId', 'orderItemId'], { unique: true })
export class ShipmentItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'shipment_id', type: 'uuid' })
  shipmentId!: string;

  @Index()
  @Column({ name: 'order_item_id', type: 'uuid' })
  orderItemId!: string;

  @Column({ type: 'integer' })
  quantity!: number;

  @ManyToOne(() => ShipmentEntity, (shipment) => shipment.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipment_id' })
  shipment?: ShipmentEntity;

  @ManyToOne(() => OrderItemEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_item_id' })
  orderItem?: OrderItemEntity;
}
