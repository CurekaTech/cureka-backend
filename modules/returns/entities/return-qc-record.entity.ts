import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { ReturnQcResult } from '../enums/return-qc-result.enum';
import { ReturnRequestItemEntity } from './return-request-item.entity';
import { ReturnRequestEntity } from './return-request.entity';

@Entity('return_qc_records')
export class ReturnQcRecordEntity extends BaseEntity {
  @Index('IDX_return_qc_records_return_request_id')
  @Column({ name: 'return_request_id', type: 'uuid' })
  returnRequestId!: string;

  @ManyToOne(() => ReturnRequestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_request_id' })
  returnRequest?: ReturnRequestEntity;

  @Column({ name: 'return_request_item_id', type: 'uuid' })
  returnRequestItemId!: string;

  @ManyToOne(() => ReturnRequestItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_request_item_id' })
  returnRequestItem?: ReturnRequestItemEntity;

  @Column({
    type: 'enum',
    enum: ReturnQcResult,
    enumName: 'return_qc_records_result_enum',
  })
  result!: ReturnQcResult;

  @Column({ name: 'received_quantity', type: 'int' })
  receivedQuantity!: number;

  @Column({ name: 'accepted_quantity', type: 'int' })
  acceptedQuantity!: number;

  @Column({ name: 'rejected_quantity', type: 'int' })
  rejectedQuantity!: number;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'performed_by', type: 'varchar', length: 255 })
  performedBy!: string;

  @Column({ name: 'performed_at', type: 'timestamptz' })
  performedAt!: Date;

  @Column({ name: 'warehouse_received_at', type: 'timestamptz', nullable: true })
  warehouseReceivedAt!: Date | null;
}
